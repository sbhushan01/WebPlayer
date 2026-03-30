# WebPlayer Extension

**WebPlayer** is a feature-rich browser extension that injects a custom, ad-free media player UI directly into web videos. It upgrades the standard web video experience with advanced streaming support, native gesture controls, an audiophile-grade equalizer, and automatic sponsor skipping.

**Author:** Sushant Bhushan  
**Version:** 1.6.0

---

## ✨ Key Features

### 🎛️ Audio & Playback Enhancements
* **10-Band Graphic Equalizer & Preamp:** Full 10-band EQ (31Hz to 16kHz) with a Preamp/Boost slider. All settings are **persistently synced** via `chrome.storage.sync` — your EQ curve is restored automatically on every session.
* **Playback State Persistence:** Automatically saves your video progress every 5 seconds. If you close a stream and return later, the player resumes exactly where you left off.
* **SponsorBlock Integration:** Automatically fetches and skips sponsor, intro, outro, self-promo, and interaction segments via the SponsorBlock API. Skip badges display the exact segment category that was skipped.
* **Media Session API Sync:** Full integration with your OS's native media controls and keyboard media keys.
* **Video Rotation:** Rotate playback in 90° increments from both the overlay UI and the standalone player, with a smooth CSS transition.

### 🤌 Smart Gesture Engine
* **Brightness & Volume:** Swipe vertically on the left side to adjust brightness, or on the right side to adjust volume.
* **Smart Seeking:** Double-tap the left or right side of the screen to seek ±10 seconds, with animated ripple feedback.
* **Quick 2× Speed:** Long-press anywhere on the video to temporarily engage 2× playback. Speed pills stay in sync and revert cleanly on release.

### 🌐 Advanced Stream & Network Handling
* **Native Stream Support:** Built-in integration for HLS (`.m3u8`) and DASH (`.mpd`) streams, with auto-retry and a custom quality-level selector.
* **Network Stream Detection:** Automatically detects media manifests in network traffic and opens them in a dedicated WebPlayer tab.
* **CORS Bypass via DNR:** Dynamically strips blocking headers using the Manifest V3 Declarative Net Request API.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| <kbd>Space</kbd> / <kbd>K</kbd> | Play / Pause |
| <kbd>←</kbd> / <kbd>→</kbd> | Seek ±10 seconds |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Adjust Volume ±5% |
| <kbd>M</kbd> | Toggle Mute |
| <kbd>F</kbd> | Toggle Fullscreen |
| <kbd>R</kbd> | Rotate Video 90° |
| <kbd>?</kbd> | Show / Hide Keyboard Shortcuts |

---

## 🚀 Installation (Developer Mode)

### Chrome / Edge / Brave
1. Download or clone this repository to your local machine.
2. Open your browser and navigate to `chrome://extensions/`.
3. Toggle **Developer mode** on in the top right corner.
4. Click **Load unpacked** in the top left corner.
5. Select the folder containing the `manifest.json` file.

### Firefox
1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**
3. Select the `manifest.json` file from your project folder. *(Note: Installation via `about:addons` is blocked by Mozilla for unsigned/unpackaged add-ons).*

---

## 🛠 Usage

1. **Overlay Mode:** Navigate to any webpage with a `<video>` element. A **"▶ Launch WebPlayer"** button will appear over qualifying videos. Click it to inject the custom gesture zone and controls directly over the existing video.
2. **Standalone Mode:** For raw stream URLs (`.m3u8` / `.mpd`), the background worker automatically intercepts the network request and opens the stream in a dedicated full-window WebPlayer tab with the 10-band EQ panel.

---

## ⚙️ Technical Improvements (v1.6.0)

* **Mobile UI Polish:** Improved hit regions for playback controls and scrub bars to make touching interactions much easier on mobile devices.
* **Viewport Rescaling Fix:** Added `maximum-scale=1` and `user-scalable=no` meta tags to `player.html` which fixes accidental layout zooming when double-tapping to seek on iOS/Android browsers.
* **Firefox Manifest V3 Compliance:** Added the strictly enforced `background.scripts` fallback to the `manifest.json` configuration, resolving the "Corrupted Add-on" install bug occurring on Firefox Beta / Nightly.

---

## ⚙️ Technical Improvements (v1.5.0)

* **Standalone vs Overlay Feature Parity:** The injected overlay player now has full feature parity with the standalone player, including the Quality selector and CC/Subtitles dropdown.
* **Stream Detection Prompt:** Instead of forcefully redirecting, HLS/DASH streams detected in the content script now show a sleek `Stream Detected` prompt.
* **Double-Tap Bug Fix:** Fixed a critical bug where double-tapping the right side of the screen in the standalone player threw an undefined error `safeSeekForward`.
* **Improved Context Handling:** Added missing try/catch blocks to prevent "Extension context invalidated" runtime errors when the extension updates.

---
