const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  startTimer: (minutes, task) => ipcRenderer.send('timer:start', { minutes, task }),
  pauseTimer: () => ipcRenderer.send('timer:pause'),
  resumeTimer: () => ipcRenderer.send('timer:resume'),
  resetTimer: () => ipcRenderer.send('timer:reset'),
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  getState: () => ipcRenderer.invoke('timer:getState'),
  onTick: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('timer:tick', handler);
    return () => ipcRenderer.removeListener('timer:tick', handler);
  },
  onCompleted: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('timer:completed', handler);
    return () => ipcRenderer.removeListener('timer:completed', handler);
  }
});
