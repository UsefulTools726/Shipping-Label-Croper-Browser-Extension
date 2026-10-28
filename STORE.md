# Store publishing guide

Built packages (after `node scripts/package.mjs`):

- `dist/shipping-label-cropper-<version>-chrome.zip` → Chrome Web Store
- `dist/shipping-label-cropper-<version>-firefox.zip` → Firefox Add-ons (AMO)

## Before you upload

1. Reload/test the unpacked extension in Chrome and Firefox one last time.
2. Confirm the Firefox add-on id in `manifest.json` → `browser_specific_settings.gecko.id` (change it before first AMO submit if you want a different permanent id).
3. Prepare store listing assets:
   - **Chrome**: at least one screenshot (1280×800 or 640×400), optional promotional images
   - **Firefox**: at least one screenshot (recommended 1280×800)
   - Short description and a longer description (see drafts below)

## Chrome Web Store

1. Open https://chrome.google.com/webstore/devconsole (one-time developer registration fee).
2. **New item** → upload `*-chrome.zip`.
3. Fill listing, privacy disclosures, and justify `<all_urls>` host permission: the extension fetches the PDF from the active tab URL to crop it.
4. Submit for review.

## Firefox Add-ons (AMO)

1. Open https://addons.mozilla.org/developers/
2. **Submit a New Add-on** → upload `*-firefox.zip`.
3. Choose listed or unlisted (self-distribute). Listed goes through AMO review.
4. Same permission justification as Chrome.

### Sideload / self-test without the stores

- **Chrome**: `chrome://extensions` → Load unpacked (project folder), or drag the chrome zip onto that page.
- **Firefox**: `about:debugging#/runtime/this-firefox` → Load Temporary Add-On → select `manifest.json`. For a longer install, submit an unlisted AMO build and install the signed `.xpi`.

## Listing copy (draft)

**Name:** Shipping Label Cropper

**Short:** One-click crop for shipping label PDFs. Learn custom crops and keep barcode quality.

**Full:**
Shipping Label Cropper detects the label area on a PDF and crops to that region so you can print without extra white space. Left-click the toolbar icon to crop the active PDF. Right-click for Correct / Learn Crop (drag a rectangle, adjust Left/Right and Top/Bottom margins, save a template for similar labels). Cropping embeds only the label region into a new page sized to the crop, preserving resolution for barcode scanners.

**Permission notes for reviewers:**
- `storage` — auto settings and learned crop templates
- `tabs` / `activeTab` — read the current tab URL to open the processor
- `contextMenus` — right-click actions on the extension icon
- Host access — fetch the PDF bytes from the page URL the user is viewing

## Privacy (draft one-liner)

This extension processes PDFs you open locally in the browser. Label data and learned templates stay on your device (`chrome.storage.local` / Firefox equivalent). Nothing is uploaded to a remote server by the extension.
