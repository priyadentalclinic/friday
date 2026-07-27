# Task: FRIDAY Mark VII - OS-Level Transformation

- `[/]` **Phase 1: Architecture & Cleanup**
    - `[ ]` Purge all local brain code and build steps.
    - `[ ]` Setup modular package structure (`voice`, `core`, `agents`, `tasks`).
    - `[ ]` Update `app/build.gradle.kts` with required libraries (ML Kit for backup, Room for Memory).
- `[ ]` **Phase 2: Robust Native TTS (Hinglish)**
    - `[ ]` Implement `HinglishRouter` (Script-based segmenting).
    - `[ ]` Rebuild `EdgeTtsManager` with binary WebSocket protocol.
    - `[ ]` Implement `MediaPlayer` queue for seamless audio stitching.
- `[ ]` **Phase 3: Multi-Agent Intelligence**
    - `[ ]` Implement `CoordinatorAgent` (The Brain).
    - `[ ]` Implement `TaskAgent` with modular `Task` registry.
    - `[ ]` Setup `MemoryAgent` with local SQLite storage.
- `[ ]` **Phase 4: Cinematic HUD Upgrade**
    - `[ ]` Build "Sentient Orb" Glassmorphism UI.
    - `[ ]` Add real-time waveform and "Thought Stream" ticker.
- `[ ]` **Phase 5: Deployment**
    - `[ ]` Push to GitHub and monitor Actions.
    - `[ ]` Final verification on device.
