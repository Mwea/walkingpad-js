<p align="center">
  <img src="docs/logo.png" alt="WalkingPad JS Logo" width="400">
</p>

# WalkingPad JS 🏃‍♂️

[![npm version](https://img.shields.io/npm/v/walkingpad-js.svg)](https://www.npmjs.com/package/walkingpad-js)
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)

> A TypeScript library to control WalkingPad treadmills via Web Bluetooth API

Control your WalkingPad treadmill directly from your browser! This library provides a clean, type-safe API to connect, monitor, and control WalkingPad devices using the Web Bluetooth standard.

---

## ✨ Features

- 🔄 **Dual Protocol Support** — Works with both legacy (A1/R1/P1) and modern (Z1/R2/C2) WalkingPad models
- 🔍 **Auto-Detection** — Automatically detects the correct protocol for your device
- 💾 **Device Memory** — Remembers your device for seamless reconnection
- 📊 **Real-time Stats** — Live speed, distance, time, and step tracking
- 🛡️ **Type-Safe** — Full TypeScript support with strict type checking
- 🌐 **Browser Native** — Uses standard Web Bluetooth API, no native dependencies

---

## 📱 Supported Devices

| Model | Protocol | Status |
|-------|----------|--------|
| WalkingPad A1 | Standard | ✅ Supported |
| WalkingPad R1 | Standard | ✅ Supported |
| WalkingPad P1 | Standard | ✅ Supported |
| WalkingPad Z1 | FTMS | ✅ Supported |
| WalkingPad R2 | FTMS | ✅ Supported |
| WalkingPad C2 | FTMS | ✅ Supported |
| KingSmith models | Both | ✅ Supported |

---

## 🌐 Browser Setup

### Browser Compatibility

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome 56+ | ✅ Full | Desktop & Android |
| Edge 79+ | ✅ Full | Chromium-based |
| Opera 43+ | ✅ Full | Desktop |
| Chrome Android | ✅ Full | Requires Android 6+ |
| Samsung Internet | ✅ Full | Android |
| Safari | ❌ None | No Web Bluetooth support |
| Firefox | ⚠️ Flag | Experimental flag required |

### Platform-Specific Setup

#### 🐧 Linux

Enable the experimental flag in Chrome:

1. Open `chrome://flags`
2. Search for **"Experimental Web Platform features"**
3. Set to **Enabled** and relaunch

You may also need Bluetooth permissions:

```bash
sudo usermod -a -G bluetooth $USER
sudo systemctl restart bluetooth
# Log out and back in
```

#### 🍎 macOS

Grant Chrome Bluetooth access:

1. **System Preferences** → **Security & Privacy** → **Privacy**
2. Select **Bluetooth** and check **Google Chrome**

#### 🪟 Windows

Usually works out of the box. If issues occur:

1. Ensure Bluetooth is enabled in Settings
2. Try `chrome://flags` → Enable **"Experimental Web Platform features"**

#### 🤖 Android

1. Enable Bluetooth and Location services
2. Grant location permission to Chrome when prompted


## 🚀 Quick Start

### Installation

```bash
npm install walkingpad-js
```

### Basic Usage

```typescript
import { getWalkingPadBLE } from 'walkingpad-js';

const pad = getWalkingPadBLE();

// Listen for state updates
pad.events.on('state', (state) => {
  console.log(`Speed: ${state.speed} km/h`);
  console.log(`Distance: ${state.distance} km`);
  console.log(`Time: ${state.time} seconds`);
  console.log(`Steps: ${state.steps}`);
});

// Handle errors
pad.events.on('error', (error) => {
  console.error('Error:', error.message);
});

// Connect to device (opens browser device picker)
await pad.connect({ rememberDevice: true });

// Control the treadmill
await pad.start();
await pad.setSpeed(3.5); // km/h
await pad.stop();

// Disconnect when done
await pad.disconnect();
```

---

## 📚 Documentation

For detailed API reference, advanced configuration options, and more examples, see the [Technical Documentation](./TECHNICAL_DOCUMENTATION.md).

---

## 🛠️ Development

```bash
git clone https://github.com/Mwea/walkingpad-js.git
cd walkingpad-js
npm install
npm test
```

| Script | Description |
|--------|-------------|
| `npm test` | Run test suite |
| `npm run typecheck` | TypeScript type checking |
| `npm run build` | Build all outputs |

---

## 📄 License

This project is licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).

- **Attribution** — Give appropriate credit
- **NonCommercial** — Not for commercial purposes
- **ShareAlike** — Same license for derivatives

---

## 🙏 Acknowledgments

- [WalkingPad](https://www.walkingpad.com/) for making great treadmills

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/Mwea">Mwea</a> & <a href="https://claude.ai">Claude</a>
</p>
