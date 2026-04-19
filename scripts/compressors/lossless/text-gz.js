import { computeSHA256, verifySHA256 } from '../../utils/crypto-hash.js';

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getPako() {
    if (typeof window !== 'undefined' && window.pako) return window.pako;
    throw new Error('pako library not found. Ensure lib/pako.min.js is loaded via a <script> tag.');
}

export async function compressText(file) {
    const pako = getPako();

    const arrayBuffer = await file.arrayBuffer();
    const inputBytes = new Uint8Array(arrayBuffer);
    const originalSize = inputBytes.length;

    const originalHash = await computeSHA256(inputBytes);

    const compressed = pako.gzip(inputBytes, { level: 9 });
    const compressedSize = compressed.length;

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

export async function decompressText(file, expectedHash = null) {
    const pako = getPako();

    const arrayBuffer = await file.arrayBuffer();
    const compressedBytes = new Uint8Array(arrayBuffer);
    const compressedSize = compressedBytes.length;

    const decompressed = pako.ungzip(compressedBytes);
    const decompressedSize = decompressed.length;

    let verification = null;
    if (expectedHash) {
        verification = await verifySHA256(decompressed, expectedHash);
    } else {
        const computedHash = await computeSHA256(decompressed);
        verification = { match: null, computed: computedHash, expected: null };
    }

    const ratio = (decompressedSize / compressedSize).toFixed(2);
    const savings = (((decompressedSize - compressedSize) / decompressedSize) * 100).toFixed(1);

    let outputType = 'text/plain';
    const fileName = file.name.toLowerCase();
    
    if (fileName.includes('.csv')) {
        outputType = 'text/csv';
    } else if (fileName.includes('.pdf')) {
        outputType = 'application/pdf';
    } else if (fileName.includes('.png')) {
        outputType = 'image/png';
    }

    return {
        blob: new Blob([decompressed], { type: outputType }),
        metrics: {
            originalSize: formatBytes(compressedSize), 
            compressedSize: formatBytes(decompressedSize), 
            ratio: `${ratio}:1`,
            savings: savings
        },
        verification
    };
}