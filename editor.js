// Visual crop editor — adjust rectangle + margins, optionally save as a learned template

const params = new URLSearchParams(location.search);
const pdfUrl = params.get('url');

const canvas = document.getElementById('pdfCanvas');
const overlay = document.getElementById('overlay');
const selection = document.getElementById('selection');
const statusEl = document.getElementById('status');
const metaEl = document.getElementById('meta');
const redetectBtn = document.getElementById('redetectBtn');
const cropOnlyBtn = document.getElementById('cropOnlyBtn');
const saveBtn = document.getElementById('saveBtn');
const marginLRInput = document.getElementById('marginLR');
const marginTBInput = document.getElementById('marginTB');
const marginLRDec = document.getElementById('marginLRDec');
const marginLRInc = document.getElementById('marginLRInc');
const marginTBDec = document.getElementById('marginTBDec');
const marginTBInc = document.getElementById('marginTBInc');

let pdfBytes = null;
let page = null;
let fingerprint = '';
let pageWidth = 0;
let pageHeight = 0;
/** Base crop before margins (PDF points, top-left origin) */
let baseCrop = null;
let margins = { lr: 0, tb: 0 };
let displayScale = 1;
let lastUsedLearned = false;

const MIN_SIZE = 8;

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', isError);
}

function setBusy(busy) {
  redetectBtn.disabled = busy;
  cropOnlyBtn.disabled = busy;
  saveBtn.disabled = busy;
  marginLRInput.disabled = busy;
  marginTBInput.disabled = busy;
  marginLRDec.disabled = busy;
  marginLRInc.disabled = busy;
  marginTBDec.disabled = busy;
  marginTBInc.disabled = busy;
}

function clampCrop(c) {
  let { x, y, width, height } = c;
  x = Math.max(0, Math.min(x, pageWidth - MIN_SIZE));
  y = Math.max(0, Math.min(y, pageHeight - MIN_SIZE));
  width = Math.max(MIN_SIZE, Math.min(width, pageWidth - x));
  height = Math.max(MIN_SIZE, Math.min(height, pageHeight - y));
  return { x, y, width, height };
}

function getEffectiveCrop() {
  if (!baseCrop) return null;
  return clampCrop({
    x: baseCrop.x - margins.lr,
    y: baseCrop.y - margins.tb,
    width: baseCrop.width + 2 * margins.lr,
    height: baseCrop.height + 2 * margins.tb
  });
}

function setBaseCrop(c, { resetMargins = false } = {}) {
  baseCrop = clampCrop(c);
  if (resetMargins) {
    margins = { lr: 0, tb: 0 };
    marginLRInput.value = '0';
    marginTBInput.value = '0';
  }
}

function syncSelectionFromCrop() {
  const crop = getEffectiveCrop();
  if (!crop) {
    selection.style.display = 'none';
    return;
  }
  selection.style.display = 'block';
  selection.style.left = `${crop.x * displayScale}px`;
  selection.style.top = `${crop.y * displayScale}px`;
  selection.style.width = `${crop.width * displayScale}px`;
  selection.style.height = `${crop.height * displayScale}px`;
}

function updateMeta(usedLearned = lastUsedLearned) {
  lastUsedLearned = usedLearned;
  const crop = getEffectiveCrop();
  if (!crop) {
    metaEl.textContent = 'Loading…';
    return;
  }
  const learnedNote = usedLearned ? ' · using saved template' : ' · auto-detected';
  const marginNote =
    margins.lr || margins.tb
      ? ` · margins L/R ${margins.lr}, T/B ${margins.tb}`
      : '';
  metaEl.textContent =
    `${Math.round(pageWidth)} × ${Math.round(pageHeight)} pt` +
    ` · crop ${Math.round(crop.width)} × ${Math.round(crop.height)}` +
    marginNote +
    learnedNote;
}

function parseMargin(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

function applyMarginsFromInputs() {
  margins = {
    lr: parseMargin(marginLRInput.value),
    tb: parseMargin(marginTBInput.value)
  };
  marginLRInput.value = String(margins.lr);
  marginTBInput.value = String(margins.tb);
  syncSelectionFromCrop();
  updateMeta(false);
}

function nudgeMargin(axis, delta) {
  if (axis === 'lr') {
    margins.lr = parseMargin(margins.lr + delta);
    marginLRInput.value = String(margins.lr);
  } else {
    margins.tb = parseMargin(margins.tb + delta);
    marginTBInput.value = String(margins.tb);
  }
  syncSelectionFromCrop();
  updateMeta(false);
}

async function renderPage() {
  const maxW = Math.max(320, window.innerWidth - 80);
  const maxH = Math.max(240, window.innerHeight - 200);
  const base = page.getViewport({ scale: 1 });
  displayScale = Math.min(maxW / base.width, maxH / base.height, 2.5);

  const viewport = page.getViewport({ scale: displayScale });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;

  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  syncSelectionFromCrop();
}

function clientToPdf(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left) / displayScale,
    y: (clientY - rect.top) / displayScale
  };
}

function setupInteraction() {
  let mode = null; // 'draw' | 'move' | handle id
  let start = null;
  let startCrop = null;

  function begin(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.target.closest('.handle');
    const onSelection = e.target === selection || handle;
    const pt = clientToPdf(e.clientX, e.clientY);
    start = pt;
    startCrop = getEffectiveCrop();

    if (handle) {
      mode = handle.dataset.handle;
    } else if (onSelection) {
      mode = 'move';
    } else {
      mode = 'draw';
      setBaseCrop({ x: pt.x, y: pt.y, width: MIN_SIZE, height: MIN_SIZE }, { resetMargins: true });
      syncSelectionFromCrop();
    }
  }

  function move(e) {
    if (!mode || !start) return;
    const pt = clientToPdf(e.clientX, e.clientY);
    const dx = pt.x - start.x;
    const dy = pt.y - start.y;

    if (mode === 'draw') {
      const x1 = Math.min(start.x, pt.x);
      const y1 = Math.min(start.y, pt.y);
      const x2 = Math.max(start.x, pt.x);
      const y2 = Math.max(start.y, pt.y);
      setBaseCrop({ x: x1, y: y1, width: x2 - x1, height: y2 - y1 }, { resetMargins: true });
    } else if (mode === 'move' && startCrop) {
      setBaseCrop({
        x: startCrop.x + dx,
        y: startCrop.y + dy,
        width: startCrop.width,
        height: startCrop.height
      }, { resetMargins: true });
    } else if (startCrop) {
      let { x, y, width, height } = startCrop;
      if (mode.includes('w')) {
        const nx = Math.min(x + width - MIN_SIZE, x + dx);
        width = width + (x - nx);
        x = nx;
      }
      if (mode.includes('e')) {
        width = Math.max(MIN_SIZE, width + dx);
      }
      if (mode.includes('n')) {
        const ny = Math.min(y + height - MIN_SIZE, y + dy);
        height = height + (y - ny);
        y = ny;
      }
      if (mode.includes('s')) {
        height = Math.max(MIN_SIZE, height + dy);
      }
      setBaseCrop({ x, y, width, height }, { resetMargins: true });
    }

    syncSelectionFromCrop();
    updateMeta(false);
  }

  function end() {
    mode = null;
    start = null;
    startCrop = null;
  }

  overlay.addEventListener('mousedown', begin);
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
}

async function openCropped(saveTemplate) {
  const crop = getEffectiveCrop();
  if (!crop || !pdfBytes) return;
  setBusy(true);
  setStatus(saveTemplate ? 'Saving template and cropping…' : 'Cropping…');
  try {
    if (saveTemplate) {
      await upsertTemplate(fingerprint, crop);
    }
    const bytes = await cropPdfToRegion(pdfBytes.slice(0), crop);
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);
    await chrome.tabs.create({ url: blobUrl, active: true });
    setStatus(saveTemplate ? 'Template saved. Opening cropped PDF…' : 'Opening cropped PDF…');
    setTimeout(() => window.close(), 600);
  } catch (err) {
    console.error(err);
    setStatus('Error: ' + err.message, true);
    setBusy(false);
  }
}

async function redetect() {
  setBusy(true);
  setStatus('Re-detecting label area…');
  try {
    const detected = await detectLabelArea(page);
    setBaseCrop(
      detected || { x: 0, y: 0, width: pageWidth, height: pageHeight },
      { resetMargins: true }
    );
    syncSelectionFromCrop();
    updateMeta(false);
    setStatus('Auto-detect applied. Adjust margins or the box, then save or crop.');
  } catch (err) {
    setStatus('Error: ' + err.message, true);
  } finally {
    setBusy(false);
  }
}

async function init() {
  if (!pdfUrl) {
    setStatus('Missing PDF URL', true);
    setBusy(true);
    return;
  }

  try {
    setStatus('Fetching PDF…');
    const response = await fetch(pdfUrl, { credentials: 'include' });
    if (!response.ok) throw new Error('Could not fetch PDF (' + response.status + ')');

    const arrayBuffer = await response.arrayBuffer();
    const headerBytes = new Uint8Array(arrayBuffer.slice(0, 5));
    const headerStr = String.fromCharCode(...headerBytes);
    if (!headerStr.startsWith('%PDF')) {
      throw new Error('URL did not return a PDF');
    }

    pdfBytes = arrayBuffer.slice(0);
    const pdf = await loadPdfDocument(arrayBuffer.slice(0));
    page = await pdf.getPage(1);

    const { templates = [] } = await chrome.storage.local.get(['templates']);
    const found = await findCropForPage(page, templates);
    fingerprint = found.fingerprint;
    pageWidth = found.pageWidth;
    pageHeight = found.pageHeight;
    setBaseCrop(found.crop, { resetMargins: true });

    await renderPage();
    setupInteraction();
    updateMeta(found.usedLearned);
    setStatus('Drag the box to adjust, or use Left/Right and Top/Bottom margins. Positive adds padding.');
    setBusy(false);
  } catch (err) {
    console.error(err);
    setStatus('Error: ' + err.message, true);
    setBusy(true);
  }
}

redetectBtn.addEventListener('click', redetect);
cropOnlyBtn.addEventListener('click', () => openCropped(false));
saveBtn.addEventListener('click', () => openCropped(true));

marginLRInput.addEventListener('change', applyMarginsFromInputs);
marginTBInput.addEventListener('change', applyMarginsFromInputs);
marginLRInput.addEventListener('input', applyMarginsFromInputs);
marginTBInput.addEventListener('input', applyMarginsFromInputs);
marginLRDec.addEventListener('click', () => nudgeMargin('lr', -1));
marginLRInc.addEventListener('click', () => nudgeMargin('lr', 1));
marginTBDec.addEventListener('click', () => nudgeMargin('tb', -1));
marginTBInc.addEventListener('click', () => nudgeMargin('tb', 1));

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (page) renderPage();
  }, 150);
});

init();
