const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ytDesktop", {
  getPrinters: () => ipcRenderer.invoke("yt:printers"),
  printImage: payload => ipcRenderer.invoke("yt:print-image", payload)
});
