const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('mandy', {
  // Config
  getConfig:    ()    => ipcRenderer.invoke('get-config'),
  saveConfig:   (cfg) => ipcRenderer.invoke('save-config', cfg),
  getChatHistories:  ()     => ipcRenderer.invoke('get-chat-histories'),
  saveChatHistories: (data) => ipcRenderer.invoke('save-chat-histories', data),

  // Files
  getRecents:       ()  => ipcRenderer.invoke('get-recents'),
  openFileDialog:   ()  => ipcRenderer.invoke('open-file-dialog'),
  openFolderDialog: ()  => ipcRenderer.invoke('open-folder-dialog'),
  openFileFromPath: (p, opts) => ipcRenderer.invoke('open-file-from-path', p, opts),
  readFile:         (p) => ipcRenderer.invoke('read-file', p),
  readFolder:       (rootPath, targetPath) => ipcRenderer.invoke('read-folder', rootPath, targetPath),
  addRecent:        (p) => ipcRenderer.invoke('add-recent', p),
  removeRecent:     (p) => ipcRenderer.invoke('remove-recent', p),
  showInFolder:     (p) => ipcRenderer.invoke('show-in-folder', p),
  createFile:       (dir, name) => ipcRenderer.invoke('create-file', dir, name),
  createFolder:     (dir, name) => ipcRenderer.invoke('create-folder', dir, name),
  renameItem:       (p, name)    => ipcRenderer.invoke('rename-item', p, name),
  deleteItem:       (p)         => ipcRenderer.invoke('delete-item', p),
  handleLink:       (href, currentFile) => ipcRenderer.invoke('handle-link', href, currentFile),
  watchFile:        (p) => ipcRenderer.invoke('watch-file', p),
  print:            ()  => ipcRenderer.invoke('print'),
  saveFile:         (filePath, content) => ipcRenderer.invoke('save-file', filePath, content),
  showSaveDialog:   (opts) => ipcRenderer.invoke('show-save-dialog', opts),
  showUnsavedDialog:(dlg)  => ipcRenderer.invoke('show-unsaved-dialog', dlg),
  getScrollPosition:(p) => ipcRenderer.invoke('get-scroll-position', p),
  setScrollPosition:(p, preview, editor) => ipcRenderer.invoke('set-scroll-position', p, preview, editor),
  saveAllScrollPositions:(positions) => ipcRenderer.invoke('save-all-scroll-positions', positions),

  // Rendering (done in main process where Node is always available)
  renderMarkdown:  (content, filePath) => ipcRenderer.invoke('render-markdown', content, filePath),
  getHljsThemeCSS: (theme)   => ipcRenderer.invoke('get-hljs-theme-css', theme),

  // AI Chat
  sendChat:    (messages, fileContext) => ipcRenderer.invoke('ai-chat', messages, fileContext),
  suggestChatContextFiles: (query, currentFilePath) => ipcRenderer.invoke('suggest-chat-context-files', query, currentFilePath),
  pickChatContextFiles:    (startDir) => ipcRenderer.invoke('pick-chat-context-files', startDir),
  cancelChat:  () => ipcRenderer.invoke('ai-chat-cancel'),
  respondChatPermission: (id, approved) => ipcRenderer.invoke('ai-chat-permission-response', id, approved),
  setSessionAutoApprove: (enabled) => ipcRenderer.invoke('ai-chat-set-session-auto-approve', enabled),
  getSessionAutoApprove: () => ipcRenderer.invoke('ai-chat-get-session-auto-approve'),
  onChatChunk: (cb) => ipcRenderer.on('ai-chat-chunk', (_, d) => cb(d)),
  onChatDone:  (cb) => ipcRenderer.on('ai-chat-done',  () => cb()),
  onChatError: (cb) => ipcRenderer.on('ai-chat-error', (_, m) => cb(m)),
  onChatPermissionRequest: (cb) => ipcRenderer.on('ai-chat-permission-request', (_, d) => cb(d)),
  onChatPermissionResolved: (cb) => ipcRenderer.on('ai-chat-permission-resolved', (_, d) => cb(d)),
  onAgentFileMutated: (cb) => ipcRenderer.on('agent-file-mutated', (_, d) => cb(d)),

  // Window
  signalReady: () => ipcRenderer.send('renderer-ready'),
  minimize:    () => ipcRenderer.invoke('window-minimize'),
  maximize:    () => ipcRenderer.invoke('window-maximize'),
  close:       () => ipcRenderer.invoke('window-close'),
  getPathForFile:  (file) => webUtils.getPathForFile(file),
  getPlatform:     () => ipcRenderer.invoke('get-platform'),
  getHome:         () => ipcRenderer.invoke('get-home'),
  getPendingFile:  () => ipcRenderer.invoke('get-pending-file'),

  // Events from main
  onFileOpened:  (cb) => ipcRenderer.on('file-opened',  (_, d) => cb(d)),
  onFileChanged: (cb) => ipcRenderer.on('file-changed', (_, c) => cb(c)),
  onOpenFolder:  (cb) => ipcRenderer.on('open-folder',  (_, p) => cb(p)),
  onAction:      (cb) => ipcRenderer.on('action',       (_, a) => cb(a)),
  onWindowState: (cb) => ipcRenderer.on('window-state', (_, s) => cb(s)),
});
