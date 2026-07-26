package com.friday.ai

import android.content.Context
import android.media.MediaPlayer
import android.util.Log
import okhttp3.*
import okio.ByteString
import java.io.File
import java.io.FileOutputStream
import java.util.*

class EdgeTtsManager(private val context: Context) {
    private val client = OkHttpClient()
    private val EDGE_URL = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9787D7E05195A4F334"
    
    fun speak(text: String, onDone: () -> Unit = {}) {
        val requestId = UUID.randomUUID().toString().replace("-", "")
        val request = Request.Builder().url(EDGE_URL).header("User-Agent", "Mozilla/5.0").build()
        val audioFile = File(context.cacheDir, "friday_voice.mp3")
        val outStream = FileOutputStream(audioFile)

        val ws = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                val config = "X-Timestamp:${System.currentTimeMillis()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{\"context\":{\"synthesis\":{\"audio\":{\"metadataoptions\":{\"sentenceBoundaryEnabled\":\"false\",\"wordBoundaryEnabled\":\"false\"},\"outputFormat\":\"audio-24khz-48kbitrate-mono-mp3\"}}}}"
                val ssml = "X-Timestamp:${System.currentTimeMillis()}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='http://www.w3.org/2001/mstts' xml:lang='en-IN'><voice name='en-IN-NeerjaNeural'><mstts:express-as style='cheerful' styledegree='2.0'><prosody pitch='+5Hz' rate='125%'>$text</prosody></mstts:express-as></voice></speak>"
                webSocket.send(config)
                webSocket.send(ssml)
            }

            override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
                val data = bytes.toByteArray()
                // Find start of audio
                val headerMarker = "Path:audio".toByteArray()
                var headerEnd = -1
                for (i in 0 until data.size - headerMarker.size) {
                    if (data.sliceArray(i until i + headerMarker.size).contentEquals(headerMarker)) {
                        headerEnd = i
                        break
                    }
                }
                if (headerEnd != -1) {
                    // Find start of binary data after \r\n\r\n
                    val bodyStart = headerEnd + 10 // Skip "Path:audio"
                    outStream.write(data.sliceArray(bodyStart + 2 until data.size))
                }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                if (text.contains("turn.end")) {
                    webSocket.close(1000, "Done")
                    outStream.close()
                    playAudio(audioFile, onDone)
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.e("FRIDAY", "TTS Failure: ${t.message}")
            }
        })
    }

    private fun playAudio(file: File, onDone: () -> Unit) {
        MediaPlayer().apply {
            setDataSource(file.absolutePath)
            prepare()
            start()
            setOnCompletionListener { 
                release()
                onDone()
            }
        }
    }
}
