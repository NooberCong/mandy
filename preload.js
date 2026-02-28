const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mandy', {
  // Config
  getConfig:    ()    => ipcRenderer.invoke('get-config'),
  saveConfig:   (cfg) => ipcRenderer.invoke('save-config', cfg),

  // Files
  getRecents:       ()  => ipcRenderer.invoke('get-recents'),
  openFileDialog:   ()  => ipcRenderer.invoke('open-file-dialog'),
  openFolderDialog: ()  => ipcRenderer.invoke('open-folder-dialog'),
  openFileFromPath: (p) => ipcRenderer.invoke('open-file-from-path', p),
  readFile:         (p) => ipcRenderer.invoke('read-file', p),
  readFolder:       (p) => ipcRenderer.invoke('read-folder', p),
  addRecent:        (p) => ipcRenderer.invoke('add-recent', p),
  removeRecent:     (p) => ipcRenderer.invoke('remove-recent', p),
  showInFolder:     (p) => ipcRenderer.invoke('show-in-folder', p),
  handleLink:       (href, currentFile) => ipcRenderer.invoke('handle-link', href, currentFile),
  watchFile:        (p) => ipcRenderer.invoke('watch-file', p),
  print:            ()  => ipcRenderer.invoke('print'),
  saveFile:         (filePath, content) => ipcRenderer.invoke('save-file', filePath, content),
  showSaveDialog:   (opts) => ipcRenderer.invoke('show-save-dialog', opts),
  showUnsavedDialog:(dlg)  => ipcRenderer.invoke('show-unsaved-dialog', dlg),

  // Rendering (done in main process where Node is always available)
  renderMarkdown:  (content) => ipcRenderer.invoke('render-markdown', content),
  getHljsThemeCSS: (theme)   => ipcRenderer.invoke('get-hljs-theme-css', theme),

  // Window
  minimize:    () => ipcRenderer.invoke('window-minimize'),
  maximize:    () => ipcRenderer.invoke('window-maximize'),
  close:       () => ipcRenderer.invoke('window-close'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  getHome:     () => ipcRenderer.invoke('get-home'),

  // Events from main
  onFileOpened:  (cb) => ipcRenderer.on('file-opened',  (_, d) => cb(d)),
  onFileChanged: (cb) => ipcRenderer.on('file-changed', (_, c) => cb(c)),
  onOpenFolder:  (cb) => ipcRenderer.on('open-folder',  (_, p) => cb(p)),
  onAction:      (cb) => ipcRenderer.on('action',       (_, a) => cb(a)),
  onWindowState: (cb) => ipcRenderer.on('window-state', (_, s) => cb(s)),
});
