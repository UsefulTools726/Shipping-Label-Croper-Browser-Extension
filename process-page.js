// process-page.js - Runs in a normal tab/page (not a service worker or offscreen document)

const statusEl = document.getElementById('status');

const params = new URLSearchParams(location.search);
const pdfUrl = params.get('url');

if (!pdfUrl) {
  statusEl.textContent = 'Missing PDF URL';
  throw new Error('No URL');
}

(async () => {
  try {
    statusEl.textContent = 'Fetching PDF…';

    const response = await fetch(pdfUrl, { credentials: 'include' });
    if (!response.ok) throw new Error('Could not fetch PDF (' + response.status + ')');

    const contentType = response.headers.get('content-type') || '';
    const arrayBuffer = await response.arrayBuffer();

    const headerBytes = new Uint8Array(arrayBuffer.slice(0, 5));
    const headerStr = String.fromCharCode(...headerBytes);
    if (!headerStr.startsWith('%PDF')) {
      throw new Error('URL did not return a PDF (got ' + (contentType || 'unknown type') + ')');
    }

    statusEl.textContent = 'Analyzing label…';
    const bufferForAnalysis = arrayBuffer.slice(0);
    const bufferForCrop = arrayBuffer.slice(0);

    const pdf = await loadPdfDocument(bufferForAnalysis);
    const page = await pdf.getPage(1);
    const { templates = [] } = await chrome.storage.local.get(['templates']);
    const { crop, fingerprint, usedLearned } = await findCropForPage(page, templates);

    statusEl.textContent = usedLearned ? 'Applying learned crop…' : 'Cropping label…';
    const croppedBytes = await cropPdfToRegion(bufferForCrop, crop);

    statusEl.textContent = 'Opening cropped label…';
    const blob = new Blob([croppedBytes], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);

    await chrome.tabs.create({ url: blobUrl, active: true });

    // Keep fingerprint available for debugging / future UI hooks
    console.log('Cropped label', { fingerprint, usedLearned, crop });

    setTimeout(() => window.close(), 500);
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Error: ' + err.message;
  }
})();
