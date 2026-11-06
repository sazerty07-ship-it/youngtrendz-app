const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");

const APP_URL = "https://sazerty07-ship-it.github.io/youngtrendz-app/";
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 900,
    minWidth: 900,
    minHeight: 680,
    title: "Young Trendz Label Printer",
    backgroundColor: "#0b1220",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) require("electron").shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.loadURL(APP_URL);
  mainWindow.on("closed", () => { mainWindow = null; });
}

app.whenReady().then(() => {
  ipcMain.handle("yt:printers", async () => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    if (!win) return [];
    return (await win.webContents.getPrintersAsync()).map(p => ({
      name: p.name,
      displayName: p.displayName || p.name,
      isDefault: Boolean(p.isDefault),
      status: p.status
    }));
  });

  ipcMain.handle("yt:print-image", async (_event, payload) => {
    if (!payload || typeof payload.dataUrl !== "string" ||
        !payload.dataUrl.startsWith("data:image/png;base64,") ||
        payload.dataUrl.length > 20_000_000) {
      throw new Error("Ongeldig of te groot labelbestand.");
    }

    const printers = await mainWindow.webContents.getPrintersAsync();
    const selected = String(payload.printerName || "");
    const printer = selected
      ? printers.find(p => p.name === selected)
      : printers.find(p => p.isDefault) || printers[0];

    if (!printer) throw new Error("Geen Windows-printer gevonden. Installeer eerst de LW650XL PRO-driver.");
    
    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });

    const html = `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  @page { size: 104mm 159mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { width: 104mm; height: 159mm; margin: 0; padding: 0; overflow: hidden; }
  body { display: flex; align-items: center; justify-content: center; }
  img { display: block; width: 104mm; height: 159mm; object-fit: contain; }
</style></head>
<body><img src="${payload.dataUrl}" onload="document.body.dataset.ready='1'" /></body></html>`;

    try {
      await printWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
      await new Promise((resolve, reject) => {
        const started = Date.now();
        const check = () => {
          if (Date.now() - started > 15000) return reject(new Error("Label kon niet worden voorbereid voor afdrukken."));
          printWindow.webContents.executeJavaScript("document.body.dataset.ready === '1'")
            .then(ready => ready ? resolve() : setTimeout(check, 100))
            .catch(reject);
        };
        check();
      });

      const result = await new Promise(resolve => {
        printWindow.webContents.print({
          silent: true,
          deviceName: printer.name,
          printBackground: true,
          margins: { marginType: "none" },
          pageSize: { width: 104000, height: 159000 },
          usePrinterDefaultPageSize: false
        }, (success, failureReason) => resolve({ success, failureReason }));
      });

      if (!result.success) throw new Error(result.failureReason || "Windows heeft de printopdracht geweigerd.");
      return { ok: true, printer: printer.displayName || printer.name };
    } finally {
      if (!printWindow.isDestroyed()) printWindow.destroy();
    }
  });

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
