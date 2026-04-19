import { compressAudio } from '../compressors/lossy/audio-mp3.js';
import { compressText, decompressText } from '../compressors/lossless/text-gz.js';
import { compressLosslessPNG } from '../compressors/lossless/image-png.js';
import { compressJPG, decompressJPG } from '../compressors/lossy/image-jpg.js';
import { compressMP4, decompressMP4 } from '../compressors/lossy/video-mp4.js';
import { FileProcessor } from '../utils/file-reader.js';


document.addEventListener('DOMContentLoaded', () => {
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
    let lastOriginalHash = null;

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
        handleFileSelect(e.dataTransfer.files[0]);
    });

    fileInput.addEventListener('change', (e) => {
        handleFileSelect(e.target.files[0]);
    });

    function handleFileSelect(file) {
        hideError();
        resultsDashboard.classList.add('hidden');
        if (verificationStatus) verificationStatus.classList.add('hidden');

        if (!file) return;

        const fileName = (file.name || '').toLowerCase();

        const allowedTypes = [
            'text/plain', 'text/csv', 'image/jpeg', 'image/png',
            'audio/mpeg', 'audio/wav', 'video/mp4', 'application/gzip', 'application/x-gzip',
            'application/pdf'
        ];

        const allowedExtensions = ['txt', 'csv', 'jpg', 'jpeg', 'png', 'mp3', 'wav', 'mp4', 'pdf', 'gz'];
        const hasSupportedExtension = allowedExtensions.some(ext => fileName.endsWith(`.${ext}`));
        const hasSupportedType = allowedTypes.includes(file.type);

        if (!hasSupportedType && !hasSupportedExtension) {
            showError("Unsupported format. Please upload TXT, CSV, JPG, PNG, MP3, WAV, MP4, PDF, or GZ.");
            btnCompress.disabled = true;
            btnDecompress.disabled = true;
            return;
        }

        currentFile = file;
        fileNameDisplay.textContent = currentFile.name;

        btnCompress.disabled = false;
        btnDecompress.disabled = false;
    }

    btnCompress.addEventListener('click', async () => {
        if (!currentFile) return;

        btnCompress.disabled = true;
        btnCompress.textContent = "Compressing...";

        try {
            let result;
            const fileType = currentFile.type;

            if (fileType.startsWith('audio/')) {
                result = await compressAudio(currentFile);
            }
            else if (fileType === 'image/png') {
                result = await compressLosslessPNG(currentFile);
            }
            else if (fileType === 'image/jpeg' || fileType === 'image/jpg') {
                result = await compressJPG(currentFile);
            }
            else if (fileType === 'video/mp4') {
                result = await compressMP4(currentFile);
            }
            else if (fileType.startsWith('text/') || currentFile.name.endsWith('.csv') || fileType === 'application/pdf') {
                result = await compressText(currentFile);
                lastOriginalHash = result.originalHash;
                showVerification('compress', result.originalHash);
            }
            else {
                throw new Error("Cannot compress this file type.");
            }

            processedBlob = result.blob;

            let downloadName;
            if (fileType.startsWith('text/') || currentFile.name.endsWith('.csv') || fileType === 'application/pdf') {
                const baseName = currentFile.name.split('.')[0];
                downloadName = `${baseName}.${currentFile.name.split('.').pop()}.gz`;
            } else {
                downloadName = currentFile.name;
            }

            currentFile = new File([processedBlob], downloadName, {
                type: processedBlob.type || currentFile.type,
                lastModified: Date.now()
            });

            updateDashboard(result.metrics, result.psnr, 'compress');

            setupDownload(processedBlob, downloadName.startsWith('compressed_') ? downloadName : `compressed_${downloadName}`);

        } catch (error) {
            showError(`Compression failed: ${error.message}`);
        } finally {
            btnCompress.disabled = false;
            btnCompress.textContent = "Compress File";
        }
    });

    btnDecompress.addEventListener('click', async () => {
        if (!currentFile) return;

        btnDecompress.disabled = true;
        btnDecompress.textContent = "Decompressing...";

        try {
            let result;
            const fileName = currentFile.name || '';
            const normalizedName = fileName.toLowerCase();
            const fileType = currentFile.type;

            if (normalizedName.endsWith('.gz') || fileType === 'application/gzip' || fileType === 'application/x-gzip') {
                result = await decompressText(currentFile, lastOriginalHash);
                if (result.verification) {
                    showVerification('decompress', null, result.verification);
                }
            }
            else if (fileType === 'image/jpeg' || fileType === 'image/jpg' || normalizedName.endsWith('.jpg') || normalizedName.endsWith('.jpeg')) {
                result = await decompressJPG(currentFile);
            }
            else if (fileType === 'video/mp4' || normalizedName.endsWith('.mp4')) {
                result = await decompressMP4(currentFile);
            }
            else {
                const readerRes = await FileProcessor.routeDecompression(currentFile);
                result = {
                    blob: new Blob([readerRes.data], { type: readerRes.type || currentFile.type || 'application/octet-stream' }),
                    metrics: { originalSize: '--', compressedSize: '--', ratio: 'N/A', savings: 'N/A' }
                };
            }

            processedBlob = result.blob;

            if (result.metrics) {
                updateDashboard(result.metrics, result.psnr, 'decompress');
            }

            let downloadName = normalizedName.endsWith('.gz')
                ? fileName.slice(0, -3)
                : `decompressed_${fileName}`;

            if (!normalizedName.endsWith('.gz') && fileName.startsWith('compressed_')) {
                downloadName = fileName.slice('compressed_'.length);
            }
            setupDownload(processedBlob, downloadName);

        } catch (error) {
            showError(`Decompression failed: ${error.message}`);
        } finally {
            btnDecompress.disabled = false;
            btnDecompress.textContent = "Decompress File";
        }
    });

    function updateDashboard(metrics, psnr = null, mode = 'compress') {
        const isDecompress = mode === 'decompress';
        
        const labelCompressed = document.getElementById('ui-label-compressed');
        const labelSavings = document.getElementById('ui-label-savings');
        
        if (labelCompressed) labelCompressed.textContent = isDecompress ? 'Decompressed' : 'Compressed';
        if (labelSavings) labelSavings.textContent = isDecompress ? 'Upscaled By' : 'Savings';

        document.getElementById('val-original').textContent = metrics.originalSize;
        document.getElementById('val-compressed').textContent = metrics.compressedSize;
        document.getElementById('val-ratio').textContent = metrics.ratio;
        
        let finalSavings = metrics.savings;
        if (isDecompress && finalSavings.startsWith('-')) {
            finalSavings = finalSavings.substring(1); 
        }
        document.getElementById('val-savings').textContent = finalSavings; 

        if (psnr !== null && psnr !== undefined) {
            verificationStatus.innerHTML = `
                <strong>Quality Assessment</strong><br>
                <small style="color:#2ecc71;">PSNR: ${psnr} dB</small>
            `;
            verificationStatus.style.borderColor = 'rgba(46, 204, 113, 0.4)';
            verificationStatus.classList.remove('hidden');
        }

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

    function showVerification(mode, hash, verification) {
        verificationStatus.classList.remove('hidden');

        if (mode === 'compress' && hash) {
            verificationStatus.innerHTML = `
                <strong>SHA-256 Fingerprint</strong><br>
                <code style="font-size:10px;word-break:break-all;color:#8a2be2;">${hash}</code>
                <br><small style="color:#888;">This hash will verify lossless rebuild on decompression.</small>
            `;
            verificationStatus.style.borderColor = 'rgba(138, 43, 226, 0.4)';
        } else if (mode === 'decompress' && verification) {
            if (verification.match === true) {
                verificationStatus.innerHTML = `
                    <strong>Lossless Rebuild Verified</strong><br>
                    <small style="color:#2ecc71;">SHA-256 hashes match — byte-for-byte identical reconstruction.</small><br>
                    <code style="font-size:10px;word-break:break-all;color:#2ecc71;">${verification.computed}</code>
                `;
                verificationStatus.style.borderColor = 'rgba(46, 204, 113, 0.4)';
            } else if (verification.match === false) {
                verificationStatus.innerHTML = `
                    <strong>Hash Mismatch</strong><br>
                    <small style="color:#e74c3c;">Data may have been altered.</small><br>
                    <strong>Expected:</strong> <code style="font-size:10px;word-break:break-all;">${verification.expected}</code><br>
                    <strong>Got:</strong> <code style="font-size:10px;word-break:break-all;">${verification.computed}</code>
                `;
                verificationStatus.style.borderColor = 'rgba(231, 76, 60, 0.4)';
            } else {
                verificationStatus.innerHTML = `
                    <strong>Decompressed Successfully</strong><br>
                    <small style="color:#888;">No original hash available for comparison.</small><br>
                    <code style="font-size:10px;word-break:break-all;color:#8a2be2;">${verification.computed}</code>
                `;
                verificationStatus.style.borderColor = 'rgba(138, 43, 226, 0.4)';
            }
        }
    }
});