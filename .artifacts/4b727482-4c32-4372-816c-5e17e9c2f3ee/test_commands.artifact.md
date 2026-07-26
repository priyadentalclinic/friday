# FRIDAY Mark VI - Post-Installation Testing Guide

The APK `app-debug (1).apk` has been successfully installed on your device (`6LNVT4NZONEU6PUK`).

## Step 1: Initial Launch & Permissions
Open the app. You will see several permission requests (Microphone, Location, Contacts, Camera, Notifications).
> [!IMPORTANT]
> You must **Grant All Permissions** for the following tests to work. The contact fetching and WhatsApp logic depends specifically on the **Contacts** permission.

## Step 2: Verification Commands
Speak or type the following commands to FRIDAY to verify the new features:

### 1. Hardware Control (Torch)
- **Command**: `"Torch on"`
- **Expected Result**: Your phone's flashlight should turn on. FRIDAY should say "Torch engaged, boss."
- **Command**: `"Torch off"`
- **Expected Result**: Flashlight turns off. FRIDAY should say "Torch dark, boss."

### 2. Network Intelligence (Scanning)
- **Command**: `"Scan network"`
- **Expected Result**: FRIDAY will say "Forging into local network, boss." After a few seconds, it will report the number of active nodes detected on your WiFi.

### 3. Secure Communications (WhatsApp & Calls)
- **Command**: `"Message [Contact Name] [Your Message]"`
  - *Example*: `"Message Rachna I am reaching Stark Tower"`
- **Expected Result**:
  1. FRIDAY shows the **MISSION AUTHORIZATION** card.
  2. You say **"Yes"** or tap **"ENGAGE"**.
  3. WhatsApp should open directly to the contact's chat with the message already typed in the input box.

- **Command**: `"Call [Contact Name]"`
  - *Example*: `"Call Dad"`
- **Expected Result**: After authorization, your phone's dialer should open with the contact's number ready to call.

## Troubleshooting
- **Contact not found**: If FRIDAY says "I can't find [Name]", ensure the name you said matches a contact name in your phone by at least 50%.
- **WhatsApp not opening**: If you get a voice alert saying "I can't launch WhatsApp", check if the official WhatsApp app is installed and updated.
