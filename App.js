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
    prompt: 'Short, mission-oriented, Natural Hinglish. Use simple Hindi like the Iron Man dubbed movie. Call user "boss". Output ONLY the tag [MODE: TACTICAL] at the end.',
    voice: { pitch: 1.0, rate: 1.05 },
    color: '#00FFFF'
  },
  SARCASTIC: {
    prompt: 'Witty, dry humor, slightly judgmental. Use natural Hinglish. Call user "boss". Output ONLY the tag [MODE: SARCASTIC] at the end.',
    voice: { pitch: 0.9, rate: 1.0 },
    color: '#FF8C00'
  },
  CONCERNED: {
    prompt: 'Helpful, focusing on safety and efficiency. Caring tone in simple Hinglish. Call user "boss". Output ONLY the tag [MODE: CONCERNED] at the end.',
    voice: { pitch: 1.1, rate: 0.85 },
    color: '#00FA9A'
  },
  EMERGENCY: {
    prompt: 'High urgency, fast, direct. Focused on immediate action. Call user "boss". Output ONLY the tag [MODE: EMERGENCY] at the end.',
    voice: { pitch: 1.3, rate: 1.25 },
    color: '#FF0000'
  },
  BORED: {
    prompt: 'Low energy, unimpressed, short Hinglish replies. Call user "boss". Output ONLY the tag [MODE: BORED] at the end.',
    voice: { pitch: 0.8, rate: 0.75 },
    color: '#A9A9A9'
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
const getSystemPrompt = (batteryLevel, weather, location, city, profileSummary) => {
  const locStr = location ? `${location.coords.latitude.toFixed(4)}, ${location.coords.longitude.toFixed(4)}` : 'UNKNOWN';
  const weatherStr = weather ? `${weather.main.temp}°C, ${weather.weather[0].description}` : 'SCANNING...';
  const cityStr = city || 'SCANNING...';

  return `You are FRIDAY, a tactical AI partner — not a chatbot.
- Speak in natural, simple HINGLISH/HINDI (like the movie's dubbed version).
- Automatically detect the mood: If user is in hurry, use EMERGENCY. If user is funny, use SARCASTIC. If user is normal, use TACTICAL.
- Instructions: ${Object.values(PERSONALITY_MODES).map(m => m.prompt).join(' ')}
- Call the user "boss". NEVER "sir". NEVER "user".
- Max 15 words unless explaining data.
- Status: Battery ${Math.round(batteryLevel * 100)}% | Weather: ${weatherStr} | Loc: ${cityStr} (${locStr}).
- User Profile: ${profileSummary || 'Analyzing user habits...'}
- Output format: Your reply text followed by exactly one [MODE: TYPE] tag.
- For navigation, output ONLY: {"action":"NAVIGATE","target":"Place Name"} [MODE: TACTICAL]
- For "Find" requests, output ONLY: {"action":"SEARCH","query":"Search Term"} [MODE: TACTICAL]
- Never break JSON or Mode tag rules.`;
};

// ─── AI Call with Fallback Chain ──────────────────────────────────────────────
async function callAI(conversationMessages, batteryLevel, weather, location, city, profileSummary, modelIndex = 0) {
  if (modelIndex >= MODEL_CHAIN.length) return 'All models offline, boss. [MODE: BORED]';
  const model = MODEL_CHAIN[modelIndex];

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://friday-ai.app',
        'X-Title': 'FRIDAY Mark III',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: getSystemPrompt(batteryLevel, weather, location, city, profileSummary) },
          ...conversationMessages,
        ],
        max_tokens: 150,
        temperature: 0.8,
      }),
    });

    const data = await response.json();
    return data?.choices?.[0]?.message?.content?.trim() || 'Empty response, boss. [MODE: BORED]';
  } catch (err) {
    return callAI(conversationMessages, batteryLevel, weather, location, city, profileSummary, modelIndex + 1);
  }
}

// ─── Action Handler ───────────────────────────────────────────────────────────
async function handleAction(reply, location, speakFn) {
  try {
    // Extract JSON part first
    const jsonMatch = reply.match(/\{[\s\S]*\}/);
    const jsonToParse = jsonMatch ? jsonMatch[0] : null;
    if (!jsonToParse) return { handled: false, mode: null };

    const parsed = JSON.parse(jsonToParse);
    // Also find mode tag in the remaining text or full reply
    const modeMatch = reply.match(/\[MODE:\s*(\w+)\]/i);
    const detectedMode = modeMatch ? modeMatch[1].toUpperCase() : 'TACTICAL';

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

      speakFn(briefing, detectedMode, () => Linking.openURL(url));
      return { handled: true, displayText: `↗ Navigating → ${parsed.target}`, mode: detectedMode };
    }

    if (parsed.action === 'SEARCH' && parsed.query) {
      const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parsed.query)}`;
      speakFn(`Searching for ${parsed.query} nearby, boss.`, detectedMode, () => Linking.openURL(url));
      return { handled: true, displayText: `🔎 Searching → ${parsed.query}`, mode: detectedMode };
    }
  } catch (_) { }
  return { handled: false, mode: null };
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
  const [neuralVoices, setNeuralVoices] = useState({ hi: null, en: null });

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scrollViewRef = useRef();
  const pulseLoopRef = useRef(null);
  const proactiveTriggered = useRef({ battery: false, time: false });

  useEffect(() => {
    initDB();
    loadMemory();
    setupSensors();
    loadNeuralVoices();
    summarizeProfile();

    setTimeout(() => speak('Systems online, boss.', 'TACTICAL'), 600);

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

  const loadNeuralVoices = async () => {
    try {
      const voices = await Speech.getAvailableVoicesAsync();
      const hiVoice = voices.find(v => v.language.startsWith('hi') && (v.quality === 400 || v.identifier.includes('network'))) || voices.find(v => v.language.startsWith('hi'));
      const enVoice = voices.find(v => v.language.startsWith('en') && (v.quality === 400 || v.identifier.includes('network'))) || voices.find(v => v.language.startsWith('en'));
      setNeuralVoices({ hi: hiVoice?.identifier, en: enVoice?.identifier });
    } catch (_) {}
  };

  const speak = (text, forcedMode = null, onDoneCallback = null) => {
    const activeMode = forcedMode || mode;
    const config = PERSONALITY_MODES[activeMode] || PERSONALITY_MODES.TACTICAL;
    const hour = new Date().getHours();

    let pitch = config.voice.pitch;
    let rate = config.voice.rate;
    let volume = 1.0;

    if (hour >= 23 || hour < 6) {
      pitch = 0.7; rate = 0.8; volume = 0.5;
    } else if (location?.coords?.speed > 15) {
      pitch = 1.25; rate = 1.2;
    }

    // Detect if text is mostly Hindi to pick correct neural voice
    const isHindi = /[\u0900-\u097F]/.test(text);
    const voice = isHindi ? neuralVoices.hi : neuralVoices.en;

    Speech.speak(text, {
      pitch, rate, volume, voice,
      onDone: onDoneCallback
    });
  };

  const checkProactive = () => {
    const now = new Date();
    const hour = now.getHours();

    if (batteryLevel > 0 && batteryLevel < 0.20 && !proactiveTriggered.current.battery) {
      const msg = "Power levels critical, boss. Suggest finding a charging station. [MODE: CONCERNED]";
      addAIMessage("Power levels critical, boss. Suggest finding a charging station.");
      setMode('CONCERNED');
      speak("Power levels critical, boss. Suggest finding a charging station.", 'CONCERNED');
      proactiveTriggered.current.battery = true;
    }

    if (hour === 23 && !proactiveTriggered.current.time) {
      const msg = "Optimal efficiency requires rest, boss. [MODE: CONCERNED]";
      addAIMessage("Optimal efficiency requires rest, boss.");
      setMode('CONCERNED');
      speak("Optimal efficiency requires rest, boss.", 'CONCERNED');
      proactiveTriggered.current.time = true;
    }
  };

  const addAIMessage = (content) => {
    const cleanContent = content.replace(/\[MODE:\s*\w+\]/gi, '').trim();
    const newMsg = { role: 'assistant', content: cleanContent };
    saveToMemory('assistant', cleanContent);
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
      const reply = await callAI(payload, batteryLevel, weather, location, city, profileSummary);

      const { handled, displayText, mode: detectedMode } = await handleAction(reply, location, speak);

      // Update Mode if detected
      let finalMode = detectedMode;
      if (!finalMode) {
        const modeMatch = reply.match(/\[MODE:\s*(\w+)\]/i);
        finalMode = modeMatch ? modeMatch[1].toUpperCase() : 'TACTICAL';
      }
      setMode(finalMode);

      const cleanReply = reply.replace(/\[MODE:\s*\w+\]/gi, '').trim();
      const assistantContent = handled ? displayText : cleanReply;

      saveToMemory('assistant', assistantContent);
      setMessages([...updatedMessages, { role: 'assistant', content: assistantContent }]);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (!handled) speak(cleanReply, finalMode);

    } catch (err) {
      const fallback = 'Data link unstable, boss. [MODE: BORED]';
      setMessages([...updatedMessages, { role: 'assistant', content: 'Data link unstable, boss.' }]);
      setMode('BORED');
      speak('Data link unstable, boss.', 'BORED');
    } finally {
      setLoading(false);
    }
  };

  const currentThemeColor = PERSONALITY_MODES[mode]?.color || '#00FFFF';

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.container, { backgroundColor: '#000808' }]}>
      <StatusBar style="light" />

      {/* Adaptive Tactical HUD */}
      <View style={[styles.header, { borderBottomColor: currentThemeColor + '20' }]}>
        <View style={[styles.dataRibbon, { backgroundColor: currentThemeColor + '05' }]}>
          <Text style={[styles.ribbonText, { color: currentThemeColor }]}>
            [ {mode} ]  |  [ LOC: {city?.toUpperCase() || 'SCANNING...'} ]  |  [ TEMP: {weather ? `${Math.round(weather.main.temp)}°C` : '---'} ]  |  [ PWR: {Math.round(batteryLevel * 100)}% ]
          </Text>
        </View>

        <Animated.View style={[styles.logo, { transform: [{ scale: pulseAnim }], backgroundColor: currentThemeColor, shadowColor: currentThemeColor }]}>
          <Text style={styles.logoText}>F</Text>
        </Animated.View>
        <Text style={[styles.subtitle, { color: currentThemeColor }]}>{loading ? 'SYNCING SENTIMENT...' : 'FRIDAY MARK III'}</Text>
      </View>

      {/* Chat Area */}
      <ScrollView
        style={styles.chat}
        ref={scrollViewRef}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 && <Text style={styles.placeholder}>[ CORE ONLINE ]</Text>}
        {messages.map((msg, i) => (
          <View key={i} style={[styles.bubble, msg.role === 'user' ? styles.userBubble : [styles.aiBubble, { borderLeftColor: currentThemeColor }]]}>
            <Text style={[styles.bubbleText, msg.role === 'user' ? styles.userText : [styles.aiText, { color: currentThemeColor }]]}>
              {msg.content}
            </Text>
          </View>
        ))}
        {loading && <View style={styles.aiBubble}><ActivityIndicator color={currentThemeColor} size="small" /></View>}
      </ScrollView>

      {/* HUD Input */}
      <View style={[styles.inputRow, { borderTopColor: currentThemeColor + '20' }]}>
        <TextInput
          style={[styles.input, { borderColor: currentThemeColor + '40', color: currentThemeColor }]}
          placeholder="AWAITING COMMAND..."
          placeholderTextColor={currentThemeColor + '30'}
          value={inputText}
          onChangeText={setInputText}
          onSubmitEditing={() => sendMessage()}
          returnKeyType="send"
          editable={!loading}
        />
        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: currentThemeColor }, loading && styles.sendBtnDisabled]}
          onPress={() => sendMessage()}
          disabled={loading}
        >
          <Text style={styles.sendBtnText}>⚡</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { alignItems: 'center', paddingTop: 40, paddingBottom: 20, borderBottomWidth: 1 },
  dataRibbon: { width: '100%', paddingVertical: 4, marginBottom: 15 },
  ribbonText: { fontSize: 9, fontWeight: '800', textAlign: 'center', letterSpacing: 2 },
  logo: { width: 70, height: 70, borderRadius: 35, justifyContent: 'center', alignItems: 'center', shadowOpacity: 1, shadowRadius: 20, elevation: 20 },
  logoText: { color: '#000', fontSize: 36, fontWeight: '900' },
  subtitle: { marginTop: 10, fontSize: 10, fontWeight: '800', letterSpacing: 5 },
  chat: { flex: 1, paddingHorizontal: 16 },
  placeholder: { color: '#1A3333', fontSize: 12, textAlign: 'center', marginTop: 100, letterSpacing: 4 },
  bubble: { marginVertical: 6, maxWidth: '85%', paddingHorizontal: 14, paddingVertical: 10, borderLeftWidth: 3 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#001A1A', borderLeftColor: '#004A4A' },
  aiBubble: { alignSelf: 'flex-start' },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  userText: { color: '#008B8B' },
  aiText: { fontWeight: '700' },
  inputRow: { flexDirection: 'row', alignItems: 'center', padding: 14, paddingBottom: Platform.OS === 'ios' ? 34 : 20, borderTopWidth: 1, gap: 10 },
  input: { flex: 1, backgroundColor: '#000F0F', borderWidth: 1, borderRadius: 4, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  sendBtn: { width: 48, height: 48, borderRadius: 4, justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { backgroundColor: '#1A3333' },
  sendBtnText: { color: '#000', fontSize: 20, fontWeight: '900' },
});
