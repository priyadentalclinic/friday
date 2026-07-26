import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:llama_cpp_dart/llama_cpp_dart.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';
import 'package:network_info_plus/network_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:speech_to_text/speech_to_text.dart' as stt;
import 'package:battery_plus/battery_plus.dart';
import 'package:geolocator/geolocator.dart';
import 'package:flutter_tts/flutter_tts.dart';

// ─── API Configuration ────────────────────────────────────────────────────────
const String openRouterApiKey = "sk-or-v1-02685746352938475635241253647586"; // User should replace
const String openRouterUrl = 'https://openrouter.ai/api/v1/chat/completions';
const String edgeTtsUrl = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9787D7E05195A4F334';
const String localModelName = 'llama-3.2-1b-instruct-q4_k_m.gguf';

final Map<String, dynamic> personalityModes = {
  'TACTICAL': {
    'prompt': 'Senior Offensive Security Consultant. High energy mission partner. Call user "boss". Latin script ONLY.',
    'voice': {'pitch': '+4Hz', 'rate': '+22%', 'style': 'cheerful'},
    'color': const Color(0xFF00FFFF)
  },
  'SARCASTIC': {
    'prompt': 'Witty, judgmental, fast hacker humor. High energy. Hinglish. Call user "boss".',
    'voice': {'pitch': '+1Hz', 'rate': '+18%', 'style': 'cheerful'},
    'color': const Color(0xFFFF8C00)
  },
  'CONCERNED': {
    'prompt': 'Security sentinel. Focus on safety and encrypted lines. High energy Hinglish. Call user "boss".',
    'voice': {'pitch': '+5Hz', 'rate': '+12%', 'style': 'cheerful'},
    'color': const Color(0xFF00FA9A)
  },
  'EMERGENCY': {
    'prompt': 'BREACH ALERT. Maximum urgency. MISSION CRITICAL. Call user "boss".',
    'voice': {'pitch': '+7Hz', 'rate': '+32%', 'style': 'excited'},
    'color': const Color(0xFFFF0000)
  }
};

// ─── App Entry ────────────────────────────────────────────────────────────────
void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const FridayApp());
}

class FridayApp extends StatelessWidget {
  const FridayApp({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'FRIDAY MARK VI',
      theme: ThemeData.dark().copyWith(scaffoldBackgroundColor: const Color(0xFF000505)),
      home: const HudScreen(),
    );
  }
}

// ─── Main HUD ────────────────────────────────────────────────────────────────
class HudScreen extends StatefulWidget {
  const HudScreen({super.key});
  @override
  State<HudScreen> createState() => _HudScreenState();
}

class _HudScreenState extends State<HudScreen> with TickerProviderStateMixin {
  static const sentinelChannel = MethodChannel('com.friday.ai/sentinel');
  final stt.SpeechToText _speech = stt.SpeechToText();
  final FlutterTts _tts = FlutterTts();
  late AnimationController _pulseController;
  
  String _mode = 'TACTICAL';
  String _city = 'Delhi';
  int _batteryLevel = 100;
  bool _isListening = false;
  bool _isSentinelActive = false;
  bool _loading = false;
  final List<Map<String, String>> _messages = [];
  Llama? _localBrain;
  bool _localBrainReady = false;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400))..repeat(reverse: true);
    _initSentinel();
    sentinelChannel.setMethodCallHandler((call) async {
      if (call.method == "onWake") _handleWakeWord();
    });
  }

  Future<void> _initSentinel() async {
    await [Permission.microphone, Permission.location, Permission.contacts].request();
    final b = Battery();
    _batteryLevel = await b.batteryLevel;
    _setupLocalLlama();
    _fridaySpeak("Iron Core engaged, boss. Systems ready.", forcedMode: "TACTICAL");
  }

  Future<void> _setupLocalLlama() async {
    final dir = await getApplicationSupportDirectory();
    final path = "${dir.path}/$localModelName";
    if (!File(path).existsSync()) {
      // Logic to copy asset model to path
      setState(() => _city = "INJECTING BRAIN...");
    }
    // Placeholder for actual llama initialization logic
    setState(() => _localBrainReady = true);
  }

  void _handleWakeWord() async {
    HapticFeedback.vibrate();
    await _fridaySpeak("Yes boss? Ready for mission.", forcedMode: "TACTICAL");
    _startListening();
  }

  void _startListening() async {
    bool available = await _speech.initialize();
    if (available) {
      setState(() => _isListening = true);
      _speech.listen(onResult: (val) {
        if (val.finalResult) {
          setState(() => _isListening = false);
          _sendMessage(val.recognizedWords);
        }
      });
    }
  }

  Future<void> _fridaySpeak(String text, {String? forcedMode}) async {
    final modeKey = forcedMode ?? _mode;
    final config = personalityModes[modeKey];
    await _tts.setLanguage("en-IN");
    await _tts.setPitch(1.2);
    await _tts.setSpeechRate(0.6);
    await _tts.speak(text);
  }

  Future<void> _sendMessage(String text) async {
    if (text.isEmpty) return;
    setState(() {
      _messages.add({"role": "user", "content": text});
      _loading = true;
    });

    // Cloud Brain Simulation
    final reply = "Sentinel Pro analyzing... Mission parameters locked. [MODE: TACTICAL]";
    
    setState(() {
      _messages.add({"role": "assistant", "content": reply});
      _loading = false;
    });
    _fridaySpeak(reply);
  }

  @override
  Widget build(BuildContext context) {
    final themeColor = personalityModes[_mode]['color'] as Color;
    return Scaffold(
      body: Column(
        children: [
          _buildHeader(themeColor),
          Expanded(child: _buildChat(themeColor)),
          _buildControls(themeColor),
        ],
      ),
    );
  }

  Widget _buildHeader(Color theme) {
    return Container(
      padding: const EdgeInsets.only(top: 50, bottom: 20),
      decoration: BoxDecoration(border: Border(bottom: BorderSide(color: theme.withOpacity(0.2)))),
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(vertical: 4),
            color: theme.withOpacity(0.05),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text("[ $_mode ]", style: TextStyle(color: theme, fontSize: 8, fontWeight: FontWeight.bold)),
                const SizedBox(width: 20),
                Text("[ $_city ]", style: TextStyle(color: theme, fontSize: 8, fontWeight: FontWeight.bold)),
                const SizedBox(width: 20),
                Text("[ $_batteryLevel% ]", style: TextStyle(color: theme, fontSize: 8, fontWeight: FontWeight.bold)),
              ],
            ),
          ),
          const SizedBox(height: 20),
          ScaleTransition(
            scale: Tween(begin: 1.0, end: 1.1).animate(_pulseController),
            child: Container(
              width: 60, height: 60,
              decoration: BoxDecoration(shape: BoxShape.circle, color: theme, boxShadow: [BoxShadow(color: theme, blurRadius: 15)]),
              child: const Center(child: Text("F", style: TextStyle(color: Colors.black, fontSize: 28, fontWeight: FontWeight.w900))),
            ),
          ),
          const SizedBox(height: 10),
          Text("FRIDAY MARK VI - IRON CORE", style: TextStyle(color: theme, fontSize: 8, letterSpacing: 3)),
        ],
      ),
    );
  }

  Widget _buildChat(Color theme) {
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _messages.length,
      itemBuilder: (context, i) {
        final m = _messages[i];
        final isUser = m['role'] == 'user';
        return Align(
          alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
          child: Container(
            margin: const EdgeInsets.symmetric(vertical: 4),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: isUser ? Colors.teal.withOpacity(0.1) : Colors.transparent, border: Border(left: BorderSide(color: isUser ? Colors.teal : theme, width: 2))),
            child: Text(m['content']!, style: TextStyle(color: isUser ? Colors.tealAccent : theme, fontSize: 13)),
          ),
        );
      },
    );
  }

  Widget _buildControls(Color theme) {
    return Container(
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(border: Border(top: BorderSide(color: theme.withOpacity(0.1)))),
      child: Row(
        children: [
          IconButton(
            onPressed: () {
              setState(() => _isSentinelActive = !_isSentinelActive);
              sentinelChannel.invokeMethod(_isSentinelActive ? "startSentinel" : "stopSentinel");
            },
            icon: Icon(_isSentinelActive ? Icons.shield : Icons.shield_outlined, color: _isSentinelActive ? Colors.green : theme),
          ),
          Expanded(
            child: TextField(
              onSubmitted: _sendMessage,
              decoration: InputDecoration(hintText: "COMMAND...", border: InputBorder.none, hintStyle: TextStyle(color: theme.withOpacity(0.2))),
              style: TextStyle(color: theme),
            ),
          ),
          IconButton(onPressed: _startListening, icon: Icon(Icons.mic, color: _isListening ? Colors.red : theme)),
        ],
      ),
    );
  }
}
