# FRIDAY Mark VII - OS-Level AI Companion (Technical Fortification)

This plan transforms FRIDAY into a modular, multi-agent AI system with a native, robust bilingual voice pipeline.

## User Review Required

> [!CAUTION]
> **Native WebSocket Re-implementation**: I am NOT using a Python bridge. I am re-implementing the Microsoft Edge "Read Aloud" WebSocket protocol natively in Kotlin using `OkHttp`. This avoids the bloat of a Python runtime while maintaining access to the high-fidelity Neerja voice.
> **Hybrid Language Routing**: ML Kit has limitations with word-level Hinglish. I am implementing a **Script-Aware Segmenter**. It will use Regex to detect Devanagari (Hindi script) and route it to the `Swara` voice, while routing Latin (English/Romanized Hindi) to `Neerja`. This ensures natural pronunciation without the "confusion" of sentence-level classifiers.

## Proposed Changes

### 1. Robust Native TTS Engine
#### [MODIFY] [EdgeTtsManager.kt](file:///C:/Users/admin/friday_expo/app/src/main/kotlin/com/friday/ai/EdgeTtsManager.kt)
- **Protocol Upgrade**: Implement the Big-Endian binary header parsing (first 2 bytes = header length) as per the actual Edge TTS spec. This replaces the fragile string-searching logic.
- **Handshake Fortification**: Add required `Origin` and `User-Agent` headers to match Edge browser signatures, preventing `403 Forbidden` errors.
- **Voice Stitcher**: Support playing multiple audio segments (EN/HI) back-to-back using a `MediaPlayer` queue for smooth sentence delivery.

### 2. Script-Aware Segmenter (Hinglish Fix)
#### [NEW] `com.friday.ai.voice.HinglishRouter`
- **Regex Splitter**: Splits response text into segments based on character ranges.
  - `[\u0900-\u097F]+` -> Devanagari (Hindi).
  - `[A-Za-z0-9\s.,!?]+` -> Latin (English/Romanized).
- **Phonetic Helper**: For Romanized Hindi words like "aaj" or "accha", `NeerjaNeural` will be tuned with specific prosody settings to ensure they don't sound "Westernized."

### 3. Multi-Agent Core Architecture
#### [NEW] `com.friday.ai.agents` Package
- **CoordinatorAgent**: The central nervous system that routes data between specialized agents.
- **ConversationAgent**: Manages wit, sarcasm, and Hinglish generation logic.
- **TaskAgent**: Executes phone-level commands (Calls, Apps, Hardware).
- **MemoryAgent**: Uses a local SQLite (Room) store to remember "Sir's" preferences.

### 4. Cinematic HUD Overhaul
#### [MODIFY] [MainActivity.kt](file:///C:/Users/admin/friday_expo/app/src/main/kotlin/com/friday/ai/MainActivity.kt)
- **Sentient Orb**: Replace the Amoeba with a multi-layered Glassmorphism orb.
- **Thought Stream**: Add a scrolling ticker that shows what the agents are "thinking" (e.g., `PLANNING_AGENT: SEARCHING_CONTACTS...`).

## Verification Plan

### Automated Tests
- **Binary Parser Test**: Unit test the WebSocket frame decoder with sample Edge TTS binary frames.
- **Hinglish Split Test**: Verify that "Hello sir, aap kaise hain?" splits into two segments with correct voice assignments.

### Manual Verification
1. **Background Stability**: Test if she listens and speaks while the phone is locked.
2. **Language Flow**: Speak a Hinglish command and verify the response sounds like a natural urban Indian professional.

---
**Does this technical approach for the TTS and Language ID meet your requirements, Boss?**
