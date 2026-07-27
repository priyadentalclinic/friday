# FRIDAY Mark VII - Core Efficiency Upgrade (Llama 1B)

This plan replaces the memory-heavy Gemma 2B model with a highly efficient **Llama 3.2 1B TFLite** model. This ensures FRIDAY remains responsive on your Redmi 13C (6GB RAM) without triggering system lag or crashes.

## User Review Required

> [!IMPORTANT]
> **RAM Optimization**: Llama 3.2 1B (INT4 quantized) uses ~800MB - 1.2GB of RAM, compared to Gemma 2B's ~2GB+. This fits perfectly within your 3.1-4GB free RAM window, leaving plenty of room for system tasks.
> **Intelligence vs Size**: While smaller than 2B, Llama 3.2 1B is a 2024 model specifically optimized for on-device reasoning and "Partner" style conversation. It is much smarter than the 0.5B models suggested by other agents.

## Proposed Changes

### 🧠 Local Brain Migration
#### [MODIFY] [MainViewModel.kt](file:///C:/Users/admin/friday_expo/app/src/main/kotlin/com/friday/ai/MainViewModel.kt)
- Update model reference to `llama-3.2-1b-it-gpu-int4.tflite`.
- Ensure the `initLocalBrain` path points to the new file.

#### [MODIFY] [MainActivity.kt](file:///C:/Users/admin/friday_expo/app/src/main/kotlin/com/friday/ai/MainActivity.kt)
- Update the `copyBrainFromAssets` logic to look for the Llama 1B file.
- Add a cleanup step to remove the old Gemma 2B file from internal storage to free up 2GB of disk space.

### 🛰️ Build Pipeline Optimization
#### [MODIFY] [build.yml](file:///C:/Users/admin/friday_expo/.github/workflows/build.yml)
- Replace the Gemma 2B download URL with the **Llama 3.2 1B TFLite** source.
- Update the filename mapping to match the new local core.

## Verification Plan

### Automated Tests
- `gradlew assembleDebug` to verify asset mapping.

### Manual Verification
1. **Memory Check**: Use Android Studio Profiler or a system monitor to verify that RAM usage stays below 1.5GB during local inference.
2. **Reasoning Test**: Ask FRIDAY: "Who are you?" or "Plan a trip to Rishikesh." Verify she uses the local core and responds within 2-3 seconds.
3. **Storage Check**: Verify the old Gemma model is deleted and only the ~600MB Llama model remains.

---
**Please approve this upgrade to ensure FRIDAY runs smoothly and never lags your phone.**
