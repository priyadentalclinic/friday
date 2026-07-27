package com.friday.ai.voice

import android.content.Context
import android.media.MediaPlayer
import android.util.Log
import okhttp3.*
import okio.ByteString
import java.io.File
import java.io.FileOutputStream
import java.util.*
import java.nio.ByteBuffer
import java.nio.ByteOrder

class EdgeTtsManager(private val context: Context) {
    private val client = OkHttpClient()
    // Stable public endpoint
    private val EDGE_URL = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1"
    
    private val mediaPlayers = LinkedList<MediaPlayer>()
    private var isPlaying = false

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
                processedCount++
                if (processedCount == segments.size) {
                    playSegments(segmentFiles, onDone)
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
                // Escaping XML characters like &
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
                    val headerText = String(headerBytes)
                    
                    if (headerText.contains("Path:audio")) {
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
                Log.e("FRIDAY", "TTS Failure: ${t.message}")
                outStream.close()
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
                    setOnErrorListener { _, _, _ ->
                        Log.e("FRIDAY", "MediaPlayer Error on ${file?.name}")
                        release()
                        playNext()
                        true
                    }
                    setOnCompletionListener { 
                        release()
                        playNext()
                    }
                    prepare()
                    start()
                }
                mediaPlayers.add(mp)
            } catch (e: Exception) {
                Log.e("FRIDAY", "Playback prepare failed: ${e.message}")
                playNext()
            }
        }

        if (!isPlaying) {
            isPlaying = true
            playNext()
        }
    }

    fun stop() {
        mediaPlayers.forEach { try { it.stop(); it.release() } catch (_: Exception) {} }
        mediaPlayers.clear()
        isPlaying = false
    }
}
