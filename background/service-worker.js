let keepAliveInterval = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'START_COMPRESSION') {
    // 1. Immediately trigger a 20-second keep-alive mechanism
    // Calling chrome.runtime.getPlatformInfo() prevents Chrome from terminating the service worker during heavy WASM tasks
    keepAliveInterval = setInterval(() => {
      chrome.runtime.getPlatformInfo((info) => {
        // Ping: keep-alive
      });
    }, 20000);

    // 2. Pass payload to the async handler
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

  // 3. Switch statement routing based on fileType
  switch (fileType) {
    case 'video/mp4':
      console.log('Processing video/mp4: Logic for processing mp4 will go here.');
      break;
    case 'image/jpeg':
      console.log('Processing image/jpeg: Logic for processing jpeg will go here.');
      break;
    case 'image/png':
      console.log('Processing image/png: Logic for processing png will go here.');
      break;
    case 'text/plain':
      console.log('Processing text/plain: Logic for processing plain text will go here.');
      break;
    default:
      console.log(`Unsupported file type received: ${fileType}`);
  }

  // 4. Calculate time taken
  const endTime = performance.now();
  const timeTakenMs = endTime - startTime;

  // 5. Return the mock success object structure
  return {
    processedBuffer: new ArrayBuffer(0), // Mock empty buffer
    metrics: {
      originalSize: payload?.size || 1024 * 1024, // Mock original size
      compressedSize: 512 * 1024,                  // Mock compressed size
      timeTakenMs: timeTakenMs
    }
  };
}
