# Young Trendz Desktop Label Printer

Windows desktop companion for the Young Trendz bol.com label web app.

## Requirements

- Windows 10/11 64-bit
- The 123inkt LW650XL PRO Windows printer driver installed
- Printer connected to this PC by USB or reachable over the local network
- Internet access for the existing Young Trendz web app and bol.com backend

## Development

```powershell
cd desktop
npm install
npm start
```

## Build installer

```powershell
cd desktop
npm install
npm run dist
```

The installer is created in `desktop/dist`.

The desktop companion loads the existing hosted Young Trendz app and exposes a restricted print bridge. Label PDFs are cropped and rotated by the web app, rendered to a PNG, and sent to the Windows print queue using Electron's silent print API at 104 × 159 mm. The printer driver must be installed and the matching custom label size must be supported/configured in its preferences.

The app does not automatically register shipments with bol.com. Shipment registration remains a separate confirmation in Young Trendz.
