// Shared detection + crop helpers used by process-page.js and editor.js

function configurePdfJs() {
  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('libs/pdf.worker.min.js');
  }
}

async function loadPdfDocument(arrayBuffer) {
  configurePdfJs();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  return loadingTask.promise;
}

async function getFingerprint(page) {
  const viewport = page.getViewport({ scale: 1.0 });
  const textContent = await page.getTextContent();
  const textSnippet = textContent.items.slice(0, 5).map(i => i.str).join(' ').substring(0, 80);
  return {
    fingerprint: `${Math.round(viewport.width)}x${Math.round(viewport.height)}:${textSnippet}`,
    pageWidth: viewport.width,
    pageHeight: viewport.height
  };
}

async function detectLabelArea(page) {
  const scale = 2.0;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const width = canvas.width;
  const height = canvas.height;

  const threshold = 235;
  let minX = width, minY = height, maxX = 0, maxY = 0;
  let contentCount = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (r < threshold || g < threshold || b < threshold) {
        contentCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (contentCount < 100 || maxX <= minX || maxY <= minY) return null;

  const shrink = Math.round(0.5 * scale);
  minX = Math.min(width - 1, minX + shrink);
  minY = Math.min(height - 1, minY + shrink);
  maxX = Math.max(0, maxX - shrink);
  maxY = Math.max(0, maxY - shrink);

  const pad = Math.round(2 * scale);
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width, maxX + pad);
  maxY = Math.min(height, maxY + pad);

  const pdfScale = 1 / scale;
  return {
    x: minX * pdfScale,
    y: minY * pdfScale,
    width: (maxX - minX) * pdfScale,
    height: (maxY - minY) * pdfScale
  };
}

async function findCropForPage(page, templates = []) {
  const { fingerprint, pageWidth, pageHeight } = await getFingerprint(page);
  const learned = templates.find(t => t.fingerprint === fingerprint);
  let crop = learned ? learned.crop : await detectLabelArea(page);
  if (!crop) {
    crop = { x: 0, y: 0, width: pageWidth, height: pageHeight };
  }
  return { fingerprint, pageWidth, pageHeight, crop, usedLearned: !!learned };
}

async function cropPdfToRegion(arrayBuffer, crop) {
  const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);
  const pdfPage = pdfDoc.getPages()[0];
  const pdfHeight = pdfPage.getHeight();
  const { x, y, width, height } = crop;

  const newDoc = await PDFLib.PDFDocument.create();
  const newPage = newDoc.addPage([width, height]);
  const embeddedPage = await newDoc.embedPage(pdfPage, {
    left: x,
    bottom: pdfHeight - (y + height),
    right: x + width,
    top: pdfHeight - y
  });

  newPage.drawPage(embeddedPage, {
    x: 0,
    y: 0,
    width,
    height
  });

  return newDoc.save();
}

async function upsertTemplate(fingerprint, crop) {
  const { templates = [] } = await chrome.storage.local.get(['templates']);
  const next = templates.filter(t => t.fingerprint !== fingerprint);
  next.push({ fingerprint, crop, timestamp: Date.now() });
  await chrome.storage.local.set({ templates: next.slice(-50) });
  return next.length;
}
