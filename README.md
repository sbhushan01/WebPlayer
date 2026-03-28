# WebPlayer Extension

**WebPlayer** is a feature-rich browser extension that injects a custom, ad-free media player UI directly into web videos. It upgrades the standard web video experience with advanced streaming support, native gesture controls, and automatic sponsor skipping.

**Author:** Sushant Bhushan

## ✨ Features

* **Custom Video UI:** Replaces native YouTube/HTML5 controls with a clean, centralized interface.
* **Advanced Stream Support:** Native integration for HLS (`.m3u8`) and DASH (`.mpd`) streams, complete with auto-retry and DRM (Widevine) detection.
* **SponsorBlock Integration:** Automatically fetches and skips sponsor, intro, and outro segments using the SponsorBlock API.
* **Smart Gesture Engine:** * Swipe vertically on the left side to adjust **brightness**.
  * Swipe vertically on the right side to adjust **volume**.
  * Double-tap left/right to **seek ±10 seconds**.
  * Long-press to temporarily engage **2× speed**.
* **Audio Equalizer:** Built-in Web Audio API equalizer with persistent Bass (<250 Hz) and Treble (>4 kHz) controls.
* **Network Stream Detection:** Automatically detects media manifests in network traffic and prompts to open them in the WebPlayer.
* **CORS Bypass:** Dynamically strips blocking headers (using Declarative Net Request) to allow cross-origin playback.

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| <kbd>Space</kbd> / <kbd>K</kbd> | Play / Pause |
| <kbd>←</kbd> / <kbd>→</kbd> | Seek ±10 seconds |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Adjust Volume |
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

1. Navigate to any webpage containing a standard `<video>` element.
2. A button labeled **"▶ Launch WebPlayer UI"** will appear as an overlay on the video.
3. Click the button to inject the custom shell and controls.
4. For raw stream URLs (like `.m3u8`), the background worker will detect the stream and the player will open it in a dedicated standalone tab.

## ⚙️ Recent Technical Improvements

* **Memory Management:** Implemented strict cleanup routines for `hls.js` and `dash.js` engines to prevent memory leaks during source switching.
* **Concurrency:** Added a promise cache to the script loader to prevent race conditions when initializing media engines rapidly.
* **Mobile Optimization:** Fixed a bug where double-tap gestures triggered the browser's native zoom, locking the UI to `touch-action: none`. Fixed floating-point volume math bugs.
