# FRIDAY Mark VII - Llama Core Integration

This plan replaces the failing Qwen download with a verified **Llama 3.2 1B TFLite** model. This is a larger but more powerful model that fits the "Partner" persona perfectly.

## User Review Required

> [!WARNING]
> **APK Size**: Llama 1B is approximately **1.2GB - 2.1GB** depending on quantization. This will result in a much larger APK download than the previous versions.
> **Memory Usage**: On your 6GB RAM device, this will consume ~1.5GB of RAM. Since you have ~3GB free, this is safe but will push the hardware harder than Qwen.

## Proposed Changes

### 1. Build Pipeline (Llama 1B Verified)
#### [MODIFY] [build.yml](file:///C:/Users/admin/friday_expo/.github/workflows/build.yml)
- Switch the download source to **Llama 3.2 1B TFLite**.
- URL: `https://huggingface.co/vimal-yuvabe/llama-3.2-1b-tflite/resolve/main/llama-3.2-1b-q8.tflite`
- Asset name: `llama-3.2-1b.tflite`.

### 2. MainActivity Brain Injection
#### [MODIFY] [MainActivity.kt](file:///C:/Users/admin/friday_expo/app/src/main/kotlin/com/friday/ai/MainActivity.kt)
- Update `copyBrainFromAssets` to look for `llama-3.2-1b.tflite`.

### 3. Logic Sync
#### [MODIFY] [MainViewModel.kt](file:///C:/Users/admin/friday_expo/app/src/main/kotlin/com/friday/ai/MainViewModel.kt)
- Update `initLocalBrain` to use the new Llama filename.

## Verification Plan

### Automated Tests
- Monitor GitHub Actions for build success. I have added `-f` to `curl` so the build will fail immediately if the URL is wrong again, rather than giving you a broken APK.

### Manual Verification
1. **Model Check**: Once installed, verify the HUD shows "LOCAL" for the brain.
2. **Conversation**: Say "Hey Friday, tell me a mission report." Verify she speaks back using the local Llama core.

---
**Please approve to switch the brain to Llama 1B and fix the download errors.**
