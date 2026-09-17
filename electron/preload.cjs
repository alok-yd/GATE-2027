const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  updateFocusStatus: (status) => ipcRenderer.send('focus:status-update', status),
  onToggleFocus: (callback) => {
    const handler = (_event, action) => callback(action);
    ipcRenderer.on('focus:action', handler);
    return () => ipcRenderer.removeListener('focus:action', handler);
  }
});
