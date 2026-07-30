# Implementation Plan - Fix Brain Congestion & Update API Key

This plan addresses the ongoing "systems congested" (429) and "uplink rejected" (400) errors by updating the OpenRouter API key and implementing a prioritized model fallback system based on the user's provided list.

## User Review Required

> [!IMPORTANT]
> **API Key Visibility**: The new API key will be hardcoded in `MainViewModel.kt` as requested. Please ensure the repository is private if this key is sensitive.
> **Model IDs**: I have mapped the provided model names to their most likely OpenRouter IDs. If any model fails with a 404, we may need to verify the exact ID from the OpenRouter dashboard.

## Proposed Changes

### ViewModel Integration

#### [MODIFY] [MainViewModel.kt](file:///C:/Users/admin/friday_expo/app/src/main/kotlin/com/friday/ai/MainViewModel.kt)
- Update `OPENROUTER_API_KEY` to the new key provided by the user.
- Replace the current model selection with a prioritized `model_pool` array.
- Update `runCloudInference` to use the OpenRouter `models` (plural) field for automatic server-side failover.
- Rank the models as follows (based on user's list and performance):
    1. `google/gemma-4-31b:free` (Top tier dense)
    2. `google/gemma-4-26b-a4b:free` (High efficiency MoE)
    3. `nvidia/nemotron-3-nano-30b-a3b:free` (Agentic MoE)
    4. `openai/gpt-oss-20b:free` (Low latency MoE)
    5. `nvidia/nemotron-nano-9b-v2:free` (Reasoning traces)
- Refine the JSON request body to use ONLY the `models` key (removing the singular `model` key) to follow the recommended fallback protocol and avoid 400 errors.

## Verification Plan

### Manual Verification
- Deploy the updated app.
- Send a query to FRIDAY.
- Monitor logcat for `FRIDAY` tags to ensure the request is successful and which model was used (if returned by OpenRouter).
- Verify that "cores congested" messages are gone or significantly reduced.
