# Walkthrough - Brain Stability & Model Prioritization

I have updated FRIDAY's brain configuration to improve stability and eliminate the congestion/400 errors.

## Changes Made

### 1. Updated API Key
- The `OPENROUTER_API_KEY` in [MainViewModel.kt](file:///C:/Users/admin/friday_expo/app/src/main/kotlin/com/friday/ai/MainViewModel.kt) has been updated to your new key (`sk-or-v1-aa73...`).

### 2. Prioritized Model Pool
- Implemented a prioritized list of models in [MainViewModel.kt](file:///C:/Users/admin/friday_expo/app/src/main/kotlin/com/friday/ai/MainViewModel.kt) as requested.
- **Priority Order:**
    1. `google/gemma-4-31b-it:free` (Primary)
    2. `google/gemma-4-26b-a4b:free` (Secondary)
    3. `nvidia/nemotron-3-nano-30b-a3b:free` (Tertiary)
    4. `openai/gpt-oss-20b:free` (Final Fail-safe)

### 3. API Protocol Fix
- Fixed the JSON request body to use the OpenRouter `models` array correctly. This ensures that if the primary model is busy, OpenRouter will automatically fail over to the next ones in the list without returning a 400 error.

## GitHub Push Protection

> [!WARNING]
> GitHub blocked the push because it detected the new API key in the code. To finish the deployment to GitHub Actions, please follow this link and select **"Allow"**:
> [Unblock Secret on GitHub](https://github.com/priyadentalclinic/friday/security/secret-scanning/unblock-secret/3HDwTvX0aFWTbGEDzjQstdUpxbO)

Once you have allowed the secret, please let me know to **"Push again"**.
