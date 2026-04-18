/**
 * image-jpg.js
 * Lossy image compression via spatial redundancy algorithms using jpeg-js.
 *
 * Spatial redundancy = neighboring pixels share similar color/luminance values.
 * JPEG exploits this via:
 *   1. Color-space conversion (RGB → YCbCr)  — separates luma from chroma
 *   2. Chroma subsampling (4:2:0)            — halves chroma resolution (human eye is less sensitive)
 *   3. 8×8 DCT blocks                        — converts spatial signal → frequency domain
 *   4. Quantization                           — coarsens high-frequency DCT coefficients (lossy step)
 *   5. Zigzag + RLE + Huffman coding          — lossless entropy coding on quantized values
 *
 * This module handles compress() and decompress() (decode-only for JPEG).
 * Quality metric: PSNR between original decoded pixels and recompressed decoded pixels.
 *
 * Dependencies (loaded globally via lib/):
 *   window.jpegjs  — jpeg-js  (encode + decode)
 */

const ImageJpgCompressor = (() => {

  /* ─────────────────────────────────────────────
   * Internal helpers
   * ───────────────────────────────────────────── */

  /**
   * Resolve the jpeg-js library from common global names.
   * jpeg-js UMD bundles may export as `jpegJs`, `jpegjs`, or `jpeg_js`.
   */
  function getJpegJs() {
    const lib = window.jpegJs || window.jpegjs || window.jpeg_js || window.JpegJs;
    if (!lib) throw new Error('jpeg-js library not found. Ensure lib/jpeg-js.min.js is loaded.');
    if (typeof lib.decode !== 'function') throw new Error('jpeg-js: decode() not available.');
    if (typeof lib.encode !== 'function') throw new Error('jpeg-js: encode() not available.');
    return lib;
  }

  /**
   * Read a File/Blob → Uint8Array (returns a Promise).
   */
  function readFileAsUint8Array(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = e => resolve(new Uint8Array(e.target.result));
      reader.onerror = ()  => reject(new Error('FileReader failed'));
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Decode a JPEG/PNG byte buffer to raw RGBA pixels using jpeg-js.
   * For PNG inputs we fall back to the Canvas API (jpeg-js only decodes JPEG).
   *
   * Returns { width, height, data: Uint8Array (RGBA, row-major) }
   */
  async function decodeToRawRGBA(bytes, mimeType) {
    if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
      const jpegJs = getJpegJs();
      // jpeg-js decode: { width, height, data: Buffer/Uint8Array }
      const decoded = jpegJs.decode(bytes, { useTArray: true, formatAsRGBA: true });
      return { width: decoded.width, height: decoded.height, data: decoded.data };
    }

    // Fallback: use Canvas API to decode (PNG, WebP, etc.)
    return new Promise((resolve, reject) => {
      const blob = new Blob([bytes], { type: mimeType });
      const url  = URL.createObjectURL(blob);
      const img  = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width  = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve({ width: canvas.width, height: canvas.height, data: imageData.data });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Canvas decode failed')); };
      img.src = url;
    });
  }

  /**
   * Encode raw RGBA pixels → JPEG bytes using jpeg-js.
   *
   * @param {object} rawImage  - { width, height, data: Uint8Array/Uint8ClampedArray }
   * @param {number} quality   - 1–100  (higher = better quality, larger file)
   * @returns {Uint8Array}     - JPEG-encoded bytes
   */
  function encodeToJpeg(rawImage, quality) {
    const jpegJs = getJpegJs();

    // jpeg-js expects { width, height, data } where data is a plain Uint8Array (RGBA)
    const frameData = {
      width : rawImage.width,
      height: rawImage.height,
      data  : rawImage.data instanceof Uint8Array
                ? rawImage.data
                : new Uint8Array(rawImage.data.buffer)
    };

    const result = jpegJs.encode(frameData, quality);
    // jpeg-js encode returns { data: Uint8Array, width, height }
    return result.data instanceof Uint8Array
      ? result.data
      : new Uint8Array(result.data);
  }

  /* ─────────────────────────────────────────────
   * Quality metric: PSNR
   * ───────────────────────────────────────────── */

  /**
   * Calculate Peak Signal-to-Noise Ratio between two RGBA pixel buffers.
   * We operate on the RGB channels only (alpha is ignored).
   *
   *   MSE   = Σ (p_orig - p_comp)² / (3 · N_pixels)
   *   PSNR  = 10 · log10(255² / MSE)      [dB]
   *
   * Typical perceptual thresholds (8-bit images):
   *   > 40 dB  → excellent, visually lossless
   *   30–40 dB → good quality
   *   20–30 dB → noticeable degradation
   *   < 20 dB  → significant distortion
   *
   * @param {Uint8Array|Uint8ClampedArray} orig  - original RGBA pixels
   * @param {Uint8Array|Uint8ClampedArray} comp  - compressed/resampled RGBA pixels
   * @param {number} pixelCount                  - total number of pixels (width × height)
   * @returns {number} PSNR in dB  (Infinity if images are identical)
   */
  function calculatePSNR(orig, comp, pixelCount) {
    let sumSquaredError = 0;
    const n = pixelCount * 4; // RGBA stride

    for (let i = 0; i < n; i += 4) {
      // RGB channels only
      const dr = orig[i]     - comp[i];
      const dg = orig[i + 1] - comp[i + 1];
      const db = orig[i + 2] - comp[i + 2];
      sumSquaredError += dr * dr + dg * dg + db * db;
    }

    const mse = sumSquaredError / (3 * pixelCount);
    if (mse === 0) return Infinity;

    return 10 * Math.log10((255 * 255) / mse);
  }

  /* ─────────────────────────────────────────────
   * Public API
   * ───────────────────────────────────────────── */

  /**
   * Compress an image file using JPEG spatial-redundancy encoding.
   *
   * Algorithm pipeline:
   *   File → decode to raw RGBA → jpeg-js encode at target quality
   *   → re-decode compressed JPEG → compute PSNR vs original pixels
   *
   * @param {File}   file     - input image file (.jpg or .png accepted)
   * @param {object} options
   *   @param {number} [options.quality=75]  - JPEG quality (1–100)
   *
   * @returns {Promise<object>} result
   *   {
   *     compressedBlob   : Blob,          // JPEG-encoded output
   *     originalSize     : number,        // bytes
   *     compressedSize   : number,        // bytes
   *     compressionRatio : number,        // originalSize / compressedSize
   *     spaceSavings     : number,        // percentage saved  (0–100)
   *     psnr             : number,        // dB  (quality metric)
   *     width            : number,
   *     height           : number,
   *     quality          : number,        // quality setting used
   *   }
   */
  async function compress(file, options = {}) {
    const quality = Math.min(100, Math.max(1, options.quality ?? 75));

    // ── Step 1: read raw bytes ──────────────────
    const originalBytes = await readFileAsUint8Array(file);
    const originalSize  = originalBytes.length;

    // ── Step 2: decode to raw RGBA pixels ───────
    const mimeType  = file.type || 'image/jpeg';
    const rawImage  = await decodeToRawRGBA(originalBytes, mimeType);
    const { width, height } = rawImage;

    // ── Step 3: JPEG-encode (spatial compression) ─
    const compressedBytes = encodeToJpeg(rawImage, quality);
    const compressedSize  = compressedBytes.length;

    // ── Step 4: Re-decode compressed JPEG for PSNR ─
    let psnr = null;
    try {
      const jpegJs = getJpegJs();
      const reDecoded = jpegJs.decode(compressedBytes, { useTArray: true, formatAsRGBA: true });
      const pixelCount = width * height;
      psnr = calculatePSNR(rawImage.data, reDecoded.data, pixelCount);
    } catch (e) {
      console.warn('ImageJpgCompressor: PSNR calculation skipped —', e.message);
    }

    // ── Step 5: Assemble result ──────────────────
    const compressionRatio = originalSize / compressedSize;
    const spaceSavings     = ((1 - compressedSize / originalSize) * 100);

    return {
      compressedBlob  : new Blob([compressedBytes], { type: 'image/jpeg' }),
      originalSize,
      compressedSize,
      compressionRatio: parseFloat(compressionRatio.toFixed(3)),
      spaceSavings    : parseFloat(spaceSavings.toFixed(2)),
      psnr            : psnr !== null ? parseFloat(psnr.toFixed(2)) : null,
      width,
      height,
      quality,
    };
  }

  /**
   * "Decompress" a JPEG file.
   *
   * JPEG is not a lossless format — the quantized DCT coefficients cannot be
   * mathematically inverted back to the exact original pixels.  What we do here
   * is decode the JPEG back to raw RGBA and re-encode it at quality=100.
   * This produces a visually faithful reconstruction while making the
   * quantization loss explicit via PSNR.
   *
   * @param {File}   file      - compressed .jpg file
   * @param {object} _options  - (unused; kept for interface consistency)
   *
   * @returns {Promise<object>} result
   *   {
   *     decompressedBlob  : Blob,
   *     compressedSize    : number,
   *     decompressedSize  : number,
   *     psnr              : number | null,
   *     width             : number,
   *     height            : number,
   *   }
   */
  async function decompress(file, _options = {}) {
    const compressedBytes = await readFileAsUint8Array(file);
    const compressedSize  = compressedBytes.length;

    // Decode the compressed JPEG to raw pixels
    const jpegJs   = getJpegJs();
    const rawImage = jpegJs.decode(compressedBytes, { useTArray: true, formatAsRGBA: true });
    const { width, height } = rawImage;

    // Re-encode at quality 100 (maximum fidelity "reconstruction")
    const decompressedBytes = encodeToJpeg(rawImage, 100);
    const decompressedSize  = decompressedBytes.length;

    // PSNR: compare original compressed decode vs q=100 re-encode decode
    let psnr = null;
    try {
      const reDecoded = jpegJs.decode(decompressedBytes, { useTArray: true, formatAsRGBA: true });
      psnr = calculatePSNR(rawImage.data, reDecoded.data, width * height);
    } catch (e) {
      console.warn('ImageJpgCompressor decompress: PSNR skipped —', e.message);
    }

    return {
      decompressedBlob : new Blob([decompressedBytes], { type: 'image/jpeg' }),
      compressedSize,
      decompressedSize,
      psnr             : psnr !== null ? parseFloat(psnr.toFixed(2)) : null,
      width,
      height,
    };
  }

  /* ─────────────────────────────────────────────
   * Module export
   * ───────────────────────────────────────────── */
  return { compress, decompress };

})();

// Make available globally (Chrome Extension content / popup scripts)
window.ImageJpgCompressor = ImageJpgCompressor;
