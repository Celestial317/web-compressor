/**
 * video-mp4.js
 * Lossy video compression via temporal redundancy reduction using ffmpeg.wasm.
 *
 * Temporal redundancy = consecutive video frames share large regions of identical
 * or similar pixel data.  Modern codecs exploit this with:
 *
 *   I-frames (Intra-coded)
 *     Full spatial JPEG-like DCT compression of a single frame.
 *     No reference to other frames.
 *
 *   P-frames (Predicted)
 *     Encode only the *difference* from the previous reference frame.
 *     Motion vectors point to 16×16 macroblocks in the reference frame;
 *     only the residual error (difference) is entropy-coded.
 *
 *   B-frames (Bi-directional Predicted)
 *     Reference both a past AND a future frame, achieving the highest
 *     temporal compression.  Require frame reordering in the bitstream.
 *
 * This module drives ffmpeg.wasm (the full FFmpeg compiled to WebAssembly) to:
 *   compress()   — transcode input MP4 → H.264/AAC MP4 at a target CRF
 *   decompress() — not truly invertible; we "decompress" by transcoding to a
 *                  visually-lossless high-quality copy and report PSNR.
 *
 * PSNR is computed by ffmpeg's built-in `psnr` video filter, which compares
 * the compressed output frame-by-frame against the input.
 *
 * Dependencies (loaded globally via lib/):
 *   window.FFmpeg  — @ffmpeg/ffmpeg  (createFFmpeg / fetchFile)
 *   window.fetchFile  (may be on FFmpeg namespace or exposed separately)
 *
 * Chrome Extension constraints:
 *   ffmpeg.wasm requires SharedArrayBuffer; the manifest must set:
 *     "Cross-Origin-Opener-Policy": "same-origin"
 *     "Cross-Origin-Embedder-Policy": "require-corp"
 *   The service worker / background page handles these headers via
 *   the declarativeNetRequest / webRequest API.
 */

const VideoMp4Compressor = (() => {

  /* ─────────────────────────────────────────────
   * FFmpeg instance management
   * ───────────────────────────────────────────── */

  let _ffmpegInstance = null;
  let _ffmpegLoading = false;
  let _ffmpegLoadWaiters = [];

  /**
   * Lazily initialise the ffmpeg.wasm instance (singleton).
   * Loading the ~25 MB WASM binary is expensive; we do it once.
   *
   * @param {function} [onProgress] - called with { ratio: 0–1 } during load
   * @returns {Promise<object>} ffmpeg instance
   */
  async function getFFmpeg(onProgress) {
    if (_ffmpegInstance && _ffmpegInstance.isLoaded()) return _ffmpegInstance;

    if (_ffmpegLoading) {
      // Another caller already started loading — queue up
      return new Promise((resolve, reject) =>
        _ffmpegLoadWaiters.push({ resolve, reject }));
    }

    _ffmpegLoading = true;

    try {
      const FFmpegLib = window.FFmpeg || window.FFmpegWASM;
      if (!FFmpegLib) throw new Error('ffmpeg.wasm not found. Ensure lib/ffmpeg.min.js is loaded.');

      const createFFmpeg = FFmpegLib.createFFmpeg || FFmpegLib.FFmpeg;
      if (!createFFmpeg) throw new Error('ffmpeg.wasm: createFFmpeg() not available.');

      _ffmpegInstance = createFFmpeg({
        corePath: chrome.runtime.getURL('lib/ffmpeg-core.js'),
        log: false,
        progress: onProgress || (() => { }),
      });

      await _ffmpegInstance.load();

      _ffmpegLoadWaiters.forEach(w => w.resolve(_ffmpegInstance));
      _ffmpegLoadWaiters = [];
      return _ffmpegInstance;

    } catch (err) {
      _ffmpegLoading = false;
      _ffmpegLoadWaiters.forEach(w => w.reject(err));
      _ffmpegLoadWaiters = [];
      throw err;
    }
  }

  /**
   * Resolve the fetchFile helper.
   * Different ffmpeg.wasm bundle versions expose it differently.
   */
  function getFetchFile() {
    const ff = window.FFmpeg || window.FFmpegWASM || {};
    const fn = ff.fetchFile || window.fetchFile;
    if (typeof fn !== 'function')
      throw new Error('ffmpeg.wasm: fetchFile() not found. Ensure lib/ffmpeg.min.js is loaded.');
    return fn;
  }

  /* ─────────────────────────────────────────────
   * Log parsing helpers
   * ───────────────────────────────────────────── */

  /**
   * Parse the PSNR output written by ffmpeg's `psnr` video filter.
   * The filter appends a line like:
   *   PSNR y:38.42 u:42.11 v:41.55 average:39.21 min:34.67 max:Inf
   * We extract `average` as the overall PSNR.
   *
   * @param {string} logText - combined ffmpeg log output
   * @returns {number|null}  - average PSNR in dB, or null if not found
   */
  function parsePSNRFromLog(logText) {
    // Match "average:XX.XX" in the PSNR filter output line
    const match = logText.match(/average[:\s]+([\d.]+(?:e[+-]?\d+)?)/i);
    if (!match) return null;
    const val = parseFloat(match[1]);
    return isNaN(val) ? null : val;
  }

  /**
   * Collect all ffmpeg log lines into a single string.
   * We temporarily override the logger, run a callback, then restore.
   *
   * @param {object}   ffmpeg  - ffmpeg.wasm instance
   * @param {function} fn      - async function to run while collecting logs
   * @returns {Promise<string>} accumulated log text
   */
  async function withLogCapture(ffmpeg, fn) {
    const lines = [];
    const original = ffmpeg.setLogger ? null : undefined; // guard

    if (typeof ffmpeg.setLogger === 'function') {
      ffmpeg.setLogger(({ message }) => lines.push(message));
    }

    try {
      await fn();
    } finally {
      if (typeof ffmpeg.setLogger === 'function') {
        // Restore quiet logger
        ffmpeg.setLogger(() => { });
      }
    }

    return lines.join('\n');
  }

  /* ─────────────────────────────────────────────
   * File size helper
   * ───────────────────────────────────────────── */

  function readFileAsUint8Array(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(new Uint8Array(e.target.result));
      reader.onerror = () => reject(new Error('FileReader failed reading video file'));
      reader.readAsArrayBuffer(file);
    });
  }

  /* ─────────────────────────────────────────────
   * Public API
   * ───────────────────────────────────────────── */

  /**
   * Compress a video file using H.264 temporal redundancy encoding.
   *
   * Temporal compression pipeline (what ffmpeg does internally):
   *   1. Decode input frames to raw YUV420p
   *   2. Perform motion estimation: find 16×16 macroblocks in reference frames
   *      that best approximate each macroblock in the current frame
   *   3. Encode motion vectors + residuals (DCT → quantize → entropy code)
   *   4. Insert I-frames at keyframe interval (GOP size)
   *   5. Pack into MP4 container with AAC audio
   *
   * CRF (Constant Rate Factor) controls quality vs size trade-off:
   *   0   = lossless
   *   18  = visually lossless
   *   23  = default (good quality)
   *   28  = acceptable quality, smaller file
   *   51  = worst quality
   *
   * PSNR is measured using ffmpeg's built-in psnr filter by comparing the
   * re-encoded output frame-by-frame against the original decoded frames.
   *
   * @param {File}   file     - input video file (.mp4)
   * @param {object} options
   *   @param {number}   [options.crf=23]         - H.264 CRF (0–51, lower = better)
   *   @param {string}   [options.preset='medium'] - x264 preset (ultrafast…veryslow)
   *   @param {number}   [options.audioBitrate=128] - kbps for AAC audio
   *   @param {function} [options.onProgress]     - progress callback { ratio }
   *
   * @returns {Promise<object>} result
   *   {
   *     compressedBlob   : Blob,
   *     originalSize     : number,
   *     compressedSize   : number,
   *     compressionRatio : number,
   *     spaceSavings     : number,    // percent
   *     psnr             : number | null,  // dB
   *     codec            : string,
   *     crf              : number,
   *     preset           : string,
   *   }
   */
  async function compress(file, options = {}) {
    const crf = Math.min(51, Math.max(0, options.crf ?? 23));
    const preset = options.preset ?? 'medium';
    const audioBitrate = options.audioBitrate ?? 128;
    const onProgress = options.onProgress ?? (() => { });

    // ── Step 1: Load ffmpeg ──────────────────────
    const ffmpeg = await getFFmpeg(onProgress);
    const fetchFile = getFetchFile();

    // ── Step 2: Write input to WASM virtual FS ──
    const inputName = 'input.mp4';
    const outputName = 'output.mp4';
    const psnrLog = 'psnr_stats.log';

    const originalBytes = await readFileAsUint8Array(file);
    const originalSize = originalBytes.length;

    ffmpeg.FS('writeFile', inputName, await fetchFile(file));

    // ── Step 3: Run compression with PSNR measurement ─
    //
    // We use a filtergraph that:
    //   [0:v] split into two streams:
    //     stream A → goes to video encoder (output)
    //     stream B → fed into the psnr filter alongside the original
    //   psnr filter writes per-frame stats to psnrLog
    //
    // Full ffmpeg args breakdown:
    //   -i input.mp4           → input file
    //   -c:v libx264           → H.264 encoder (handles temporal redundancy)
    //   -crf <crf>             → quality/size trade-off
    //   -preset <preset>       → encoding speed vs compression ratio
    //   -c:a aac               → AAC audio codec
    //   -b:a <kbps>k           → audio bitrate
    //   -movflags +faststart   → move MP4 metadata to front (streaming-friendly)
    //   -y                     → overwrite output without prompting
    //
    // For PSNR we do a two-pass approach: first compress, then measure.

    let psnr = null;
    let logText = '';

    // Pass 1: compress
    await ffmpeg.run(
      '-i', inputName,
      '-c:v', 'libx264',
      '-crf', String(crf),
      '-preset', preset,
      '-c:a', 'aac',
      '-b:a', `${audioBitrate}k`,
      '-movflags', '+faststart',
      '-y',
      outputName
    );

    // Pass 2: measure PSNR  (compare original vs compressed via lavfi psnr filter)
    // ffmpeg -i output.mp4 -i input.mp4 -lavfi "[0:v][1:v]psnr=stats_file=psnr.log" -f null -
    try {
      logText = await withLogCapture(ffmpeg, async () => {
        await ffmpeg.run(
          '-i', outputName,
          '-i', inputName,
          '-lavfi', `[0:v][1:v]psnr=stats_file=${psnrLog}`,
          '-f', 'null',
          '-'
        );
      });

      // Try reading the stats file first
      try {
        const statsData = ffmpeg.FS('readFile', psnrLog);
        const statsText = new TextDecoder().decode(statsData);
        psnr = parsePSNRFromLog(statsText);
      } catch (_) {
        // Fall back to log text
        psnr = parsePSNRFromLog(logText);
      }
    } catch (psnrErr) {
      console.warn('VideoMp4Compressor: PSNR measurement failed —', psnrErr.message);
    }

    // ── Step 4: Read compressed output ──────────
    const compressedData = ffmpeg.FS('readFile', outputName);
    const compressedSize = compressedData.length;

    // ── Step 5: Cleanup WASM virtual FS ─────────
    const filesToClean = [inputName, outputName, psnrLog];
    filesToClean.forEach(f => { try { ffmpeg.FS('unlink', f); } catch (_) { } });

    // ── Step 6: Assemble result ──────────────────
    const compressionRatio = originalSize / compressedSize;
    const spaceSavings = (1 - compressedSize / originalSize) * 100;

    return {
      compressedBlob: new Blob([compressedData], { type: 'video/mp4' }),
      originalSize,
      compressedSize,
      compressionRatio: parseFloat(compressionRatio.toFixed(3)),
      spaceSavings: parseFloat(spaceSavings.toFixed(2)),
      psnr: psnr !== null ? parseFloat(psnr.toFixed(2)) : null,
      codec: 'H.264 (libx264)',
      crf,
      preset,
    };
  }

  /**
   * "Decompress" a compressed MP4 file.
   *
   * H.264 is inherently lossy — the quantized DCT residuals and discarded
   * high-frequency motion data cannot be reconstructed.  This function:
   *   1. Decodes the input via ffmpeg to raw YUV frames
   *   2. Re-encodes at CRF=0 (lossless H.264) to produce the highest-fidelity
   *      representation of the already-decoded frames
   *   3. Reports PSNR to quantify accumulated loss
   *
   * @param {File}   file     - compressed .mp4 file
   * @param {object} options
   *   @param {function} [options.onProgress] - progress callback
   *
   * @returns {Promise<object>} result
   *   {
   *     decompressedBlob  : Blob,
   *     compressedSize    : number,
   *     decompressedSize  : number,
   *     psnr              : number | null,
   *     codec             : string,
   *   }
   */
  async function decompress(file, options = {}) {
    const onProgress = options.onProgress ?? (() => { });

    const ffmpeg = await getFFmpeg(onProgress);
    const fetchFile = getFetchFile();

    const inputName = 'decomp_input.mp4';
    const outputName = 'decomp_output.mp4';
    const psnrLog = 'decomp_psnr.log';

    const compressedBytes = await readFileAsUint8Array(file);
    const compressedSize = compressedBytes.length;

    // Write input
    ffmpeg.FS('writeFile', inputName, await fetchFile(file));

    // Decode → re-encode at CRF 0 (lossless intra) for "reconstruction"
    await ffmpeg.run(
      '-i', inputName,
      '-c:v', 'libx264',
      '-crf', '0',           // lossless — preserves decoded pixel values exactly
      '-preset', 'ultrafast',
      '-c:a', 'copy',        // copy audio stream unchanged
      '-movflags', '+faststart',
      '-y',
      outputName
    );

    // Measure PSNR: compare CRF-0 output vs original input
    let psnr = null;
    try {
      const logText = await withLogCapture(ffmpeg, async () => {
        await ffmpeg.run(
          '-i', outputName,
          '-i', inputName,
          '-lavfi', `[0:v][1:v]psnr=stats_file=${psnrLog}`,
          '-f', 'null',
          '-'
        );
      });

      try {
        const statsData = ffmpeg.FS('readFile', psnrLog);
        psnr = parsePSNRFromLog(new TextDecoder().decode(statsData));
      } catch (_) {
        psnr = parsePSNRFromLog(logText);
      }
    } catch (psnrErr) {
      console.warn('VideoMp4Compressor decompress: PSNR skipped —', psnrErr.message);
    }

    // Read output
    const decompressedData = ffmpeg.FS('readFile', outputName);
    const decompressedSize = decompressedData.length;

    // Cleanup
    [inputName, outputName, psnrLog].forEach(f => { try { ffmpeg.FS('unlink', f); } catch (_) { } });

    return {
      decompressedBlob: new Blob([decompressedData], { type: 'video/mp4' }),
      compressedSize,
      decompressedSize,
      psnr: psnr !== null ? parseFloat(psnr.toFixed(2)) : null,
      codec: 'H.264 CRF-0 (lossless decode)',
    };
  }

  /**
   * Pre-load ffmpeg.wasm in the background so the first compression
   * call does not have to wait for WASM initialisation.
   * Call this once on extension popup load.
   */
  async function preload(onProgress) {
    try {
      await getFFmpeg(onProgress);
    } catch (e) {
      console.warn('VideoMp4Compressor: preload failed —', e.message);
    }
  }

  /* ─────────────────────────────────────────────
   * Module export
   * ───────────────────────────────────────────── */
  return { compress, decompress, preload };

})();

// Expose globally for Chrome Extension popup / content scripts
window.VideoMp4Compressor = VideoMp4Compressor;
