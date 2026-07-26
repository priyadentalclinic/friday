package com.friday.ai

import android.content.Context
import android.util.Log
import com.google.ai.edge.litertlm.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.Flow
import java.io.File

class LocalBrain(private val context: Context) {
    private var engine: Engine? = null
    private var conversation: Conversation? = null
    var isReady = false

    suspend fun initialize(modelPath: String) = withContext(Dispatchers.IO) {
        try {
            val file = File(modelPath)
            if (!file.exists()) {
                Log.e("FRIDAY", "Model file missing: $modelPath")
                return@withContext
            }

            val config = EngineConfig(
                modelPath = modelPath,
                device = Device.GPU,
                maxTokens = 1024
            )
            
            engine = Engine(config).apply { initialize() }
            conversation = engine?.createConversation()
            isReady = true
            Log.d("FRIDAY", "Local Brain Synced.")
        } catch (e: Exception) {
            Log.e("FRIDAY", "Brain Sync Failure: ${e.message}")
        }
    }

    fun chat(prompt: String): Flow<String>? {
        return conversation?.sendMessageAsync(prompt)
    }

    fun close() {
        conversation?.close()
        engine?.close()
    }
}
