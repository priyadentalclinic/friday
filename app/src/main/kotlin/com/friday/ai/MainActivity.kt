package com.friday.ai

import android.Manifest
import android.content.*
import android.net.Uri
import android.os.*
import android.speech.*
import android.util.Log
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.draw.*
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import java.util.*

class MainActivity : ComponentActivity() {
    private val viewModel: MainViewModel by viewModels()
    private lateinit var tts: EdgeTtsManager
    private val fuzzyMatcher = FuzzyMatcher()
    private val networkForge by lazy { NetworkForge(this) }

    private val wakeReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            Log.d("FRIDAY", "Activity Wake Event Detected")
            startVoiceInput()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        tts = EdgeTtsManager(this)
        
        // Android 14+ Exported Receiver Flag
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(wakeReceiver, IntentFilter("com.friday.ai.WAKE_WORD_DETECTED"), RECEIVER_EXPORTED)
        } else {
            registerReceiver(wakeReceiver, IntentFilter("com.friday.ai.WAKE_WORD_DETECTED"))
        }
        
        checkPermissions()
        viewModel.initLocalBrain(this)

        setContent {
            FridayHud(viewModel, tts, networkForge, fuzzyMatcher) {
                startVoiceInput()
            }
        }
    }

    private fun checkPermissions() {
        val permissions = arrayOf(
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.READ_CONTACTS,
            Manifest.permission.CAMERA,
            Manifest.permission.POST_NOTIFICATIONS
        )
        requestPermissions(permissions, 101)
    }

    private fun startVoiceInput() {
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-IN")
        }
        try {
            startActivityForResult(intent, 102)
        } catch (e: Exception) {
            Toast.makeText(this, "Speech Engine Error", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == 102 && resultCode == RESULT_OK) {
            val result = data?.getStringArrayListExtra(RecognizerIntent.RESULTS_RECOGNITION)
            result?.get(0)?.let { viewModel.sendMessage(it, this, tts, fuzzyMatcher, networkForge) }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        unregisterReceiver(wakeReceiver)
        viewModel.localBrain?.close()
    }
}

@Composable
fun FridayHud(
    viewModel: MainViewModel, 
    tts: EdgeTtsManager, 
    forge: NetworkForge, 
    fuzzy: FuzzyMatcher,
    onMicClick: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var isSentinelActive by remember { mutableStateOf(false) }
    var inputText by remember { mutableStateOf("") }
    val listState = rememberLazyListState()

    val infiniteTransition = rememberInfiniteTransition()
    val pulse by infiniteTransition.animateFloat(
        initialValue = 1f, targetValue = 1.15f,
        animationSpec = infiniteRepeatable(tween(1200), RepeatMode.Reverse)
    )

    LaunchedEffect(viewModel.messages.size) {
        if (viewModel.messages.isNotEmpty()) {
            listState.animateScrollToItem(viewModel.messages.size - 1)
        }
    }

    Scaffold(
        containerColor = Color(0xFF000505),
        bottomBar = {
            Column {
                Divider(color = Color(0xFF00FFFF).withOpacity(0.1))
                
                // Permission Card (Tony Stark Style)
                viewModel.pendingAction?.let { action ->
                    MissionConfirmation(
                        action = action["action"].toString(),
                        onConfirm = { viewModel.sendMessage("Yes", context, tts, fuzzy, forge) },
                        onAbort = { viewModel.sendMessage("Abort", context, tts, fuzzy, forge) }
                    )
                }

                Row(
                    modifier = Modifier.fillMaxWidth().padding(12),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(onClick = { 
                        isSentinelActive = !isSentinelActive
                        val intent = Intent(context, SentinelService::class.java)
                        if (isSentinelActive) context.startForegroundService(intent)
                        else context.stopService(intent)
                    }) {
                        Icon(
                            if (isSentinelActive) Icons.Default.Security else Icons.Default.SecurityUpdateWarning,
                            contentDescription = "Sentinel",
                            tint = if (isSentinelActive) Color.Green else Color(0xFF00FFFF).withOpacity(0.5)
                        )
                    }

                    TextField(
                        value = inputText,
                        onValueChange = { inputText = it },
                        modifier = Modifier.weight(1f),
                        placeholder = { Text("AWAITING MISSION...", color = Color(0xFF00FFFF).withOpacity(0.2), fontSize = 12.sp) },
                        colors = TextFieldDefaults.colors(
                            unfocusedContainerColor = Color.Transparent,
                            focusedContainerColor = Color.Transparent,
                            unfocusedIndicatorColor = Color.Transparent,
                            focusedIndicatorColor = Color.Transparent,
                            cursorColor = Color(0xFF00FFFF),
                            focusedTextColor = Color(0xFF00FFFF)
                        )
                    )

                    IconButton(onClick = onMicClick) {
                        Icon(Icons.Default.Mic, contentDescription = "Voice", tint = Color(0xFF00FFFF))
                    }

                    IconButton(onClick = { 
                        if (inputText.isNotBlank()) {
                            viewModel.sendMessage(inputText, context, tts, fuzzy, forge)
                            inputText = ""
                        }
                    }) {
                        Icon(Icons.Default.Bolt, contentDescription = "Send", tint = Color(0xFF00FFFF))
                    }
                }
            }
        }
    ) { padding ->
        Column(modifier = Modifier.padding(padding).fillMaxSize()) {
            Row(
                modifier = Modifier.fillMaxWidth().background(Color(0xFF00FFFF).withOpacity(0.05)).padding(vertical: 4),
                horizontalArrangement = Arrangement.Center
            ) {
                HudTag("CORE: ACTIVE")
                HudTag("BRAIN: ${if(viewModel.localBrain?.isReady == true) "LOCAL" else "CLOUD"}")
                HudTag("SENTINEL: ${if(isSentinelActive) "UP" else "DOWN"}")
            }

            Box(
                modifier = Modifier.fillMaxWidth().height(250.dp),
                contentAlignment = Alignment.Center
            ) {
                SentientCore(pulse)
                Text(
                    "FRIDAY MARK VII",
                    modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 20.dp),
                    color = Color(0xFF00FFFF).withOpacity(0.7f),
                    fontSize = 10.sp,
                    fontWeight = FontWeight.W900,
                    letterSpacing = 5.sp
                )
            }

            LazyColumn(
                state = listState,
                modifier = Modifier.weight(1f).fillMaxWidth().padding(horizontal: 16)
            ) {
                items(viewModel.messages) { msg ->
                    ChatBubble(msg)
                }
            }
        }
    }
}

@Composable
fun MissionConfirmation(action: String, onConfirm: () -> Unit, onAbort: () -> Unit) {
    Surface(
        color = Color.Yellow.withOpacity(0.1f),
        modifier = Modifier.fillMaxWidth().padding(16).border(1.dp, Color.Yellow, RoundedCornerShape(4.dp))
    ) {
        Column(modifier = Modifier.padding(12), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("MISSION AUTHORIZATION: $action", color = Color.Yellow, fontSize = 10.sp, fontWeight = FontWeight.Black)
            Spacer(modifier = Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.SpaceEvenly, modifier = Modifier.fillMaxWidth()) {
                TextButton(onClick = onAbort) { Text("ABORT", color = Color.Red, fontWeight = FontWeight.Bold) }
                Button(onClick = onConfirm, colors = ButtonDefaults.buttonColors(containerColor = Color.Yellow)) {
                    Text("ENGAGE", color = Color.Black, fontWeight = FontWeight.ExtraBold)
                }
            }
        }
    }
}

@Composable
fun HudTag(text: String) {
    Surface(
        color = Color(0xFF00FFFF).withOpacity(0.1),
        shape = RoundedCornerShape(2.dp),
        modifier = Modifier.padding(horizontal: 4)
    ) {
        Text(text, color = Color(0xFF00FFFF), fontSize = 7.sp, fontWeight = FontWeight.ExtraBold, modifier = Modifier.padding(horizontal: 6, vertical: 2))
    }
}

@Composable
fun SentientCore(scale: Float) {
    Canvas(modifier = Modifier.size(100.dp).graphicsLayer(scaleX = scale, scaleY = scale)) {
        drawCircle(
            color = Color(0xFF00FFFF),
            radius = size.minDimension / 2,
            style = Stroke(width = 2.dp.toPx())
        )
        drawCircle(
            color = Color(0xFF00FFFF).withOpacity(0.3f),
            radius = (size.minDimension / 2) + 12.dp.toPx(),
            style = Stroke(width = 1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(15f, 10f)))
        )
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(Color(0xFF00FFFF).withOpacity(0.5f), Color.Transparent),
                center = center,
                radius = size.minDimension / 2
            ),
            radius = size.minDimension / 2
        )
    }
}

@Composable
fun ChatBubble(msg: Map<String, String>) {
    val isUser = msg["role"] == "user"
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical: 6),
        horizontalAlignment = if (isUser) Alignment.End else Alignment.Start
    ) {
        Surface(
            color = if (isUser) Color(0xFF00FFFF).withOpacity(0.05) else Color.Transparent,
            modifier = Modifier.border(
                width = 1.dp,
                brush = Brush.horizontalGradient(
                    listOf(if (isUser) Color(0xFF004A4A) else Color(0xFF00FFFF), Color.Transparent)
                )
            )
        ) {
            Text(
                msg["content"] ?: "",
                modifier = Modifier.padding(12),
                color = if (isUser) Color(0xFF008B8B) else Color(0xFF00FFFF),
                fontSize = 13.sp,
                fontWeight = if (isUser) FontWeight.Normal else FontWeight.Bold,
                fontFamily = FontFamily.Monospace
            )
        }
    }
}
