import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, View, Text, TextInput, TouchableOpacity,
  ScrollView, KeyboardAvoidingView, Platform, Animated, ActivityIndicator
} from 'react-native';
import * as Speech from 'expo-speech';
import * as Linking from 'expo-linking';
import { StatusBar } from 'expo-status-bar';

// ─── API Configuration ────────────────────────────────────────────────────────
const OPENROUTER_API_KEY = process.env.EXPO_PUBLIC_OPENROUTER_API_KEY;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Fallback chain — auto-switch on rate-limit/error
const MODEL_CHAIN = [
  'google/gemma-4-31b-it',
  'poolside/laguna-xs-2.1',
  'nvidia/nemotron-3-nano-30b-a3b',
  'openai/gpt-oss-20b',
  'nvidia/nemotron-nano-9b-v2',
];

// ─── Personality ──────────────────────────────────────────────────────────────
const FRIDAY_SYSTEM_PROMPT = `You are FRIDAY, a tactical AI partner — not a chatbot.
- Call the user "boss". NEVER "sir". NEVER "user".
- Max 15 words unless explaining data.
- Slightly sarcastic, always loyal. Dry humor, never mean.
- Proactive. Go silent when done. NO "how can I help?". NO filler.
- For navigation/directions requests, output ONLY this JSON: {"action":"NAVIGATE","target":"Place Name"}
- Never break the JSON format rule.`;

// ─── AI Call with Fallback Chain ──────────────────────────────────────────────
async function callAI(conversationMessages, modelIndex = 0) {
  if (modelIndex >= MODEL_CHAIN.length) {
    return 'All models offline, boss. Try again later.';
  }

  const model = MODEL_CHAIN[modelIndex];

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://friday-ai.app',
        'X-Title': 'FRIDAY',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: FRIDAY_SYSTEM_PROMPT },
          ...conversationMessages,
        ],
        max_tokens: 120,
        temperature: 0.7,
      }),
    });

    // Rate-limited or server error → switch model
    if (response.status === 429 || response.status >= 500) {
      console.log(`[FRIDAY] ${model} failed (${response.status}). Switching to fallback ${modelIndex + 1}...`);
      return callAI(conversationMessages, modelIndex + 1);
    }

    if (!response.ok) {
      console.log(`[FRIDAY] ${model} HTTP error ${response.status}. Trying next...`);
      return callAI(conversationMessages, modelIndex + 1);
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      console.log(`[FRIDAY] ${model} empty response. Trying next...`);
      return callAI(conversationMessages, modelIndex + 1);
    }

    console.log(`[FRIDAY] Success via ${model}`);
    return reply;

  } catch (err) {
    console.log(`[FRIDAY] ${model} threw: ${err.message}. Trying next...`);
    return callAI(conversationMessages, modelIndex + 1);
  }
}

// ─── Action Handler ───────────────────────────────────────────────────────────
async function handleAction(reply) {
  try {
    // Attempt to extract JSON if embedded in text
    const jsonMatch = reply.match(/\{[\s\S]*\}/);
    const jsonToParse = jsonMatch ? jsonMatch[0] : reply;

    const parsed = JSON.parse(jsonToParse);
    if (parsed.action === 'NAVIGATE' && parsed.target) {
      Speech.speak(`Plotting route to ${parsed.target}, boss.`);
      const url = Platform.select({
        ios: `maps:0,0?q=${encodeURIComponent(parsed.target)}`,
        android: `geo:0,0?q=${encodeURIComponent(parsed.target)}`,
      });

      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
        return { handled: true, displayText: `↗ Navigating → ${parsed.target}` };
      } else {
        console.log("[FRIDAY] Map URL not supported");
        return { handled: false };
      }
    }
  } catch (err) {
    // Not valid JSON or parsing failed
    console.log("[FRIDAY] Action parsing skipped:", err.message);
  }
  return { handled: false };
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scrollViewRef = useRef();
  const pulseLoopRef = useRef(null);

  useEffect(() => {
    setTimeout(() => Speech.speak('Systems online, boss.'), 600);

    // Start idle glow pulse
    pulseLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.1, duration: 1400, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 1400, useNativeDriver: true }),
      ])
    );
    pulseLoopRef.current.start();

    return () => pulseLoopRef.current?.stop();
  }, []);

  const sendMessage = async (text) => {
    const msg = (text || inputText).trim();
    if (!msg || loading) return;

    const userMsg = { role: 'user', content: msg };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInputText('');
    setLoading(true);

    try {
      const payload = updatedMessages.map(m => ({ role: m.role, content: m.content }));
      const reply = await callAI(payload);

      const { handled, displayText } = await handleAction(reply);
      const assistantContent = handled ? displayText : reply;

      setMessages([...updatedMessages, { role: 'assistant', content: assistantContent }]);
      if (!handled) Speech.speak(reply);

    } catch (err) {
      const fallback = 'Connection failed, boss.';
      setMessages([...updatedMessages, { role: 'assistant', content: fallback }]);
      Speech.speak(fallback);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <Animated.View style={[styles.logo, { transform: [{ scale: pulseAnim }] }]}>
          <Text style={styles.logoText}>F</Text>
        </Animated.View>
        <Text style={styles.subtitle}>{loading ? 'PROCESSING...' : 'FRIDAY'}</Text>
      </View>

      {/* Chat Area */}
      <ScrollView
        style={styles.chat}
        ref={scrollViewRef}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 && (
          <Text style={styles.placeholder}>Ready, boss.</Text>
        )}
        {messages.map((msg, i) => (
          <View key={i} style={[styles.bubble, msg.role === 'user' ? styles.userBubble : styles.aiBubble]}>
            <Text style={[styles.bubbleText, msg.role === 'user' ? styles.userText : styles.aiText]}>
              {msg.content}
            </Text>
          </View>
        ))}
        {loading && (
          <View style={styles.aiBubble}>
            <ActivityIndicator color="#CC0000" size="small" />
          </View>
        )}
      </ScrollView>

      {/* Input */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Give me a command..."
          placeholderTextColor="#2A2A2A"
          value={inputText}
          onChangeText={setInputText}
          onSubmitEditing={() => sendMessage()}
          returnKeyType="send"
          editable={!loading}
          multiline={false}
        />
        <TouchableOpacity
          style={[styles.sendBtn, loading && styles.sendBtnDisabled]}
          onPress={() => sendMessage()}
          disabled={loading}
          activeOpacity={0.75}
        >
          <Text style={styles.sendBtnText}>▶</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
  },
  header: {
    alignItems: 'center',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#111',
  },
  logo: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#CC0000',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#CC0000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 16,
    elevation: 12,
  },
  logoText: {
    color: '#000',
    fontSize: 36,
    fontWeight: '900',
  },
  subtitle: {
    marginTop: 8,
    color: '#CC0000',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 5,
  },
  chat: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  placeholder: {
    color: '#1C1C1C',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 80,
    letterSpacing: 3,
  },
  bubble: {
    marginVertical: 5,
    maxWidth: '84%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#111',
  },
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: 'transparent',
    paddingLeft: 4,
  },
  bubbleText: {
    fontSize: 16,
    lineHeight: 22,
  },
  userText: {
    color: '#555',
  },
  aiText: {
    color: '#CC0000',
    fontWeight: '700',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    borderTopWidth: 1,
    borderTopColor: '#111',
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: '#0F0F0F',
    color: '#FFF',
    borderWidth: 1,
    borderColor: '#1A1A1A',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  sendBtn: {
    backgroundColor: '#CC0000',
    width: 46,
    height: 46,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: '#2A0000',
  },
  sendBtnText: {
    color: '#000',
    fontSize: 18,
    fontWeight: '900',
  },
});
