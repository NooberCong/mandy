# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

Mandy is a desktop Markdown reader and editor built with Electron 33 and vanilla JavaScript (no framework). It targets Windows only. Markdown is rendered in the main process using `marked` 13 with `highlight.js` 11 for syntax highlighting; the renderer process receives pre-rendered HTML over IPC.

## Build & Run Commands

- `npm install` — install dependencies
- `node scripts/create-icon.js` — generate `assets/icon.ico` and `assets/icon.png` (run once before first build)
- `npm start` — launch the app (`electron .`)
- `npm run dev` — launch with `--dev` flag
- `npm run build` — build all Windows targets (NSIS installer, portable, zip) to `dist/`
- `npm run build:installer` — build only the NSIS installer
- `npm run build:portable` — build only the portable executable

There is no test suite, linter, or type checker configured in this project.

## Release Process

Tag a commit with a semver tag (e.g. `v1.3.2`) and push. The GitHub Actions workflow `.github/workflows/release.yml` builds on `windows-latest` and publishes installers via `softprops/action-gh-release`.

## Architecture

### Process Model (Electron)

The app uses a standard Electron two-process architecture with `contextIsolation: true` and `nodeIntegration: false`:

- **Main process** (`main.js`): Owns the `BrowserWindow`, native menus, file system access, file watching (`fs.watch`), dialogs, and Markdown rendering. All file I/O and `marked.parse()` + `hljs.highlight()` happen here.
- **Preload** (`preload.js`): Exposes the `window.mandy` API via `contextBridge`. Every main-process capability the renderer needs goes through an `ipcRenderer.invoke()` or `ipcRenderer.on()` call defined here. Adding a new IPC channel requires updating both `main.js` (handler) and `preload.js` (bridge).
- **Renderer process** (`renderer/renderer.js`): ~2500 lines of vanilla JS in a single file. Contains all UI logic: tab management, view modes (preview/split/edit), sidebar (recents, folder tree, TOC), settings panel, find-in-document, drag-and-drop, keyboard shortcuts, editor formatting, scroll sync, and i18n.

### Markdown Pipeline

Markdown content flows: `fs.readFileSync` → `marked.parse()` → `enhanceCodeBlocks()` (adds hljs highlighting + copy button) → `resolveLocalPaths()` (rewrites relative image src to `file://` URLs) → HTML sent to renderer via IPC `file-opened` event.

In the renderer, the HTML is set via `innerHTML` on `#md-content`, then `addHeadingIds()` generates slug-based IDs and `buildTOC()` builds the outline sidebar.

### State & Persistence

All persistent state is stored as JSON files in Electron's `userData` directory:
- `config.json` — user settings (theme, font, palette, language, etc.). Defaults defined in `DEFAULT_CONFIG` in `main.js`.
- `recents.json` — last 20 opened files.
- `winstate.json` — window dimensions and maximized state.
- `scroll-positions.json` — per-file scroll positions (capped at 100 entries).

### Tab System

Tabs are managed as an in-memory array (`tabs[]`) in `renderer.js`. Each tab stores its own file path, content, rendered HTML, cursor position, scroll positions, view mode, and unsaved state. `saveActiveTabState()` snapshots DOM state back into the tab object before switching; `activateTab()` restores it.

### Internationalization

All UI strings live in the `LOCALES` object at the top of `renderer.js` (7 languages: en, es, fr, de, pt, ja, zh). HTML elements use `data-i18n`, `data-i18n-placeholder`, and `data-i18n-title` attributes. The `t(key)` function resolves strings, with English as fallback. When adding new UI text, add the key to all locale objects.

### Theming & Styling

`renderer/styles.css` uses CSS custom properties (`--font-size`, `--line-height`, `--content-width`, `--sidebar-w`) set dynamically from JS. Themes are toggled via `body[data-theme="dark|light|sepia"]`, accent palettes via `body[data-palette="..."]`, and font families via `body[data-font="serif|sans|mono"]`.

### Editor Scroll Sync (Split View)

Split view uses anchor-based scroll synchronization (`buildScrollAnchors()` in `renderer.js`). ATX headings in the editor source are matched to rendered headings in the preview. A hidden mirror `<div>` with identical styling measures the pixel offset of each heading to handle word-wrapping accurately, then piecewise linear interpolation maps scroll positions between the two panes.

### Key Code Patterns

- DOM queries use `$()` / `$$()` shorthands defined in `renderer.js` (line ~368).
- Editor mutations use `document.execCommand('insertText')` to integrate with the native undo stack.
- The app enforces single-instance mode via `app.requestSingleInstanceLock()`.
- The custom frameless titlebar with window controls is in `index.html`; macOS traffic lights are hidden and replaced by padding detection in `detectPlatform()`.
