<div align="center">

<img src="assets/icon.png" width="96" alt="Mandy logo" />

# Mandy

A desktop Markdown + text reader/editor for Windows, with a strong AI Chat workflow for document-based Q&A.

[![License: MIT](https://img.shields.io/badge/license-MIT-amber?style=flat-square)](LICENSE)
[![Platform: Windows](https://img.shields.io/badge/platform-Windows-blue?style=flat-square&logo=windows)](https://github.com/NooberCong/mandy/releases)
[![Electron](https://img.shields.io/badge/Electron-33-47848f?style=flat-square&logo=electron)](https://www.electronjs.org)

</div>

## Highlights
- AI Chat integrated directly in-app with streaming responses and Markdown rendering.
- Ask AI from selected text in preview/editor context menu.
- Chat context files: add files with `/` path suggestions or file picker; remove context files from chips.
- Conversation history per document (up to 5), continue old conversations, remove history items.
- Multi-tab reader/editor with drag-reorder, horizontal overflow controls, and duplicate-name disambiguation.
- Folder tree actions (new file, new folder, delete) and refresh button.
- Works with Markdown and `.txt` files.

## AI Chat Features
- Configurable API URL, API key, and model (preset picker + custom value).
- Context-aware prompts using the active document plus optional extra files.
- Real-time streaming output with smart incremental formatting.
- Error cards with user-friendly messages and direct "Open AI Settings" action.
- Resizable chat panel and history menu.
- Typography in chat follows app font-size settings.

## Editor and Reading
- Preview / Split / Edit modes.
- Syntax-highlighted code blocks with copy button.
- Find in document and find in editor.
- Table of contents, recents, folder browser.
- Theme, palette, typography, line-height, and content-width settings.

## Internationalization
Supported languages:
- English (`en`)
- Spanish (`es`)
- French (`fr`)
- German (`de`)
- Portuguese (`pt`)
- Japanese (`ja`)
- Chinese (`zh`)
- Vietnamese (`vn`)

## Screenshots
Add your screenshots under `docs/screenshots/` and keep/update refs below.

- Main window: `docs/screenshots/dark-preview.png`
- Welcome: `docs/screenshots/welcome.png`
- Split view: `docs/screenshots/split-view.png`
- Settings: `docs/screenshots/settings.png`
- Folder browser: `docs/screenshots/folder-browser.png`
- AI Chat panel: `docs/screenshots/chat-panel.png`
- AI Chat history: `docs/screenshots/chat-history.png`

## Development
Prerequisites:
- Node.js 18+
- npm

Run locally:
```bash
git clone https://github.com/NooberCong/mandy.git
cd mandy
npm install
node scripts/create-icon.js
npm start
```

Build:
```bash
npm run build
```

## License
MIT
