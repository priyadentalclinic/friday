# FRIDAY Mark VII - Critical Connectivity & Vocal Fix

This plan resolves the build failure (401 error) and the "Silent Friday" bug where she refuses to speak or text back.

## User Review Required

> [!CAUTION]
> **Build Failure Fix**: The previous model link required authentication, causing the "401" error. I am switching to a **LiteRT Community verified public link** that is open to the public.
> **Vocal Affirmation**: I am forcing FRIDAY to always provide a verbal "Acknowledge" before executing a command. This ensures she never leaves you with an empty chat bubble.

## Proposed Changes

### 1. Fix build.yml (Resolve 401 Error)
#### [MODIFY] [build.yml](file:///C:/Users/admin/friday_expo/.github/workflows/build.yml)
- Replace the gated Hugging Face URL with the **LiteRT Community public URL**.
- Model: `Qwen2.5-0.5B-Instruct_seq128_dynamic_int8_ekv1280.tflite` (~521MB).

### 2. Restore Vocal & Text Replies
#### [MODIFY] [MainViewModel.kt](file:///C:/Users/admin/friday_expo/app/src/main/kotlin/com/friday/ai/MainViewModel.kt)
- **Acknowledge Logic**: If the AI only returns a command (JSON), FRIDAY will now automatically insert "Engaging protocol now, boss" or "I'm on it."
- **Network Feedback**: If the cloud call fails, she will now post "Satellite uplink timed out" instead of doing nothing.
- **Prompt Strengthening**: Updated the `systemPrompt` to strictly require verbal context: *"Always start your reply with a natural sentence before the command."*

### 3. Build Integrity
#### [MODIFY] [MainActivity.kt](file:///C:/Users/admin/friday_expo/app/src/main/kotlin/com/friday/ai/MainActivity.kt)
- Updated the local file name reference to match the new `Qwen2.5` LiteRT model.

## Verification Plan

### Automated Tests
- Monitor GitHub Actions for a **Green Checkmark** (verifies model download and APK compilation).

### Manual Verification
1. **Text Reply**: Type "Who are you?" in the chat. She should reply with text and voice.
2. **Command Reply**: Type "Call Disha." She should say "Dialing Disha now, boss" and then trigger the dialer.
3. **Empty Case**: If the AI returns only `{...}`, she should automatically speak a fallback confirmation.

---
**Please approve this plan to restore her voice and fix the build.**
