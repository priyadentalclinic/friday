package com.friday.friday_ai

import android.app.*
import android.content.*
import android.content.pm.ServiceInfo
import android.os.*
import android.speech.*
import android.util.Log
import androidx.core.app.NotificationCompat
import io.flutter.plugin.common.MethodChannel
import java.util.*

class SentinelService : Service() {
    private var speechRecognizer: SpeechRecognizer? = null
    private var recognizerIntent: Intent? = null
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        Log.d("FRIDAY", "Sentinel Service Created")
        
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "FRIDAY::SentinelWakeLock")
        wakeLock?.acquire()

        initRecognizer()
    }

    private fun initRecognizer() {
        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this)
        recognizerIntent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-IN")
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        }

        speechRecognizer?.setRecognitionListener(object : RecognitionListener {
            override fun onResults(results: Bundle?) {
                val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                if (matches != null) {
                    for (match in matches) {
                        if (match.lowercase(Locale.ROOT).contains("friday")) {
                            Log.d("FRIDAY", "Wake word detected!")
                            broadcastWake()
                        }
                    }
                }
                restartListening()
            }

            override fun onPartialResults(partialResults: Bundle?) {
                val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                if (matches != null) {
                    for (match in matches) {
                        if (match.lowercase(Locale.ROOT).contains("friday")) {
                            broadcastWake()
                        }
                    }
                }
            }

            override fun onError(error: Int) {
                Log.d("FRIDAY", "Recognizer Error: $error")
                restartListening()
            }

            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onEvent(eventType: Int, params: Bundle?) {}
        })

        speechRecognizer?.startListening(recognizerIntent)
    }

    private fun restartListening() {
        speechRecognizer?.stopListening()
        speechRecognizer?.startListening(recognizerIntent)
    }

    private fun broadcastWake() {
        val intent = Intent("com.friday.WAKE_UP")
        sendBroadcast(intent)
        // High-Energy Medium Pulse (Professional 2026 Waveform)
        val vibrator = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val composition = VibrationEffect.startComposition()
                .addPrimitive(VibrationEffect.Composition.PRIMITIVE_CLICK, 0.7f)
                .addPrimitive(VibrationEffect.Composition.PRIMITIVE_TICK, 0.5f, 50)
                .compose()
            vibrator.vibrate(composition)
        } else {
            vibrator.vibrate(VibrationEffect.createOneShot(100, 200))
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val channelId = "FRIDAY_SENTINEL"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(channelId, "FRIDAY Sentinel", NotificationManager.IMPORTANCE_LOW)
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }

        val notification = NotificationCompat.Builder(this, channelId)
            .setContentTitle("FRIDAY Iron Core Active")
            .setContentText("Monitoring local perimeters...")
            .setSmallIcon(com.friday.friday_ai.R.mipmap.ic_launcher)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(1, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
        } else {
            startForeground(1, notification)
        }
        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        speechRecognizer?.destroy()
        wakeLock?.release()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
