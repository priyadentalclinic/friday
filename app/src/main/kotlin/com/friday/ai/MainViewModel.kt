package com.friday.ai

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.compose.runtime.mutableStateListOf
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.gson.Gson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException

class MainViewModel : ViewModel() {
    private val client = OkHttpClient()
    private val gson = Gson()
    private val OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
    private val OPENROUTER_API_KEY = "sk-or-v1-3004838634731383827363473138382736"

    val messages = mutableStateListOf<Map<String, String>>()
    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading

    fun sendMessage(text: String, context: Context, tts: EdgeTtsManager, fuzzy: FuzzyMatcher) {
        if (text.isBlank()) return
        
        messages.add(mapOf("role" to "user", "content" to text))
        _isLoading.value = true

        viewModelScope.launch(Dispatchers.IO) {
            val systemPrompt = "You are FRIDAY. Sentinel Core. Persona: Cybersecurity Expert. Latin script ONLY. Max 12 words. Commands: NAVIGATE, CALL, WHATSAPP, TORCH. Format: Reply [MODE: TYPE] {json}"
            val payload = mapOf(
                "model" to "google/gemma-2-9b-it",
                "messages" to listOf(
                    mapOf("role" to "system", "content" to systemPrompt),
                    mapOf("role" to "user", "content" to text)
                )
            )

            val body = gson.toJson(payload).toRequestBody("application/json".toMediaType())
            val request = Request.Builder()
                .url(OPENROUTER_URL)
                .addHeader("Authorization", "Bearer $OPENROUTER_API_KEY")
                .post(body)
                .build()

            client.newCall(request).enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    postMsg("assistant", "Satellite link broken, boss.", tts)
                }

                override fun onResponse(call: Call, response: Response) {
                    val respBody = response.body?.string()
                    if (response.isSuccessful && respBody != null) {
                        val jsonResponse = gson.fromJson(respBody, Map::class.java)
                        val choices = jsonResponse["choices"] as List<*>
                        val firstChoice = choices[0] as Map<*, *>
                        val message = firstChoice["message"] as Map<*, *>
                        val content = message["content"] as String
                        
                        handleResponse(content, context, tts, fuzzy)
                    }
                }
            })
        }
    }

    private fun handleResponse(content: String, context: Context, tts: EdgeTtsManager, fuzzy: FuzzyMatcher) {
        val cleanMsg = content.replace(Regex("\\{.*\\}"), "").replace(Regex("\\[MODE:.*?\\]"), "").trim()
        postMsg("assistant", cleanMsg, tts)

        val jsonMatch = Regex("\\{.*\\}").find(content)
        jsonMatch?.value?.let { jsonStr ->
            try {
                val action = gson.fromJson(jsonStr, Map::class.java)
                val cmd = action["action"] as String
                val target = action["target"] as? String ?: ""
                
                viewModelScope.launch(Dispatchers.Main) {
                    when (cmd) {
                        "CALL" -> {
                            val contact = fuzzy.findBestContact(context, target)
                            if (contact != null) {
                                tts.speak("Dialing ${contact.name}, boss.") {
                                    val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:${contact.number}"))
                                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                    context.startActivity(intent)
                                }
                            } else postMsg("assistant", "Target not in perimeter, boss.", tts)
                        }
                        "WHATSAPP" -> {
                            val contact = fuzzy.findBestContact(context, target)
                            if (contact != null) {
                                val msg = action["text"] as? String ?: "Friday Mission"
                                tts.speak("Drafting encrypted message to ${contact.name}.") {
                                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/${contact.number}?text=${Uri.encode(msg)}"))
                                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                    context.startActivity(intent)
                                }
                            }
                        }
                        "NAVIGATE" -> {
                            tts.speak("Target $target locked. Initiating OSRM briefing.") {
                                val intent = Intent(Intent.ACTION_VIEW, Uri.parse("google.navigation:q=$target"))
                                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                context.startActivity(intent)
                            }
                        }
                    }
                }
            } catch (e: Exception) { Log.e("FRIDAY", "Action Error: ${e.message}") }
        }
    }

    private fun postMsg(role: String, content: String, tts: EdgeTtsManager) {
        viewModelScope.launch(Dispatchers.Main) {
            _isLoading.value = false
            messages.add(mapOf("role" to role, "content" to content))
            if (role == "assistant") tts.speak(content)
        }
    }
}
