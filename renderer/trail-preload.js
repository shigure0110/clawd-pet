const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("trail", {
  onFootprint: (cb) => ipcRenderer.on("footprint", (_e, fp) => cb(fp)),
  onClear: (cb) => ipcRenderer.on("trail-clear", () => cb()),
  idle: () => ipcRenderer.send("trail-idle"),
});
