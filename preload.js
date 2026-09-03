const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ccPet', {
  // Claude Code status updates
  onStatusUpdate: (callback) => {
    ipcRenderer.on('status-update', (_event, data) => callback(data));
  },

  // Fullscreen app detection (true = a borderless fullscreen window is in front)
  onFullscreenChange: (callback) => {
    ipcRenderer.on('fullscreen-change', (_event, active) => callback(active));
  },

  // Seconds since the last mouse/keyboard input anywhere on the system (every 10s)
  onSystemIdle: (callback) => {
    ipcRenderer.on('system-idle', (_event, seconds) => callback(seconds));
  },

  // Commands from the tray menu: "usage" | "toggle-roam" | "toggle-hide"
  onTrayCommand: (callback) => {
    ipcRenderer.on('tray-command', (_event, cmd) => callback(cmd));
  },

  // Native context menu (rendered by the OS, never clipped by the pet window)
  showMenu: (state) => ipcRenderer.send('show-menu', state),
  onMenuAction: (callback) => {
    ipcRenderer.on('menu-action', (_event, action) => callback(action));
  },
  onMenuClosed: (callback) => {
    ipcRenderer.on('menu-closed', () => callback());
  },

  // Concurrent Claude Code sessions: { count, names }
  onSessionsUpdate: (callback) => {
    ipcRenderer.on('sessions-update', (_event, data) => callback(data));
  },

  // Window movement
  getWindowPosition: () => ipcRenderer.invoke('get-window-position'),
  setWindowPosition: (x, y) => ipcRenderer.send('set-window-position', { x, y }),
  getWorkArea: () => ipcRenderer.invoke('get-work-area'),

  // Click-through (used while tucked away at the screen edge)
  setIgnoreMouse: (ignore) => {
    ipcRenderer.send('set-ignore-mouse', ignore);
  },

  // Always on top
  toggleAlwaysOnTop: (flag) => {
    ipcRenderer.send('toggle-always-on-top', flag);
  },

  // Today's usage + API-equivalent cost (ccusage)
  getUsage: () => ipcRenderer.invoke('get-usage'),

  // Start with Windows
  getAutoStart: () => ipcRenderer.invoke('get-autostart'),
  setAutoStart: (enabled) => ipcRenderer.invoke('set-autostart', enabled),

  // Pet import / management
  importPetZip: () => ipcRenderer.invoke('import-pet-zip'),
  listPets: () => ipcRenderer.invoke('list-pets'),
  getPetDir: (petId) => ipcRenderer.invoke('get-pet-dir', petId),
  getCurrentPetId: () => ipcRenderer.invoke('get-current-pet-id'),
  setCurrentPetId: (petId) => ipcRenderer.send('set-current-pet-id', petId),

  // Bring the Claude desktop app to the front (launch it if needed)
  openClaude: () => ipcRenderer.send('open-claude'),

  // Window geometry (DIP): { fg: {x,y,w,h,title,cls,hwnd,maximized,fullscreen}|null, claude: {...}|null }
  onWindowsUpdate: (callback) => {
    ipcRenderer.on('windows-update', (_event, data) => callback(data));
  },
  getWindows: () => ipcRenderer.invoke('get-windows'),

  // Mischief: muddy footprints (absolute DIP coords) and cursor stealing
  footprint: (fp) => ipcRenderer.send('footprint', fp),
  clearFootprints: () => ipcRenderer.send('trail-clear'),
  getCursor: () => ipcRenderer.invoke('get-cursor'),
  setCursor: (x, y) => ipcRenderer.send('set-cursor', { x, y }),

  quit: () => ipcRenderer.send('quit-app'),
  restart: () => ipcRenderer.send('restart-app'),
});
