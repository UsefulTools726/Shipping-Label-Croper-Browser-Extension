# Shipping Label Cropper Browser Extension

A browser extension for Chrome and Firefox that automatically detects and crops shipping label PDFs to the actual label area. Cropping embeds only the detected region into a new page of that exact size, so barcodes stay sharp when printed.

## Features
- **One-click crop** — left-click the toolbar icon to crop the active PDF tab.
- **Right-click menu** — Correct / Learn Crop, and clear learned templates.
- **PDF badge** — icon shows a **PDF** badge when the active tab looks like a PDF.
- **Learning** — templates are keyed by a fingerprint (page size + text snippet). Matching labels reuse the saved crop. Up to 50 templates are kept.
- **Cross-browser** — Manifest V3 for Chrome and Firefox (gecko settings included).

## Installation (development)

### Chrome
1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `shipping-label-cropper` folder

### Firefox
1. Open `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select the `manifest.json` file

## Package for Chrome / Firefox stores

```bash
node scripts/package.mjs
```

Or on Windows: `.\scripts\package.ps1`

This writes versioned zips to `dist/`:

- `shipping-label-cropper-<version>-chrome.zip`
- `shipping-label-cropper-<version>-firefox.zip`

See [STORE.md](STORE.md) for upload steps, listing copy, and permission notes.

## Usage
1. Open a shipping label PDF and review it if needed.
2. **Left-click** the extension icon to crop (a **PDF** badge means the tab is ready).
3. Print from the cropped PDF tab.

## Learning / correcting a crop
1. Open the original label PDF.
2. **Right-click** the extension icon → **Correct / Learn Crop…**
3. Drag or resize the orange rectangle (or drag on empty space to draw a new one).
4. Use **Left / Right** and **Top / Bottom** margins (in PDF points) to add or tighten padding around the crop. Positive expands; negative shrinks.
5. **Re-detect** restores the automatic bounding box (and resets margins).
6. **Save template & crop** stores the final crop for similar labels and opens the result.
7. **Crop only** opens the result without saving.
8. Right-click the icon → **Clear learned templates** when needed.

## Architecture
- `background.js` — left-click crop, action context menu, badge; opens `process.html` / `editor.html`.
- `process-page.js` — fetches the PDF, detects (or loads a learned crop), crops, opens a blob tab.
- `editor.js` — visual crop UI for correction and learning.
- `label-core.js` — shared fingerprinting, non-white bounding-box detection, and pdf-lib crop/embed.

Detection uses pdf.js at 2× scale. Cropping uses pdf-lib `embedPage` into a new page sized to the crop (not CropBox-only), which avoids leftover white space on print.

## Privacy Policy
Read the [Privacy Policy](docs/privacy-policy.html).

## Permissions
Storage, tabs, activeTab, contextMenus, and host permissions for fetching PDFs.

## Libraries
- pdf-lib (UMD)
- pdf.js (for analysis and the editor preview)
