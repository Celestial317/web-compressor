// Import your audio compressor (assuming you are using ES Modules)
import { compressAudio } from '../compressors/lossy/audio-mp3.js';
// Import Kartikay's text compressor and decompressor
import { compressText, decompressText } from '../compressors/lossless/text-gz.js';

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const fileNameDisplay = document.getElementById('file-name');
    const btnCompress = document.getElementById('btn-compress');
    const btnDecompress = document.getElementById('btn-decompress');
    const errorMessage = document.getElementById('error-message');
    const resultsDashboard = document.getElementById('results-dashboard');
    const btnDownload = document.getElementById('btn-download');
    const verificationStatus = document.getElementById('verification-status');

    let currentFile = null;
    let processedBlob = null;
    let lastOriginalHash = null; // Store hash for decompression verification

    // --- Drag and Drop Aesthetics ---
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
    });

    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        handleFileSelect(dt.files[0]);
    });

    fileInput.addEventListener('change', (e) => {
        handleFileSelect(e.target.files[0]);
    });

    // --- File Handling & Validation ---
    function handleFileSelect(file) {
        hideError();
        resultsDashboard.classList.add('hidden');

        if (!file) return;

        // Strict validation based on project requirements
        const allowedTypes = ['text/plain', 'text/csv', 'image/jpeg', 'image/png', 'audio/mpeg', 'audio/wav', 'video/mp4', 'application/gzip', 'application/x-gzip'];

        if (!allowedTypes.includes(file.type)) {
            showError("Unsupported format. Please upload TXT, CSV, JPG, PNG, MP3, WAV, or MP4.");
            btnCompress.disabled = true;
            btnDecompress.disabled = true;
            return;
        }

        currentFile = file;
        fileNameDisplay.textContent = currentFile.name;

        // Enable buttons with a smooth transition
        btnCompress.disabled = false;
        btnDecompress.disabled = false;
    }

    // --- The Master Router ---
    btnCompress.addEventListener('click', async () => {
        if (!currentFile) return;

        btnCompress.disabled = true;
        btnCompress.textContent = "Compressing...";

        try {
            let result;
            const fileType = currentFile.type;

            // Route to specific squad member's engine
            if (fileType.startsWith('audio/')) {
                // YOUR MODULE
                result = await compressAudio(currentFile);
            } else if (fileType.startsWith('image/')) {
                // Aryan / Gitesh's module
                // result = await compressImage(currentFile); 
                throw new Error("Image module pending integration.");
            } else if (fileType.startsWith('text/')) {
                // Kartikay's text compression module (pako gzip + SHA-256)
                result = await compressText(currentFile);
                lastOriginalHash = result.originalHash;
                showVerification('compress', result.originalHash);
            } else if (fileType.startsWith('video/')) {
                // Aryan's video module via Prakhar's background script
                // result = await processVideoViaWorker(currentFile);
                throw new Error("Video background worker pending integration.");
            }

            processedBlob = result.blob;
            updateDashboard(result.metrics);
            setupDownload(processedBlob, `compressed_${currentFile.name}`);

        } catch (error) {
            showError(`Compression failed: ${error.message}`);
        } finally {
            btnCompress.disabled = false;
            btnCompress.textContent = "Compress File";
        }
    });

    // --- Decompression Handler ---
    btnDecompress.addEventListener('click', async () => {
        if (!currentFile) return;

        btnDecompress.disabled = true;
        btnDecompress.textContent = "Decompressing...";

        try {
            let result;
            const fileName = currentFile.name || '';
            const fileType = currentFile.type;

            // Route .gz files to Kartikay's text decompressor
            if (fileName.endsWith('.gz') || fileType === 'application/gzip' || fileType === 'application/x-gzip') {
                result = await decompressText(currentFile, lastOriginalHash);

                // Show SHA-256 verification result
                if (result.verification) {
                    showVerification('decompress', null, result.verification);
                }
            } else {
                throw new Error("Decompression for this format is not yet supported.");
            }

            processedBlob = result.blob;
            updateDashboard(result.metrics);

            // Determine decompressed filename
            let downloadName = fileName.endsWith('.gz')
                ? fileName.slice(0, -3)
                : `decompressed_${fileName}`;
            setupDownload(processedBlob, downloadName);

        } catch (error) {
            showError(`Decompression failed: ${error.message}`);
        } finally {
            btnDecompress.disabled = false;
            btnDecompress.textContent = "Decompress File";
        }
    });

    // --- UI Update Utilities ---
    function updateDashboard(metrics) {
        document.getElementById('val-original').textContent = metrics.originalSize;
        document.getElementById('val-compressed').textContent = metrics.compressedSize;
        document.getElementById('val-ratio').textContent = metrics.ratio;
        document.getElementById('val-savings').textContent = `${metrics.savings}%`;

        resultsDashboard.classList.remove('hidden');
        btnDownload.classList.remove('hidden');
    }

    function setupDownload(blob, filename) {
        btnDownload.onclick = () => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            URL.revokeObjectURL(url);
        };
    }

    function showError(msg) {
        errorMessage.textContent = msg;
        errorMessage.classList.remove('hidden');
    }

    function hideError() {
        errorMessage.classList.add('hidden');
    }

    // --- SHA-256 Verification Display ---
    function showVerification(mode, hash, verification) {
        verificationStatus.classList.remove('hidden');

        if (mode === 'compress' && hash) {
            verificationStatus.innerHTML = `
                <strong>🔒 SHA-256 Fingerprint</strong><br>
                <code style="font-size:10px;word-break:break-all;color:#8a2be2;">${hash}</code>
                <br><small style="color:#888;">This hash will verify lossless rebuild on decompression.</small>
            `;
            verificationStatus.style.borderColor = 'rgba(138, 43, 226, 0.4)';
        } else if (mode === 'decompress' && verification) {
            if (verification.match === true) {
                verificationStatus.innerHTML = `
                    <strong>✅ Lossless Rebuild Verified</strong><br>
                    <small style="color:#2ecc71;">SHA-256 hashes match — byte-for-byte identical reconstruction.</small><br>
                    <code style="font-size:10px;word-break:break-all;color:#2ecc71;">${verification.computed}</code>
                `;
                verificationStatus.style.borderColor = 'rgba(46, 204, 113, 0.4)';
            } else if (verification.match === false) {
                verificationStatus.innerHTML = `
                    <strong>❌ Hash Mismatch</strong><br>
                    <small style="color:#e74c3c;">Data may have been altered.</small><br>
                    <strong>Expected:</strong> <code style="font-size:10px;word-break:break-all;">${verification.expected}</code><br>
                    <strong>Got:</strong> <code style="font-size:10px;word-break:break-all;">${verification.computed}</code>
                `;
                verificationStatus.style.borderColor = 'rgba(231, 76, 60, 0.4)';
            } else {
                verificationStatus.innerHTML = `
                    <strong>🔓 Decompressed Successfully</strong><br>
                    <small style="color:#888;">No original hash available for comparison.</small><br>
                    <code style="font-size:10px;word-break:break-all;color:#8a2be2;">${verification.computed}</code>
                `;
                verificationStatus.style.borderColor = 'rgba(138, 43, 226, 0.4)';
            }
        }
    }
});