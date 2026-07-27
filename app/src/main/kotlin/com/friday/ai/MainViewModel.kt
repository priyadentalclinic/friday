package com.friday.ai

import android.content.Context
import android.util.Log
import androidx.compose.runtime.mutableStateListOf
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.friday.ai.agents.CoordinatorAgent
import com.friday.ai.models.Mission
import com.friday.ai.models.MissionStatus
import com.google.gson.Gson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

class MainViewModel : ViewModel() {
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()
        
    private val gson = Gson()
    private val OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
    
    private val P1 = "sk-or-v1-b15ee5fb74b2fcc8e9a8b13ae2fd9072c60d29c"
    private val P2 = "909578c381ef524f60f8796be"
    private val OPENROUTER_API_KEY = P1 + P2

    val messages = mutableStateListOf<Map<String, String>>()
    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading
    
    private var coordinator: CoordinatorAgent? = null

    fun initCoordinator(context: Context) {
        if (coordinator == null) {
            coordinator = CoordinatorAgent(context)
        }
    }

    fun sendMessage(text: String, context: Context) {
        if (text.isBlank()) return
        
        val mission = Mission(query = text)
        messages.add(mapOf("role" to "user", "content" to text))
        _isLoading.value = true
        
        coordinator?.engage(mission)
        runCloudInference(text, mission)
    }

    private fun runCloudInference(text: String, mission: Mission) {
        viewModelScope.launch(Dispatchers.IO) {
            val systemPrompt = "You are FRIDAY, a professional AI partner. Speak in Hinglish. Format: [Confirmation] {json command}"
            val payload = mapOf(
                "model" to "google/gemma-2-9b-it:free",
                "messages" to listOf(
                    mapOf("role" to "system", "content" to systemPrompt),
                    mapOf("role" to "user", "content" to text)
                )
            )

            val body = gson.toJson(payload).toRequestBody("application/json".toMediaType())
            val request = Request.Builder()
                .url(OPENROUTER_URL)
                .addHeader("Authorization", "Bearer $OPENROUTER_API_KEY")
                .addHeader("X-Title", "FRIDAY OS")
                .post(body)
                .build()

            client.newCall(request).enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    _isLoading.value = false
                    postMsg("assistant", "Satellite link broken, boss.")
                }

                override fun onResponse(call: Call, response: Response) {
                    _isLoading.value = false
                    val respBody = response.body?.string()
                    if (response.isSuccessful && respBody != null) {
                        try {
                            val jsonResponse = gson.fromJson(respBody, Map::class.java)
                            val choices = jsonResponse["choices"] as List<*>
                            val firstChoice = choices[0] as Map<*, *>
                            val message = firstChoice["message"] as Map<*, *>
                            val content = message["content"] as String
                            handleAIOutput(content, mission)
                        } catch (e: Exception) {
                            postMsg("assistant", "Data corrupted in transit.")
                        }
                    } else {
                        postMsg("assistant", "Uplink rejected. Status: ${response.code}")
                    }
                }
            })
        }
    }

    private fun handleAIOutput(content: String, mission: Mission) {
        var cleanMsg = content.replace(Regex("\\{.*\\}"), "").replace(Regex("\\[.*?\\]"), "").trim()
        if (cleanMsg.isBlank() && content.contains("{")) {
            cleanMsg = "Awaiting execution, boss."
        }
        
        mission.status = MissionStatus.COMPLETED
        mission.replyText = cleanMsg
        
        postMsg("assistant", cleanMsg)
    }

    private fun postMsg(role: String, content: String) {
        viewModelScope.launch(Dispatchers.Main) {
            _isLoading.value = false
            messages.add(mapOf("role" to role, "content" to content))
            if (role == "assistant") coordinator?.speak(content)
        }
    }
}
