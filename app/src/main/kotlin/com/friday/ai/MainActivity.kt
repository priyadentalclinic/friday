package com.friday.ai

import android.content.*
import android.os.*
import android.speech.*
import android.util.Log
import android.widget.Toast
import android.os.BatteryManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.core.content.ContextCompat
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.SecurityUpdateWarning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

class MainActivity : ComponentActivity() {
    private val viewModel: MainViewModel by viewModels()
    private lateinit var tts: EdgeTtsManager
    private val fuzzyMatcher = FuzzyMatcher()
    private val networkForge by lazy { NetworkForge(this) }
    private lateinit var speechLauncher: ActivityResultLauncher<Intent>

    private val wakeReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            Log.d("FRIDAY", "Activity Wake Event Detected")
            startVoiceInput()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        tts = EdgeTtsManager(this)

        speechLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            if (result.resultCode == RESULT_OK) {
                val data = result.data
                val results = data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
                results?.get(0)?.let { viewModel.sendMessage(it, this, tts, fuzzyMatcher, networkForge) }
            }
        }
        
        // Copy Local Brain from Assets to Internal Storage (The Sentinel Slim Path)
        copyBrainFromAssets()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(wakeReceiver, IntentFilter("com.friday.ai.WAKE_WORD_DETECTED"), RECEIVER_EXPORTED)
        } else {
            // Added explicit RECEIVER_EXPORTED for older versions to satisfy modern SDK requirements
            ContextCompat.registerReceiver(this, wakeReceiver, IntentFilter("com.friday.ai.WAKE_WORD_DETECTED"), ContextCompat.RECEIVER_EXPORTED)
        }
        
        checkPermissions()
        viewModel.initLocalBrain(this)

        setContent {
            FridayHud(viewModel, tts, networkForge, fuzzyMatcher) {
                startVoiceInput()
            }
        }
    }

    private fun copyBrainFromAssets() {
        val modelName = "llama-3.2-1b-instruct-q4_k_m.gguf"
        val targetFile = java.io.File(filesDir, modelName)
        if (targetFile.exists()) return

        Thread {
            try {
                assets.open(modelName).use { input ->
                    java.io.FileOutputStream(targetFile).use { output ->
                        input.copyTo(output)
                    }
                }
                Log.d("FRIDAY", "Local Brain Injected Successfully.")
            } catch (_: Exception) {
                Log.e("FRIDAY", "Brain Injection Failed")
            }
        }.start()
    }

    private fun checkPermissions() {
        val permissions = mutableListOf(
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.READ_CONTACTS,
            Manifest.permission.CAMERA,
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        requestPermissions(permissions.toTypedArray(), 101)
    }

    private fun startVoiceInput() {
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-IN")
        }
        try {
            speechLauncher.launch(intent)
        } catch (_: Exception) {
            Toast.makeText(this, "Speech Engine Error", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        unregisterReceiver(wakeReceiver)
        viewModel.localBrain?.close()
    }
}

@androidx.compose.ui.tooling.preview.Preview(showBackground = true, backgroundColor = 0xFF000505)
@Composable
fun FridayHudPreview() {
    val viewModel = MainViewModel()
    FridayHud(
        viewModel = viewModel,
        tts = EdgeTtsManager(LocalContext.current),
        forge = NetworkForge(LocalContext.current),
        fuzzy = FuzzyMatcher(),
    ) { }
}

@Composable
fun FridayHud(
    viewModel: MainViewModel, 
    tts: EdgeTtsManager, 
    forge: NetworkForge, 
    fuzzy: FuzzyMatcher,
    onMicClick: () -> Unit,
) {
    val context = LocalContext.current
    var isSentinelActive by remember { mutableStateOf(value = false) }
    var inputText by remember { mutableStateOf("") }
    val listState = rememberLazyListState()
    
    // Telemetry States
    var batteryLevel by remember { mutableIntStateOf(0) }
    var temperature by remember { mutableFloatStateOf(0f) }

    DisposableEffect(context) {
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                batteryLevel = intent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
                val tempRaw = intent?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, -1) ?: -1
                if (tempRaw != -1) temperature = tempRaw / 10f
            }
        }
        context.registerReceiver(receiver, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        onDispose { context.unregisterReceiver(receiver) }
    }

    val hudColor = when {
        batteryLevel < 15 -> Color.Red
        viewModel.isLoading.value -> Color.Green
        else -> Color(0xFF00FFFF)
    }

    val infiniteTransition = rememberInfiniteTransition()
    val pulse by infiniteTransition.animateFloat(
        initialValue = 1f, targetValue = 1.15f,
        animationSpec = infiniteRepeatable(tween(1200), RepeatMode.Reverse),
    )
    
    val rotation by infiniteTransition.animateFloat(
        initialValue = 0f, targetValue = 360f,
        animationSpec = infiniteRepeatable(tween(5000, easing = LinearEasing), RepeatMode.Restart),
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
                HorizontalDivider(color = hudColor.copy(alpha = 0.1f))
                
                // Permission Card (Tony Stark Style)
                viewModel.pendingAction?.let { action ->
                    MissionConfirmation(
                        action = action["action"].toString(),
                        hudColor = hudColor,
                        onConfirm = { viewModel.sendMessage("Yes", context, tts, fuzzy, forge) },
                    ) { viewModel.sendMessage("Abort", context, tts, fuzzy, forge) }
                }

                Row(
                    modifier = Modifier.fillMaxWidth().padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconButton(
                        onClick = { 
                            isSentinelActive = !isSentinelActive
                            val intent = Intent(context, SentinelService::class.java)
                            if (isSentinelActive) context.startForegroundService(intent)
                            else context.stopService(intent)
                        },
                    ) {
                        Icon(
                            if (isSentinelActive) Icons.Default.Security else Icons.Default.SecurityUpdateWarning,
                            contentDescription = "Sentinel",
                            tint = if (isSentinelActive) Color.Green else hudColor.copy(alpha = 0.5f),
                        )
                    }

                    TextField(
                        value = inputText,
                        onValueChange = { inputText = it },
                        modifier = Modifier.weight(1f),
                        placeholder = { Text("AWAITING MISSION...", color = hudColor.copy(alpha = 0.2f), fontSize = 12.sp) },
                        colors = TextFieldDefaults.colors(
                            unfocusedContainerColor = Color.Transparent,
                            focusedContainerColor = Color.Transparent,
                            unfocusedIndicatorColor = Color.Transparent,
                            focusedIndicatorColor = Color.Transparent,
                            cursorColor = hudColor,
                            focusedTextColor = hudColor,
                        ),
                    )

                    IconButton(onClick = onMicClick) {
                        Icon(Icons.Default.Mic, contentDescription = "Voice", tint = hudColor)
                    }

                    IconButton(
                        onClick = { 
                            if (inputText.isNotBlank()) {
                                viewModel.sendMessage(inputText, context, tts, fuzzy, forge)
                                inputText = ""
                            }
                        },
                    ) {
                        Icon(Icons.Default.Bolt, contentDescription = "Send", tint = hudColor)
                    }
                }
            }
        },
    ) { padding ->
        Column(modifier = Modifier.padding(padding).fillMaxSize()) {
            Row(
                modifier = Modifier.fillMaxWidth().background(hudColor.copy(alpha = 0.05f)).padding(vertical = 4.dp),
                horizontalArrangement = Arrangement.Center,
            ) {
                HudTag("CORE: ACTIVE", hudColor)
                HudTag("BRAIN: ${if(viewModel.localBrain?.isReady == true) "LOCAL" else "CLOUD"}", hudColor)
                HudTag("BATTERY: $batteryLevel%", hudColor)
                HudTag("TEMP: ${temperature}°C", hudColor)
            }

            Box(
                modifier = Modifier.fillMaxWidth().weight(1f),
                contentAlignment = Alignment.Center,
            ) {
                SentientCore(pulse, rotation, hudColor)
                Text(
                    "FRIDAY MARK VII",
                    modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 20.dp),
                    color = hudColor.copy(alpha = 0.7f),
                    fontSize = 10.sp,
                    fontWeight = FontWeight.W900,
                    letterSpacing = 5.sp,
                )
            }

            LazyColumn(
                state = listState,
                modifier = Modifier.height(300.dp).fillMaxWidth().padding(horizontal = 16.dp),
            ) {
                items(viewModel.messages) { msg ->
                    ChatBubble(msg, hudColor)
                }
            }
        }
    }
}

@Composable
fun MissionConfirmation(action: String, hudColor: Color, onConfirm: () -> Unit, onAbort: () -> Unit) {
    Surface(
        color = hudColor.copy(alpha = 0.1f),
        modifier = Modifier.fillMaxWidth().padding(16.dp).border(1.dp, hudColor, RoundedCornerShape(4.dp)),
    ) {
        Column(modifier = Modifier.padding(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("MISSION AUTHORIZATION: $action", color = hudColor, fontSize = 10.sp, fontWeight = FontWeight.Black)
            Spacer(modifier = Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.SpaceEvenly, modifier = Modifier.fillMaxWidth()) {
                TextButton(onClick = onAbort) { Text("ABORT", color = Color.Red, fontWeight = FontWeight.Bold) }
                Button(onClick = onConfirm, colors = ButtonDefaults.buttonColors(containerColor = hudColor)) {
                    Text("ENGAGE", color = Color.Black, fontWeight = FontWeight.ExtraBold)
                }
            }
        }
    }
}

@Composable
fun HudTag(text: String, hudColor: Color) {
    Surface(
        color = hudColor.copy(alpha = 0.1f),
        shape = RoundedCornerShape(2.dp),
        modifier = Modifier.padding(horizontal = 4.dp),
    ) {
        Text(text, color = hudColor, fontSize = 7.sp, fontWeight = FontWeight.ExtraBold, modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp))
    }
}

@Composable
fun SentientCore(scale: Float, rotation: Float, hudColor: Color) {
    Box(contentAlignment = Alignment.Center, modifier = Modifier.size(200.dp)) {
        // Outer Rings
        Canvas(modifier = Modifier.size(180.dp).graphicsLayer(rotationZ = rotation)) {
            drawCircle(
                color = hudColor.copy(alpha = 0.3f),
                style = Stroke(width = 1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(20f, 20f))),
            )
        }
        
        Canvas(modifier = Modifier.size(150.dp).graphicsLayer(rotationZ = -rotation * 1.5f)) {
            drawCircle(
                color = hudColor.copy(alpha = 0.5f),
                style = Stroke(width = 2.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(10f, 30f))),
            )
        }

        // Inner Sentient Blob (Amoeba style)
        val transition = rememberInfiniteTransition()
        val blobScale by transition.animateFloat(
            initialValue = 0.8f, targetValue = 1.2f,
            animationSpec = infiniteRepeatable(tween(2000), RepeatMode.Reverse)
        )

        Surface(
            modifier = Modifier.size(80.dp).graphicsLayer(scaleX = scale * blobScale, scaleY = scale * blobScale).blur(20.dp),
            shape = CircleShape,
            color = hudColor.copy(alpha = 0.4f)
        ) {}

        Canvas(modifier = Modifier.size(60.dp).graphicsLayer(scaleX = scale, scaleY = scale)) {
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(hudColor, hudColor.copy(alpha = 0.2f), Color.Transparent),
                )
            )
        }
    }
}

@Composable
fun ChatBubble(msg: Map<String, String>, hudColor: Color) {
    val isUser = msg["role"] == "user"
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        horizontalAlignment = if (isUser) Alignment.End else Alignment.Start,
    ) {
        Surface(
            color = if (isUser) hudColor.copy(alpha = 0.05f) else Color.Transparent,
            modifier = Modifier.border(
                width = 1.dp,
                brush = Brush.horizontalGradient(
                    listOf(if (isUser) hudColor.copy(alpha = 0.3f) else hudColor, Color.Transparent),
                ),
                shape = RoundedCornerShape(4.dp),
            ),
        ) {
            Text(
                msg["content"] ?: "",
                modifier = Modifier.padding(8.dp),
                color = if (isUser) hudColor.copy(alpha = 0.7f) else hudColor,
                fontSize = 12.sp,
                fontWeight = if (isUser) FontWeight.Normal else FontWeight.Bold,
                fontFamily = FontFamily.Monospace,
            )
        }
    }
}
