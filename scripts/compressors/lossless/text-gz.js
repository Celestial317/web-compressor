/**
 * text-gz.js
 * ──────────────────────────────────────────────────────────────────
 * Dictionary-based lossless text compression using pako (gzip/DEFLATE).
 *
 * Algorithm — DEFLATE (RFC 1951), wrapped in gzip (RFC 1952):
 *   1. LZ77 sliding-window  — scans a 32 KB window for repeated byte
 *      sequences and replaces duplicates with (distance, length) back-
 *      reference pairs.  This is the "dictionary-based" component.
 *   2. Huffman coding        — the LZ77 output (literal bytes + back-
 *      references) is further compressed with dynamic Huffman trees
 *      that assign shorter bit-codes to more frequent symbols.
 *   3. gzip envelope         — adds a 10-byte header (magic number,
 *      compression method, timestamp) and an 8-byte trailer (CRC-32
 *      checksum + original size mod 2³²) for integrity checking.
 *
 * Compression level 9 (maximum) spends more CPU time building optimal
 * Huffman trees and searching the LZ77 window, producing the smallest
 * possible output — ideal for a one-shot file-compressor like MACS-FC.
 *
 * Lossless verification:
 *   SHA-256 hashes are computed before compression and after decompression
 *   via the crypto-hash.js module.  Matching hashes prove a byte-for-byte
 *   identical rebuild — the gold standard of lossless integrity.
 *
 * Dependencies:
 *   - window.pako  (loaded globally via lib/pako.min.js)
 *   - crypto-hash.js (ES module import)
 *
 * Assigned to: Kartikay (Core DSA & Cryptography)
 * ──────────────────────────────────────────────────────────────────
 */

import { computeSHA256, verifySHA256 } from '../../utils/crypto-hash.js';

// ─── Helper ────────────────────────────────────────────────────────

/**
 * Format byte counts into a human-readable string.
 * @param {number} bytes
 * @returns {string}  e.g. "12.45 KB"
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Resolve the pako library from the global scope.
 * pako is loaded as a <script> tag in popup.html before this module runs.
 * @returns {object}  The pako library object
 */
function getPako() {
    if (typeof window !== 'undefined' && window.pako) return window.pako;
    throw new Error(
        'pako library not found. Ensure lib/pako.min.js is loaded via a <script> tag.'
    );
}

// ─── Compression ───────────────────────────────────────────────────

/**
 * Compress a text file using pako gzip (DEFLATE dictionary-based compression).
 *
 * Pipeline:
 *   File → ArrayBuffer → Uint8Array
 *     → SHA-256 hash (pre-compression fingerprint)
 *     → pako.gzip(data, { level: 9 })
 *     → Blob + metrics
 *
 * @param   {File}  file  – A text file (.txt, .csv, etc.)
 * @returns {Promise<object>}  result
 *   {
 *     blob          : Blob,    // gzipped output (.gz)
 *     metrics       : { originalSize, compressedSize, ratio, savings },
 *     originalHash  : string   // SHA-256 hex digest of the original data
 *   }
 */
export async function compressText(file) {
    const pako = getPako();

    // ── Step 1: Read file into raw bytes ──────────────────────────
    const arrayBuffer = await file.arrayBuffer();
    const inputBytes = new Uint8Array(arrayBuffer);
    const originalSize = inputBytes.length;

    // ── Step 2: Compute pre-compression SHA-256 hash ──────────────
    //    This fingerprint will be used later during decompression
    //    to prove the data was rebuilt without any loss.
    const originalHash = await computeSHA256(inputBytes);

    // ── Step 3: DEFLATE compression via gzip ──────────────────────
    //    level 9 = maximum compression (best ratio, slower encode)
    //    pako.gzip wraps the DEFLATE stream in a gzip envelope
    //    which includes CRC-32 and original-size fields.
    const compressed = pako.gzip(inputBytes, { level: 9 });
    const compressedSize = compressed.length;

    // ── Step 4: Build result envelope ─────────────────────────────
    const ratio = (originalSize / compressedSize).toFixed(2);
    const savings = (((originalSize - compressedSize) / originalSize) * 100).toFixed(1);

    return {
        blob: new Blob([compressed], { type: 'application/gzip' }),
        metrics: {
            originalSize: formatBytes(originalSize),
            compressedSize: formatBytes(compressedSize),
            ratio: `${ratio}:1`,
            savings: savings
        },
        originalHash
    };
}

// ─── Decompression ─────────────────────────────────────────────────

/**
 * Decompress a gzip-compressed file and verify lossless rebuild via SHA-256.
 *
 * Pipeline:
 *   .gz File → ArrayBuffer → Uint8Array
 *     → pako.ungzip(data)
 *     → SHA-256 hash (post-decompression fingerprint)
 *     → Compare with original hash (if provided)
 *     → Blob + metrics + verification result
 *
 * @param   {File}    file          – A gzip-compressed file (.gz)
 * @param   {string}  [expectedHash]  – Optional SHA-256 hash of the original
 *                                       file. If provided, the decompressed
 *                                       output is verified against it.
 * @returns {Promise<object>}  result
 *   {
 *     blob             : Blob,     // decompressed text output
 *     metrics          : { originalSize, compressedSize, ratio, savings },
 *     verification     : { match, computed, expected } | null
 *   }
 */
export async function decompressText(file, expectedHash = null) {
    const pako = getPako();

    // ── Step 1: Read gzipped file ─────────────────────────────────
    const arrayBuffer = await file.arrayBuffer();
    const compressedBytes = new Uint8Array(arrayBuffer);
    const compressedSize = compressedBytes.length;

    // ── Step 2: Inflate (decompress) via pako.ungzip ──────────────
    //    pako.ungzip reverses the DEFLATE + gzip envelope,
    //    validating the CRC-32 checksum in the gzip trailer.
    const decompressed = pako.ungzip(compressedBytes);
    const decompressedSize = decompressed.length;

    // ── Step 3: SHA-256 verification ──────────────────────────────
    //    If an expected hash is provided, we compare it against
    //    the hash of the decompressed data to prove byte-for-byte
    //    identical reconstruction (lossless rebuild).
    let verification = null;
    if (expectedHash) {
        verification = await verifySHA256(decompressed, expectedHash);
    } else {
        // Even without an expected hash, compute and report the digest
        // so the user can manually verify if desired.
        const computedHash = await computeSHA256(decompressed);
        verification = {
            match: null,  // cannot determine without expected hash
            computed: computedHash,
            expected: null
        };
    }

    // ── Step 4: Build result envelope ─────────────────────────────
    const ratio = (decompressedSize / compressedSize).toFixed(2);
    const savings = (((decompressedSize - compressedSize) / decompressedSize) * 100).toFixed(1);

    // Attempt to detect original filename from the file name
    let outputType = 'text/plain';
    const fileName = file.name || '';
    if (fileName.endsWith('.csv.gz')) {
        outputType = 'text/csv';
    }

    return {
        blob: new Blob([decompressed], { type: outputType }),
        metrics: {
            originalSize: formatBytes(compressedSize),   // "original" here = input to this function
            compressedSize: formatBytes(decompressedSize),  // "result" size
            ratio: `${ratio}:1`,
            savings: savings
        },
        verification
    };
}
