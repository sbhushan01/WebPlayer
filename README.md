# WebPlayer Extension

**WebPlayer** is a feature-rich browser extension that injects a custom, ad-free media player UI directly into web videos. It upgrades the standard web video experience with advanced streaming support, native gesture controls, an audiophile-grade equalizer, and automatic sponsor skipping.

**Author:** Sushant Bhushan  
**Version:** 1.0.0

---

## ✨ Key Features

### 🎛️ Audio & Playback Enhancements
* **10-Band Graphic Equalizer & Preamp:** Full 10-band EQ (31Hz to 16kHz) with a Preamp/Boost slider. All settings are **persistently synced** via `chrome.storage.sync` — your EQ curve is restored automatically on every session.
* **Playback State Persistence:** Automatically saves your video progress every 5 seconds. If you close a stream and return later, the player resumes exactly where you left off. Stale data is automatically cleaned up in the background.
* **SponsorBlock Integration:** Automatically fetches and skips sponsor, intro, outro, self-promo, and interaction segments via the SponsorBlock API. Skip badges display the exact segment category that was skipped.
* **Media Session API Sync:** Full integration with your OS's native media controls and keyboard media keys.
* **Video Rotation:** Rotate playback in 90° increments with smooth CSS transitions.

### 🤌 Smart Gesture Engine (Fully Mobile Optimized)
* **Brightness & Volume:** Swipe vertically on the left side to adjust brightness, or on the right side to adjust volume.
* **Smart Seeking:** Double-tap the left or right side of the screen to seek ±10 seconds, with animated ripple feedback.
* **Quick 2× Speed:** Long-press anywhere on the video to temporarily engage 2× playback. Speed pills automatically sync.
* *Note: The player features a mobile-locked viewport and expanded `44px` hit targets to ensure the UI feels responsive and prevents accidental layout zooming.*

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

## 🚀 Building & Installation

Because Chrome and Firefox have mutually exclusive Manifest V3 requirements, this project uses a build script to generate browser-specific versions perfectly tuned for each environment.

### 1. Compile the Extension
Open your terminal in the extension folder and run:
`node build.js`
This generates two output folders: `build-chrome` and `build-firefox`.

### 2. Install on Chrome / Edge / Brave
1. Open your browser and navigate to `chrome://extensions/`.
2. Toggle **Developer mode** on in the top right corner.
3. Click **Load unpacked** in the top left corner.
4. Select the **`build-chrome`** folder.

### 3. Install on Firefox
1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**
3. Select the `manifest.json` file inside the **`build-firefox`** folder. 

---

## 🛠 Usage

1. **Overlay Mode:** Navigate to any webpage with a `<video>` element. A **"▶ Launch WebPlayer"** button will appear over qualifying videos. Click it to inject the custom gesture zone and controls directly over the existing video.
2. **Standalone Mode:** For raw stream URLs (`.m3u8` / `.mpd`), the background worker automatically intercepts the network request, prompts you, and can open the stream in a dedicated full-window WebPlayer tab with the 10-band EQ panel.
