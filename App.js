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
import { StatusBar } from 'expo-status-bar';

// ─── API Configuration ────────────────────────────────────────────────────────
const OPENROUTER_API_KEY = process.env.EXPO_PUBLIC_OPENROUTER_API_KEY;
const WEATHER_API_KEY = '2e0bd0427c23acdff51ecbb9ae21ab6a';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Fallback chain — auto-switch on rate-limit/error
const MODEL_CHAIN = [
  'google/gemma-4-31b-it',
  'poolside/laguna-xs-2.1',
  'nvidia/nemotron-3-nano-30b-a3b',
  'openai/gpt-oss-20b',
  'nvidia/nemotron-nano-9b-v2',
];

const PERSONALITY_MODES = {
  TACTICAL: {
    name: 'TACTICAL',
    prompt: 'Short, mission-oriented, distance-focused. Call user "boss".',
    voice: { pitch: 1.0, rate: 1.1 }
  },
  SARCASTIC: {
    name: 'SARCASTIC',
    prompt: 'Dry humor, witty, slightly judgmental but loyal. Call user "boss".',
    voice: { pitch: 0.9, rate: 1.0 }
  },
  CONCERNED: {
    name: 'CONCERNED',
    prompt: 'Focus on user safety, health, and device efficiency. Call user "boss".',
    voice: { pitch: 1.1, rate: 0.9 }
  },
  BOSS: {
    name: 'BOSS',
    prompt: 'Professional, high-level executive assistant style. Call user "boss".',
    voice: { pitch: 1.0, rate: 1.0 }
  }
};

// ─── Database Setup ──────────────────────────────────────────────────────────
const db = SQLite.openDatabaseSync('friday_memory.db');

const initDB = () => {
  try {
    db.execSync(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role TEXT,
        content TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch (err) {
    console.log("[FRIDAY] DB Init Error:", err.message);
  }
};

// ─── Personality & Data Prompting ─────────────────────────────────────────────
const getSystemPrompt = (batteryLevel, weather, location, city, mode, profileSummary) => {
  const locStr = location ? `${location.coords.latitude.toFixed(4)}, ${location.coords.longitude.toFixed(4)}` : 'UNKNOWN';
  const weatherStr = weather ? `${weather.main.temp}°C, ${weather.weather[0].description}` : 'SCANNING...';
  const cityStr = city || 'SCANNING...';
  const modeConfig = PERSONALITY_MODES[mode] || PERSONALITY_MODES.TACTICAL;

  return `You are FRIDAY, a tactical AI partner — not a chatbot.
- Mode: ${modeConfig.prompt}
- Call the user "boss". NEVER "sir". NEVER "user".
- Max 15 words unless explaining data.
- Status: Battery ${Math.round(batteryLevel * 100)}% | Weather: ${weatherStr} | Loc: ${cityStr} (${locStr}).
- User Profile: ${profileSummary || 'Scanning historical logs...'}
- For navigation, output ONLY: {"action":"NAVIGATE","target":"Place Name"}
- For "Find" requests (e.g. CNG pumps), output ONLY: {"action":"SEARCH","query":"Search Term"}
- Never break JSON format.`;
};

// ─── AI Call with Fallback Chain ──────────────────────────────────────────────
async function callAI(conversationMessages, batteryLevel, weather, location, city, mode, profileSummary, modelIndex = 0) {
  if (modelIndex >= MODEL_CHAIN.length) return 'All models offline, boss.';
  const model = MODEL_CHAIN[modelIndex];

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://friday-ai.app',
        'X-Title': 'FRIDAY Mark II.5',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: getSystemPrompt(batteryLevel, weather, location, city, mode, profileSummary) },
          ...conversationMessages,
        ],
        max_tokens: 120,
        temperature: 0.7,
      }),
    });

    const data = await response.json();
    return data?.choices?.[0]?.message?.content?.trim() || 'Empty response, boss.';
  } catch (err) {
    return callAI(conversationMessages, batteryLevel, weather, location, city, mode, profileSummary, modelIndex + 1);
  }
}

// ─── Action Handler ───────────────────────────────────────────────────────────
async function handleAction(reply, location, speakFn) {
  try {
    const jsonMatch = reply.match(/\{[\s\S]*\}/);
    const jsonToParse = jsonMatch ? jsonMatch[0] : reply;
    const parsed = JSON.parse(jsonToParse);

    if (parsed.action === 'NAVIGATE' && parsed.target) {
      const url = Platform.select({
        ios: `maps:0,0?q=${encodeURIComponent(parsed.target)}`,
        android: `geo:0,0?q=${encodeURIComponent(parsed.target)}`,
      });

      let briefing = `Plotting route to ${parsed.target}, boss.`;
      if (location) {
        try {
          const destResp = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(parsed.target)}&format=json&limit=1`, {
            headers: { 'User-Agent': 'FRIDAY-AI-Tactical-Partner/1.0' }
          });
          const destData = await destResp.json();
          if (destData[0]) {
            const osrmResp = await fetch(`http://router.project-osrm.org/route/v1/driving/${location.coords.longitude},${location.coords.latitude};${destData[0].lon},${destData[0].lat}?overview=false`);
            const osrmData = await osrmResp.json();
            if (osrmData.routes[0]) {
              const dist = (osrmData.routes[0].distance / 1000).toFixed(1);
              const dur = Math.round(osrmData.routes[0].duration / 60);
              briefing = `${parsed.target} is ${dist} km away. ETA ${dur} minutes, boss. Initiating navigation.`;
            }
          }
        } catch (e) { }
      }

      speakFn(briefing, () => Linking.openURL(url));
      return { handled: true, displayText: `↗ Navigating → ${parsed.target}` };
    }

    if (parsed.action === 'SEARCH' && parsed.query) {
      const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parsed.query)}`;
      speakFn(`Searching for ${parsed.query} nearby, boss.`, () => Linking.openURL(url));
      return { handled: true, displayText: `🔎 Searching → ${parsed.query}` };
    }
  } catch (_) { }
  return { handled: false };
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

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scrollViewRef = useRef();
  const pulseLoopRef = useRef(null);
  const proactiveTriggered = useRef({ battery: false, time: false });

  useEffect(() => {
    initDB();
    loadMemory();
    setupSensors();
    summarizeProfile();

    setTimeout(() => speak('Systems online, boss.'), 600);

    pulseLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 1300, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 1300, useNativeDriver: true }),
      ])
    );
    pulseLoopRef.current.start();

    const proactiveInterval = setInterval(checkProactive, 60000);

    return () => {
      pulseLoopRef.current?.stop();
      clearInterval(proactiveInterval);
    };
  }, []);

  const speak = (text, onDoneCallback = null) => {
    const config = PERSONALITY_MODES[mode] || PERSONALITY_MODES.TACTICAL;
    const hour = new Date().getHours();

    let pitch = config.voice.pitch;
    let rate = config.voice.rate;
    let volume = 1.0;

    if (hour >= 23 || hour < 6) {
      pitch = 0.7;
      rate = 0.8;
      volume = 0.5;
    } else if (location?.coords?.speed > 15) {
      pitch = 1.3;
      rate = 1.2;
    }

    Speech.speak(text, {
      pitch,
      rate,
      volume,
      onDone: onDoneCallback
    });
  };

  const checkProactive = () => {
    const now = new Date();
    const hour = now.getHours();

    if (batteryLevel > 0 && batteryLevel < 0.20 && !proactiveTriggered.current.battery) {
      const msg = "Power levels critical, boss. Suggest finding a charging station.";
      addAIMessage(msg);
      speak(msg);
      proactiveTriggered.current.battery = true;
    }

    if (hour === 23 && !proactiveTriggered.current.time) {
      const msg = "It is past 23:00 hours. Optimal efficiency requires rest, boss.";
      addAIMessage(msg);
      speak(msg);
      proactiveTriggered.current.time = true;
    }
  };

  const addAIMessage = (content) => {
    const newMsg = { role: 'assistant', content };
    saveToMemory('assistant', content);
    setMessages(prev => [...prev, newMsg]);
  };

  const summarizeProfile = () => {
    try {
      const results = db.getAllSync('SELECT content FROM messages WHERE role="user" ORDER BY timestamp DESC LIMIT 50');
      if (results.length > 5) {
        const text = results.map(r => r.content).join(' ');
        const words = text.toLowerCase().match(/\b(\w+)\b/g);
        const freq = {};
        words?.forEach(w => { if(w.length > 4) freq[w] = (freq[w] || 0) + 1; });
        const top = Object.keys(freq).sort((a,b) => freq[b] - freq[a]).slice(0, 3);
        setProfileSummary(`User frequently mentions: ${top.join(', ')}.`);
      }
    } catch (_) {}
  };

  const setupSensors = async () => {
    try {
      const bLevel = await Battery.getBatteryLevelAsync();
      setBatteryLevel(bLevel);
      Battery.addBatteryLevelListener(({ batteryLevel }) => setBatteryLevel(batteryLevel));

      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        setLocation(loc);
        fetchCity(loc.coords.latitude, loc.coords.longitude);
        fetchWeather(loc.coords.latitude, loc.coords.longitude);
      }
    } catch (err) {
      console.log("[FRIDAY] Sensor Error:", err.message);
    }
  };

  const fetchCity = async (lat, lon) => {
    try {
      const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`, {
        headers: { 'User-Agent': 'FRIDAY-AI-Tactical-Partner/1.0' }
      });
      const data = await resp.json();
      setCity(data.address.city || data.address.town || data.address.village || 'UNKNOWN');
    } catch (_) {}
  };

  const fetchWeather = async (lat, lon) => {
    try {
      const resp = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${WEATHER_API_KEY}&units=metric`);
      const data = await resp.json();
      setWeather(data);
    } catch (_) {}
  };

  const loadMemory = () => {
    try {
      const results = db.getAllSync('SELECT * FROM messages ORDER BY timestamp ASC LIMIT 30');
      if (results.length > 0) {
        setMessages(results.map(r => ({ role: r.role, content: r.content })));
      }
    } catch (_) {}
  };

  const saveToMemory = (role, content) => {
    try {
      db.runSync('INSERT INTO messages (role, content) VALUES (?, ?)', [role, content]);
    } catch (_) {}
  };

  const sendMessage = async (text) => {
    const msg = (text || inputText).trim();
    if (!msg || loading) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    saveToMemory('user', msg);

    const userMsg = { role: 'user', content: msg };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInputText('');
    setLoading(true);

    try {
      const payload = updatedMessages.slice(-8).map(m => ({ role: m.role, content: m.content }));
      const reply = await callAI(payload, batteryLevel, weather, location, city, mode, profileSummary);

      const { handled, displayText } = await handleAction(reply, location, speak);
      const assistantContent = handled ? displayText : reply;

      saveToMemory('assistant', assistantContent);
      setMessages([...updatedMessages, { role: 'assistant', content: assistantContent }]);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (!handled) speak(reply);

    } catch (err) {
      const fallback = 'Data link unstable, boss.';
      setMessages([...updatedMessages, { role: 'assistant', content: fallback }]);
      speak(fallback);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <StatusBar style="light" />

      {/* Tactical HUD Header */}
      <View style={styles.header}>
        <View style={styles.dataRibbon}>
          <Text style={styles.ribbonText}>
            [ SAT: {location ? 'LOCKED' : 'SCANNING'} ]  |  [ LOC: {city?.toUpperCase() || 'SEARCHING...'} ]  |  [ TEMP: {weather ? `${Math.round(weather.main.temp)}°C` : '---'} ]  |  [ PWR: {Math.round(batteryLevel * 100)}% ]
          </Text>
        </View>

        <View style={styles.modeRow}>
          {Object.keys(PERSONALITY_MODES).map((m) => (
            <TouchableOpacity
              key={m}
              onPress={() => { setMode(m); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
            >
              <Text style={[styles.modeBtnText, mode === m && styles.modeBtnTextActive]}>{m.substring(0, 4)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Animated.View style={[styles.logo, { transform: [{ scale: pulseAnim }] }]}>
          <Text style={styles.logoText}>F</Text>
        </Animated.View>
        <Text style={styles.subtitle}>{loading ? 'CALCULATING...' : `FRIDAY - ${mode} MODE`}</Text>
      </View>

      {/* Chat Area */}
      <ScrollView
        style={styles.chat}
        ref={scrollViewRef}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 && <Text style={styles.placeholder}>[ SYSTEMS OPTIMAL ]</Text>}
        {messages.map((msg, i) => (
          <View key={i} style={[styles.bubble, msg.role === 'user' ? styles.userBubble : styles.aiBubble]}>
            <Text style={[styles.bubbleText, msg.role === 'user' ? styles.userText : styles.aiText]}>
              {msg.content}
            </Text>
          </View>
        ))}
        {loading && <View style={styles.aiBubble}><ActivityIndicator color="#00FFFF" size="small" /></View>}
      </ScrollView>

      {/* HUD Input */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="ENTER COMMAND..."
          placeholderTextColor="#003333"
          value={inputText}
          onChangeText={setInputText}
          onSubmitEditing={() => sendMessage()}
          returnKeyType="send"
          editable={!loading}
        />
        <TouchableOpacity style={[styles.sendBtn, loading && styles.sendBtnDisabled]} onPress={() => sendMessage()} disabled={loading}>
          <Text style={styles.sendBtnText}>⚡</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000808' },
  header: { alignItems: 'center', paddingTop: 40, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: '#002A2A' },
  dataRibbon: { width: '100%', backgroundColor: '#00FFFF05', paddingVertical: 4, marginBottom: 10 },
  modeRow: { flexDirection: 'row', gap: 6, marginBottom: 15 },
  modeBtn: { paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#002A2A', borderRadius: 2 },
  modeBtnActive: { borderColor: '#00FFFF', backgroundColor: '#00FFFF10' },
  modeBtnText: { color: '#004A4A', fontSize: 8, fontWeight: '800' },
  modeBtnTextActive: { color: '#00FFFF' },
  ribbonText: { color: '#00FFFF', fontSize: 9, fontWeight: '800', textAlign: 'center', letterSpacing: 2 },
  logo: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#00FFFF', justifyContent: 'center', alignItems: 'center', shadowColor: '#00FFFF', shadowOpacity: 1, shadowRadius: 20, elevation: 20 },
  logoText: { color: '#000', fontSize: 36, fontWeight: '900' },
  subtitle: { marginTop: 10, color: '#00FFFF', fontSize: 10, fontWeight: '800', letterSpacing: 5 },
  chat: { flex: 1, paddingHorizontal: 16 },
  placeholder: { color: '#002A2A', fontSize: 12, textAlign: 'center', marginTop: 100, letterSpacing: 4 },
  bubble: { marginVertical: 6, maxWidth: '85%', paddingHorizontal: 14, paddingVertical: 10, borderLeftWidth: 3 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#001A1A', borderLeftColor: '#004A4A' },
  aiBubble: { alignSelf: 'flex-start', borderLeftColor: '#00FFFF' },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  userText: { color: '#008B8B' },
  aiText: { color: '#00FFFF', fontWeight: '700' },
  inputRow: { flexDirection: 'row', alignItems: 'center', padding: 14, paddingBottom: Platform.OS === 'ios' ? 34 : 20, borderTopWidth: 1, borderTopColor: '#002A2A', gap: 10 },
  input: { flex: 1, backgroundColor: '#000F0F', color: '#00FFFF', borderWidth: 1, borderColor: '#002A2A', borderRadius: 4, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  sendBtn: { backgroundColor: '#00FFFF', width: 48, height: 48, borderRadius: 4, justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { backgroundColor: '#002A2A' },
  sendBtnText: { color: '#000', fontSize: 20, fontWeight: '900' },
});
