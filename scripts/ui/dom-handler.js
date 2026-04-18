// Import your audio compressor (assuming you are using ES Modules)
import { compressAudio } from '../compressors/lossy/audio-mp3.js';

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

    let currentFile = null;
    let processedBlob = null;

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
        const allowedTypes = ['text/plain', 'text/csv', 'image/jpeg', 'image/png', 'audio/mpeg', 'audio/wav', 'video/mp4'];
        
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
                // Kartikay's module
                // result = await compressText(currentFile);
                throw new Error("Text module pending integration.");
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
});