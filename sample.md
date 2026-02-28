# Mandy — A Markdown Viewer

A beautiful, configurable Markdown reader built with Electron.

## Features

- **Elegant UI** with dark, light, and sepia themes
- **Syntax highlighted code** blocks with one-click copy
- **Table of contents** with scroll-spy navigation
- **Recent files** panel with timestamps
- **Folder browser** for markdown directories
- **Find in document** with match highlighting
- **Live reload** on file change
- **Focus mode** for distraction-free reading
- **Configurable** typography, width, and reading options
- **Drag & drop** file support
- **Print** with print-optimized styles

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+O` | Open file |
| `Ctrl+F` | Find in document |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+,` | Settings |
| `Ctrl+=` | Zoom in |
| `Ctrl+-` | Zoom out |
| `Ctrl+0` | Reset zoom |
| `Ctrl+Shift+F` | Focus mode |
| `F11` | Full screen |
| `Escape` | Close panel |

## Typography

The viewer uses **Playfair Display** for headings and **Crimson Pro** for body text — a refined editorial pairing that makes long documents comfortable to read.

> "Typography is the craft of endowing human language with a durable visual form."
> — Robert Bringhurst

## Code Example

```
// Fibonacci with memoization
function fib(n, memo = {}) {
  if (n in memo) return memo[n];
  if (n <= 1) return n;
  return memo[n] = fib(n - 1, memo) + fib(n - 2, memo);
}

console.log(fib(50)); // 12586269025
```

```
# Quick sort in Python
def quicksort(arr):
    if len(arr) <= 1:
        return arr
    pivot = arr[len(arr) // 2]
    left = [x for x in arr if x < pivot]
    mid = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    return quicksort(left) + mid + quicksort(right)
```

```
# Start the viewer
npm start

# Open a specific file
electron . path/to/file.md
```

## Configuration

All settings are saved automatically in your user data directory:

- **Theme**: Dark / Light / Sepia
- **Font Family**: Serif (Crimson Pro) / Sans-serif (DM Sans) / Monospace (JetBrains Mono)
- **Font Size**: 12px – 28px
- **Line Height**: 1.2 – 2.4
- **Content Width**: 480px – 1200px
- **Code Theme**: 9 syntax highlighting themes
- **Live Reload**: Auto-refresh when file changes on disk

## Task Lists

- [x] Open markdown files
- [x] Syntax highlighted code blocks
- [x] Table of contents
- [x] Find in document
- [x] Drag and drop
- [x] Settings panel
- [x] Recent files
- [ ] Tabs for multiple files
- [ ] Export to PDF

## Inline formatting

You can write **bold**, *italic*, ~~strikethrough~~, and `inline code`.

Links like [this one](https://github.com) open in your default browser.

---

Mandy was built with Electron, marked.js, and highlight.js.
