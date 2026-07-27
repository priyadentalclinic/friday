# FRIDAY Mark VII - Stealth Listener & Core Recovery

This plan fixes the two reasons FRIDAY is "silent": Android blocking background activity launches and the local brain being corrupt/missing.

## User Review Required

> [!IMPORTANT]
> **Stealth Listening**: To avoid Android's "Background Activity Block," I am moving the speech listener from an Intent-based popup to a **Continuous Service-based Recognizer**. You won't see a Google popup anymore; FRIDAY will just hear you and reply.
> **Qwen 0.5B Direct Injection**: I am using a verified direct link to ensure the local core is ~350MB, not 133 bytes. This will make the build take longer (~5-10 mins) but it will actually work.

## Proposed Changes

### 1. Stealth Speech Engine
#### [MODIFY] [MainActivity.kt](file:///C:/Users/admin/friday_expo/app/src/main/kotlin/com/friday/ai/MainActivity.kt)
- Replace `speechLauncher` (Activity-based) with an internal `SpeechRecognizer` instance.
- This allows FRIDAY to start listening immediately when "Hey Friday" is detected without being blocked by the system.

### 2. Verified Brain Build
#### [MODIFY] [build.yml](file:///C:/Users/admin/friday_expo/.github/workflows/build.yml)
- Update the `curl` command to use the **MediaPipe-validated Qwen 0.5B** model.
- Add a build step to verify the downloaded model size is > 50MB.

### 3. Mission Feedback
#### [MODIFY] [MainViewModel.kt](file:///C:/Users/admin/friday_expo/app/src/main/kotlin/com/friday/ai/MainViewModel.kt)
- Add a "Thinking..." message to the HUD the moment speech is recognized.
- Ensure the TTS engine speaks "I'm on it" or similar if the model takes more than 1 second to load.

## Verification Plan

### Automated Tests
- `gradlew assembleDebug` to verify the new speech recognition dependencies.

### Manual Verification
1. **Background Test**: Minimize the app, say "Hey Friday," and then "What time is it?" Verify she speaks the time without opening any popups.
2. **Brain Check**: Run `adb shell "run-as com.friday.ai ls -lh files/"` and verify the model file is > 300MB.

---
**Please approve this plan to break through the system blocks and bring FRIDAY back online.**
