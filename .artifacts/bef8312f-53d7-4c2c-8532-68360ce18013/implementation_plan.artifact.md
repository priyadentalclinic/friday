# FRIDAY Mark VII - Cloud-First reasoning (OpenRouter)

This plan pivots FRIDAY to a cloud-first architecture, removing the heavy local brain and relying entirely on the **OpenRouter API** for reasoning. This will make the app extremely small (~20MB) and much more reliable for initial testing.

## User Review Required

> [!IMPORTANT]
> **API Key Safety**: I will ensure your OpenRouter API key is securely handled in the code.
> **Internet Mandatory**: Since we are removing the local brain, FRIDAY will require an active internet connection to "think" or "speak."
> **Model Selection**: I will set the default model to **Gemma 2 9B** (via OpenRouter) as it is excellent at Hinglish and very fast.

## Proposed Changes

### 1. Simplify Brain Logic
#### [MODIFY] [MainViewModel.kt](file:///C:/Users/admin/friday_expo/app/src/main/kotlin/com/friday/ai/MainViewModel.kt)
- Remove all `LocalBrain` references and the `initLocalBrain` function.
- Simplify `sendMessage` to always route through `runCloudInference`.
- Fortify `runCloudInference` with better timeout handling and mandatory verbal confirmation.

### 2. Cleanup & De-bloat
#### [MODIFY] [MainActivity.kt](file:///C:/Users/admin/friday_expo/app/src/main/kotlin/com/friday/ai/MainActivity.kt)
- Remove `copyBrainFromAssets` logic.
- Update the HUD tags to show **BRAIN: CLOUD** permanently.

#### [MODIFY] [build.yml](file:///C:/Users/admin/friday_expo/.github/workflows/build.yml)
- Remove the "Inject Local Brain" steps.
- The build will now be fast (under 2 minutes) and the APK will be tiny (~20MB).

### 3. Voice & Personality
#### [MODIFY] [MainViewModel.kt](file:///C:/Users/admin/friday_expo/app/src/main/kotlin/com/friday/ai/MainViewModel.kt)
- Update the System Prompt to be even more "Partner-like" since we have the cloud's full power:
  - *"You are FRIDAY, a loyal AI partner. mission-ready. Respond in a mix of English and Hindi (Hinglish). If a command is triggered, explain what you are doing naturally."*

## Verification Plan

### Automated Tests
- `gradlew assembleDebug` to ensure no orphaned local-brain references.

### Manual Verification
1. **Connectivity Test**: Type "How's the weather in Delhi?" Verify the cloud response appears in text and voice.
2. **Command Test**: Type "Call Disha." Verify she says "Connecting you to Disha now" and opens the dialer.
3. **APK Size Check**: Confirm the APK is small and installs instantly.

---
**Please approve this shift to Cloud-First mode to get FRIDAY talking immediately.**
