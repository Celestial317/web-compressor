export const Metrics = {
  /**
   * Calculates the compression ratio between original and compressed sizes.
   * @param {number} originalSize 
   * @param {number} compressedSize 
   * @returns {string} Formatted ratio string (e.g., '2.5:1')
   */
  getCompressionRatio(originalSize, compressedSize) {
    if (originalSize == null || compressedSize == null) return 'N/A';
    const o = Number(originalSize);
    const c = Number(compressedSize);

    if (o <= 0 || isNaN(o) || isNaN(c)) return '0:1';
    if (c <= 0) return '∞:1'; // Edge case: if compressed size is 0 somehow

    const ratio = o / c;
    // Format up to 2 decimal places, removing unnecessary trailing zeros
    const formattedRatio = (Math.round(ratio * 100) / 100).toString();
    return `${formattedRatio}:1`;
  },

  /**
   * Calculates the space savings as a percentage.
   * @param {number} originalSize 
   * @param {number} compressedSize 
   * @returns {string} Percentage formatted to two decimal places (e.g., '50.00%')
   */
  getSpaceSavings(originalSize, compressedSize) {
    if (originalSize == null || compressedSize == null) return '0.00%';
    const o = Number(originalSize);
    const c = Number(compressedSize);

    if (o <= 0 || isNaN(o) || isNaN(c)) return '0.00%';

    const savings = ((o - c) / o) * 100;
    return `${savings.toFixed(2)}%`;
  },

  /**
   * Calculates Peak Signal-to-Noise Ratio (PSNR) for image streams.
   * @param {Uint8Array|number[]} originalPixels 
   * @param {Uint8Array|number[]} compressedPixels 
   * @returns {number} PSNR value or Infinity if they are perfectly identical.
   */
  calculatePSNR(originalPixels, compressedPixels) {
    if (!originalPixels || !compressedPixels) return 0;
    if (originalPixels.length === 0) return 0;
    if (originalPixels.length !== compressedPixels.length) {
      console.warn("calculatePSNR: Pixel arrays must be the same length.");
      return 0;
    }

    let mse = 0;
    const length = originalPixels.length;

    for (let i = 0; i < length; i++) {
      const diff = originalPixels[i] - compressedPixels[i];
      mse += diff * diff;
    }

    mse = mse / length;

    // Handle identical images without dividing by zero
    if (mse === 0) return Infinity;

    const MAX_I = 255;
    return 10 * Math.log10((MAX_I * MAX_I) / mse);
  },

  /**
   * Stub implementation for Structural Similarity Index (SSIM).
   * Math stub to be filled in with standard windowing variables.
   * @param {Object} img1 - Mock image 1 data
   * @param {Object} img2 - Mock image 2 data
   * @returns {number} Value between -1 and 1 indicating structural similarity. 
   */
  calculateSSIM(img1, img2) {
    if (!img1 || !img2) return 0;
    return 1.0;
  }
};
