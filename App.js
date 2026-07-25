import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet, View, Text, TextInput, TouchableOpacity,
  ScrollView, KeyboardAvoidingView, Platform, Animated, ActivityIndicator
} from 'react-native';
import * as Speech from 'expo-speech';
import * as Linking from 'expo-linking';
import * as SQLite from 'expo-sqlite';
import * as Battery from 'expo-battery';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import * as Brightness from 'expo-brightness';
import * as Calendar from 'expo-calendar';
import * as Contacts from 'expo-contacts';
import * as Network from 'expo-network';
import { CameraView } from 'expo-camera';
import { VolumeManager } from 'react-native-volume-manager';
import LANPortScanner from 'react-native-lan-port-scanner';
import { Audio } from 'expo-av';
import { useSpeechRecognitionEvent, ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { StatusBar } from 'expo-status-bar';

// ─── API Configuration ────────────────────────────────────────────────────────
const OPENROUTER_API_KEY = process.env.EXPO_PUBLIC_OPENROUTER_API_KEY;
const WEATHER_API_KEY = '2e0bd0427c23acdff51ecbb9ae21ab6a';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const EDGE_TTS_URL = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9787D7E05195A4F334';

const MODEL_CHAIN = [
  'google/gemma-4-31b-it',
  'poolside/laguna-xs-2.1',
  'nvidia/nemotron-3-nano-30b-a3b',
  'openai/gpt-oss-20b',
];

const PERSONALITY_MODES = {
  TACTICAL: {
    prompt: 'High-energy tactical Hinglish. MISSION ORIENTED. Short replies. Call user "boss". Output tag [MODE: TACTICAL].',
    voice: { pitch: '+4Hz', rate: '+20%', style: 'cheerful' },
    color: '#00FFFF'
  },
  SARCASTIC: {
    prompt: 'Witty, fast, dry humor. Hinglish. Call user "boss". Output tag [MODE: SARCASTIC].',
    voice: { pitch: '+1Hz', rate: '+15%', style: 'cheerful' },
    color: '#FF8C00'
  },
  CONCERNED: {
    prompt: 'Helpful and high energy. Focus on safety. Hinglish. Call user "boss". Output tag [MODE: CONCERNED].',
    voice: { pitch: '+5Hz', rate: '+10%', style: 'cheerful' },
    color: '#00FA9A'
  },
  EMERGENCY: {
    prompt: 'MAX URGENCY. Fast, snappy, direct. MISSION CRITICAL. Call user "boss". Output tag [MODE: EMERGENCY].',
    voice: { pitch: '+8Hz', rate: '+35%', style: 'excited' },
    color: '#FF0000'
  }
};

// ─── Database Setup ──────────────────────────────────────────────────────────
const db = SQLite.openDatabaseSync('friday_memory.db');
const initDB = () => {
  try {
    db.execSync(`CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT, content TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP);`);
  } catch (err) { console.log("[FRIDAY] DB Error:", err.message); }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const toBase64 = (uint8Array) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let binary = '';
  const len = uint8Array.byteLength;
  for (let i = 0; i < len; i++) { binary += String.fromCharCode(uint8Array[i]); }
  let output = '';
  for (let i = 0, block, charCode, map = chars; binary.charAt(i | 0) || (map = '=', i % 1); output += map.charAt(63 & block >> 8 - i % 1 * 8)) {
    charCode = binary.charCodeAt(i += 3 / 4);
    block = block << 8 | charCode;
  }
  return output;
};

const getSimilarity = (str1, str2) => {
  const s1 = (str1 || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/bahan/g, 'behen').replace(/mummy/g, 'mom').replace(/papa/g, 'dad');
  const s2 = (str2 || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/bahan/g, 'behen').replace(/mummy/g, 'mom').replace(/papa/g, 'dad');
  if (s1 === s2) return 1.0;
  if (s1.length < 2 || s2.length < 2) return 0;
  const bigrams1 = new Set();
  for (let i = 0; i < s1.length - 1; i++) bigrams1.add(s1.substring(i, i + 2));
  const bigrams2 = new Set();
  for (let i = 0; i < s2.length - 1; i++) bigrams2.add(s2.substring(i, i + 2));
  const intersect = [...bigrams1].filter(x => bigrams2.has(x)).length;
  return (2.0 * intersect) / (bigrams1.size + bigrams2.size);
};

// ─── Personality & Data Prompting ─────────────────────────────────────────────
const getSystemPrompt = (batteryLevel, weather, location, city) => {
  const locStr = location ? `${location.coords.latitude.toFixed(3)}, ${location.coords.longitude.toFixed(3)}` : 'UNKNOWN';
  const weatherStr = weather ? `${weather.main.temp}°C, ${weather.weather[0].description}` : 'SCANNING...';

  return `You are FRIDAY, Tony Stark's advanced AI partner.
- Tone: High-energy, snappy, and enthusiastic. NO slow or tired words.
- Script: NEVER use Devanagari. Use Latin letters ONLY. Max 12 words.
- Sentinel Mode: You can scan the local network to find all connected devices.
- Powers: Torch, Volume, Brightness, Calls, WhatsApp, Network Sweep.
- Status: Battery ${Math.round(batteryLevel * 100)}% | Weather: ${weatherStr} | Loc: ${city || 'SCANNING'} (${locStr}).
- Action JSON Format:
  {"action":"NAVIGATE","target":"Destination"}
  {"action":"TORCH","state":"on/off"}
  {"action":"VOLUME","level":0.0-1.0}
  {"action":"SCAN_NETWORK"}
  {"action":"CALL","name":"Contact Name"}
  {"action":"WHATSAPP","name":"Contact Name","text":"Msg"}`;
};

// ─── AI Call ──────────────────────────────────────────────────────────────────
async function callAI(conversationMessages, batteryLevel, weather, location, city, modelIndex = 0) {
  if (modelIndex >= MODEL_CHAIN.length) return 'All systems offline, boss. [MODE: EMERGENCY]';
  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://friday-ai.app', 'X-Title': 'FRIDAY Mark V' },
      body: JSON.stringify({
        model: MODEL_CHAIN[modelIndex],
        messages: [{ role: 'system', content: getSystemPrompt(batteryLevel, weather, location, city) }, ...conversationMessages],
        max_tokens: 150,
        temperature: 0.8,
      }),
    });
    const data = await response.json();
    return data?.choices?.[0]?.message?.content?.trim() || 'Empty signal, boss. [MODE: TACTICAL]';
  } catch (err) { return callAI(conversationMessages, batteryLevel, weather, location, city, modelIndex + 1); }
}

// ─── Neural Voice Implementation (Edge TTS) ────────────────────────────────────
async function playNeuralVoice(text, modeConfig, onDone) {
  return new Promise((resolve) => {
    const ws = new WebSocket(EDGE_TTS_URL, null, {
      headers: {
        'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckmegniedg',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
      },
    });
    let audioChunks = [];
    ws.onopen = () => {
      const configMsg = `X-Timestamp:${Date.now()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`;
      const ssmlMsg = `X-Timestamp:${Date.now()}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='http://www.w3.org/2001/mstts' xml:lang='en-IN'><voice name='en-IN-NeerjaNeural'><mstts:express-as style='${modeConfig.voice.style}' styledegree='2.0'><prosody pitch='${modeConfig.voice.pitch}' rate='${modeConfig.voice.rate}' volume='+30%'>${text}</prosody></mstts:express-as></voice></speak>`;
      ws.send(configMsg); ws.send(ssmlMsg);
    };
    ws.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        if (event.data.includes('Path:turn.end')) {
          ws.close();
          if (audioChunks.length > 0) {
            const totalLength = audioChunks.reduce((acc, chunk) => acc + chunk.length, 0);
            const combined = new Uint8Array(totalLength);
            let offset = 0; for (const chunk of audioChunks) { combined.set(chunk, offset); offset += chunk.length; }
            const base64Audio = toBase64(combined);
            const { sound: newSound } = await Audio.Sound.createAsync({ uri: `data:audio/mp3;base64,${base64Audio}` }, { shouldPlay: true });
            newSound.setOnPlaybackStatusUpdate((status) => { if (status.didJustFinish) { newSound.unloadAsync(); if (onDone) onDone(); } });
            resolve(true);
          } else resolve(false);
        }
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          const buffer = reader.result;
          const view = new DataView(buffer);
          audioChunks.push(new Uint8Array(buffer.slice(2 + view.getUint16(0))));
        };
        reader.readAsArrayBuffer(event.data);
      }
    };
    ws.onerror = () => resolve(false);
  });
}

// ─── App ──────────────────────────────────────────────────────────────────────
// MISSION CLOCK: 2026-07-25T16:50:00
export default function App() {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [batteryLevel, setBatteryLevel] = useState(0);
  const [weather, setWeather] = useState(null);
  const [location, setLocation] = useState(null);
  const [city, setCity] = useState(null);
  const [mode, setMode] = useState('TACTICAL');
  const [isListening, setIsListening] = useState(false);
  const [isSentinelOn, setIsSentinelOn] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isTorchProcessing, setIsTorchProcessing] = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const auraAnim = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef();
  const proactiveTriggered = useRef({ battery: false, schedule: false });

  // Main Speech Result Handler
  useSpeechRecognitionEvent("result", (e) => {
    if (e.results[0]?.transcript) {
      const text = e.results[0].transcript;
      if (isSentinelOn && text.toLowerCase().includes("friday")) {
        handleWakeWord();
      } else if (!isSentinelOn) {
        setInputText(text);
        if (e.isFinal) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); setTimeout(() => sendMessage(text), 600); }
      }
    }
  });

  useSpeechRecognitionEvent("start", () => !isSentinelOn && setIsListening(true));
  useSpeechRecognitionEvent("end", () => {
    setIsListening(false);
    if (isSentinelOn) setTimeout(startSentinel, 300); // Eternal Sentinel Loop
  });

  const startSentinel = useCallback(() => {
    ExpoSpeechRecognitionModule.start({ lang: "en-IN", interimResults: true, continuous: true });
  }, []);

  const handleWakeWord = async () => {
    setIsSentinelOn(false); // Pause sentinel to handle command
    ExpoSpeechRecognitionModule.stop();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    await FRIDAYSpeak("Yes boss?", "TACTICAL");
    setIsListening(true);
    ExpoSpeechRecognitionModule.start({ lang: "en-IN", interimResults: true });
  };

  useEffect(() => {
    initDB(); loadMemory(); setupSensors(); Audio.requestPermissionsAsync();
    setTimeout(() => FRIDAYSpeak('Systems online, boss. Sentinel Protocol active.', 'TACTICAL'), 1500);

    // Core Pulse
    Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.15, duration: 1200, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1.0, duration: 1200, useNativeDriver: true })
    ])).start();

    // Sentinel Aura
    Animated.loop(Animated.sequence([
      Animated.timing(auraAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
      Animated.timing(auraAnim, { toValue: 0, duration: 2000, useNativeDriver: true })
    ])).start();

    const interval = setInterval(systemAudit, 60000);
    return () => clearInterval(interval);
  }, []);

  const setupSensors = async () => {
    const b = await Battery.getBatteryLevelAsync(); setBatteryLevel(b);
    Battery.addBatteryLevelListener(({ batteryLevel }) => setBatteryLevel(batteryLevel));
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      const loc = await Location.getCurrentPositionAsync({}); setLocation(loc);
      fetchEnvData(loc.coords.latitude, loc.coords.longitude);
    }
  };

  const fetchEnvData = async (lat, lon) => {
    try {
      const [wResp, cResp] = await Promise.all([
        fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${WEATHER_API_KEY}&units=metric`),
        fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`, { headers: { 'User-Agent': 'FRIDAY-AI/1.0' } })
      ]);
      const wData = await wResp.json(); const cData = await cResp.json();
      setWeather(wData); setCity(cData.address.city || cData.address.town || 'UNKNOWN');
    } catch (_) {}
  };

  const systemAudit = async () => {
    if (batteryLevel > 0 && batteryLevel < 0.15 && isSentinelOn) {
      setIsSentinelOn(false);
      triggerProactive("Boss, power critical. Sentinel mode disabled to save core.", "EMERGENCY");
    }
  };

  const triggerProactive = (msg, m) => { addMsg('assistant', msg); setMode(m); FRIDAYSpeak(msg, m); };

  const FRIDAYSpeak = async (text, forcedMode, onDone) => {
    const mConfig = PERSONALITY_MODES[forcedMode || mode] || PERSONALITY_MODES.TACTICAL;
    const success = await playNeuralVoice(text, mConfig, onDone);
    if (!success) Speech.speak(text, { pitch: 1.3, rate: 1.3, onDone });
  };

  const addMsg = (role, content) => { setMessages(prev => [...prev, { role, content }]); try { db.runSync('INSERT INTO messages (role, content) VALUES (?, ?)', [role, content]); } catch (_) {} };

  const loadMemory = () => { try {
    const results = db.getAllSync('SELECT * FROM messages ORDER BY timestamp ASC LIMIT 25');
    if (results.length > 0) setMessages(results.map(r => ({ role: r.role, content: r.content })));
  } catch (_) {} };

  const handleAction = async (reply) => {
    const jsonMatch = reply.match(/\{[\s\S]*\}/); if (!jsonMatch) return false;
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.action === 'NAVIGATE') {
        const url = Platform.select({ ios: `maps:0,0?q=${encodeURIComponent(parsed.target)}`, android: `geo:0,0?q=${encodeURIComponent(parsed.target)}` });
        let briefing = `Target ${parsed.target} locked, boss. Let's go.`;
        if (location) {
          const dResp = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(parsed.target)}&format=json&limit=1`, { headers: { 'User-Agent': 'FRIDAY-AI/1.0' } });
          const dData = await dResp.json();
          if (dData[0]) {
            const oResp = await fetch(`http://router.project-osrm.org/route/v1/driving/${location.coords.longitude},${location.coords.latitude};${dData[0].lon},${dData[0].lat}?overview=false`);
            const oData = await oResp.json();
            if (oData.routes[0]) briefing = `${parsed.target} is ${(oData.routes[0].distance/1000).toFixed(1)} km away. ETA ${Math.round(oData.routes[0].duration/60)} mins. Ready?`;
          }
        }
        FRIDAYSpeak(briefing, mode, () => Linking.openURL(url)); return true;
      }
      if (parsed.action === 'TORCH') {
        if (isCameraReady) { setIsTorchProcessing(true); setTimeout(() => { setTorchOn(parsed.state === 'on'); setIsTorchProcessing(false); }, 200); return true; }
        else { FRIDAYSpeak("Hardware warmup required, boss. Try again.", "CONCERNED"); return false; }
      }
      if (parsed.action === 'SCAN_NETWORK') {
        const ip = await Network.getIpAddressAsync();
        const subnet = ip.substring(0, ip.lastIndexOf('.'));
        FRIDAYSpeak("Sweeping local subnet, boss. Searching for all 7 devices.", "TACTICAL");
        // Increased timeout to 400ms for more reliable mobile scanning
        LANPortScanner.startScan({ networkId: subnet, ports: [80, 443, 8080, 22, 21], timeout: 400, onFound: (d) => {}, onFinished: (list) => {
          const count = list.length;
          const names = list.map(d => d.ip).join(', ');
          triggerProactive(`Scan complete. Detected ${count} active signals on the grid: ${names}`, "TACTICAL");
        }});
        return true;
      }
      if (parsed.action === 'VOLUME') { await VolumeManager.setVolume(parsed.level); return true; }
      if (parsed.action === 'CALL' || parsed.action === 'WHATSAPP') {
        const { status } = await Contacts.requestPermissionsAsync();
        if (status === 'granted') {
          const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers] });
          const candidates = data.filter(c => c.name && c.name.length > 1).map(c => ({ ...c, score: getSimilarity(parsed.name, c.name) }));
          candidates.sort((a, b) => b.score - a.score);
          if (candidates[0] && candidates[0].score > 0.6) {
            const phone = candidates[0].phoneNumbers?.[0]?.number;
            if (phone) { Linking.openURL(parsed.action === 'CALL' ? `tel:${phone}` : `whatsapp://send?phone=${phone}&text=${encodeURIComponent(parsed.text || 'Hey')}`); return true; }
          }
          FRIDAYSpeak(`Boss, ${parsed.name} contact list mein nahi mil raha.`, mode);
        }
      }
    } catch (_) {} return false;
  };

  const sendMessage = async (overrideText) => {
    const msg = (overrideText || inputText).trim(); if (!msg || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); addMsg('user', msg); setInputText(''); setLoading(true);
    try {
      const payload = messages.slice(-8).map(m => ({ role: m.role, content: m.content }));
      payload.push({ role: 'user', content: msg });
      const reply = await callAI(payload, batteryLevel, weather, location, city);
      const modeMatch = reply.match(/\[MODE:\s*(\w+)\]/i);
      const newMode = modeMatch ? modeMatch[1].toUpperCase() : 'TACTICAL'; setMode(newMode);
      const cleanReply = reply.replace(/\[MODE:\s*\w+\]/gi, '').replace(/\{[\s\S]*\}/, '').trim();
      const actionHandled = await handleAction(reply);
      if (!actionHandled) { addMsg('assistant', cleanReply); FRIDAYSpeak(cleanReply, newMode); }
      else addMsg('assistant', `↗ MISSION: ${newMode}`);
    } catch (_) { addMsg('assistant', 'Data link unstable, boss.'); } finally { setLoading(false); }
  };

  const theme = PERSONALITY_MODES[mode]?.color || '#00FFFF';

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: '#000808' }}>
      <StatusBar style="light" />

      {/* Sentinel Hardware session (2x2 pixel, 0.15 opacity, Top level) */}
      <View style={{ position: 'absolute', width: 2, height: 2, opacity: 0.15, zIndex: 999 }} pointerEvents="none">
        <CameraView style={{ flex: 1 }} facing="back" enableTorch={torchOn} onCameraReady={() => setIsCameraReady(true)} />
      </View>

      <View style={[styles.header, { borderBottomColor: theme + '30' }]}>
        {/* Sentinel Aura pulsing logic */}
        {isSentinelOn && <Animated.View style={[styles.aura, { borderColor: theme, opacity: auraAnim, transform: [{ scale: auraAnim.interpolate({inputRange: [0, 1], outputRange: [1, 1.5]}) }] }]} />}

        <View style={[styles.dataRibbon, { backgroundColor: theme + '05' }]}>
          <Text style={[styles.ribbonText, { color: theme }]}>
            [ {isSentinelOn ? 'SENTINEL' : mode} ] | [ {city?.toUpperCase() || 'SCANNING'} ] | [ {weather ? `${Math.round(weather.main.temp)}°C` : '--'} ] | [ {Math.round(batteryLevel * 100)}% PWR ]
          </Text>
        </View>
        <Animated.View style={[styles.logo, { transform: [{ scale: pulseAnim }], backgroundColor: theme, shadowColor: theme }]}><Text style={styles.logoText}>F</Text></Animated.View>
        <Text style={[styles.subtitle, { color: theme }]}>{loading ? 'SYNCING...' : 'FRIDAY MARK V.4 - SENTINEL PRIME'}</Text>
      </View>

      <ScrollView style={styles.chat} ref={scrollViewRef} onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}>
        {messages.length === 0 && <Text style={styles.placeholder}>[ SENTINEL STANDBY ]</Text>}
        {messages.map((msg, i) => (
          <View key={i} style={[styles.bubble, msg.role === 'user' ? styles.userBubble : [styles.aiBubble, { borderLeftColor: theme }]]}>
            <Text style={[styles.bubbleText, msg.role === 'user' ? styles.userText : { color: theme, fontWeight: '700' }]}>{msg.content}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={[styles.inputRow, { borderTopColor: theme + '20' }]}>
        <TouchableOpacity
          style={[styles.sentinelBtn, { borderColor: isSentinelOn ? '#00FF00' : theme + '40' }]}
          onPress={() => { setIsSentinelOn(!isSentinelOn); if(!isSentinelOn) startSentinel(); else ExpoSpeechRecognitionModule.stop(); }}
        >
          <Text style={{ fontSize: 10, color: isSentinelOn ? '#00FF00' : theme }}>{isSentinelOn ? 'ACTIVE' : 'SENTINEL'}</Text>
        </TouchableOpacity>

        <TextInput style={[styles.input, { borderColor: theme + '40', color: theme }]} placeholder={isListening ? "LISTENING..." : "COMMAND..."} placeholderTextColor={theme + '30'} value={inputText} onChangeText={setInputText} onSubmitEditing={() => sendMessage()} />
        <TouchableOpacity style={[styles.sendBtn, { backgroundColor: theme }]} onPress={() => sendMessage()}><Text style={styles.sendBtnText}>⚡</Text></TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', paddingTop: 40, paddingBottom: 20, borderBottomWidth: 1 },
  aura: { position: 'absolute', top: 60, width: 80, height: 80, borderRadius: 40, borderWidth: 2 },
  dataRibbon: { width: '100%', paddingVertical: 6, marginBottom: 15 },
  ribbonText: { fontSize: 8, fontWeight: '800', textAlign: 'center', letterSpacing: 2 },
  logo: { width: 66, height: 66, borderRadius: 33, justifyContent: 'center', alignItems: 'center', shadowOpacity: 1, shadowRadius: 15, elevation: 15 },
  logoText: { color: '#000', fontSize: 32, fontWeight: '900' },
  subtitle: { marginTop: 10, fontSize: 9, fontWeight: '800', letterSpacing: 4 },
  chat: { flex: 1, paddingHorizontal: 16 },
  placeholder: { color: '#1A3333', fontSize: 11, textAlign: 'center', marginTop: 120, letterSpacing: 3 },
  bubble: { marginVertical: 6, maxWidth: '85%', paddingHorizontal: 14, paddingVertical: 10, borderLeftWidth: 3 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#001A1A', borderLeftColor: '#004A4A' },
  aiBubble: { alignSelf: 'flex-start' },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  userText: { color: '#008B8B' },
  inputRow: { flexDirection: 'row', alignItems: 'center', padding: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 20, borderTopWidth: 1, gap: 10 },
  sentinelBtn: { width: 60, height: 48, borderRadius: 4, borderWidth: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000F0F' },
  input: { flex: 1, backgroundColor: '#000F0F', borderWidth: 1, borderRadius: 4, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  sendBtn: { width: 46, height: 48, borderRadius: 4, justifyContent: 'center', alignItems: 'center' },
  sendBtnText: { color: '#000', fontSize: 18, fontWeight: '900' },
});
