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
import 'package:lan_scanner/lan_scanner.dart';
import 'edge_tts.dart';

// ─── API Configuration ────────────────────────────────────────────────────────
const String openRouterApiKey = "sk-or-v1-3004838634731383827363473138382736"; // Replace with your real key
const String openRouterUrl = 'https://openrouter.ai/api/v1/chat/completions';
const String localModelName = 'llama-3.2-1b-instruct-q4_k_m.gguf';

final Map<String, dynamic> personalityModes = {
  'TACTICAL': {
    'prompt': 'Senior Offensive Security Consultant. High energy mission partner. Call user "boss". Latin script ONLY.',
    'voice': {'pitch': '+4Hz', 'rate': 1.25, 'style': 'cheerful'},
    'color': const Color(0xFF00FFFF)
  },
  'SARCASTIC': {
    'prompt': 'Witty, judgmental, fast hacker humor. High energy. Hinglish. Call user "boss".',
    'voice': {'pitch': '+1Hz', 'rate': 1.20, 'style': 'cheerful'},
    'color': const Color(0xFFFF8C00)
  },
  'CONCERNED': {
    'prompt': 'Security sentinel. Focus on safety and encrypted lines. High energy Hinglish. Call user "boss".',
    'voice': {'pitch': '+5Hz', 'rate': 1.15, 'style': 'cheerful'},
    'color': const Color(0xFF00FA9A)
  },
  'EMERGENCY': {
    'prompt': 'BREACH ALERT. Maximum urgency. MISSION CRITICAL. Call user "boss".',
    'voice': {'pitch': '+7Hz', 'rate': 1.35, 'style': 'excited'},
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
      theme: ThemeData.dark().copyWith(
        scaffoldBackgroundColor: const Color(0xFF000505),
        textTheme: const TextTheme(
          bodyMedium: TextStyle(fontFamily: 'Courier', letterSpacing: 1),
        ),
      ),
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
  final EdgeTtsManager _edgeTts = EdgeTtsManager();
  final FlutterTts _fallbackTts = FlutterTts();
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
  Map<String, dynamic>? _pendingAction;
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(vsync: this, duration: const Duration(milliseconds: 1000))..repeat(reverse: true);
    _initSystem();
    sentinelChannel.setMethodCallHandler((call) async {
      if (call.method == "onWake") _handleWakeWord();
    });
  }

  Future<void> _initSystem() async {
    await [Permission.microphone, Permission.location, Permission.contacts, Permission.notification].request();
    final b = Battery();
    _batteryLevel = await b.batteryLevel;
    b.onBatteryLevelChanged.listen((l) => setState(() => _batteryLevel = l));
    
    _setupLocalLlama();
    _initSTT();
    
    Position pos = await Geolocator.getCurrentPosition();
    setState(() => _city = "GRID: ${pos.latitude.toStringAsFixed(2)}, ${pos.longitude.toStringAsFixed(2)}");

    _fridaySpeak("Iron Core engaged, boss. Systems ready for perimeter audit.", forcedMode: "TACTICAL");
  }

  Future<void> _setupLocalLlama() async {
    try {
      final dir = await getApplicationSupportDirectory();
      final path = "${dir.path}/$localModelName";
      if (!File(path).existsSync()) {
        final byteData = await rootBundle.load("assets/models/$localModelName");
        final file = File(path);
        await file.writeAsBytes(byteData.buffer.asUint8List(byteData.offsetInBytes, byteData.lengthInBytes));
      }
      _localBrain = Llama(modelPath: path);
      setState(() => _localBrainReady = true);
    } catch (e) {
      print("[FRIDAY] Local Brain Error: $e");
    }
  }

  Future<void> _initSTT() async {
    await _speech.initialize();
  }

  void _handleWakeWord() async {
    // Medium Haptic Pulse
    HapticFeedback.mediumImpact();
    await _fridaySpeak("Yes boss? Systems hot.", forcedMode: "TACTICAL");
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
      }, listenMode: stt.ListenMode.confirmation);
    }
  }

  Future<void> _fridaySpeak(String text, {String? forcedMode}) async {
    final modeKey = forcedMode ?? _mode;
    final config = personalityModes[modeKey];
    try {
      await _edgeTts.speak(text, rate: config['voice']['rate'] as double, pitch: config['voice']['pitch'] as String);
    } catch (e) {
      await _fallbackTts.setLanguage("en-IN");
      await _fallbackTts.speak(text);
    }
  }

  String _getSystemPrompt(String brainType) {
    return "You are FRIDAY. Persona: Cybersecurity Sentinel & White Hat Hacker. Tone: High-energy, mission-focused. Rules: Latin script ONLY. Max 12 words. Brain: $brainType. Action required for hardware/network missions. Commands: SCAN_NETWORK, TORCH, VOLUME, CALL, AUDIT_IP.";
  }

  Future<void> _sendMessage(String text) async {
    if (text.isEmpty || _loading) return;
    setState(() {
      _messages.add({"role": "user", "content": text});
      _loading = true;
    });

    if (_pendingAction != null && (text.toLowerCase().contains("yes") || text.toLowerCase().contains("initiate"))) {
      final act = _pendingAction!;
      _pendingAction = null;
      _handleHardwareAction(act);
      return;
    }

    String reply = "";
    final bool simple = text.length < 25;

    if (simple && _localBrainReady) {
      reply = "Local core analyzing perimeter. No threats detected. [MODE: TACTICAL]";
    } else {
      try {
        final response = await http.post(
          Uri.parse(openRouterUrl),
          headers: {'Authorization': 'Bearer $openRouterApiKey', 'Content-Type': 'application/json'},
          body: jsonEncode({
            'model': 'google/gemma-2-9b-it',
            'messages': [{'role': 'system', 'content': _getSystemPrompt("CLOUD")}, {'role': 'user', 'content': text}],
            'max_tokens:': 100,
          }),
        );
        final data = jsonDecode(response.body);
        reply = data['choices'][0]['message']['content'];
      } catch (e) {
        reply = "Encryption link broken, boss. Offline core active. [MODE: EMERGENCY]";
      }
    }

    final modeMatch = RegExp(r'\[MODE:\s*(\w+)\]').firstMatch(reply);
    if (modeMatch != null) {
      setState(() => _mode = modeMatch.group(1)!.toUpperCase());
    }

    final jsonMatch = RegExp(r'\{.*\}').firstMatch(reply);
    if (jsonMatch != null) {
      _pendingAction = jsonDecode(jsonMatch.group(0)!);
      reply = reply.replaceAll(jsonMatch.group(0)!, "").trim();
    }

    setState(() {
      _messages.add({"role": "assistant", "content": reply});
      _loading = false;
    });
    _fridaySpeak(reply);
    _scrollToBottom();
  }

  void _handleHardwareAction(Map<String, dynamic> action) async {
    final cmd = action['action'];
    if (cmd == 'SCAN_NETWORK') {
      _scanNetwork();
    } else if (cmd == 'TORCH') {
      // Logic for Torch toggle via MethodChannel
    }
  }

  Future<void> _scanNetwork() async {
    _fridaySpeak("Forging into local network, boss. Accessing router logs.", forcedMode: "TACTICAL");
    final scanner = LanScanner();
    final info = NetworkInfo();
    final String? ip = await info.getWifiIP();
    if (ip == null) return;
    final String subnet = ip.substring(0, ip.lastIndexOf('.'));
    
    final List<DeviceModel> devices = [];
    final stream = scanner.preciseScan(subnet, timeout: const Duration(milliseconds: 500));
    
    stream.listen((device) {
      if (device.exists) devices.add(device);
    }, onDone: () {
      final report = "Scan complete. Found ${devices.length} active nodes on your Wi-Fi. Perimeter secure.";
      setState(() => _messages.add({"role": "assistant", "content": report}));
      _fridaySpeak(report);
    });
  }

  void _scrollToBottom() {
    Future.delayed(const Duration(milliseconds: 300), () {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(_scrollController.position.maxScrollExtent, duration: const Duration(milliseconds: 500), curve: Curves.easeOut);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final themeColor = personalityModes[_mode]['color'] as Color;
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            _buildHeader(themeColor),
            Expanded(child: _buildChat(themeColor)),
            if (_pendingAction != null) _buildPermissionCard(themeColor),
            _buildControls(themeColor),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(Color theme) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 15),
      decoration: BoxDecoration(border: Border(bottom: BorderSide(color: theme.withOpacity(0.3)))),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _infoTag("MODE: $_mode", theme),
              _infoTag(_city, theme),
              _infoTag("PWR: $_batteryLevel%", theme),
            ],
          ),
          const SizedBox(height: 15),
          ScaleTransition(
            scale: Tween(begin: 1.0, end: 1.15).animate(_pulseController),
            child: Container(
              width: 55, height: 55,
              decoration: BoxDecoration(shape: BoxShape.circle, color: theme, boxShadow: [BoxShadow(color: theme.withOpacity(0.5), blurRadius: 20, spreadRadius: 5)]),
              child: const Center(child: Text("F", style: TextStyle(color: Colors.black, fontSize: 26, fontWeight: FontWeight.w900))),
            ),
          ),
          const SizedBox(height: 10),
          Text("FRIDAY MARK VI - IRON CORE", style: TextStyle(color: theme, fontSize: 9, fontWeight: FontWeight.w900, letterSpacing: 4)),
        ],
      ),
    );
  }

  Widget _infoTag(String text, Color theme) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 5),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(color: theme.withOpacity(0.1), borderRadius: BorderRadius.circular(2)),
      child: Text(text, style: TextStyle(color: theme, fontSize: 7, fontWeight: FontWeight.bold)),
    );
  }

  Widget _buildChat(Color theme) {
    return ListView.builder(
      controller: _scrollController,
      padding: const EdgeInsets.all(16),
      itemCount: _messages.length,
      itemBuilder: (context, i) {
        final m = _messages[i];
        final isUser = m['role'] == 'user';
        return Align(
          alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
          child: Container(
            margin: const EdgeInsets.symmetric(vertical: 5),
            padding: const EdgeInsets.all(12),
            constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.8),
            decoration: BoxDecoration(
              color: isUser ? theme.withOpacity(0.05) : Colors.transparent,
              border: Border(left: BorderSide(color: isUser ? Colors.white24 : theme, width: 2)),
            ),
            child: Text(m['content']!, style: TextStyle(color: isUser ? Colors.white70 : theme, fontSize: 13, fontWeight: isUser ? FontWeight.normal : FontWeight.bold)),
          ),
        );
      },
    );
  }

  Widget _buildPermissionCard(Color theme) {
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(color: Colors.yellow.withOpacity(0.1), border: Border.all(color: Colors.yellow, width: 1)),
      child: Column(
        children: [
          const Text("MISSION AUTHORIZATION REQUIRED", style: TextStyle(color: Colors.yellow, fontSize: 10, fontWeight: FontWeight.bold)),
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              TextButton(onPressed: () => setState(() => _pendingAction = null), child: const Text("ABORT", style: TextStyle(color: Colors.red))),
              ElevatedButton(
                style: ElevatedButton.styleFrom(backgroundColor: Colors.yellow),
                onPressed: () => _sendMessage("Initiate"), 
                child: const Text("ENGAGE", style: TextStyle(color: Colors.black, fontWeight: FontWeight.bold)),
              ),
            ],
          )
        ],
      ),
    );
  }

  Widget _buildControls(Color theme) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: Colors.black, border: Border(top: BorderSide(color: theme.withOpacity(0.2)))),
      child: Row(
        children: [
          IconButton(
            onPressed: () {
              setState(() => _isSentinelActive = !_isSentinelActive);
              sentinelChannel.invokeMethod(_isSentinelActive ? "startSentinel" : "stopSentinel");
            },
            icon: Icon(_isSentinelActive ? Icons.security : Icons.security_outlined, color: _isSentinelActive ? Colors.greenAccent : theme),
          ),
          Expanded(
            child: TextField(
              onSubmitted: _sendMessage,
              decoration: InputDecoration(hintText: "COMMAND...", border: InputBorder.none, hintStyle: TextStyle(color: theme.withOpacity(0.3))),
              style: TextStyle(color: theme),
            ),
          ),
          IconButton(onPressed: _startListening, icon: Icon(Icons.mic, color: _isListening ? Colors.red : theme)),
        ],
      ),
    );
  }
}
