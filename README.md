# WebPlayer Extension

**WebPlayer** is a feature-rich browser extension that injects a custom, ad-free media player UI directly into web videos. It upgrades the standard web video experience with advanced streaming support, native gesture controls, an audiophile-grade equalizer, and automatic sponsor skipping.

**Author:** Sushant Bhushan

## ✨ Key Features

### 🎛️ Audio & Playback Enhancements
* **10-Band Graphic Equalizer & Preamp:** Upgraded from simple bass/treble controls to a full 10-band EQ (31Hz to 16kHz) with a Preamp/Boost slider. Settings are persistently synced across your browser.
* **Playback State Persistence:** Automatically saves your video progress every 5 seconds. If you close a stream and return later, the player will resume exactly where you left off.
* **SponsorBlock Integration:** Automatically fetches and seamlessly skips sponsor, intro, and outro segments using the SponsorBlock API, complete with visual skip badges.
* **Media Session API Sync:** Full integration with your operating system's native media controls and keyboard media keys.
* **Video Rotation:** Easily rotate video playback in 90-degree increments right from the overlay UI.

### 🤌 Smart Gesture Engine
* **Brightness & Volume:** Swipe vertically on the left side to adjust brightness, or on the right side to adjust volume.
* **Smart Seeking:** Double-tap the left or right side of the screen to seek ±10 seconds, complete with animated ripple feedback.
* **Quick 2× Speed:** Long-press anywhere on the video to temporarily engage 2× playback speed.

### 🌐 Advanced Stream & Network Handling
* **Native Stream Support:** Built-in integration for HLS (`.m3u8`) and DASH (`.mpd`) streams, complete with auto-retry mechanisms.
* **Network Stream Detection:** Automatically detects media manifests in network traffic and intercepts them to open in the dedicated WebPlayer tab.
* **CORS Bypass via DNR:** Dynamically strips blocking headers using Manifest V3's Declarative Net Request API to allow cross-origin playback without compromising browser security.

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| <kbd>Space</kbd> / <kbd>K</kbd> | Play / Pause |
| <kbd>←</kbd> / <kbd>→</kbd> | Seek ±10 seconds |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Adjust Volume ±10% |
| <kbd>M</kbd> | Toggle Mute |
| <kbd>F</kbd> | Toggle Fullscreen |

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
3. Select the `manifest.json` file from your project folder.

## 🛠 Usage

1. **Overlay Mode:** Navigate to any webpage containing a standard `<video>` element. A button labeled **"▶ Launch WebPlayer UI"** will appear. Click it to inject the custom shell, gesture zone, and controls directly over the existing video.
2. **Standalone Mode:** For raw stream URLs (like `.m3u8` or `.mpd`), the background worker will automatically detect the network request and launch the stream in a dedicated, full-window WebPlayer tab with the 10-band EQ panel.

## ⚙️ Recent Technical Improvements

* **Audiophile Pipeline:** Completely rewrote the Web Audio API implementation to utilize a cascade of `BiquadFilterNodes` for precise 10-band frequency shaping and pre-amplification.
* **Manifest V3 Modernization:** Migrated cross-origin request handling to the `declarativeNetRequest` API, creating and cleaning up dynamic session rules to strip CORS and CSP headers efficiently.
* **Robust Double-Tap Logic:** Improved mobile accessibility by decoupling the double-tap gesture from native browser zooming, and introduced dynamic visual ripple elements for immediate user feedback.
* **Debounced State Management:** Implemented efficient storage write operations for playback persistence to prevent quota limits and race conditions during rapid seeking or SponsorBlock segment skipping.
