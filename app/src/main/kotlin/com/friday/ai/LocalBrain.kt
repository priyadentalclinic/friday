package com.friday.ai

import android.content.Context
import android.util.Log
import com.google.ai.edge.litertlm.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.io.File

class LocalBrain(private val context: Context) {
    private var engine: Engine? = null
    private var conversation: Conversation? = null
    var isReady = false

    suspend fun initialize(modelPath: String) = withContext(Dispatchers.IO) {
        try {
            val file = File(modelPath)
            if (!file.exists()) {
                Log.e("FRIDAY", "Model file missing at: $modelPath")
                return@withContext
            }

            // Using LiteRT-LM 0.14.0 API
            val config = EngineConfig(
                modelPath = modelPath,
                backend = Backend.GPU(), // Recommended for LLMs
                cacheDir = context.cacheDir.absolutePath
            )
            
            engine = Engine(config).apply { initialize() }
            conversation = engine?.createConversation()
            isReady = true
            Log.d("FRIDAY", "Local Supercomputer Brain Synced.")
        } catch (e: Exception) {
            Log.e("FRIDAY", "Brain Sync Failure: ${e.message}")
        }
    }

    fun generateResponse(prompt: String): Flow<String>? {
        if (!isReady) return null
        return conversation?.sendMessageAsync(prompt)?.map { it.text }
    }

    fun close() {
        conversation?.close()
        engine?.close()
        isReady = false
    }
}
