# MACS-FC: Universal File Compression Extension

![Status](https://img.shields.io/badge/Status-Submitted-brightgreen)
![MACS JC](https://img.shields.io/badge/MACS_JC-Project_2-blue)
![Manifest](https://img.shields.io/badge/Manifest-V3-orange)
![License](https://img.shields.io/badge/License-MIT-purple)

---

## Overview

**MACS-FC** is a fully browser-native Chrome Extension that compresses and decompresses files of multiple types — text, images, audio, and video — entirely offline, without any server-side processing. The extension supports both **lossless** compression (guaranteeing 100% data-identical rebuilds verified via SHA-256 hashing) and **lossy** compression (discarding perceptually imperceptible data for maximum size reduction). After every operation, it transparently reports performance metrics including compression ratio, space savings percentage, and perceptual quality scores (PSNR / SSIM) for lossy media. The UI is built with a premium dark-themed glassmorphism aesthetic and ensures the interface remains fully responsive even during heavy WebAssembly workloads via a dedicated background Service Worker.

---

## Team Members

| Team Member | Role | Files Assigned |
|---|---|---|
| **Soumya** | Frontend & Audio Engine | `popup.html`, `popup.css`, `dom-handler.js`, `audio-mp3.js` |
| **Aryan Manu** | Lossy Media Engine | `image-jpg.js`, `video-mp4.js` |
| **Kartikay** | Core DSA & Cryptography | `text-gz.js`, `crypto-hash.js` |
| **Lavisha** | Data Pipeline & Routing | `file-reader.js`, Decompression Router |
| **Gitesh** | Metrics Engine & Lossless Visuals | `metrics.js`, `image-png.js` |
| **Prakhar** | Background Ops & Architecture | `manifest.json`, `service-worker.js` |

### Individual Responsibilities

- **Soumya** — Built the dark-themed glassmorphism UI, wired all DOM event listeners for file input/output interactions, and implemented `lamejs` for in-browser MP3 audio compression.
- **Aryan Manu** — Implemented spatial redundancy algorithms for lossy JPEG image compression via `jpeg-js` and handled temporal redundancy reduction for video via `ffmpeg.wasm`.
- **Kartikay** — Wrote dictionary-based DEFLATE/gzip text compression using `pako` and utilized the SubtleCrypto Web API to generate SHA-256 hashes for lossless rebuild verification.
- **Lavisha** — Managed browser memory using the FileReader API to safely chunk heavy file uploads and built the master routing logic for the reverse decompression pipeline.
- **Gitesh** — Wrote the mathematical logic to calculate Compression Ratios, Space Savings %, PSNR, and SSIM quality metrics, and implemented `UPNG.js` for lossless PNG encoding.
- **Prakhar** — Configured the Manifest V3 architecture (permissions, CSP, web-accessible resources) and implemented the background Service Worker to offload heavy video/image processing from the main UI thread.

---

## Features

- **Multi-Format Compression** — Supports `.txt` / `.csv` (lossless gzip), `.png` (lossless UPNG), `.jpg` / `.jpeg` (lossy JPEG), `.mp3` / `.wav` (lossy MP3), and `.mp4` (lossy H.264 via ffmpeg.wasm)
- **Bidirectional Processing** — Compress any supported file and download the output; re-upload compressed files to fully decompress them back to the original format
- **Live Metrics Dashboard** — Instantly displays Original Size, Compressed Size, Compression Ratio (e.g. `3.47:1`), and Space Savings % after every operation
- **Cryptographic Rebuild Verification** — For all lossless operations, automatically computes and compares SHA-256 hashes of the original and decompressed file to prove byte-for-byte identical reconstruction
- **Perceptual Quality Assessment** — Calculates and displays PSNR (Peak Signal-to-Noise Ratio) and SSIM (Structural Similarity Index) scores for lossy image and video outputs
- **Asynchronous Background Processing** — Heavy WebAssembly tasks (ffmpeg video encoding) are offloaded to a Manifest V3 Service Worker, keeping the popup UI fully responsive at all times
- **Chunked Memory Management** — The FileReader pipeline chunks large files to prevent out-of-memory browser errors during processing of heavy media
- **Graceful Error Handling** — Unsupported formats, oversized files, and runtime failures surface as clear inline UI error messages rather than silent console failures
- **Glassmorphism UI** — Polished dark-themed interface with translucent backdrop filters, modern typography, and smooth state transitions — no horizontal scrollbars, no overflow

---

## Repository Structure

```text
web-compressor-main/
├── manifest.json                        # Manifest V3 config (Prakhar)
├── popup.html                           # Extension popup shell (Soumya)
├── popup.css                            # Glassmorphism dark UI styles (Soumya)
├── background/
│   └── service-worker.js               # Offloads heavy WASM tasks (Prakhar)
├── scripts/
│   ├── ui/
│   │   └── dom-handler.js              # DOM events & UI state (Soumya)
│   ├── compressors/
│   │   ├── lossless/
│   │   │   ├── text-gz.js              # gzip via pako (Kartikay)
│   │   │   ├── image-png.js            # Lossless PNG via UPNG.js (Gitesh)
│   │   │   └── document-pdf.js         # PDF handling via pdf-lib
│   │   └── lossy/
│   │       ├── image-jpg.js            # JPEG via jpeg-js (Aryan Manu)
│   │       ├── audio-mp3.js            # MP3 via lamejs (Soumya)
│   │       └── video-mp4.js            # H.264 via ffmpeg.wasm (Aryan Manu)
│   └── utils/
│       ├── metrics.js                  # Ratio, savings, PSNR, SSIM (Gitesh)
│       ├── crypto-hash.js              # SHA-256 via SubtleCrypto (Kartikay)
│       └── file-reader.js              # Chunked FileReader pipeline (Lavisha)
├── lib/
│   ├── pako.min.js                     # DEFLATE/gzip compression
│   ├── jpeg-js.min.js                  # JPEG encode/decode
│   ├── upng.min.js                     # Lossless PNG encode/decode
│   ├── lamejs.min.js                   # MP3 audio encoding
│   ├── pdf-lib.min.js                  # PDF manipulation
│   ├── ffmpeg.min.js                   # ffmpeg.wasm orchestration
│   ├── ffmpeg-core.js                  # ffmpeg WebAssembly core
│   └── ffmpeg-core.wasm                # ffmpeg WASM binary
└── assets/
    └── macs-logo.png                   # Extension icon
```

---

## Installation

> **Requirements:** Google Chrome (v88+) or any Chromium-based browser.

1. **Download the source** — Clone or download this repository as a `.zip` and extract it to a local folder.

2. **Open Chrome Extensions** — Navigate to `chrome://extensions` in your browser address bar.

3. **Enable Developer Mode** — Toggle the **Developer mode** switch in the top-right corner of the Extensions page.

4. **Load the extension** — Click **Load unpacked**, then select the root folder of this repository (the one containing `manifest.json`).

5. **Pin the extension** — Click the puzzle-piece icon in Chrome's toolbar, find **MACS-FC: Universal File Compression**, and click the pin icon so it's always visible.

6. **Open the popup** — Click the MACS-FC icon in your toolbar to launch the extension.

> **Packaging as `.crx`:** To distribute as a packaged extension, go to `chrome://extensions`, click **Pack extension**, point it at the project root, and Chrome will generate a `.crx` file and a `.pem` private key.

---

## How to Use

### Compression

1. Click the MACS-FC extension icon to open the popup.
2. Drag and drop a file onto the upload zone, or click **Choose File** to browse.
3. The extension auto-detects the file type and selects the appropriate algorithm.
4. Click **Compress**.
5. The metrics panel updates with Original Size, Compressed Size, Compression Ratio, and Space Savings %.
6. Click **Download Compressed File** to save the output.

### Decompression

1. Open the popup and switch to the **Decompress** tab.
2. Upload the previously compressed file.
3. Click **Decompress**.
4. For lossless files, a SHA-256 hash comparison is performed automatically — a ✅ confirms byte-for-byte identical reconstruction.
5. For lossy files, PSNR and SSIM quality scores are displayed.
6. Click **Download Decompressed File** to save the restored file.

---

## Compression Results

> Results measured on representative sample files.

| File Type | Original Size | Compressed Size | Compression Ratio | Space Savings |
|---|---|---|---|---|
| Text / CSV (`.txt`, `.csv`) | — | — | — | — |
| Image — Lossless PNG (`.png`) | — | — | — | — |
| Image — Lossy JPEG (`.jpg`) | — | — | — | — |
| Audio — MP3 (`.wav` → `.mp3`) | — | — | — | — |
| Video — MP4 H.264 (`.mp4`) | — | — | — | — |

> *(Results to be filled in after final benchmarking.)*

---

## Rebuild Verification

### Lossless Files (Text, PNG)

After decompression, the extension automatically computes SHA-256 hashes of both the original and reconstructed file using the SubtleCrypto Web API and compares them. A matching hash pair proves byte-for-byte identical reconstruction with zero data loss.

```
Original SHA-256:     [hash]
Decompressed SHA-256: [hash]
Status: ✅ MATCH — Lossless rebuild verified
```

### Lossy Files (JPEG, MP3, MP4)

For lossy formats, perceptual quality metrics are calculated and displayed:

- **PSNR (Peak Signal-to-Noise Ratio)** — Values above 30 dB are generally considered good quality; above 40 dB is considered excellent.
- **SSIM (Structural Similarity Index)** — Values range from 0 to 1; scores above 0.95 indicate high perceptual fidelity.

---

## Algorithm Explanation

| Library | Format | Type | Why It Was Chosen |
|---|---|---|---|
| **pako** v2 | `.txt`, `.csv` | Lossless | Pure-JS implementation of DEFLATE/gzip (RFC 1952). Fast, zero-dependency, runs natively in browser context without WASM overhead. |
| **UPNG.js** | `.png` | Lossless | Lightweight PNG encoder/decoder that supports full bit-depth and alpha channels. Outperforms Canvas `toBlob()` for programmatic control over filter heuristics. |
| **jpeg-js** | `.jpg` | Lossy | Pure-JS JPEG encoder/decoder. Allows direct control of the quantisation quality factor (0–100) for spatial redundancy reduction without native binaries. |
| **lamejs** | `.mp3`, `.wav` | Lossy | JavaScript port of the LAME MP3 encoder. Enables configurable bitrate MP3 encoding entirely in-browser via typed arrays. |
| **ffmpeg.wasm** | `.mp4` | Lossy | WebAssembly port of FFmpeg. The only viable path for H.264 video encoding in a browser environment; runs in the Service Worker to avoid UI thread blocking. |
| **pdf-lib** | `.pdf` | Lossless | Pure-JS PDF creation and modification library. Enables content-stream–level optimisations without relying on native PDF renderers. |
| **SubtleCrypto** | Hash | Utility | Built-in Web Crypto API — no external dependency needed for SHA-256 digest generation, ensuring zero attack surface for cryptographic operations. |

---

## Limitations

- **Maximum file size** — Very large video files (>100 MB) may exceed browser memory limits depending on available RAM. The chunked FileReader mitigates this but does not eliminate it entirely.
- **Video encoding speed** — ffmpeg.wasm encoding is significantly slower than native FFmpeg. A 30-second 1080p clip may take 1–3 minutes depending on hardware.
- **Unsupported sub-formats** — Animated GIFs, WebP, HEIC/HEIF images, OGG/FLAC audio, and AV1/HEVC video are not currently supported.
- **Browser compatibility** — Requires a Chromium-based browser (Chrome, Edge, Brave). Firefox and Safari are not supported due to Manifest V3 and WebAssembly `SharedArrayBuffer` differences.
- **Offline WASM load** — `ffmpeg-core.wasm` (~30 MB) must be fully loaded into memory before any video operation; first-run latency is expected.
- **No batch processing** — The current UI supports single-file operations only; batch/folder compression is not implemented.

---

## References

### Libraries
- [pako](https://github.com/nodeca/pako) — High-speed zlib port to JavaScript
- [UPNG.js](https://github.com/photopea/UPNG.js) — Fast, advanced PNG encoder/decoder
- [jpeg-js](https://github.com/jpeg-js/jpeg-js) — Pure JavaScript JPEG encoder/decoder
- [lamejs](https://github.com/zhuker/lamejs) — MP3 encoder in JavaScript
- [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) — FFmpeg compiled to WebAssembly
- [pdf-lib](https://github.com/Hopding/pdf-lib) — Create and modify PDF documents in any JavaScript environment

### Standards & APIs
- [RFC 1952 — GZIP File Format Specification](https://www.ietf.org/rfc/rfc1952.txt)
- [Web Crypto API — SubtleCrypto](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto)
- [FileReader API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/FileReader)
- [Chrome Extensions — Manifest V3 Overview](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [Service Workers — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)

### Concepts & Articles
- [PSNR and SSIM for Image Quality Assessment](https://en.wikipedia.org/wiki/Peak_signal-to-noise_ratio)
- [SSIM — Structural Similarity Index](https://en.wikipedia.org/wiki/Structural_similarity)
- [JPEG Compression & the DCT](https://www.sciencedirect.com/topics/engineering/discrete-cosine-transform)
