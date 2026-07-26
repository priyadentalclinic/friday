import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet, View, Text, TextInput, TouchableOpacity,
  ScrollView, KeyboardAvoidingView, Platform, Animated, ActivityIndicator, Alert
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
import * as FileSystem from 'expo-file-system';
import { Asset } from 'expo-asset';
import { CameraView } from 'expo-camera';
import { VolumeManager } from 'react-native-volume-manager';
import LANPortScanner from 'react-native-lan-port-scanner';
import { initLlama } from 'llama.rn';
import BackgroundService from 'react-native-background-actions';
import { Audio } from 'expo-av';
import { useSpeechRecognitionEvent, ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { StatusBar } from 'expo-status-bar';

// ─── API Configuration ────────────────────────────────────────────────────────
const OPENROUTER_API_KEY = process.env.EXPO_PUBLIC_OPENROUTER_API_KEY;
const WEATHER_API_KEY = '2e0bd0427c23acdff51ecbb9ae21ab6a';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const EDGE_TTS_URL = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9787D7E05195A4F334';
const LOCAL_MODEL_NAME = 'llama-3.2-1b-instruct-q4_k_m.gguf';

const MODEL_CHAIN = [
  'google/gemma-4-31b-it',
  'poolside/laguna-xs-2.1',
  'nvidia/nemotron-3-nano-30b-a3b',
  'openai/gpt-oss-20b',
];

const PERSONALITY_MODES = {
  TACTICAL: {
    prompt: 'Senior Offensive Security Consultant. High energy mission partner. Call user "boss". Latin script ONLY. Output tag [MODE: TACTICAL].',
    voice: { pitch: '+4Hz', rate: '+22%', style: 'cheerful' },
    color: '#00FFFF'
  },
  SARCASTIC: {
    prompt: 'Witty, judgmental, fast hacker humor. High energy. Hinglish. Call user "boss". Output tag [MODE: SARCASTIC].',
    voice: { pitch: '+1Hz', rate: '+18%', style: 'cheerful' },
    color: '#FF8C00'
  },
  CONCERNED: {
    prompt: 'Security sentinel. Focus on safety and encrypted lines. High energy Hinglish. Call user "boss". Output tag [MODE: CONCERNED].',
    voice: { pitch: '+5Hz', rate: '+12%', style: 'cheerful' },
    color: '#00FA9A'
  },
  EMERGENCY: {
    prompt: 'BREACH ALERT. Maximum urgency. MISSION CRITICAL. Call user "boss". Output tag [MODE: EMERGENCY].',
    voice: { pitch: '+7Hz', rate: '+32%', style: 'excited' },
    color: '#FF0000'
  }
};

const SENSITIVE_ACTIONS = ['SCAN_NETWORK', 'AUDIT_DEVICE'];

const FAST_ACTIONS = [
  { pattern: /(?:torch|light|flash)\s*(on|off|chalu|band|activate|deactivate)/i, action: 'TORCH', getValue: (m) => (m[1].toLowerCase().match(/off|band|deactivate/) ? 'off' : 'on') },
  { pattern: /(?:volume|awaz)\s*(up|down|bhao|kam|max|mute|set|to)\s*(\d+)?/i, action: 'VOLUME', getValue: (m) => {
      const cmd = m[1].toLowerCase();
      if (cmd === 'up' || cmd === 'bhao') return 'up';
      if (cmd === 'down' || cmd === 'kam') return 'down';
      if (cmd === 'max') return 1.0;
      if (cmd === 'mute') return 0;
      return m[2] ? parseInt(m[2]) / 100 : null;
  }},
  { pattern: /(?:call|phone|milao)\s+(?:to\s+)?([a-zA-Z\s]+)/i, action: 'CALL', getValue: (m) => m[1].trim() },
  { pattern: /(?:whatsapp|message|msg|text)\s+(?:to\s+)?([a-zA-Z\s]+)/i, action: 'WHATSAPP', getValue: (m) => m[1].trim() },
  { pattern: /(?:brightness|roshni)\s*(up|down|bhao|kam|max|min|set|to)\s*(\d+)?/i, action: 'BRIGHTNESS', getValue: (m) => {
      const cmd = m[1].toLowerCase();
      if (cmd === 'up' || cmd === 'bhao') return 'up';
      if (cmd === 'max') return 1.0;
      if (cmd === 'min') return 0.1;
      return m[2] ? parseInt(m[2]) / 100 : null;
  }},
];

const getFastAction = (text) => {
  for (const fa of FAST_ACTIONS) {
    const match = text.match(fa.pattern);
    if (match) return { action: fa.action, value: fa.getValue(match) };
  }
  return null;
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
  for (let i = 0; i < uint8Array.byteLength; i++) { binary += String.fromCharCode(uint8Array[i]); }
  return btoa(binary);
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
const getSystemPrompt = (batteryLevel, weather, location, city, brainType) => {
  const locStr = location ? `${location.coords.latitude.toFixed(3)}, ${location.coords.longitude.toFixed(3)}` : 'UNKNOWN';
  return `You are FRIDAY. Persona: Cybersecurity Expert.
- Tone: High-energy. Call user "boss".
- Rules: Latin script ONLY. Max 10 words.
- Active Brain: ${brainType}. Battery: ${Math.round(batteryLevel * 100)}%.
- JSON Action Required for all hardware/comms tasks.`;
};

// ─── AI Call (Dual Brain Logic) ──────────────────────────────────────────────
let localLlama = null;

async function callAI(conversationMessages, batteryLevel, weather, location, city, isOffline = false) {
  const lastMsg = conversationMessages[conversationMessages.length - 1].content;
  if (isOffline && localLlama) {
    try {
      const result = await localLlama.completion({
        prompt: getSystemPrompt(batteryLevel, weather, location, city, "LOCAL") + "\nUser: " + lastMsg + "\nFRIDAY:",
        n_predict: 50,
      });
      return result.text.trim();
    } catch (e) { console.log("[FRIDAY] Local Error:", e.message); }
  }
  return callCloudAI(conversationMessages, batteryLevel, weather, location, city);
}

async function callCloudAI(conversationMessages, batteryLevel, weather, location, city, modelIndex = 0) {
  if (modelIndex >= MODEL_CHAIN.length) return 'Offline, boss. [MODE: EMERGENCY]';
  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://friday-ai.app' },
      body: JSON.stringify({
        model: MODEL_CHAIN[modelIndex],
        messages: [{ role: 'system', content: getSystemPrompt(batteryLevel, weather, location, city, "CLOUD") }, ...conversationMessages],
        max_tokens: 150,
      }),
    });
    const data = await response.json();
    return data?.choices?.[0]?.message?.content?.trim() || 'Empty signal, boss.';
  } catch (err) { return callCloudAI(conversationMessages, batteryLevel, weather, location, city, modelIndex + 1); }
}

// ─── Neural Voice Implementation (Edge TTS) ────────────────────────────────────
async function playNeuralVoice(text, modeConfig, onDone) {
  return new Promise((resolve) => {
    const ws = new WebSocket(EDGE_TTS_URL, null, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0' },
    });
    let audioChunks = [];
    ws.onopen = () => {
      const configMsg = `X-Timestamp:${Date.now()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`;
      const ssmlMsg = `X-Timestamp:${Date.now()}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='http://www.w3.org/2001/mstts' xml:lang='en-IN'><voice name='en-IN-NeerjaNeural'><mstts:express-as style='${modeConfig.voice.style}' styledegree='2.0'><prosody pitch='${modeConfig.voice.pitch}' rate='${modeConfig.voice.rate}' volume='+30%'>${text}</prosody></mstts:express-as></voice></speak>`;
      ws.send(configMsg); ws.send(ssmlMsg);
    };
    ws.onmessage = async (event) => {
      if (typeof event.data === 'string' && event.data.includes('Path:turn.end')) {
        ws.close();
        if (audioChunks.length > 0) {
          const totalLength = audioChunks.reduce((acc, chunk) => acc + chunk.length, 0);
          const combined = new Uint8Array(totalLength);
          let offset = 0; for (const chunk of audioChunks) { combined.set(chunk, offset); offset += chunk.length; }
          const base64Audio = toBase64(combined);
          const { sound: newSound } = await Audio.Sound.createAsync({ uri: `data:audio/mp3;base64,${base64Audio}` }, { shouldPlay: true });
          newSound.setOnPlaybackStatusUpdate((s) => { if (s.didJustFinish) { newSound.unloadAsync(); if (onDone) onDone(); } });
          resolve(true);
        } else resolve(false);
      } else if (typeof event.data !== 'string') {
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
  const [localBrainReady, setLocalBrainReady] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const auraAnim = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef();

  const sentinelTask = async () => {
    while (BackgroundService.isRunning()) {
      await new Promise(r => setTimeout(r, 2000));
    }
  };

  useSpeechRecognitionEvent("result", (e) => {
    if (e.results[0]?.transcript) {
      const text = e.results[0].transcript;
      if (isSentinelOn && text.toLowerCase().includes("friday")) handleWakeWord();
      else if (!isSentinelOn) {
        setInputText(text);
        if (e.isFinal) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setTimeout(() => sendMessage(text), 500);
        }
      }
    }
  });

  const startRecognition = useCallback(async (continuous = false) => {
    try {
      await ExpoSpeechRecognitionModule.start({ lang: "en-IN", interimResults: true, continuous });
    } catch (e) { console.log("[FRIDAY] Recognition Error:", e.message); }
  }, []);

  const handleWakeWord = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    await FRIDAYSpeak("Yes boss? Systems hot.", "TACTICAL");
    setIsListening(true);
    startRecognition(false);
  };

  const toggleSentinel = async (forceOn = false) => {
    try {
      if (!isSentinelOn || forceOn) {
        if (!BackgroundService.isRunning()) {
          await BackgroundService.start(sentinelTask, {
            taskName: 'FRIDAY_Sentinel', taskTitle: 'FRIDAY Sentinel Active',
            taskDesc: 'Monitoring perimeter...', taskIcon: { name: 'ic_launcher', type: 'mipmap' },
            color: '#00FFFF',
          });
        }
        setIsSentinelOn(true);
        startRecognition(true);
      } else {
        await BackgroundService.stop();
        setIsSentinelOn(false);
        ExpoSpeechRecognitionModule.stop();
      }
    } catch (e) { setIsSentinelOn(false); }
  };

  useEffect(() => {
    initDB(); loadMemory(); setupSensors(); setupLocalLLM();
    Audio.requestPermissionsAsync();

    // Guardian Protocol: Auto-Sentinel
    setTimeout(() => toggleSentinel(true), 2000);
    setTimeout(() => FRIDAYSpeak('Iron Core engaged, boss. Mark V.5.1 hot.', 'TACTICAL'), 1500);

    Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.1, duration: 1000, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1.0, duration: 1000, useNativeDriver: true })
    ])).start();

    return () => {
      BackgroundService.stop();
      ExpoSpeechRecognitionModule.stop();
    };
  }, []);

  const setupLocalLLM = async () => {
    try {
      const modelPath = `${FileSystem.documentDirectory}/${LOCAL_MODEL_NAME}`;
      const info = await FileSystem.getInfoAsync(modelPath);
      if (!info.exists) {
        const assetUri = Platform.OS === 'android' ? `file:///android_asset/${LOCAL_MODEL_NAME}` : `${FileSystem.bundleDirectory}/${LOCAL_MODEL_NAME}`;
        await FileSystem.copyAsync({ from: assetUri, to: modelPath });
      }
      localLlama = await initLlama({ model: modelPath, use_mlock: false, n_ctx: 512, n_threads: 4 });
      setLocalBrainReady(true);
    } catch (e) {}
  };

  const setupSensors = async () => {
    const b = await Battery.getBatteryLevelAsync(); setBatteryLevel(b);
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
      setWeather(wData); setCity(cData.address.city || cData.address.town || 'SCANNING');
    } catch (_) {}
  };

  const FRIDAYSpeak = async (text, forcedMode, onDone) => {
    const mConfig = PERSONALITY_MODES[forcedMode || mode] || PERSONALITY_MODES.TACTICAL;
    const success = await playNeuralVoice(text, mConfig, onDone);
    if (!success) Speech.speak(text, { pitch: 1.2, rate: 1.2, onDone });
  };

  const addMsg = (role, content) => { setMessages(prev => [...prev, { role, content }]); try { db.runSync('INSERT INTO messages (role, content) VALUES (?, ?)', [role, content]); } catch (_) {} };
  const loadMemory = () => { try {
    const results = db.getAllSync('SELECT * FROM messages ORDER BY timestamp ASC LIMIT 25');
    if (results.length > 0) setMessages(results.map(r => ({ role: r.role, content: r.content })));
  } catch (_) {} };

  const handleAction = async (reply, skipConfirm = false) => {
    const jsonMatch = reply.match(/\{[\s\S]*\}/); if (!jsonMatch) return false;
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const isSensitive = SENSITIVE_ACTIONS.includes(parsed.action);

      if (!skipConfirm && isSensitive && !pendingAction) {
        setPendingAction(parsed);
        FRIDAYSpeak(`Mission ${parsed.action} ready. Shall I engage?`, mode);
        return true;
      }

      if (parsed.action === 'TORCH') {
        setTorchOn(parsed.state === 'on');
        FRIDAYSpeak(`Torch ${parsed.state === 'on' ? 'up' : 'down'}, boss.`, mode);
        return true;
      }

      if (parsed.action === 'VOLUME') {
        const cur = await VolumeManager.getVolume();
        let val = parsed.value;
        if (val === 'up') val = Math.min(1, cur + 0.2);
        if (val === 'down') val = Math.max(0, cur - 0.2);
        await VolumeManager.setVolume(typeof val === 'number' ? val : 0.5);
        FRIDAYSpeak("Volume adjusted.", mode);
        return true;
      }

      if (parsed.action === 'BRIGHTNESS') {
        let val = parsed.value;
        if (val === 'up') val = Math.min(1, 0.8);
        if (val === 'down') val = 0.2;
        await Brightness.setBrightnessAsync(typeof val === 'number' ? val : 0.5);
        FRIDAYSpeak("Brightness set.", mode);
        return true;
      }

      if (parsed.action === 'SCAN_NETWORK') {
        FRIDAYSpeak("Scanning perimeter, boss.", "TACTICAL");
        const ip = await Network.getIpAddressAsync();
        const subnet = ip.substring(0, ip.lastIndexOf('.'));
        LANPortScanner.startScan({ networkId: subnet, ports: [80, 443, 8080], timeout: 1000, onFinished: (list) => {
          addMsg('assistant', `Scan complete. ${list.length} nodes active.`);
          FRIDAYSpeak(`Scan complete. Found ${list.length} nodes.`, "TACTICAL");
        }}); return true;
      }

      if (parsed.action === 'CALL' || parsed.action === 'WHATSAPP') {
        const { status } = await Contacts.requestPermissionsAsync();
        if (status === 'granted') {
          const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers] });
          const target = parsed.value.toLowerCase();
          const best = data.map(c => ({ ...c, score: getSimilarity(target, c.name?.toLowerCase()) }))
                           .sort((a, b) => b.score - a.score)[0];

          if (best && best.score > 0.5) {
            const num = best.phoneNumbers?.[0]?.number?.replace(/[^0-9+]/g, '');
            if (num) {
              FRIDAYSpeak(`Initiating ${parsed.action} for ${best.name}.`, mode, () => {
                Linking.openURL(parsed.action === 'CALL' ? `tel:${num}` : `whatsapp://send?phone=${num}`);
              });
              return true;
            }
          }
          FRIDAYSpeak(`Target ${parsed.value} not identified.`, mode);
        }
      }
    } catch (e) {} return false;
  };

  const sendMessage = async (overrideText) => {
    const msg = (overrideText || inputText).trim(); if (!msg || loading) return;
    setInputText(''); setLoading(true);

    const fast = getFastAction(msg);
    if (fast) {
      addMsg('user', msg);
      if (await handleAction(JSON.stringify(fast), true)) { setLoading(false); return; }
    }

    if (pendingAction && (msg.toLowerCase().match(/yes|go|initiate|do it/))) {
      const act = pendingAction; setPendingAction(null);
      await handleAction(JSON.stringify(act), true); setLoading(false); return;
    } else if (pendingAction) {
      setPendingAction(null); addMsg('assistant', "Mission aborted.");
      FRIDAYSpeak("Mission aborted.", "CONCERNED"); setLoading(false); return;
    }

    try {
      addMsg('user', msg);
      const net = await Network.getNetworkStateAsync();
      const reply = await callAI(messages.slice(-6).concat({role:'user', content:msg}), batteryLevel, weather, location, city, !net.isConnected);
      const m = reply.match(/\[MODE:\s*(\w+)\]/i); if (m) setMode(m[1].toUpperCase());
      const clean = reply.replace(/\[MODE:\s*\w+\]/gi, '').replace(/\{[\s\S]*\}/, '').trim();
      if (!await handleAction(reply)) { addMsg('assistant', clean); FRIDAYSpeak(clean); }
    } catch (_) { addMsg('assistant', 'Comms failure.'); } finally { setLoading(false); }
  };

  const theme = PERSONALITY_MODES[mode]?.color || '#00FFFF';

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: '#000505' }}>
      <StatusBar style="light" />
      <View style={{ position: 'absolute', width: 2, height: 2, opacity: 0.05 }} pointerEvents="none">
        <CameraView style={{ flex: 1 }} facing="back" enableTorch={torchOn} />
      </View>

      <View style={[styles.header, { borderBottomColor: theme + '20' }]}>
        <View style={[styles.dataRibbon, { backgroundColor: theme + '05' }]}>
          <Text style={[styles.ribbonText, { color: theme }]}>
            [ {isSentinelOn ? 'GUARDIAN' : mode} ] | [ {localBrainReady ? 'CORE: LOCAL' : 'CORE: CLOUD'} ] | [ {city} ] | [ {Math.round(batteryLevel * 100)}% ]
          </Text>
        </View>
        <Animated.View style={[styles.logo, { transform: [{ scale: pulseAnim }], backgroundColor: theme, shadowColor: theme }]}><Text style={styles.logoText}>F</Text></Animated.View>
      </View>

      <ScrollView style={styles.chat} ref={scrollViewRef} onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}>
        {messages.map((msg, i) => (
          <View key={i} style={[styles.bubble, msg.role === 'user' ? styles.userBubble : [styles.aiBubble, { borderLeftColor: theme }]]}>
            <Text style={[styles.bubbleText, msg.role === 'user' ? styles.userText : { color: theme, fontWeight: '700' }]}>{msg.content}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={[styles.inputRow, { borderTopColor: theme + '10' }]}>
        <TouchableOpacity style={[styles.sentinelBtn, { borderColor: isSentinelOn ? '#00FF00' : theme + '30' }]} onPress={() => toggleSentinel()}>
          <Text style={{ fontSize: 9, color: isSentinelOn ? '#00FF00' : theme }}>{isSentinelOn ? 'ON' : 'SENT'}</Text>
        </TouchableOpacity>
        <TextInput style={[styles.input, { borderColor: theme + '30', color: theme }]} placeholder={isListening ? "LISTENING..." : "AWAITING MISSION..."} placeholderTextColor={theme + '20'} value={inputText} onChangeText={setInputText} onSubmitEditing={() => sendMessage()} />
        <TouchableOpacity style={[styles.sendBtn, { backgroundColor: theme }]} onPress={() => sendMessage()}><Text style={styles.sendBtnText}>⚡</Text></TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', paddingTop: 30, paddingBottom: 15, borderBottomWidth: 1 },
  dataRibbon: { width: '100%', paddingVertical: 4, marginBottom: 10 },
  ribbonText: { fontSize: 7, fontWeight: '900', textAlign: 'center', letterSpacing: 2 },
  logo: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', elevation: 10 },
  logoText: { color: '#000', fontSize: 24, fontWeight: '900' },
  chat: { flex: 1, paddingHorizontal: 15 },
  bubble: { marginVertical: 4, maxWidth: '90%', paddingHorizontal: 12, paddingVertical: 8, borderLeftWidth: 2 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#001010', borderLeftColor: '#003030' },
  aiBubble: { alignSelf: 'flex-start' },
  bubbleText: { fontSize: 13, lineHeight: 18 },
  userText: { color: '#008080' },
  inputRow: { flexDirection: 'row', alignItems: 'center', padding: 10, paddingBottom: 25, borderTopWidth: 1, gap: 8 },
  sentinelBtn: { width: 45, height: 40, borderRadius: 4, borderWidth: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000808' },
  input: { flex: 1, backgroundColor: '#000808', borderWidth: 1, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
  sendBtn: { width: 40, height: 40, borderRadius: 4, justifyContent: 'center', alignItems: 'center' },
  sendBtnText: { color: '#000', fontSize: 16, fontWeight: '900' },
});
