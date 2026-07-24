import React, { useState, useEffect, useRef } from 'react';
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
    prompt: 'Mission-oriented Hinglish. Short replies. Sound like movie FRIDAY. Call user "boss". Output tag [MODE: TACTICAL].',
    voice: { pitch: '+0Hz', rate: '+10%' },
    color: '#00FFFF'
  },
  SARCASTIC: {
    prompt: 'Witty, judgmental dry humor. Natural Hinglish. Call user "boss". Output tag [MODE: SARCASTIC].',
    voice: { pitch: '-3Hz', rate: '+0%' },
    color: '#FF8C00'
  },
  CONCERNED: {
    prompt: 'Focus on safety/health. Caring tone in simple Hinglish. Call user "boss". Output tag [MODE: CONCERNED].',
    voice: { pitch: '+2Hz', rate: '-5%' },
    color: '#00FA9A'
  },
  EMERGENCY: {
    prompt: 'High urgency, fast, direct. Mission critical. Call user "boss". Output tag [MODE: EMERGENCY].',
    voice: { pitch: '+6Hz', rate: '+25%' },
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
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let binary = '';
  const len = uint8Array.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  let output = '';
  for (let block = 0, charCode, i = 0, map = chars; binary.charAt(i | 0) || (map = '=', i % 1); output += map.charAt(63 & block >> 8 - i % 1 * 8)) {
    charCode = binary.charCodeAt(i += 3 / 4);
    block = block << 8 | charCode;
  }
  return output;
};

// ─── Personality & Data Prompting ─────────────────────────────────────────────
const getSystemPrompt = (batteryLevel, weather, location, city, profileSummary) => {
  const locStr = location ? `${location.coords.latitude.toFixed(3)}, ${location.coords.longitude.toFixed(3)}` : 'UNKNOWN';
  const weatherStr = weather ? `${weather.main.temp}°C, ${weather.weather[0].description}` : 'SCANNING...';

  return `You are FRIDAY, Tony Stark's advanced AI partner.
- Speak in natural, simple HINGLISH (Hindi + English mix). No difficult Hindi words.
- Be proactive. Automatically detect user sentiment.
- Instructions: ${Object.values(PERSONALITY_MODES).map(m => m.prompt).join(' ')}
- Status: Battery ${Math.round(batteryLevel * 100)}% | Weather: ${weatherStr} | Loc: ${city || 'SCANNING'} (${locStr}).
- User Interests: ${profileSummary || 'Analyzing historical logs...'}
- Output format: Your reply text followed by exactly one [MODE: TYPE] tag.
- For navigation, output ONLY: {"action":"NAVIGATE","target":"Place Name"} [MODE: TACTICAL]
- For "Find" requests, output ONLY: {"action":"SEARCH","query":"Search Term"} [MODE: TACTICAL]
- Never break the JSON or tag rule. Keep replies under 15 words.`;
};

// ─── AI Call ──────────────────────────────────────────────────────────────────
async function callAI(conversationMessages, batteryLevel, weather, location, city, profileSummary, modelIndex = 0) {
  if (modelIndex >= MODEL_CHAIN.length) return 'All systems offline, boss. [MODE: EMERGENCY]';
  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://friday-ai.app', 'X-Title': 'FRIDAY Mark IV' },
      body: JSON.stringify({
        model: MODEL_CHAIN[modelIndex],
        messages: [{ role: 'system', content: getSystemPrompt(batteryLevel, weather, location, city, profileSummary) }, ...conversationMessages],
        max_tokens: 150,
        temperature: 0.8,
      }),
    });
    const data = await response.json();
    return data?.choices?.[0]?.message?.content?.trim() || 'Empty signal, boss. [MODE: TACTICAL]';
  } catch (err) {
    return callAI(conversationMessages, batteryLevel, weather, location, city, profileSummary, modelIndex + 1);
  }
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
      const ssmlMsg = `X-Timestamp:${Date.now()}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='hi-IN'><voice name='hi-IN-SwaraNeural'><prosody pitch='${modeConfig.voice.pitch}' rate='${modeConfig.voice.rate}' volume='+0%'>${text}</prosody></voice></speak>`;
      ws.send(configMsg);
      ws.send(ssmlMsg);
    };

    ws.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        if (event.data.includes('Path:turn.end')) {
          ws.close();
          if (audioChunks.length > 0) {
            const totalLength = audioChunks.reduce((acc, chunk) => acc + chunk.length, 0);
            const combined = new Uint8Array(totalLength);
            let offset = 0;
            for (const chunk of audioChunks) { combined.set(chunk, offset); offset += chunk.length; }

            const base64Audio = toBase64(combined);
            const { sound: newSound } = await Audio.Sound.createAsync(
              { uri: `data:audio/mp3;base64,${base64Audio}` },
              { shouldPlay: true }
            );

            newSound.setOnPlaybackStatusUpdate((status) => {
              if (status.didJustFinish) {
                newSound.unloadAsync();
                if (onDone) onDone();
              }
            });
            resolve(true);
          } else { resolve(false); }
        }
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          const buffer = reader.result;
          const view = new DataView(buffer);
          const headerLength = view.getUint16(0);
          const mp3Part = new Uint8Array(buffer.slice(2 + headerLength));
          audioChunks.push(mp3Part);
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
  const [profileSummary, setProfileSummary] = useState('');
  const [isListening, setIsListening] = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scrollViewRef = useRef();
  const proactiveTriggered = useRef({ battery: false, time: false });

  useSpeechRecognitionEvent("start", () => setIsListening(true));
  useSpeechRecognitionEvent("end", () => setIsListening(false));
  useSpeechRecognitionEvent("result", (event) => {
    if (event.results[0]?.transcript) {
      const text = event.results[0].transcript;
      setInputText(text);
      if (event.isFinal) setTimeout(() => sendMessage(text), 600);
    }
  });

  useEffect(() => {
    initDB();
    loadMemory();
    setupSensors();
    Audio.requestPermissionsAsync();

    setTimeout(() => FRIDAYSpeak('Systems online, boss.', 'TACTICAL'), 800);

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 1400, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 1400, useNativeDriver: true }),
      ])
    ).start();

    const checkInterval = setInterval(checkStatus, 60000);
    return () => clearInterval(checkInterval);
  }, []);

  const setupSensors = async () => {
    const b = await Battery.getBatteryLevelAsync(); setBatteryLevel(b);
    Battery.addBatteryLevelListener(({ batteryLevel }) => setBatteryLevel(batteryLevel));
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      const loc = await Location.getCurrentPositionAsync({});
      setLocation(loc);
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
      setWeather(wData);
      setCity(cData.address.city || cData.address.town || cData.address.village || 'UNKNOWN');
    } catch (_) {}
  };

  const checkStatus = () => {
    const hour = new Date().getHours();
    if (batteryLevel > 0 && batteryLevel < 0.15 && !proactiveTriggered.current.battery) {
      triggerProactive("Boss, power critical hai. Charging station dhundo.", "EMERGENCY");
      proactiveTriggered.current.battery = true;
    }
    if (hour === 23 && !proactiveTriggered.current.time) {
      triggerProactive("Boss, 11 baj gaye hain. Efficiency ke liye neend zaroori hai.", "CONCERNED");
      proactiveTriggered.current.time = true;
    }
  };

  const triggerProactive = (msg, m) => {
    addMsg('assistant', msg); setMode(m); FRIDAYSpeak(msg, m);
  };

  const FRIDAYSpeak = async (text, forcedMode, onDone) => {
    const mConfig = PERSONALITY_MODES[forcedMode || mode] || PERSONALITY_MODES.TACTICAL;
    const success = await playNeuralVoice(text, mConfig, onDone);
    if (!success) {
      Speech.speak(text, { pitch: 1.0, rate: 1.0, onDone });
    }
  };

  const loadMemory = () => {
    try {
      const results = db.getAllSync('SELECT * FROM messages ORDER BY timestamp ASC LIMIT 20');
      if (results.length > 0) setMessages(results.map(r => ({ role: r.role, content: r.content })));
      const users = db.getAllSync('SELECT content FROM messages WHERE role="user"');
      if (users.length > 5) setProfileSummary(`Frequent topics: ${users.slice(-5).map(u => u.content).join(', ')}`);
    } catch (_) {}
  };

  const saveToMemory = (role, content) => {
    try { db.runSync('INSERT INTO messages (role, content) VALUES (?, ?)', [role, content]); } catch (_) {}
  };

  const addMsg = (role, content) => {
    setMessages(prev => [...prev, { role, content }]);
    saveToMemory(role, content);
  };

  const handleAction = async (reply) => {
    const jsonMatch = reply.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return false;
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.action === 'NAVIGATE') {
        const url = Platform.select({ ios: `maps:0,0?q=${encodeURIComponent(parsed.target)}`, android: `geo:0,0?q=${encodeURIComponent(parsed.target)}` });

        let briefing = `Plotting route to ${parsed.target}, boss.`;
        if (location) {
          try {
            const destResp = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(parsed.target)}&format=json&limit=1`, { headers: { 'User-Agent': 'FRIDAY-AI/1.0' } });
            const destData = await destResp.json();
            if (destData[0]) {
              const osrmResp = await fetch(`http://router.project-osrm.org/route/v1/driving/${location.coords.longitude},${location.coords.latitude};${destData[0].lon},${destData[0].lat}?overview=false`);
              const osrmData = await osrmResp.json();
              if (osrmData.routes[0]) {
                const dist = (osrmData.routes[0].distance / 1000).toFixed(1);
                const dur = Math.round(osrmData.routes[0].duration / 60);
                briefing = `${parsed.target} is ${dist} km away. ETA ${dur} minutes, boss. Initiating.`;
              }
            }
          } catch (e) { }
        }
        FRIDAYSpeak(briefing, mode, () => Linking.openURL(url));
        return true;
      }
      if (parsed.action === 'SEARCH') {
        const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parsed.query)}`;
        FRIDAYSpeak(`Searching for ${parsed.query} nearby, boss.`, mode, () => Linking.openURL(url));
        return true;
      }
    } catch (_) {}
    return false;
  };

  const sendMessage = async (overrideText) => {
    const msg = (overrideText || inputText).trim();
    if (!msg || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    addMsg('user', msg); setInputText(''); setLoading(true);

    try {
      const payload = messages.slice(-6).map(m => ({ role: m.role, content: m.content }));
      payload.push({ role: 'user', content: msg });
      const reply = await callAI(payload, batteryLevel, weather, location, city, profileSummary);

      const modeMatch = reply.match(/\[MODE:\s*(\w+)\]/i);
      const newMode = modeMatch ? modeMatch[1].toUpperCase() : 'TACTICAL';
      setMode(newMode);

      const cleanReply = reply.replace(/\[MODE:\s*\w+\]/gi, '').replace(/\{[\s\S]*\}/, '').trim();
      const actionHandled = await handleAction(reply);

      if (!actionHandled) {
        addMsg('assistant', cleanReply);
        FRIDAYSpeak(cleanReply, newMode);
      } else {
        addMsg('assistant', `↗ MISSION ACTIVE: ${newMode}`);
      }
    } catch (_) {
      addMsg('assistant', 'Data link failure, boss.');
    } finally { setLoading(false); }
  };

  const currentTheme = PERSONALITY_MODES[mode]?.color || '#00FFFF';

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.container, { backgroundColor: '#000808' }]}>
      <StatusBar style="light" />
      <View style={[styles.header, { borderBottomColor: currentTheme + '30' }]}>
        <View style={[styles.dataRibbon, { backgroundColor: currentTheme + '05' }]}>
          <Text style={[styles.ribbonText, { color: currentTheme }]}>
            [ {mode} ]  |  [ {city?.toUpperCase() || 'SCANNING...'} ]  |  [ {weather ? `${Math.round(weather.main.temp)}°C` : '--'} ]  |  [ {Math.round(batteryLevel * 100)}% PWR ]
          </Text>
        </View>
        <Animated.View style={[styles.logo, { transform: [{ scale: pulseAnim }], backgroundColor: currentTheme, shadowColor: currentTheme }]}>
          <Text style={styles.logoText}>F</Text>
        </Animated.View>
        <Text style={[styles.subtitle, { color: currentTheme }]}>{loading ? 'SYNCING...' : 'FRIDAY MARK IV'}</Text>
      </View>

      <ScrollView style={styles.chat} ref={scrollViewRef} onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}>
        {messages.length === 0 && <Text style={styles.placeholder}>[ CORE ONLINE ]</Text>}
        {messages.map((msg, i) => (
          <View key={i} style={[styles.bubble, msg.role === 'user' ? styles.userBubble : [styles.aiBubble, { borderLeftColor: currentTheme }]]}>
            <Text style={[styles.bubbleText, msg.role === 'user' ? styles.userText : { color: currentTheme, fontWeight: '700' }]}>{msg.content}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={[styles.inputRow, { borderTopColor: currentTheme + '20' }]}>
        <TouchableOpacity
          style={[styles.micBtn, { borderColor: isListening ? '#FF0000' : currentTheme + '40' }]}
          onPress={() => isListening ? ExpoSpeechRecognitionModule.stop() : ExpoSpeechRecognitionModule.start({ lang: "hi-IN", interimResults: true })}
        >
          <Text style={{ fontSize: 20 }}>{isListening ? '●' : '🎤'}</Text>
        </TouchableOpacity>
        <TextInput
          style={[styles.input, { borderColor: currentTheme + '40', color: currentTheme }]}
          placeholder={isListening ? "LISTENING..." : "COMMAND..."}
          placeholderTextColor={currentTheme + '30'}
          value={inputText} onChangeText={setInputText} onSubmitEditing={() => sendMessage()}
        />
        <TouchableOpacity style={[styles.sendBtn, { backgroundColor: currentTheme }]} onPress={() => sendMessage()}>
          <Text style={styles.sendBtnText}>⚡</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { alignItems: 'center', paddingTop: 40, paddingBottom: 20, borderBottomWidth: 1 },
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
  micBtn: { width: 46, height: 48, borderRadius: 23, borderWidth: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000F0F' },
  input: { flex: 1, backgroundColor: '#000F0F', borderWidth: 1, borderRadius: 4, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  sendBtn: { width: 46, height: 48, borderRadius: 4, justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { backgroundColor: '#1A3333' },
  sendBtnText: { color: '#000', fontSize: 18, fontWeight: '900' },
});
