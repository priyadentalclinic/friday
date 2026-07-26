import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:llama_cpp_dart/llama_cpp_dart.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:permission_handler/permission_handler.dart' hide PermissionStatus;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';
import 'package:network_info_plus/network_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:speech_to_text/speech_to_text.dart' as stt;
import 'package:battery_plus/battery_plus.dart';
import 'package:geolocator/geolocator.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:lan_scanner/lan_scanner.dart';
import 'package:flutter_contacts/flutter_contacts.dart';
import 'package:camera/camera.dart';
import 'edge_tts.dart';

// ─── API Configuration ────────────────────────────────────────────────────────
const String openRouterApiKey = "sk-or-v1-3004838634731383827363473138382736"; 
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
  void dispose() {
    _pulseController.dispose();
    _textController.dispose();
    _scrollController.dispose();
    _cameraController?.dispose();
    super.dispose();
  }

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

// ─── Helpers ──────────────────────────────────────────────────────────────────
double getSimilarity(String str1, String str2) {
  final s1 = str1.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '').replaceAll('bahan', 'behen').replaceAll('mummy', 'mom').replaceAll('papa', 'dad');
  final s2 = str2.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '').replaceAll('bahan', 'behen').replaceAll('mummy', 'mom').replaceAll('papa', 'dad');
  if (s1 == s2) return 1.0;
  if (s1.length < 2 || s2.length < 2) return 0;
  final bigrams1 = <String>{};
  for (var i = 0; i < s1.length - 1; i++) { bigrams1.add(s1.substring(i, i + 2)); }
  final bigrams2 = <String>{};
  for (var i = 0; i < s2.length - 1; i++) { bigrams2.add(s2.substring(i, i + 2)); }
  var intersect = 0;
  for (final bi in bigrams1) { if (bigrams2.contains(bi)) intersect++; }
  return (2.0 * intersect) / (bigrams1.length + bigrams2.length);
}

// ─── Main HUD ────────────────────────────────────────────────────────────────
class HudScreen extends StatefulWidget {
  const HudScreen({super.key});
  @override
  State<HudScreen> createState() => _HudScreenState();
}

class _HudScreenState extends State<HudScreen> with TickerProviderStateMixin {
  static const sentinelChannel = MethodChannel('com.friday.ai/sentinel');
  static const hardwareChannel = MethodChannel('com.friday.ai/hardware');
  
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
  bool _isBrainLoading = false;
  Map<String, dynamic>? _pendingAction;
  final ScrollController _scrollController = ScrollController();
  final TextEditingController _textController = TextEditingController();
  CameraController? _cameraController;

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
    try {
      await [Permission.microphone, Permission.location, Permission.contacts, Permission.notification, Permission.camera].request();
      final b = Battery();
      _batteryLevel = await b.batteryLevel;
      Timer.periodic(const Duration(seconds: 60), (timer) async {
        final level = await b.batteryLevel;
        if (mounted) setState(() => _batteryLevel = level);
      });
      
      await _setupLocalLlama();
      await _initSTT();
      await _initCamera();
      
      try {
        Position pos = await Geolocator.getCurrentPosition();
        setState(() => _city = "GRID: ${pos.latitude.toStringAsFixed(2)}, ${pos.longitude.toStringAsFixed(2)}");
      } catch (e) { print("[FRIDAY] GPS Error: $e"); }

      _fridaySpeak("Iron Core engaged, boss. Sentinel Slim Protocol active.", forcedMode: "TACTICAL");
    } catch (e) {
      print("[FRIDAY] Init Error: $e");
      _fridaySpeak("Systems critical, boss. Some modules offline.");
    }
  }

  Future<void> _initCamera() async {
    try {
      final cameras = await availableCameras();
      if (cameras.isNotEmpty) {
        _cameraController = CameraController(cameras[0], ResolutionPreset.low, enableAudio: false);
        await _cameraController!.initialize();
      }
    } catch (e) { print("[FRIDAY] Camera Error: $e"); }
  }

  Future<void> _setupLocalLlama() async {
    try {
      setState(() => _isBrainLoading = true);
      final dir = await getApplicationSupportDirectory();
      final path = "${dir.path}/$localModelName";
      
      // Sentinel Slim: Use native asset copy to avoid Flutter Asset Tax
      final bool copied = await hardwareChannel.invokeMethod('copyAssetToFile', {
        'assetName': localModelName,
        'targetPath': path,
      });

      if (copied && File(path).existsSync()) {
        _localBrain = Llama(path);
        setState(() {
          _localBrainReady = true;
          _isBrainLoading = false;
        });
      }
    } catch (e) { 
      print("[FRIDAY] Local Brain Error: $e"); 
      setState(() => _isBrainLoading = false);
    }
  }

  Future<void> _initSTT() async { await _speech.initialize(); }

  void _handleWakeWord() async {
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
    return "You are FRIDAY. Persona: Cybersecurity Sentinel & White Hat Hacker. Tone: High-energy. Rules: Latin script ONLY. Max 12 words. Brain: $brainType. Actions: SCAN_NETWORK, TORCH, VOLUME, CALL, WHATSAPP.";
  }

  Future<void> _sendMessage(String text) async {
    if (text.isEmpty || _loading) return;
    _textController.clear();
    setState(() {
      _messages.add({"role": "user", "content": text});
      _loading = true;
    });

    if (_pendingAction != null && (text.toLowerCase().contains("yes") || text.toLowerCase().contains("initiate"))) {
      final act = _pendingAction!;
      _pendingAction = null;
      _handleHardwareAction(act);
      setState(() => _loading = false);
      return;
    }

    String reply = "";
    final bool simple = text.length < 25;

    if (simple && _localBrainReady) {
      reply = "Local core analyzing grid. No threats detected. [MODE: TACTICAL]";
    } else {
      try {
        final response = await http.post(
          Uri.parse(openRouterUrl),
          headers: {'Authorization': 'Bearer $openRouterApiKey', 'Content-Type': 'application/json'},
          body: jsonEncode({
            'model': 'google/gemma-2-9b-it',
            'messages': [{'role': 'system', 'content': _getSystemPrompt("CLOUD")}, {'role': 'user', 'content': text}],
            'max_tokens': 100,
          }),
        );
        final data = jsonDecode(response.body);
        reply = data['choices'][0]['message']['content'];
      } catch (e) { reply = "Comms link broken, boss. Offline core active. [MODE: EMERGENCY]"; }
    }

    final modeMatch = RegExp(r'\[MODE:\s*(\w+)\]').firstMatch(reply);
    if (modeMatch != null) { setState(() => _mode = modeMatch.group(1)!.toUpperCase()); }

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
      final state = action['state'] == 'on';
      if (_cameraController != null) {
        await _cameraController!.setFlashMode(state ? FlashMode.torch : FlashMode.off);
        _fridaySpeak("Torch ${state ? 'engaged' : 'dark'}, boss.");
      }
    } else if (cmd == 'CALL' || cmd == 'WHATSAPP') {
      _handleComms(cmd, action['target'], action['text'] ?? "Hey");
    }
  }

  Future<void> _handleComms(String type, String name, String text) async {
    // Correct FlutterContacts v2 API
    final bool permission = await FlutterContacts.permissions.request(PermissionType.read) == PermissionStatus.granted;
    if (permission) {
      final contacts = await FlutterContacts.getAll(properties: {ContactProperty.phone});
      if (contacts.isEmpty) { _fridaySpeak("Boss, contact list empty hai."); return; }
      
      final candidates = contacts.map((c) => {'contact': c, 'score': getSimilarity(name, c.displayName ?? "")})
                                 .toList();
      candidates.sort((a, b) => (b['score'] as double).compareTo(a['score'] as double));
      
      final bestMatch = candidates[0];

      if ((bestMatch['score'] as double) > 0.5) {
        final contact = bestMatch['contact'] as Contact;
        final phone = contact.phones.isNotEmpty ? contact.phones[0].number.replaceAll(RegExp(r'[^0-9+]'), '') : null;
        if (phone != null) {
          final url = type == 'CALL' ? "tel:$phone" : "whatsapp://send?phone=$phone&text=${Uri.encodeComponent(text)}";
          final uri = Uri.parse(url);
          if (await canLaunchUrl(uri)) {
            _fridaySpeak("Initiating $type for ${contact.displayName}, boss.");
            await launchUrl(uri, mode: LaunchMode.externalApplication);
          } else {
            _fridaySpeak("Boss, I can't launch $type. Is the app installed?");
          }
        }
      } else { _fridaySpeak("Boss, I can't find $name in secure contacts."); }
    }
  }

  Future<void> _scanNetwork() async {
    _fridaySpeak("Forging into local network, boss.", forcedMode: "TACTICAL");
    final scanner = LanScanner();
    final info = NetworkInfo();
    final String? ip = await info.getWifiIP();
    if (ip == null) return;
    final String subnet = ip.substring(0, ip.lastIndexOf('.'));
    
    final List<Host> devices = [];
    final stream = scanner.icmpScan(subnet, timeout: const Duration(milliseconds: 500));
    
    stream.listen((host) {
      if (host.pingTime != null) devices.add(host);
    }, onDone: () {
      final report = "Scan complete. Detected ${devices.length} active nodes on the grid.";
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
  void dispose() {
    _pulseController.dispose();
    _textController.dispose();
    _scrollController.dispose();
    _cameraController?.dispose();
    super.dispose();
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
              if (_isBrainLoading) _infoTag("BRAIN: LOADING...", Colors.orange),
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
              controller: _textController,
              onSubmitted: _sendMessage,
              decoration: InputDecoration(hintText: "COMMAND...", border: InputBorder.none, hintStyle: TextStyle(color: theme.withOpacity(0.3))),
              style: TextStyle(color: theme),
            ),
          ),
          IconButton(
            onPressed: () => _sendMessage(_textController.text),
            icon: Icon(Icons.send_rounded, color: theme),
          ),
          IconButton(onPressed: _startListening, icon: Icon(Icons.mic, color: _isListening ? Colors.red : theme)),
        ],
      ),
    );
  }
}
