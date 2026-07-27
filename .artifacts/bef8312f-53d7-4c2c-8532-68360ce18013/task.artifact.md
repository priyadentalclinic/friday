# Task: FRIDAY Mark VII - Cloud Restoration (Reliable)

- `[/]` **Phase 1: Brain Removal & Code De-bloat**
    - `[ ]` Remove `LocalBrain` usage and file from project.
    - `[ ]` Remove asset copying logic from `MainActivity.kt`.
    - `[ ]` Update `build.yml` to stop downloading large models.
- `[ ]` **Phase 2: Bulletproof Cloud Logic**
    - `[ ]` Update `MainViewModel.kt` with provided OpenRouter Key.
    - `[ ]` Add mandatory `_isLoading.value = false` on ALL error paths.
    - `[ ]` Implement "Forced Acknowledge" (FRIDAY must speak/text a reason if she's silent).
    - `[ ]` Add network timeout (15s) to `OkHttpClient`.
- `[ ]` **Phase 3: HUD & Voice Polish**
    - `[ ]` Lock HUD to `Tactical Blue` / `Emergency Red`.
    - `[ ]` Update HUD tags to `BRAIN: CLOUD`.
- `[ ]` **Phase 4: Deployment**
    - `[ ]` Push to GitHub.
    - `[ ]` Verify build success.
