import { compressLosslessPNG } from '../scripts/compressors/lossless/image-png.js';
import { getCompressionRatio, getSpaceSavings } from '../scripts/utils/metrics.js';
let keepAliveInterval = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'START_COMPRESSION') {
    // Calling chrome.runtime.getPlatformInfo() prevents Chrome from terminating the service worker during heavy WASM tasks
    keepAliveInterval = setInterval(() => {
      chrome.runtime.getPlatformInfo((info) => {
        // Ping: keep-alive
      });
    }, 20000);

    //Pass payload to the async handler
    handleCompressionTask(message.payload)
      .then((result) => {
        // Clear interval upon completion
        if (keepAliveInterval) {
          clearInterval(keepAliveInterval);
          keepAliveInterval = null;
        }
        sendResponse({ success: true, data: result });
      })
      .catch((error) => {
        // Clear interval upon execution failure
        if (keepAliveInterval) {
          clearInterval(keepAliveInterval);
          keepAliveInterval = null;
        }
        sendResponse({ success: false, error: error.toString() });
      });

    // Return true to indicate we are sending a response asynchronously
    return true;
  }
});

async function handleCompressionTask(payload) {
  const startTime = performance.now();
  const fileType = payload?.fileType || 'unknown';

  //Switch statement routing based on fileType
  switch (fileType) {

    case 'video/mp4':
      console.log('Processing video/mp4: Logic for processing mp4 will go here.');
      break;
    case 'image/jpeg':
      console.log('Processing image/jpeg: Logic for processing jpeg will go here.');
      break;
    case 'image/png':
      // Hand the raw file to Gitesh's compressor and wait for the result
      compressedData = await compressLosslessPNG(fileData);
      metrics.spaceSavings = getSpaceSavings(originalSize, compressedData.byteLength);
      metrics.ratio = getCompressionRatio(originalSize, compressedData.byteLength);
      break;
    case 'text/plain':
      console.log('Processing text/plain: Logic for processing plain text will go here.');
      break;
    default:
      console.log(`Unsupported file type received: ${fileType}`);
  }

  //Calculate time taken
  const endTime = performance.now();
  const timeTakenMs = endTime - startTime;

  //Return the mock success object structure
  return {
    processedBuffer: new ArrayBuffer(0),
    metrics: {
      originalSize: payload?.size || 1024 * 1024,
      compressedSize: 512 * 1024,
      timeTakenMs: timeTakenMs
    }
  };
}
