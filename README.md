# Young Trendz Label Automation

Mobile-first Progressive Web App (PWA) starter for managing bol.com shipping labels.

## Current status

Version 0.1 is the **frontend foundation only**:
- Responsive iPhone-friendly interface
- Printer preference selector (Automatic / Bluetooth / Ethernet)
- Preference saved locally in the browser
- Basic offline app shell

Not implemented yet:
- bol.com OAuth and order retrieval
- Shipping option selection and label purchase
- Shipment registration
- Actual Bluetooth, Ethernet or printer communication
- Background processing / cloud print bridge

## Deploy

The GitHub Actions workflow in `.github/workflows/deploy.yml` publishes the root of this repository to GitHub Pages. In the repository, open **Settings → Pages** and select **GitHub Actions** as the build and deployment source if GitHub asks for it.

After deployment, open the Pages URL in Safari on iPhone, tap **Share → Add to Home Screen**.

## Security

Never put a bol.com Client Secret, access token, refresh token, or printer credentials in frontend files or commit them to this repository. The bol.com integration must run on a secure backend and secrets must be stored as server-side environment variables.

## Printer architecture

An iPhone browser/PWA cannot be assumed to have unrestricted Bluetooth printer access. Ethernet printing also needs a reachable local print service. For reliable unattended printing while the PC is off, the likely architecture is a small always-on local bridge (for example a Raspberry Pi) that makes an authenticated outbound connection to the backend. Do not expose the printer's raw print port to the public internet.

## Next development steps

1. Verify the exact bol.com API permissions and current shipping-label API contract.
2. Implement backend OAuth and order retrieval.
3. Add duplicate prevention and shipment-state checks before purchasing/registering labels.
4. Build and test the local print bridge against the exact printer model and firmware.


## Product Tracker

The Product Tracker stores daily competitor-offer snapshots in Cloudflare D1. It records the current buy-box offer, price, retailer identifier and number of active offers. It does **not** claim to know competitor unit sales or stock quantity: those are not provided by the official competing-offers API.

Before enabling the tracker:

1. Create a Cloudflare D1 database named `youngtrendz-tracker`.
2. Add it to the Worker as a D1 binding named `DB` (the database ID must also be added to `worker/wrangler.toml`).
3. Apply `worker/migrations/0001_product_tracker.sql` to that database.
4. The Worker cron runs daily at 05:00 UTC.

The basket-quantity measurement is a separate integration and must be validated against bol.com's current storefront before estimated sales can be displayed.


## Category tracking

After migration 0001, apply `worker/migrations/0002_category_tracker.sql`. Up to three search terms can be followed; each daily sync imports at most 50 popular Belgian results per term. Daily offer snapshots are capped at 150 products. Stopping a category keeps discovered products in the regular tracker.
