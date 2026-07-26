import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:web_socket_channel/io.dart';
import 'package:uuid/uuid.dart';
import 'package:just_audio/just_audio.dart';

class EdgeTtsManager {
  final _player = AudioPlayer();
  final String _voice = 'en-IN-NeerjaNeural';

  // Keep a reference to stop ongoing speech
  bool _isSpeaking = false;

  Future<void> speak(
    String text, {
    double rate = 1.25,
    String pitch = '+5Hz',
  }) async {
    if (text.trim().isEmpty) return;
    try {
      _isSpeaking = true;
      final audioData = await _synthesize(text, rate, pitch);
      if (audioData != null && audioData.isNotEmpty && _isSpeaking) {
        await _player.setAudioSource(MyByteSource(audioData));
        await _player.play();
      }
    } catch (e) {
      // Rethrow so caller (main.dart) can fall back to flutter_tts
      rethrow;
    } finally {
      _isSpeaking = false;
    }
  }

  void stop() {
    _isSpeaking = false;
    _player.stop();
  }

  Future<Uint8List?> _synthesize(
    String text,
    double rate,
    String pitch,
  ) async {
    final connectionId = const Uuid().v4().replaceAll('-', '');
    final url =
        'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1'
        '?TrustedClientToken=6A5AA1D4EAFF4E9787D7E05195A4F334'
        '&ConnectionId=$connectionId';

    // Edge TTS requires these exact headers
    final channel = IOWebSocketChannel.connect(
      Uri.parse(url),
      headers: {
        'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
            '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
        'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache',
      },
    );

    final List<int> audioChunks = [];
    final completer = Completer<Uint8List?>();

    // Timeout: if no response in 8 seconds, give up
    final timeoutTimer = Timer(const Duration(seconds: 8), () {
      if (!completer.isCompleted) {
        channel.sink.close();
        completer.complete(null);
      }
    });

    // 1. Send Config
    channel.sink.add(
      'Content-Type:application/json; charset=utf-8\r\n'
      'Path:speech.config\r\n\r\n' +
          jsonEncode({
            'context': {
              'synthesis': {
                'audio': {
                  'metadataoptions': {
                    'sentenceBoundaryEnabled': 'false',
                    'wordBoundaryEnabled': 'false',
                  },
                  'outputFormat': 'audio-24khz-48kbitrate-mono-mp3',
                },
              },
            },
          }),
    );

    // 2. Send SSML
    final String ssml = '''
<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='http://www.w3.org/2001/mstts' xml:lang='en-IN'>
  <voice name='$_voice'>
    <mstts:express-as style='cheerful' styledegree='2.0'>
      <prosody pitch='$pitch' rate='${(rate * 100).toInt()}%'>$text</prosody>
    </mstts:express-as>
  </voice>
</speak>''';

    channel.sink.add(
      'X-RequestId:$connectionId\r\n'
      'Content-Type:application/ssml+xml\r\n'
      'Path:ssml\r\n\r\n$ssml',
    );

    channel.stream.listen(
      (message) {
        if (message is Uint8List) {
          // Audio binary frames: find "Path:audio" header, take everything after
          final headerBytes = [
            0x50, 0x61, 0x74, 0x68, 0x3A, 0x61, 0x75, 0x64, 0x69, 0x6F,
          ]; // "Path:audio"
          final headerIndex = _indexOf(message, headerBytes);
          if (headerIndex != -1) {
            // Skip to double CRLF (\r\n\r\n) after the header
            int bodyStart = headerIndex + headerBytes.length;
            for (int i = bodyStart; i < message.length - 3; i++) {
              if (message[i] == 0x0D &&
                  message[i + 1] == 0x0A &&
                  message[i + 2] == 0x0D &&
                  message[i + 3] == 0x0A) {
                bodyStart = i + 4;
                break;
              }
            }
            if (bodyStart < message.length) {
              audioChunks.addAll(message.sublist(bodyStart));
            }
          }
        } else if (message is String && message.contains('turn.end')) {
          timeoutTimer.cancel();
          if (!completer.isCompleted) {
            channel.sink.close();
          }
        }
      },
      onDone: () {
        timeoutTimer.cancel();
        if (!completer.isCompleted) {
          completer.complete(
            audioChunks.isNotEmpty ? Uint8List.fromList(audioChunks) : null,
          );
        }
      },
      onError: (e) {
        timeoutTimer.cancel();
        if (!completer.isCompleted) completer.complete(null);
      },
    );

    return completer.future;
  }

  int _indexOf(Uint8List list, List<int> pattern) {
    for (int i = 0; i <= list.length - pattern.length; i++) {
      bool found = true;
      for (int j = 0; j < pattern.length; j++) {
        if (list[i + j] != pattern[j]) {
          found = false;
          break;
        }
      }
      if (found) return i;
    }
    return -1;
  }
}

class MyByteSource extends StreamAudioSource {
  final Uint8List bytes;
  MyByteSource(this.bytes);

  @override
  Future<StreamAudioResponse> request([int? start, int? end]) async {
    start ??= 0;
    end ??= bytes.length;
    return StreamAudioResponse(
      sourceLength: bytes.length,
      contentLength: end - start,
      offset: start,
      stream: Stream.value(bytes.sublist(start, end)),
      contentType: 'audio/mpeg',
    );
  }
}
