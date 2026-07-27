package com.friday.ai.voice

import android.content.Context
import android.media.MediaPlayer
import android.speech.tts.TextToSpeech
import android.util.Log
import okhttp3.*
import okio.ByteString
import java.io.File
import java.io.FileOutputStream
import java.util.*
import java.nio.ByteOrder

class EdgeTtsManager(private val context: Context) : TextToSpeech.OnInitListener {
    private val client = OkHttpClient()
    private val EDGE_URL = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9787D7E05195A4F334"
    
    private val mediaPlayers = LinkedList<MediaPlayer>()
    private var isPlaying = false
    private var nativeTts: TextToSpeech? = null
    private var isNativeTtsReady = false

    init {
        nativeTts = TextToSpeech(context, this)
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            nativeTts?.language = Locale("hi", "IN")
            isNativeTtsReady = true
            Log.d("FRIDAY", "Native TTS Engine Initialized.")
        }
    }

    fun speak(segments: List<VoiceSegment>, onDone: () -> Unit = {}) {
        if (segments.isEmpty()) {
            onDone()
            return
        }

        val segmentFiles = mutableListOf<File>()
        var processedCount = 0

        segments.forEachIndexed { index, segment ->
            val audioFile = File(context.cacheDir, "friday_segment_$index.mp3")
            segmentFiles.add(audioFile)
            
            fetchAudio(segment.text, segment.voice, audioFile) { success ->
                if (success) {
                    processedCount++
                    if (processedCount == segments.size) {
                        playSegments(segmentFiles, onDone)
                    }
                } else {
                    Log.e("FRIDAY", "Edge TTS failed for segment. Engaging Native Fallback.")
                    speakNative(segments, onDone)
                }
            }
        }
    }

    private fun fetchAudio(text: String, voice: String, targetFile: File, onComplete: (Boolean) -> Unit) {
        val request = Request.Builder()
            .url(EDGE_URL)
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edge/120.0.0.0")
            .header("Origin", "chrome-extension://jdiccldimpdaibmpdkjnbmckmegniedg")
            .build()

        val outStream = FileOutputStream(targetFile)
        var hasAudio = false

        client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                val config = "X-Timestamp:${System.currentTimeMillis()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{\"context\":{\"synthesis\":{\"audio\":{\"metadataoptions\":{\"sentenceBoundaryEnabled\":\"false\",\"wordBoundaryEnabled\":\"false\"},\"outputFormat\":\"audio-24khz-48kbitrate-mono-mp3\"}}}}"
                val safeText = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                val ssml = "X-Timestamp:${System.currentTimeMillis()}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='http://www.w3.org/2001/mstts' xml:lang='en-US'><voice name='$voice'><prosody pitch='+10Hz' rate='135%'>$safeText</prosody></voice></speak>"
                webSocket.send(config)
                webSocket.send(ssml)
            }

            override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
                val buffer = bytes.asByteBuffer()
                if (buffer.remaining() < 2) return
                buffer.order(ByteOrder.BIG_ENDIAN)
                val headerLength = buffer.short.toInt() and 0xFFFF
                if (buffer.remaining() >= headerLength) {
                    val headerBytes = ByteArray(headerLength)
                    buffer.get(headerBytes)
                    if (String(headerBytes).contains("Path:audio")) {
                        val audioBytes = ByteArray(buffer.remaining())
                        buffer.get(audioBytes)
                        outStream.write(audioBytes)
                        hasAudio = true
                    }
                }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                if (text.contains("turn.end")) {
                    webSocket.close(1000, "Done")
                    outStream.close()
                    onComplete(hasAudio)
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.e("FRIDAY", "Edge TTS Failure: ${t.message}")
                try { outStream.close() } catch(_: Exception) {}
                onComplete(false)
            }
        })
    }

    private fun playSegments(files: List<File>, onDone: () -> Unit) {
        val queue = LinkedList(files.filter { it.exists() && it.length() > 0 })
        if (queue.isEmpty()) {
            onDone()
            return
        }

        fun playNext() {
            if (queue.isEmpty()) {
                isPlaying = false
                onDone()
                return
            }
            val file = queue.poll()
            try {
                val mp = MediaPlayer().apply {
                    setDataSource(file?.absolutePath)
                    setOnErrorListener { _, _, _ -> release(); playNext(); true }
                    setOnCompletionListener { release(); playNext() }
                    prepare()
                    start()
                }
                mediaPlayers.add(mp)
            } catch (e: Exception) { playNext() }
        }

        if (!isPlaying) {
            isPlaying = true
            playNext()
        }
    }

    private fun speakNative(segments: List<VoiceSegment>, onDone: () -> Unit) {
        if (!isNativeTtsReady) return
        segments.forEach { nativeTts?.speak(it.text, TextToSpeech.QUEUE_ADD, null, it.text) }
        // Simple delay to simulate completion since native TTS callbacks are complex with queueing
        context.mainLooper.run { onDone() }
    }

    fun stop() {
        mediaPlayers.forEach { try { it.stop(); it.release() } catch (_: Exception) {} }
        mediaPlayers.clear()
        nativeTts?.stop()
        isPlaying = false
    }

    fun shutdown() {
        stop()
        nativeTts?.shutdown()
    }
}
