# Task: FRIDAY Mark VII - Cloud Restoration (Reliable)

- `[x]` **Phase 1: Brain Removal & Code De-bloat**
    - `[x]` Remove `LocalBrain` usage and file from project.
    - `[x]` Remove asset copying logic from `MainActivity.kt`.
    - `[x]` Update `build.yml` to stop downloading large models.
    - `[x]` **CRITICAL**: Purged 800MB+ legacy binary blobs (`litert.aar`, `classes.jar`) from the repo causing packaging failures.
- `[x]` **Phase 2: Bulletproof Cloud Logic**
    - `[x]` Update `MainViewModel.kt` with provided OpenRouter Key.
    - `[x]` Add mandatory `_isLoading.value = false` on ALL error paths.
    - `[x]` Implement "Forced Acknowledge" (FRIDAY must speak/text a reason if she's silent).
    - `[x]` Add network timeout (15s) to `OkHttpClient`.
- `[x]` **Phase 3: HUD & Voice Polish**
    - `[x]` Lock HUD to `Tactical Blue` / `Emergency Red`.
    - `[x]` Update HUD tags to `BRAIN: CLOUD`.
- `[ ]` **Phase 4: Deployment**
    - `[x]` Push fixes to GitHub.
    - `[ ]` Verify build success.
