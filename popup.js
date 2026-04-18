// Preload ffmpeg.wasm as soon as popup opens (warms up the 25MB WASM binary)
document.addEventListener('DOMContentLoaded', () => {
  VideoMp4Compressor.preload();
});

// ── Main file handler ──────────────────────────────────────────────────────

document.getElementById('fileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const ext = file.name.split('.').pop().toLowerCase();

  try {
    showStatus('Compressing...');

    let result;

    if (ext === 'jpg' || ext === 'jpeg') {
      result = await ImageJpgCompressor.compress(file, { quality: 75 });
      showMetrics(result, 'image');
      offerDownload(result.compressedBlob, 'compressed.jpg');

    } else if (ext === 'mp4') {
      result = await VideoMp4Compressor.compress(file, {
        crf    : 28,
        preset : 'fast',
        onProgress: ({ ratio }) => showStatus(`Compressing video... ${Math.round(ratio * 100)}%`)
      });
      showMetrics(result, 'video');
      offerDownload(result.compressedBlob, 'compressed.mp4');

    } else {
      showStatus(`Unsupported format: .${ext}`);
    }

  } catch (err) {
    showStatus(`Error: ${err.message}`);
    console.error(err);
  }
});

// ── Helper functions ───────────────────────────────────────────────────────

function showStatus(msg) {
  const el = document.getElementById('status');
  if (el) el.textContent = msg;
}

function showMetrics(result, type) {
  showStatus('Done!');

  document.getElementById('originalSize').textContent   = formatBytes(result.originalSize);
  document.getElementById('compressedSize').textContent = formatBytes(result.compressedSize);
  document.getElementById('ratio').textContent          = result.compressionRatio + 'x';
  document.getElementById('savings').textContent        = result.spaceSavings + '%';

  // PSNR — only for lossy
  const psnrEl = document.getElementById('psnr');
  if (psnrEl) {
    psnrEl.textContent = result.psnr !== null ? result.psnr + ' dB' : 'N/A';
  }
}

function offerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatBytes(bytes) {
  if (bytes < 1024)        return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}