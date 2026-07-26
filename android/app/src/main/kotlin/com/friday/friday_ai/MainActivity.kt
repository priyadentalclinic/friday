package com.friday.friday_ai

import android.content.*
import android.os.Bundle
import android.os.Build
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.*

class MainActivity : FlutterActivity() {
    private val CHANNEL_SENTINEL = "com.friday.ai/sentinel"
    private val CHANNEL_HARDWARE = "com.friday.ai/hardware"
    private var methodChannel: MethodChannel? = null

    private val wakeReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            methodChannel?.invokeMethod("onWake", null)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(wakeReceiver, IntentFilter("com.friday.WAKE_UP"), Context.RECEIVER_EXPORTED)
        } else {
            registerReceiver(wakeReceiver, IntentFilter("com.friday.WAKE_UP"))
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        unregisterReceiver(wakeReceiver)
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        
        // Sentinel Channel
        methodChannel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL_SENTINEL)
        methodChannel?.setMethodCallHandler { call, result ->
            when (call.method) {
                "startSentinel" -> {
                    val intent = Intent(this, SentinelService::class.java)
                    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                        startForegroundService(intent)
                    } else {
                        startService(intent)
                    }
                    result.success(true)
                }
                "stopSentinel" -> {
                    stopService(Intent(this, SentinelService::class.java))
                    result.success(true)
                }
                else -> result.notImplemented()
            }
        }

        // Hardware Channel (The Sentinel Slim Tools)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL_HARDWARE).setMethodCallHandler { call, result ->
            if (call.method == "copyAssetToFile") {
                val assetName = call.argument<String>("assetName")
                val targetPath = call.argument<String>("targetPath")
                if (assetName != null && targetPath != null) {
                    Thread {
                        try {
                            copyAssetToFile(assetName, targetPath)
                            runOnUiThread { result.success(true) }
                        } catch (e: Exception) {
                            runOnUiThread { result.error("IO_ERROR", e.message, null) }
                        }
                    }.start()
                } else {
                    result.error("INVALID_ARGS", "Missing assetName or targetPath", null)
                }
            } else {
                result.notImplemented()
            }
        }
    }

    private fun copyAssetToFile(assetName: String, targetPath: String) {
        val targetFile = File(targetPath)
        if (targetFile.exists()) return

        val inputStream = assets.open(assetName)
        val outputStream = FileOutputStream(targetFile)
        val buffer = ByteArray(8192)
        var length: Int
        while (inputStream.read(buffer).also { length = it } > 0) {
            outputStream.write(buffer, 0, length)
        }
        outputStream.flush()
        outputStream.close()
        inputStream.close()
    }
}
