package com.friday.ai

import android.app.*
import android.content.*
import android.os.*
import android.speech.*
import android.util.Log
import android.content.pm.ServiceInfo
import androidx.core.app.NotificationCompat
import java.util.*

class SentinelService : Service() {
    private var speechRecognizer: SpeechRecognizer? = null
    private var recognizerIntent: Intent? = null
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        Log.d("FRIDAY", "Sentinel Core Active")
        
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "FRIDAY::SentinelShield")
        wakeLock?.acquire()

        initRecognizer()
    }

    private fun initRecognizer() {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            Log.e("FRIDAY", "Recognition not available")
            return
        }

        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this)
        recognizerIntent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-IN")
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        }

        speechRecognizer?.setRecognitionListener(object : RecognitionListener {
            override fun onResults(results: Bundle?) {
                val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                matches?.forEach {
                    val spoken = it.lowercase(Locale.ROOT)
                    if (spoken.contains("hey friday") || spoken.contains("friday")) {
                        broadcastWake()
                    }
                }
                restartListening()
            }

            override fun onPartialResults(partialResults: Bundle?) {
                val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                matches?.forEach {
                    val spoken = it.lowercase(Locale.ROOT)
                    if (spoken.contains("hey friday") || spoken.contains("friday")) {
                        broadcastWake()
                    }
                }
            }

            override fun onError(error: Int) {
                Log.d("FRIDAY", "Recognizer Error: $error")
                if (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY) return
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
        Handler(Looper.getMainLooper()).postDelayed({
            speechRecognizer?.stopListening()
            speechRecognizer?.startListening(recognizerIntent)
        }, 100)
    }

    private fun broadcastWake() {
        val intent = Intent("com.friday.ai.WAKE_WORD_DETECTED")
        sendBroadcast(intent)
        
        // Tactical Pulse
        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vibratorManager = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
            vibratorManager.defaultVibrator
        } else {
            getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createOneShot(150, 180)) // Medium Intensity
        } else {
            vibrator.vibrate(150)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val channelId = "FRIDAY_SENTINEL_CHANNEL"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(channelId, "Sentinel Core", NotificationManager.IMPORTANCE_LOW)
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }

        val notification = NotificationCompat.Builder(this, channelId)
            .setContentTitle("FRIDAY SENTINEL ACTIVE")
            .setContentText("Shielding local systems...")
            .setSmallIcon(android.R.drawable.ic_lock_idle_lock)
            .setPriority(NotificationCompat.PRIORITY_LOW)
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
