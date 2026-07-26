# Implementation Tasks - FRIDAY Mark V.5 Optimization

- [ ] `[/]` Create Background Service Plugin
    - [ ] [NEW] `plugins/withBackgroundService.js`
    - [ ] [MODIFY] `app.json`
- [ ] `[ ]` Core Logic Overhaul (App.js)
    - [ ] Define `FAST_ACTIONS` and `SENSITIVE_ACTIONS`
    - [ ] Implement `getFastAction` (Regex engine)
    - [ ] Update `handleAction` (Skip confirmation for non-risky tasks)
    - [ ] Refine `CALL` logic (Better fuzzy matching)
    - [ ] Implement `WHATSAPP` logic
    - [ ] Update `sendMessage` (Integrate Fast-Response)
- [ ] `[ ]` Stability & Crash Fixes
    - [ ] Refactor `sentinelTask` loop
    - [ ] Add error boundaries to Sentinel toggle
- [ ] `[ ]` Verification & Cleanup
    - [ ] Verify "Torch" latency
    - [ ] Verify "Call" accuracy
    - [ ] Verify Sentinel button stability
