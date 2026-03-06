const {app, BrowserWindow, ipcMain, dialog, Menu, shell, nativeTheme} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const {marked} = require('marked');
const hljs = require('highlight.js');
const {AgentChatService} = require('./ai/agentChat');

// ---- Markdown setup — use default marked renderer, post-process code blocks ----
marked.use({gfm: true, breaks: false});

const COPY_BTN =
    `<button class="code-copy" onclick="window.__copyCode(this)">` +
    `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">` +
    `<rect x="9" y="9" width="13" height="13" rx="2"/>` +
    `<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy</button>`;

function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function isPlainTextPreviewFile(filePath) {
    const ext = path.extname(String(filePath || '')).toLowerCase();
    return ext === '.txt' || ext === '.text' || ext === '.log';
}

function renderDocumentHtml(content, filePath) {
    if (isPlainTextPreviewFile(filePath)) {
        // Preserve literal newlines and spacing for plain text files.
        return `<pre class="plain-text-preview">${escapeHtml(content)}</pre>`;
    }
    return resolveLocalPaths(enhanceCodeBlocks(marked.parse(content)), filePath);
}

// Rewrite relative image src attributes to absolute file:// URLs so Electron can
// load them regardless of where renderer/index.html lives on disk.
function resolveLocalPaths(html, filePath) {
    if (!filePath) return html;
    const dir = path.dirname(filePath);
    // Match each <img ...> tag, then rewrite its src if it's a relative path.
    // Two-step avoids the attribute-order problem (src may be first or last).
    return html.replace(/<img\b[^>]*>/gi, imgTag =>
        imgTag.replace(/(\bsrc=")([^"]+)(")/i, (_, pre, src, post) => {
            if (/^(https?|data|file|blob):/i.test(src)) return _;
            const abs = path.resolve(dir, decodeURIComponent(src)).replace(/\\/g, '/');
            return `${pre}file:///${abs}${post}`;
        })
    );
}

// Post-process marked's default HTML: find <pre><code> blocks and add hljs + header.
// Marked already HTML-escapes the code content, so unlabelled blocks are safe as-is.
function enhanceCodeBlocks(html) {
    return html.replace(
        /<pre><code(?: class="([^"]*)")?>([\s\S]*?)<\/code><\/pre>/g,
        (_, classAttr, escapedCode) => {
            const langMatch = (classAttr || '').match(/language-(\S+)/);
            const lang = langMatch ? langMatch[1].toLowerCase() : '';

            let highlighted = escapedCode; // fallback: marked's already-escaped text
            if (lang && hljs.getLanguage(lang)) {
                try {
                    // Decode marked's escaping before passing to hljs
                    const raw = escapedCode
                        .replace(/&amp;/g, '&')
                        .replace(/&lt;/g, '<')
                        .replace(/&gt;/g, '>')
                        .replace(/&quot;/g, '"')
                        .replace(/&#39;/g, "'");
                    highlighted = hljs.highlight(raw, {language: lang}).value;
                } catch { /* keep fallback */
                }
            }

            return (
                `<div class="code-block-wrap">` +
                `<div class="code-header"><span class="code-lang">${lang}</span>${COPY_BTN}</div>` +
                `<pre><code class="hljs${lang ? ' language-' + lang : ''}">${highlighted}</code></pre>` +
                `</div>`
            );
        }
    );
}

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
const RECENTS_PATH = path.join(app.getPath('userData'), 'recents.json');
const WIN_STATE_PATH = path.join(app.getPath('userData'), 'winstate.json');
const SCROLL_POS_PATH = path.join(app.getPath('userData'), 'scroll-positions.json');

function loadWinState() {
    try {
        if (fs.existsSync(WIN_STATE_PATH)) return JSON.parse(fs.readFileSync(WIN_STATE_PATH, 'utf8'));
    } catch {
    }
    return {maximized: false, width: 1280, height: 820};
}

function saveWinState() {
    try {
        const maximized = mainWindow.isMaximized();
        const {width, height} = maximized ? {width: 1280, height: 820} : mainWindow.getBounds();
        fs.writeFileSync(WIN_STATE_PATH, JSON.stringify({maximized, width, height}));
    } catch {
    }
}

const DEFAULT_CONFIG = {
    theme: 'dark',
    fontFamily: 'sans',
    fontSize: 18,
    lineHeight: 1.8,
    contentWidth: 80,
    codeTheme: 'github-dark',
    showTOC: true,
    showWordCount: true,
    smoothScroll: true,
    focusMode: false,
    spellCheck: false,
    zoom: 1.0,
    palette: 'amber',
    language: 'en',
    rememberScrollPos: true,
    aiApiUrl: 'https://api.openai.com',
    aiApiKey: '',
    aiModel: 'gpt-4o-mini',
    chatWidth: 420,
    chatHistories: {},
};

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            return {...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))};
        }
    } catch {
    }
    return {...DEFAULT_CONFIG};
}

function saveConfig(cfg) {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
    } catch {
    }
}

function loadRecents() {
    try {
        if (fs.existsSync(RECENTS_PATH)) {
            return JSON.parse(fs.readFileSync(RECENTS_PATH, 'utf8')) || [];
        }
    } catch {
    }
    return [];
}

function saveRecents(list) {
    try {
        fs.writeFileSync(RECENTS_PATH, JSON.stringify(list, null, 2));
    } catch {
    }
}

function addRecent(filePath) {
    let recents = loadRecents();
    recents = recents.filter(r => r.path !== filePath);
    recents.unshift({path: filePath, name: path.basename(filePath), opened: Date.now()});
    if (recents.length > 20) recents = recents.slice(0, 20);
    saveRecents(recents);
    return recents;
}

function removeRecentEntry(filePath) {
    let recents = loadRecents().filter(r => r.path !== filePath);
    saveRecents(recents);
    try {
        const cfg = loadConfig();
        if (cfg.chatHistories && cfg.chatHistories[filePath]) {
            delete cfg.chatHistories[filePath];
            saveConfig(cfg);
        }
    } catch {
    }
    return recents;
}

function loadScrollPositions() {
    try {
        if (fs.existsSync(SCROLL_POS_PATH)) {
            return JSON.parse(fs.readFileSync(SCROLL_POS_PATH, 'utf8')) || {};
        }
    } catch {
    }
    return {};
}

function saveScrollPositions(positions) {
    try {
        fs.writeFileSync(SCROLL_POS_PATH, JSON.stringify(positions, null, 2));
    } catch {
    }
}

function getScrollPosition(filePath) {
    const positions = loadScrollPositions();
    return positions[filePath] || {previewScroll: 0, editorScroll: 0};
}

function setScrollPosition(filePath, previewScroll, editorScroll) {
    const positions = loadScrollPositions();
    positions[filePath] = {previewScroll, editorScroll, timestamp: Date.now()};
    // Keep only the 100 most recent scroll positions
    const entries = Object.entries(positions);
    if (entries.length > 100) {
        entries.sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));
        const kept = Object.fromEntries(entries.slice(0, 100));
        saveScrollPositions(kept);
    } else {
        saveScrollPositions(positions);
    }
}

let mainWindow;
let pendingLaunchFile = null;

function createSplash(cfg) {
    const bg = cfg.theme === 'light' ? '#f5f1eb' : cfg.theme === 'sepia' ? '#f4ede0' : '#0d0d0d';
    const splash = new BrowserWindow({
        width: 340, height: 180,
        frame: false, resizable: false, center: true,
        backgroundColor: bg, skipTaskbar: true,
        icon: path.join(__dirname, 'assets', 'icon.png'),
        webPreferences: {contextIsolation: true},
    });
    splash.loadFile(path.join(__dirname, 'renderer', 'splash.html'), {query: {theme: cfg.theme || 'dark'}});
    return splash;
}

function createWindow() {
    const cfg = loadConfig();
    const winState = loadWinState();

    mainWindow = new BrowserWindow({
        width: winState.width,
        height: winState.height,
        minWidth: 640,
        minHeight: 480,
        frame: false,
        titleBarStyle: 'hidden',
        trafficLightPosition: {x: 16, y: 16},
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,          // required so preload can require() npm packages
            spellcheck: cfg.spellCheck,
            webSecurity: true,
        },
        show: false,
        icon: path.join(__dirname, 'assets', 'icon.png'),
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

    // Store a file path requested at launch so the renderer can pull it once init() finishes.
    const fileArg = process.argv.find(arg => !arg.startsWith('-') && /\.(md|markdown|mdx|txt)$/i.test(arg) && fs.existsSync(arg));
    if (fileArg) pendingLaunchFile = fileArg;

    const splash = createSplash(cfg);
    const timeout = new Promise(resolve => setTimeout(resolve, 1000)); // show splash at least 1s
    ipcMain.once('renderer-ready', async () => {
        await timeout;
        splash.close();
        if (winState.maximized) mainWindow.maximize();
        mainWindow.show();
    });

    mainWindow.on('close', saveWinState);
    mainWindow.on('maximize', () => mainWindow.webContents.send('window-state', 'maximized'));
    mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-state', 'normal'));
    mainWindow.on('enter-full-screen', () => mainWindow.webContents.send('window-state', 'fullscreen'));
    mainWindow.on('leave-full-screen', () => mainWindow.webContents.send('window-state', 'normal'));

    buildMenu();
}

function buildMenu() {
    const template = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'New Tab',
                    accelerator: 'CmdOrCtrl+T',
                    click: () => mainWindow.webContents.send('action', 'new-tab')
                },
                {
                    label: 'New File',
                    accelerator: 'CmdOrCtrl+N',
                    click: () => mainWindow.webContents.send('action', 'new-file')
                },
                {
                    label: 'Close Tab',
                    accelerator: 'CmdOrCtrl+W',
                    click: () => mainWindow.webContents.send('action', 'close-tab')
                },
                {type: 'separator'},
                {label: 'Open File...', accelerator: 'CmdOrCtrl+O', click: () => openFileDialog()},
                {label: 'Open Folder...', accelerator: 'CmdOrCtrl+Shift+O', click: () => openFolderDialog()},
                {type: 'separator'},
                {label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => mainWindow.webContents.send('action', 'save')},
                {type: 'separator'},
                {
                    label: 'Recent Files',
                    role: 'recentDocuments',
                    submenu: [{label: 'Clear Recent', role: 'clearRecentDocuments'}]
                },
                {type: 'separator'},
                {
                    label: 'Print...',
                    accelerator: 'CmdOrCtrl+P',
                    click: () => mainWindow.webContents.send('action', 'print')
                },
                {type: 'separator'},
                {label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit()},
            ],
        },
        {
            label: 'View',
            submenu: [
                {
                    label: 'Preview Mode',
                    accelerator: 'CmdOrCtrl+Shift+P',
                    click: () => mainWindow.webContents.send('action', 'mode-preview')
                },
                {
                    label: 'Split View',
                    accelerator: 'CmdOrCtrl+Shift+E',
                    click: () => mainWindow.webContents.send('action', 'mode-split')
                },
                {
                    label: 'Edit Mode',
                    accelerator: 'CmdOrCtrl+E',
                    click: () => mainWindow.webContents.send('action', 'mode-edit')
                },
                {type: 'separator'},
                {
                    label: 'Toggle Table of Contents',
                    accelerator: 'CmdOrCtrl+Shift+T',
                    click: () => mainWindow.webContents.send('action', 'toggle-toc')
                },
                {
                    label: 'Toggle Focus Mode',
                    accelerator: 'CmdOrCtrl+Shift+F',
                    click: () => mainWindow.webContents.send('action', 'toggle-focus')
                },
                {type: 'separator'},
                {
                    label: 'Zoom In',
                    accelerator: 'CmdOrCtrl+=',
                    click: () => mainWindow.webContents.send('action', 'zoom-in')
                },
                {
                    label: 'Zoom Out',
                    accelerator: 'CmdOrCtrl+-',
                    click: () => mainWindow.webContents.send('action', 'zoom-out')
                },
                {
                    label: 'Reset Zoom',
                    accelerator: 'CmdOrCtrl+0',
                    click: () => mainWindow.webContents.send('action', 'zoom-reset')
                },
                {type: 'separator'},
                {
                    label: 'Toggle Full Screen',
                    accelerator: 'F11',
                    click: () => mainWindow.setFullScreen(!mainWindow.isFullScreen())
                },
                {type: 'separator'},
                {
                    label: 'Settings',
                    accelerator: 'CmdOrCtrl+,',
                    click: () => mainWindow.webContents.send('action', 'open-settings')
                },
            ],
        },
        {
            label: 'Edit',
            submenu: [
                {
                    label: 'Find in Document',
                    accelerator: 'CmdOrCtrl+F',
                    click: () => mainWindow.webContents.send('action', 'find')
                },
                {type: 'separator'},
                {label: 'Copy', role: 'copy'},
                {label: 'Select All', role: 'selectAll'},
            ],
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'Toggle DevTools',
                    accelerator: 'CmdOrCtrl+Shift+I',
                    click: () => mainWindow.webContents.toggleDevTools()
                },
            ],
        },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function openFileDialog() {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Open Markdown File',
        filters: [
            {name: 'Markdown', extensions: ['md', 'markdown', 'mdx', 'txt']},
            {name: 'All Files', extensions: ['*']},
        ],
        properties: ['openFile'],
    });
    if (!result.canceled && result.filePaths[0]) {
        openFile(result.filePaths[0]);
    }
}

async function openFolderDialog() {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Open Folder',
        properties: ['openDirectory'],
    });
    if (!result.canceled && result.filePaths[0]) {
        mainWindow.webContents.send('open-folder', result.filePaths[0]);
    }
}

async function pickChatContextFiles(startDir) {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Add Files to AI Chat Context',
        defaultPath: startDir || undefined,
        filters: [
            {name: 'Markdown & Text', extensions: ['md', 'markdown', 'mdx', 'txt']},
            {name: 'All Files', extensions: ['*']},
        ],
        properties: ['openFile', 'multiSelections'],
    });
    return result.canceled ? [] : (result.filePaths || []);
}

function suggestChatContextFiles(query, currentFilePath) {
    try {
        if (!currentFilePath || typeof currentFilePath !== 'string') return [];
        const baseDir = path.dirname(currentFilePath);
        const q = (query || '').trim();
        if (!q.startsWith('/')) return [];

        const partial = q.slice(1).replace(/\\/g, '/');
        let slashIdx = partial.lastIndexOf('/');
        let relDir = slashIdx >= 0 ? partial.slice(0, slashIdx + 1) : '';
        let namePrefix = slashIdx >= 0 ? partial.slice(slashIdx + 1) : partial;

        // Allow "/.." and "/a/.." to move to parent folder immediately.
        if (partial === '..' || partial.endsWith('/..')) {
            relDir = partial + '/';
            namePrefix = '';
        }

        const dirPath = path.resolve(baseDir, relDir || '.');
        const entries = fs.readdirSync(dirPath, {withFileTypes: true});
        return entries
            .filter(e => !e.name.startsWith('.') && e.name.toLowerCase().startsWith(namePrefix.toLowerCase()))
            .map(e => {
                const full = path.join(dirPath, e.name);
                const rel = '/' + path.relative(baseDir, full).replace(/\\/g, '/');
                if (e.isDirectory()) {
                    return {type: 'dir', path: full, relPath: rel + '/', name: e.name};
                }
                if (e.isFile()) {
                    return {type: 'file', path: full, relPath: rel, name: e.name};
                }
                return null;
            })
            .filter(Boolean)
            .sort((a, b) => {
                if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
                return a.relPath.localeCompare(b.relPath);
            })
            .slice(0, 60);
    } catch {
        return [];
    }
}

function openFile(filePath, opts = {}) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const html = renderDocumentHtml(content, filePath);
        const recents = addRecent(filePath);
        mainWindow.webContents.send('file-opened', {
            path: filePath,
            name: path.basename(filePath),
            content,
            html,
            recents,
            gotoLine: Number(opts.gotoLine) > 0 ? Number(opts.gotoLine) : null,
            gotoColumn: Number(opts.gotoColumn) > 0 ? Number(opts.gotoColumn) : null,
        });
        if (process.platform === 'darwin') mainWindow.setRepresentedFilename(filePath);
        return {ok: true, path: filePath, recents};
    } catch (err) {
        if (!opts.silentErrorDialog) dialog.showErrorBox('Error', `Could not open file:\n${err.message}`);
        return {ok: false, path: filePath, error: err.message, code: err.code || ''};
    }
}

// IPC handlers
ipcMain.handle('get-config', () => loadConfig());
ipcMain.handle('save-config', (_, cfg) => {
    saveConfig(cfg);
    return true;
});
ipcMain.handle('get-recents', () => loadRecents());
ipcMain.handle('open-file-dialog', () => openFileDialog());
ipcMain.handle('open-folder-dialog', () => openFolderDialog());
ipcMain.handle('pick-chat-context-files', (_, startDir) => pickChatContextFiles(startDir));
ipcMain.handle('suggest-chat-context-files', (_, query, currentFilePath) => suggestChatContextFiles(query, currentFilePath));
ipcMain.handle('read-file', (_, filePath) => {
    try {
        return {content: fs.readFileSync(filePath, 'utf8'), error: null};
    } catch (e) {
        return {content: null, error: e.message};
    }
});
ipcMain.handle('read-folder', (_, rootFolderPath, targetFolderPath) => {
    const MD_RE = /\.(md|markdown|mdx|txt)$/i;
    const rootPath = path.resolve(String(rootFolderPath || ''));
    const targetPath = path.resolve(String(targetFolderPath || rootPath));
    const rootCmp = process.platform === 'win32' ? rootPath.toLowerCase() : rootPath;
    const targetCmp = process.platform === 'win32' ? targetPath.toLowerCase() : targetPath;

    // Only allow browsing inside the selected root folder for this request.
    if (targetCmp !== rootCmp && !targetCmp.startsWith(rootCmp + path.sep)) {
        return [];
    }

    let entries;
    try {
        entries = fs.readdirSync(targetPath, {withFileTypes: true});
    } catch {
        return [];
    }

    const dirs = [];
    const files = [];
    for (const e of entries) {
        if (e.name.startsWith('.')) continue; // skip hidden
        const itemPath = path.join(targetPath, e.name);
        if (e.isDirectory()) {
            dirs.push({
                type: 'dir',
                name: e.name,
                path: itemPath
            });
            continue;
        }
        if (e.isFile()) {
            files.push({
                type: 'file',
                name: e.name,
                path: itemPath,
                markdown: MD_RE.test(e.name)
            });
        }
    }

    dirs.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));
    return [...dirs, ...files];
});
ipcMain.handle('add-recent', (_, filePath) => addRecent(filePath));
ipcMain.handle('remove-recent', (_, filePath) => {
    return removeRecentEntry(filePath);
});
ipcMain.handle('get-scroll-position', (_, filePath) => getScrollPosition(filePath));
ipcMain.handle('set-scroll-position', (_, filePath, previewScroll, editorScroll) => {
    setScrollPosition(filePath, previewScroll, editorScroll);
    return true;
});
ipcMain.handle('save-all-scroll-positions', (_, positions) => {
    // positions is an array of {path, previewScroll, editorScroll}
    try {
        const existing = loadScrollPositions();
        positions.forEach(pos => {
            if (pos.path) {
                existing[pos.path] = {
                    previewScroll: pos.previewScroll,
                    editorScroll: pos.editorScroll,
                    timestamp: Date.now()
                };
            }
        });
        saveScrollPositions(existing);
        return true;
    } catch (e) {
        return false;
    }
});
ipcMain.handle('window-minimize', () => mainWindow.minimize());
ipcMain.handle('window-maximize', () => {
    if (mainWindow.isMaximized()) mainWindow.restore(); else mainWindow.maximize();
});
ipcMain.handle('window-close', () => mainWindow.close());
ipcMain.handle('open-file-from-path', async (_, filePath, opts = {}) => {
    const res = openFile(filePath, {silentErrorDialog: true});
    if (res?.ok) return res;

    const fromRecent = Boolean(opts && opts.fromRecent);
    const missing = String(res?.code || '').toUpperCase() === 'ENOENT';
    if (fromRecent && missing) {
        const base = path.basename(String(filePath || ''));
        const prompt = await dialog.showMessageBox(mainWindow, {
            type: 'warning',
            buttons: ['Remove from Recents', 'Cancel'],
            defaultId: 0,
            cancelId: 1,
            message: `File not found: "${base}"`,
            detail: 'This item points to a file that no longer exists.',
        });
        if (prompt.response === 0) {
            const recents = removeRecentEntry(filePath);
            return {...res, missing: true, removedRecent: true, recents};
        }
        return {...res, missing: true, removedRecent: false};
    }

    dialog.showErrorBox('Error', `Could not open file:\n${res?.error || 'Unknown error'}`);
    return res;
});
ipcMain.handle('show-in-folder', (_, filePath) => shell.showItemInFolder(filePath));
ipcMain.handle('delete-item', async (_, filePath) => {
    const name = path.basename(filePath);
    const {response} = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        buttons: ['Move to Trash', 'Cancel'],
        defaultId: 1, cancelId: 1,
        message: `Delete "${name}"?`,
        detail: 'It will be moved to the Recycle Bin.',
    });
    if (response === 1) return false;
    await shell.trashItem(filePath);
    return true;
});
ipcMain.handle('create-file', (_, parentDir, name) => {
    const full = path.join(parentDir, name);
    if (!fs.existsSync(full)) fs.writeFileSync(full, '', 'utf8');
    return full;
});
ipcMain.handle('create-folder', (_, parentDir, name) => {
    const full = path.join(parentDir, name);
    fs.mkdirSync(full, {recursive: true});
    return full;
});
ipcMain.handle('rename-item', (_, itemPath, newName) => {
    try {
        const oldPath = String(itemPath || '');
        const nextName = String(newName || '').trim();
        if (!oldPath || !nextName) return {ok: false, error: 'invalid'};
        const parent = path.dirname(oldPath);
        const newPath = path.join(parent, nextName);
        if (oldPath === newPath) return {ok: true, path: oldPath};
        if (fs.existsSync(newPath)) return {ok: false, error: 'exists'};
        fs.renameSync(oldPath, newPath);

        const norm = p => process.platform === 'win32' ? String(p || '').toLowerCase() : String(p || '');
        const oldNorm = norm(oldPath);
        const oldPrefixNorm = oldNorm + path.sep;
        const remapPath = (p) => {
            const src = String(p || '');
            const srcNorm = norm(src);
            if (srcNorm === oldNorm) return newPath;
            if (srcNorm.startsWith(oldPrefixNorm)) return newPath + src.slice(oldPath.length);
            return src;
        };

        // Keep recents valid after file/folder renames.
        const recents = loadRecents().map(r => {
            const mapped = remapPath(r.path);
            if (mapped === r.path) return r;
            return {...r, path: mapped, name: path.basename(mapped)};
        });
        saveRecents(recents);

        // Keep per-doc chat history keys aligned with new path.
        const cfg = loadConfig();
        if (cfg.chatHistories && typeof cfg.chatHistories === 'object') {
            const nextHistories = {};
            Object.keys(cfg.chatHistories).forEach(k => {
                nextHistories[remapPath(k)] = cfg.chatHistories[k];
            });
            cfg.chatHistories = nextHistories;
            saveConfig(cfg);
        }

        // Keep scroll positions aligned too.
        const scroll = loadScrollPositions();
        const nextScroll = {};
        Object.keys(scroll || {}).forEach(k => {
            nextScroll[remapPath(k)] = scroll[k];
        });
        saveScrollPositions(nextScroll);

        return {ok: true, path: newPath};
    } catch (e) {
        return {ok: false, error: e.message || 'rename-failed'};
    }
});
ipcMain.handle('get-platform', () => process.platform);
ipcMain.handle('print', () => mainWindow.webContents.print({silent: false, printBackground: true}));
ipcMain.handle('get-home', () => os.homedir());
ipcMain.handle('get-pending-file', () => {
    const f = pendingLaunchFile;
    pendingLaunchFile = null;
    return f;
});

ipcMain.handle('handle-link', (_, href, currentFilePath) => {
    const rawHref = decodeURIComponent(String(href || ''));
    const isWindowsAbsPath = /^[A-Za-z]:[\\/]/.test(rawHref);

    // Any scheme URL (http, https, mailto, ftp, ...) -> system default browser/handler
    if (!isWindowsAbsPath && /^[a-z][a-z0-9+\-.]*:/i.test(rawHref)) {
        shell.openExternal(rawHref);
        return;
    }

    // Support markdown links with line suffix: path/to/file.mdx:81 or file.md:81:5
    const mdLineMatch = rawHref.match(/^(.*\.(?:md|markdown|mdx)):(\d+)(?::(\d+))?$/i);
    const linkPath = mdLineMatch ? mdLineMatch[1] : rawHref;
    const gotoLine = mdLineMatch ? Number(mdLineMatch[2]) : null;
    const gotoColumn = mdLineMatch && mdLineMatch[3] ? Number(mdLineMatch[3]) : null;

    // Resolve relative path against the directory of the current file
    const base = currentFilePath ? path.dirname(currentFilePath) : app.getPath('home');
    const resolved = path.resolve(base, linkPath);

    // Markdown file -> open in a new tab inside Mandy
    if (/\.(md|markdown|mdx)$/i.test(resolved)) {
        openFile(resolved, {gotoLine, gotoColumn});
    } else {
        // Any other file -> system default application
        shell.openPath(resolved);
    }
});

ipcMain.handle('save-file', (_, filePath, content) => {
    try {
        fs.writeFileSync(filePath, content, 'utf8');
        return {ok: true};
    } catch (e) {
        return {ok: false, error: e.message};
    }
});

ipcMain.handle('show-save-dialog', async (_, opts) => {
    return dialog.showSaveDialog(mainWindow, {
        title: 'Save Markdown File',
        defaultPath: (opts && opts.defaultPath) || 'untitled.md',
        filters: [
            {name: 'Markdown', extensions: ['md', 'markdown', 'mdx']},
            {name: 'Text', extensions: ['txt']},
            {name: 'All Files', extensions: ['*']},
        ],
    });
});

ipcMain.handle('show-unsaved-dialog', async (_, dlg) => {
    const result = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        title: dlg.title,
        message: dlg.message,
        detail: dlg.detail,
        buttons: dlg.buttons,
        defaultId: 0,
        cancelId: 2,
    });
    return result.response; // 0=Save, 1=Don't Save, 2=Cancel
});

ipcMain.handle('render-markdown', (_, content, filePath) => {
    try {
        return renderDocumentHtml(content, filePath);
    } catch (e) {
        return `<pre>${escapeHtml(content)}</pre>`;
    }
});

ipcMain.handle('get-hljs-theme-css', (_, theme) => {
    try {
        const p = path.join(__dirname, 'node_modules', 'highlight.js', 'styles', `${theme}.min.css`);
        return fs.existsSync(p)
            ? fs.readFileSync(p, 'utf8')
            : fs.readFileSync(path.join(__dirname, 'node_modules', 'highlight.js', 'styles', 'github-dark.min.css'), 'utf8');
    } catch {
        return '';
    }
});

// ---- AI Chat (OpenAI Agents SDK) ----
const agentChatService = new AgentChatService();
let chatPermissionSeq = 0;
const pendingChatPermissions = new Map();
const queuedChatPermissions = [];
let activeChatPermissionId = null;
let sessionAutoApprove = false;

function pumpChatPermissionQueue() {
    if (activeChatPermissionId) return;
    while (queuedChatPermissions.length > 0) {
        const nextId = queuedChatPermissions[0];
        const pending = pendingChatPermissions.get(nextId);
        if (!pending) {
            queuedChatPermissions.shift();
            continue;
        }
        activeChatPermissionId = nextId;
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('ai-chat-permission-request', {
                id: nextId,
                details: pending.details || {},
            });
        }
        return;
    }
}

function resolveChatPermission(id, approved, reason = 'user', opts = {}) {
    const pending = pendingChatPermissions.get(id);
    if (!pending) return false;
    pendingChatPermissions.delete(id);
    const queueIdx = queuedChatPermissions.indexOf(id);
    if (queueIdx >= 0) queuedChatPermissions.splice(queueIdx, 1);
    if (activeChatPermissionId === id) activeChatPermissionId = null;
    clearTimeout(pending.timer);
    try {
        pending.resolve(Boolean(approved));
    } catch {
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ai-chat-permission-resolved', {
            id,
            approved: Boolean(approved),
            reason,
        });
    }
    if (!opts.skipPump) pumpChatPermissionQueue();
    return true;
}

function rejectAllPendingChatPermissions(reason = 'cancelled') {
    activeChatPermissionId = null;
    queuedChatPermissions.length = 0;
    const ids = Array.from(pendingChatPermissions.keys());
    ids.forEach(id => resolveChatPermission(id, false, reason, {skipPump: true}));
}

ipcMain.handle('ai-chat', async (_, messages, fileContext) => {
    const cfg = loadConfig();
    try {
        await agentChatService.send({
            config: cfg,
            messages,
            fileContext,
            requestWriteApproval: async details => {
                if (sessionAutoApprove === true) {
                    const id = `perm_${Date.now()}_${++chatPermissionSeq}`;
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('ai-chat-permission-request', {
                            id,
                            details: details || {},
                        });
                        mainWindow.webContents.send('ai-chat-permission-resolved', {
                            id,
                            approved: true,
                            reason: 'auto',
                        });
                    }
                    return true;
                }
                const id = `perm_${Date.now()}_${++chatPermissionSeq}`;
                return new Promise(resolve => {
                    const timer = setTimeout(() => {
                        resolveChatPermission(id, false, 'timeout');
                    }, 120000);
                    pendingChatPermissions.set(id, {resolve, timer, details: details || {}});
                    queuedChatPermissions.push(id);
                    pumpChatPermissionQueue();
                });
            },
            onFileMutated: filePath => {
                mainWindow.webContents.send('agent-file-mutated', {path: filePath});
            },
            onChunk: delta => mainWindow.webContents.send('ai-chat-chunk', delta),
            onDone: () => {
                rejectAllPendingChatPermissions('cancelled');
                mainWindow.webContents.send('ai-chat-done');
            },
            onError: msg => {
                rejectAllPendingChatPermissions('cancelled');
                mainWindow.webContents.send('ai-chat-error', msg);
            },
        });
    } catch (err) {
        rejectAllPendingChatPermissions('cancelled');
        mainWindow.webContents.send('ai-chat-error', err?.message || String(err));
    }
});

ipcMain.handle('ai-chat-cancel', () => {
    agentChatService.cancel();
    rejectAllPendingChatPermissions('cancelled');
});

ipcMain.handle('ai-chat-permission-response', (_, id, approved) => {
    return {ok: resolveChatPermission(String(id || ''), Boolean(approved), 'user')};
});

ipcMain.handle('ai-chat-set-session-auto-approve', (_, enabled) => {
    sessionAutoApprove = Boolean(enabled);
    return {ok: true, enabled: sessionAutoApprove};
});

ipcMain.handle('ai-chat-get-session-auto-approve', () => {
    return {ok: true, enabled: sessionAutoApprove};
});

// File watcher
let watcher = null;
ipcMain.handle('watch-file', (_, filePath) => {
    if (watcher) {
        try {
            watcher.close();
        } catch {
        }
    }
    if (!filePath) return;
    try {
        watcher = fs.watch(filePath, () => {
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                const html = renderDocumentHtml(content, filePath);
                mainWindow.webContents.send('file-changed', {content, html});
            } catch {
            }
        });
    } catch {
    }
});

// Single-instance lock — forward file-open attempts to the existing window
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', (_, argv) => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
        const fileArg = argv.find(arg => !arg.startsWith('-') && /\.(md|markdown|mdx|txt)$/i.test(arg) && fs.existsSync(arg));
        if (fileArg) openFile(fileArg);
    });
    app.whenReady().then(createWindow);
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.on('open-file', (e, filePath) => {
    e.preventDefault();
    if (mainWindow) openFile(filePath);
});


