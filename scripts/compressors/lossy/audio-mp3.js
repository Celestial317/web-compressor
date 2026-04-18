/**
 * Note: This module assumes `lamejs` is loaded globally via a <script> tag 
 * in popup.html before this script runs, which is standard for extensions.
 */

export async function compressAudio(file) {
    return new Promise(async (resolve, reject) => {
        try {
            // 1. Read the file into an ArrayBuffer
            const arrayBuffer = await file.arrayBuffer();
            
            // 2. Decode audio data using browser's built-in Audio API
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            
            // 3. Setup LAME MP3 Encoder
            // We use 1 channel (mono) or 2 (stereo), and a target of 128kbps for aggressive lossy compression
            const channels = audioBuffer.numberOfChannels;
            const sampleRate = audioBuffer.sampleRate;
            const kbps = 128; 
            const mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, kbps);
            const mp3Data = [];

            // 4. Extract left (and right) channels
            const left = audioBuffer.getChannelData(0);
            const right = channels > 1 ? audioBuffer.getChannelData(1) : null;
            
            // 5. Convert Float32 (-1.0 to 1.0) to Int16 (-32768 to 32767) for LAME
            const sampleBlockSize = 1152; // LAME frame size
            
            for (let i = 0; i < left.length; i += sampleBlockSize) {
                const leftChunk = left.subarray(i, i + sampleBlockSize);
                const rightChunk = right ? right.subarray(i, i + sampleBlockSize) : null;
                
                const leftInt16 = floatTo16BitPCM(leftChunk);
                const rightInt16 = right ? floatTo16BitPCM(rightChunk) : null;

                // 6. Encode the chunk
                let mp3buf;
                if (channels === 1) {
                    mp3buf = mp3encoder.encodeBuffer(leftInt16);
                } else {
                    mp3buf = mp3encoder.encodeBuffer(leftInt16, rightInt16);
                }

                if (mp3buf.length > 0) {
                    mp3Data.push(mp3buf);
                }
            }

            // 7. Flush the encoder to get the final bits
            const mp3buf = mp3encoder.flush();
            if (mp3buf.length > 0) {
                mp3Data.push(mp3buf);
            }

            // 8. Create the final compressed blob
            const blob = new Blob(mp3Data, { type: 'audio/mpeg' });

            // 9. Call Gitesh's logic (simulated here for independence) to get metrics
            const originalBytes = file.size;
            const compressedBytes = blob.size;
            const ratio = (originalBytes / compressedBytes).toFixed(2);
            const savings = (((originalBytes - compressedBytes) / originalBytes) * 100).toFixed(1);

            resolve({
                blob: blob,
                metrics: {
                    originalSize: formatBytes(originalBytes),
                    compressedSize: formatBytes(compressedBytes),
                    ratio: `${ratio}:1`,
                    savings: savings
                }
            });

        } catch (error) {
            console.error("Audio compression error:", error);
            reject(new Error("Failed to encode audio track."));
        }
    });
}

// --- Utility Functions ---

function floatTo16BitPCM(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
        let s = Math.max(-1, Math.min(1, float32Array[i]));
        int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array;
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}