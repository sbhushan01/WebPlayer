# WebPlayer Extension

<p align="center">
  <img src="icons/icon128.png" alt="WebPlayer icon" width="96">
</p>

<p align="center">
  <strong>A feature-rich browser extension that replaces the standard web video experience with a custom, ad-free player.</strong><br>
  Advanced streaming · Gesture controls · 10-band EQ · SponsorBlock · Material 3 themes
</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-1.4.4-A8C7FA?style=flat-square">
  <img alt="Manifest" src="https://img.shields.io/badge/manifest-v3-7C3AED?style=flat-square">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-82C99E?style=flat-square">
  <img alt="Chrome" src="https://img.shields.io/badge/chrome-✓-4A7FFF?style=flat-square&logo=googlechrome&logoColor=white">
  <img alt="Firefox" src="https://img.shields.io/badge/firefox-✓-FF7139?style=flat-square&logo=firefox&logoColor=white">
</p>

---

**Author:** Sushant Bhushan
**Version:** 1.4.4

---

## ✨ Key Features

### 🎛️ Audio & Playback

| Feature | Description |
| :--- | :--- |
| **10-Band Graphic Equalizer** | Full 31 Hz–16 kHz EQ with a Preamp/Boost slider, built-in presets, and a **Reset** button. Settings are **persistently synced** via `chrome.storage.sync` (with `local` fallback). |
| **Playback Persistence** | Saves video progress every 5 s. Resume exactly where you left off — even across sessions. Stale data is auto-cleaned. |
| **SponsorBlock** | Skips sponsor, intro, outro, self-promo, and interaction segments via the SponsorBlock API. Category badges appear for each skip, with an instant **Skip Undo** button. |
| **Speed Control** | Preset speed pills (0.25×–3×) plus a fine-tune slider. Long-press anywhere on the video for temporary 2× playback. |
| **Media Session Sync** | Full integration with OS media controls and keyboard media keys. |
| **Video Rotation** | Rotate playback in 90° increments with smooth CSS transitions. |
| **Picture-in-Picture** | Native PiP support — keep watching while multitasking. |

### 🎨 Video Enhancements

| Feature | Description |
| :--- | :--- |
| **Video Enhancer** | Real-time brightness, contrast, saturation, and custom SVG-based **sharpening filter**. |
| **Enhancer Presets** | Anime, Cinema, and Sports presets to quickly apply fine-tuned visual adjustments. |
| **Ambilight Glow** | Dynamically samples the video and tints the page background with the dominant color for an immersive viewing experience. |
| **Seek Preview** | Frame-accurate thumbnail preview while hovering or dragging the progress bar. |

### 🎨 Appearance

| Feature | Description |
| :--- | :--- |
| **Material 3 Themes** | Three dark themes — **Blue**, **Amethyst**, and **Emerald** — with smooth transitions. Even the glow effects update per-theme. |
| **Glassmorphic Controls** | Frosted-glass control island with backdrop blur, elevation shadows, and responsive layout. |

### 🤌 Smart Gesture Engine (Desktop + Mobile)

| Gesture | Action |
| :--- | :--- |
| **Swipe ↕ left half** | Adjust brightness |
| **Swipe ↕ right half** | Adjust volume |
| **Double-tap L / R** | Seek ±10 s with animated ripple feedback |
| **Long-press** | Temporary 2× speed |
| **Horizontal swipe** | Seek through video |

> Touch targets are expanded to 44 px with mobile-safe spacing for improved usability across devices.

### 🌐 Streaming & Network

| Feature | Description |
| :--- | :--- |
| **HLS & DASH** | Native support for `.m3u8` and `.mpd` streams with auto-retry and a custom **quality-level selector**. |
| **Subtitles & Audio Tracks** | Full CC/subtitle selector and multi-audio-track switcher for HLS and DASH content. |
| **Stream Detection** | Automatically detects media manifests in network traffic and opens them in a dedicated WebPlayer tab. |
| **CORS Bypass** | Dynamically strips blocking headers via the Manifest V3 **Declarative Net Request** API. |

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| <kbd>Space</kbd> / <kbd>K</kbd> | Play / Pause |
| <kbd>←</kbd> / <kbd>→</kbd> | Seek ±10 seconds |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Adjust Volume ±5% |
| <kbd>M</kbd> | Toggle Mute |
| <kbd>F</kbd> | Toggle Fullscreen |
| <kbd>P</kbd> | Picture-in-Picture |
| <kbd>R</kbd> | Rotate Video 90° |
| <kbd><</kbd> / <kbd>></kbd> | Speed ±0.25× |
| <kbd>?</kbd> | Show / Hide Keyboard Shortcuts |

---

## 🚀 Building & Installation

Chrome and Firefox have mutually exclusive Manifest V3 requirements, so this project uses a build script to generate browser-specific versions.

### 1. Compile the Extension

```bash
node build.js
```

This generates two folders: `build-chrome/` and `build-firefox/`.

### 1.1 Publish a GitHub Release (`.crx` & `.xpi`)

A CI workflow at `.github/workflows/release.yml` runs on tags like `v1.4.4` (or manually via **workflow_dispatch**). It builds both browser variants and uploads:

- `WebPlayer-<version>.xpi` — Firefox
- `WebPlayer-<version>.crx` — Chrome

**Required repository secret:**

| Secret | Purpose |
| :--- | :--- |
| `CHROME_EXTENSION_PRIVATE_KEY` | PEM private key used to sign the `.crx` |

```bash
git tag v1.4.4 && git push origin v1.4.4
```

### 2. Install on Chrome / Edge / Brave

1. Navigate to `chrome://extensions/`.
2. Toggle **Developer mode** on (top-right corner).
3. Click **Load unpacked** (top-left corner).
4. Select the **`build-chrome`** folder.

### 3. Install on Firefox

1. Navigate to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**
3. Select the `manifest.json` file inside the **`build-firefox`** folder.

---

## 🛠 Usage

| Mode | How It Works |
| :--- | :--- |
| **Overlay** | Navigate to any page with a `<video>` element. A **"▶ Launch WebPlayer"** button appears over qualifying videos. Click it to inject the custom controls and gesture layer directly over the existing video. |
| **Standalone** | For raw stream URLs (`.m3u8` / `.mpd`), the background worker intercepts the request, prompts you, and opens the stream in a dedicated full-window WebPlayer tab with the EQ panel, video enhancer, themes, and all controls. |

---

## 📂 Project Structure

```
WebPlayer/
├── manifest.json        # Extension manifest (MV3)
├── background.js        # Service worker (stream intercept, CORS bypass, alarms)
├── content.js           # Content script (overlay injection)
├── overlay.css          # Overlay button styles
├── player.html          # Standalone player UI
├── player.js            # Standalone player logic (EQ, gestures, themes, etc.)
├── welcome.html         # Welcome / onboarding page
├── welcome.js           # Welcome page logic
├── build.js             # Build script (Chrome + Firefox variants)
├── icons/               # Extension icons (16–128 px)
├── libs/                # Vendored libraries (hls.js, dash.js)
├── build-chrome/        # Generated — Chrome build output
├── build-firefox/       # Generated — Firefox build output
└── .github/workflows/   # CI: release.yml
```

---

<p align="center">
  Made with ♥ by <strong>Sushant Bhushan</strong><br>
  <sub>Open source & ad-free. Enjoy the show.</sub>
</p>
