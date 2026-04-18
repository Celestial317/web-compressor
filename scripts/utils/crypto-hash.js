/**
 * crypto-hash.js
 * ──────────────────────────────────────────────────────────────────
 * Cryptographic SHA-256 hashing module for lossless rebuild verification.
 *
 * Uses the browser-native SubtleCrypto API (Web Crypto API) which is
 * available in all modern browsers and Chrome Extension contexts.
 * No external libraries required.
 *
 * SHA-256 produces a 256-bit (32-byte) digest that uniquely fingerprints
 * an input.  By computing a hash before compression and again after
 * decompression, we can prove byte-for-byte identical rebuilds.
 *
 * Assigned to: Kartikay (Core DSA & Cryptography)
 * ──────────────────────────────────────────────────────────────────
 */

/**
 * Compute the SHA-256 hash of an ArrayBuffer or Uint8Array.
 *
 * Pipeline:
 *   raw bytes  →  SubtleCrypto digest  →  hex string
 *
 * @param   {ArrayBuffer|Uint8Array} data  – The raw binary data to hash.
 * @returns {Promise<string>}              – Lowercase hex-encoded SHA-256 digest
 *                                           (64 characters, e.g. "a7ffc6f8…").
 *
 * @example
 *   const hash = await computeSHA256(fileArrayBuffer);
 *   console.log(hash);  // "e3b0c44298fc1c149afbf4c8996fb924..."
 */
export async function computeSHA256(data) {
  // Ensure we have an ArrayBuffer (SubtleCrypto requires it)
  const buffer = data instanceof ArrayBuffer ? data : data.buffer;

  // Compute the SHA-256 digest using the native Web Crypto API
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);

  // Convert the raw hash bytes to a hex string
  const hashArray = new Uint8Array(hashBuffer);
  const hexString = Array.from(hashArray)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');

  return hexString;
}

/**
 * Verify that a given data buffer matches an expected SHA-256 hash.
 *
 * This is the core mechanism for proving lossless rebuild:
 *   1. Hash the original file BEFORE compression   → originalHash
 *   2. Compress → decompress
 *   3. Hash the decompressed output                → rebuiltHash
 *   4. verifySHA256(decompressedData, originalHash) → { match: true }
 *
 * @param   {ArrayBuffer|Uint8Array} data          – The data to verify.
 * @param   {string}                 expectedHash  – The expected hex SHA-256 hash.
 * @returns {Promise<{match: boolean, computed: string, expected: string}>}
 *
 * @example
 *   const result = await verifySHA256(decompressedBuffer, originalHash);
 *   if (result.match) {
 *     console.log('✅ Lossless rebuild verified!');
 *   }
 */
export async function verifySHA256(data, expectedHash) {
  const computed = await computeSHA256(data);

  return {
    match: computed === expectedHash,
    computed,
    expected: expectedHash
  };
}
