/**
 * Compresses a PNG buffer losslessly using UPNG.js.
 * Assumes UPNG is loaded globally via lib/upng.min.js.
 * 
 * @param {ArrayBuffer} fileArrayBuffer - The original PNG buffer
 * @returns {Promise<ArrayBuffer>} - The newly minted lossless buffer
 */
export async function compressLosslessPNG(fileArrayBuffer) {
  try {
    // Decode the initial array buffer
    const decodedImg = UPNG.decode(fileArrayBuffer);

    // Extract dimensions
    const width = decodedImg.width;
    const height = decodedImg.height;

    // Extract all RGBA pixel frames
    const frames = UPNG.toRGBA8(decodedImg);

    // Re-encode the frames losslessly (0 is strictly required for lossless)
    const compressedBuffer = UPNG.encode(frames, width, height, 0);

    return compressedBuffer;
  } catch (error) {
    console.error('Failed to compress PNG losslessly:', error);
    throw error;
  }
}
