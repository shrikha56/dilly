# Dilly

Dilly is a Chrome extension that adds a gentle pause between "add to cart" and checkout impulse. On supported shopping sites, it intercepts common add-to-cart and buy-now clicks, shows a calm full-screen overlay, and lets the shopper either wait before continuing or skip the purchase for now.

## What it includes

- A Manifest V3 Chrome extension
- A content script that detects common cart and buy triggers across Amazon, ASOS, Zara, H&M, SHEIN, NET-A-PORTER, Revolve, eBay, Etsy, and generic Shopify storefronts
- A polished overlay with rotating prompts, timer choices, and local-only stats
- A toolbar popup for settings like spending threshold, Intentional Mode, and pausing the extension
- Local-only persistence for settings and stats via an offscreen document using `localStorage`

## Files

- `manifest.json`: extension configuration
- `content.js`: add-to-cart detection, interception, overlay flow
- `popup.html`: toolbar popup markup
- `popup.js`: settings and stats UI logic
- `styles.css`: shared popup and overlay styling
- `background.js`: service worker that brokers messages
- `offscreen.html` + `offscreen.js`: local storage bridge for shared extension data

## Load In Chrome

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select the `dilly` folder.
5. Pin the extension from the Chrome toolbar if you want quick access to settings.

## How to test

1. Open a supported product page, such as Amazon or ASOS.
2. Click an add-to-cart or buy-now button.
3. If the product price is above your threshold, Dilly should show the overlay before the site action continues.
4. Try `Not today` to record a pause.
5. Try waiting for the timer and then click `Yes, add it` to let the original purchase action continue.

## Deploy landing (Vercel)

The marketing page lives in `landing/` (`index.html` + `images/`).

1. Push this repo to GitHub, GitLab, or Bitbucket.
2. In [Vercel](https://vercel.com), create a **New Project** and import the repo.
3. Leave **Framework Preset** as **Other** and leave **Build Command** / **Output Directory** empty (static site).
4. Deploy. The included root `vercel.json` serves `landing/index.html` at `/` and maps `/images/*` to `landing/images/*`.

**Alternative:** In the Vercel project **Settings → General → Root Directory**, set `landing` and remove or ignore the root `vercel.json` rewrites so `index.html` is served at `/` without redirects.

Deploy from the CLI (after `npm i -g vercel` or `npx vercel`): from the `dilly` folder run `vercel` for a preview, or `vercel --prod` for production.

## Notes

- Dilly stores everything locally on the device.
- No accounts, analytics, or external APIs are used.
- If Dilly cannot confidently detect a supported button, it does nothing and leaves the site alone.
