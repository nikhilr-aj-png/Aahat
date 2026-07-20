# Aahat TWA APK Build Guide (Android Packaging)

This guide explains how to package the Aahat Progressive Web App (PWA) into an Android APK (Trusted Web Activity) that can be distributed directly or uploaded to the Google Play Store.

---

## 🛠️ Prerequisites

Before building, you must install:
1. **Node.js** (v16+)
2. **Java Development Kit (JDK 17)**
3. **Android SDK Command Line Tools**

---

## 🚀 Step 1: Install Bubblewrap CLI

Bubblewrap is the official CLI tool by Google to generate TWAs. Install it globally:

```bash
npm install -g @bubblewrap/cli
```

Once installed, configure the paths to your JDK and Android SDK:

```bash
bubblewrap setup
```
*(Bubblewrap will prompt you to enter the paths to your JDK and Android SDK. If you don't have them, it can download them automatically).*

---

## 📦 Step 2: Customize the Configuration

A preconfigured `twa-manifest.json` has been created at [web/twa-manifest.json](file:///d:/vs.code/messages/web/twa-manifest.json). 

Before building, update the following fields in `web/twa-manifest.json` to match your deployed hosting domain:
- `"host"`: Set to your actual web domain (e.g., `aahat-app.example.com`).
- `"iconUrl"` and `"maskableIconUrl"`: Set to the absolute HTTPS URLs of your app logo on your domain.

---

## 🏗️ Step 3: Build the Android Project & APK

1. In your terminal, navigate to the `web` directory:
   ```bash
   cd web
   ```
2. Initialize the Bubblewrap project from the local manifest:
   ```bash
   bubblewrap init --twaManifest=twa-manifest.json
   ```
3. Build the signed APK:
   ```bash
   bubblewrap build
   ```
   During this step, Bubblewrap will:
   - Generate a new keystore (`aahat-release-key.jks`) if you don't have one.
   - Compile the Android Java code.
   - Generate `app-release-signed.apk` (your release APK).

---

## 📲 Step 4: Make the APK Downloadable in Aahat

To make the APK downloadable when users click the **"App"** button in the sidebar:
1. Rename the compiled `app-release-signed.apk` to `aahat.apk`.
2. Move/copy the `aahat.apk` file into the `web/public/` directory.
3. Deploy/rebuild your web app:
   ```bash
   npm run build
   ```
   Now, any user clicking **"App"** in the sidebar will download the APK directly to their device.

---

## 🔒 Step 5: Remove Browser Address Bar (Digital Asset Links)

To make the Android app open in **full-screen mode** without showing the Chrome browser address bar, you must associate your domain with the Android app's signing certificate:

1. When you run `bubblewrap build`, it prints the **SHA-256 fingerprint** of your signing key, as well as a JSON snippet.
2. Create a file named `assetlinks.json` inside the `.well-known` folder on your web server:
   `web/public/.well-known/assetlinks.json`
3. Paste the following JSON configuration, replacing the SHA-256 fingerprint with your app's actual fingerprint:

```json
[
  {
    "relation": [
      "delegate_permission/common.handle_all_urls"
    ],
    "target": {
      "namespace": "android_app",
      "package_name": "com.aahat.messages",
      "sha256_cert_fingerprints": [
        "YOUR_SHA_256_FINGERPRINT_HERE"
      ]
    }
  }
]
```
4. Deploy the web app. Once deployed, the browser URL address bar will automatically disappear when launching the Android app.
