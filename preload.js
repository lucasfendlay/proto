const { contextBridge, ipcRenderer } = require('electron');

console.log('Preload script loaded.');

contextBridge.exposeInMainWorld('electron', {
    ipcRenderer: {
        invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
        on: (channel, listener) => {
            console.log(`Listening for '${channel}' events.`);
            ipcRenderer.on(channel, listener);
        },
        removeListener: (channel, listener) => ipcRenderer.removeListener(channel, listener),
    },
});