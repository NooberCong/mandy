const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const ALLOWED_TEXT_EXTENSIONS = new Set([
    '.md',
    '.markdown',
    '.mdx',
    '.txt',
    '.text',
    '.json',
    '.jsonc',
    '.yaml',
    '.yml',
    '.toml',
    '.ini',
    '.cfg',
    '.conf',
    '.xml',
    '.csv',
    '.tsv',
    '.log',
    '.js',
    '.mjs',
    '.cjs',
    '.ts',
    '.tsx',
    '.jsx',
    '.vue',
    '.svelte',
    '.astro',
    '.css',
    '.scss',
    '.less',
    '.html',
    '.htm',
    '.py',
    '.rb',
    '.go',
    '.rs',
    '.java',
    '.kt',
    '.cs',
    '.cpp',
    '.cc',
    '.cxx',
    '.c',
    '.h',
    '.hpp',
    '.php',
    '.swift',
    '.dart',
    '.r',
    '.lua',
    '.pl',
    '.sql',
    '.proto',
    '.gradle',
    '.kts',
    '.cmake',
    '.mk',
    '.make',
    '.sh',
    '.bash',
    '.ps1',
    '.bat',
    '.cmd',
    '.dockerfile',
    '.env',
    '.gitignore',
    '.gitattributes',
]);
const MAX_READ_BYTES = 2 * 1024 * 1024;
const MAX_CONTEXT_CHARS_PER_FILE = 20_000;
const MAX_CONTEXT_FILES = 12;
const MAX_LIST_RESULTS = 200;
const MAX_TOOL_CONTENT_CHARS = 250_000;
const MAX_SEARCH_MATCHES = 300;
const MAX_DIFF_REGION_LINES_FOR_LCS = 240;
const MAX_DIFF_PREVIEW_ROWS = 500;

function normalizeBaseUrl(rawUrl) {
    const parsed = new URL((rawUrl || '').trim());
    parsed.hash = '';
    parsed.search = '';
    const cleanPath = parsed.pathname.replace(/\/+$/, '');
    parsed.pathname = cleanPath === '' ? '/v1' : cleanPath;
    return parsed.toString().replace(/\/+$/, '');
}

function shouldUseResponses(baseUrl) {
    try {
        const host = new URL(baseUrl).hostname.toLowerCase();
        return host === 'api.openai.com' || host.endsWith('.openai.com');
    } catch {
        return true;
    }
}

function isPathInside(parentPath, candidatePath) {
    const parent = path.resolve(parentPath);
    const candidate = path.resolve(candidatePath);
    if (parent === candidate) return true;
    return candidate.startsWith(parent + path.sep);
}

function realpathOrResolved(targetPath) {
    try {
        return fs.realpathSync.native(targetPath);
    } catch {
        return path.resolve(targetPath);
    }
}

function ensureAllowedTextPath(filePath) {
    const ext = path.extname(filePath || '').toLowerCase();
    const base = path.basename(filePath || '').toLowerCase();
    const byName =
        base === 'dockerfile' ||
        base === 'makefile' ||
        base === '.env' ||
        base === '.gitignore' ||
        base === '.gitattributes';
    if (!byName && !ALLOWED_TEXT_EXTENSIONS.has(ext)) {
        throw new Error(`Unsupported file extension "${ext || '(none)'}" for text tools.`);
    }
}

function ensureWithinRoots(filePath, roots) {
    if (!Array.isArray(roots) || roots.length === 0) {
        throw new Error('No file roots are available for this chat request.');
    }
    const targetForCheck = fs.existsSync(filePath)
        ? realpathOrResolved(filePath)
        : path.join(realpathOrResolved(path.dirname(filePath)), path.basename(filePath));
    const canonicalRoots = roots.map(root => realpathOrResolved(root));

    if (!canonicalRoots.some(root => isPathInside(root, targetForCheck))) {
        throw new Error('Path is outside allowed roots for this chat.');
    }
}

function resolveFilePath(inputPath, baseDir) {
    const raw = String(inputPath || '').trim();
    if (!raw) throw new Error('Path is required.');

    let normalized = raw;
    if (raw.startsWith('~')) {
        normalized = path.join(os.homedir(), raw.slice(1));
    }
    return path.isAbsolute(normalized)
        ? path.normalize(normalized)
        : path.resolve(baseDir || os.homedir(), normalized);
}

function safeReadText(filePath) {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) throw new Error('Target path is not a file.');
    if (stat.size > MAX_READ_BYTES) {
        throw new Error(`File is too large (${stat.size} bytes). Max supported size is ${MAX_READ_BYTES} bytes.`);
    }
    return fs.readFileSync(filePath, 'utf8');
}

function writeFileAtomic(filePath, content) {
    const dir = path.dirname(filePath);
    const tmpPath = path.join(dir, `.${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}`);
    fs.writeFileSync(tmpPath, content, 'utf8');
    fs.renameSync(tmpPath, filePath);
}

function buildPreviewDiffRows(beforeText, afterText) {
    const beforeLines = String(beforeText || '').replace(/\r\n/g, '\n').split('\n');
    const afterLines = String(afterText || '').replace(/\r\n/g, '\n').split('\n');

    let prefix = 0;
    const minLen = Math.min(beforeLines.length, afterLines.length);
    while (prefix < minLen && beforeLines[prefix] === afterLines[prefix]) prefix += 1;

    let suffix = 0;
    while (
        suffix < (beforeLines.length - prefix) &&
        suffix < (afterLines.length - prefix) &&
        beforeLines[beforeLines.length - 1 - suffix] === afterLines[afterLines.length - 1 - suffix]
    ) {
        suffix += 1;
    }

    const beforeMid = beforeLines.slice(prefix, beforeLines.length - suffix);
    const afterMid = afterLines.slice(prefix, afterLines.length - suffix);
    if (beforeMid.length === 0 && afterMid.length === 0) return [];

    const out = [];
    const push = (kind, text, oldLine = null, newLine = null) => {
        if (out.length >= MAX_DIFF_PREVIEW_ROWS) return;
        out.push({kind, text: String(text ?? ''), oldLine, newLine});
    };

    // For small changed regions, use LCS to avoid "whole file changed" noise from shifted lines.
    if (beforeMid.length <= MAX_DIFF_REGION_LINES_FOR_LCS && afterMid.length <= MAX_DIFF_REGION_LINES_FOR_LCS) {
        const n = beforeMid.length;
        const m = afterMid.length;
        const dp = Array.from({length: n + 1}, () => new Uint16Array(m + 1));
        for (let i = n - 1; i >= 0; i -= 1) {
            for (let j = m - 1; j >= 0; j -= 1) {
                if (beforeMid[i] === afterMid[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
                else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
            }
        }
        let i = 0;
        let j = 0;
        while (i < n && j < m && out.length < MAX_DIFF_PREVIEW_ROWS) {
            if (beforeMid[i] === afterMid[j]) {
                i += 1;
                j += 1;
            } else if (dp[i + 1][j] >= dp[i][j + 1]) {
                push('del', beforeMid[i], prefix + i + 1, null);
                i += 1;
            } else {
                push('add', afterMid[j], null, prefix + j + 1);
                j += 1;
            }
        }
        while (i < n && out.length < MAX_DIFF_PREVIEW_ROWS) {
            push('del', beforeMid[i], prefix + i + 1, null);
            i += 1;
        }
        while (j < m && out.length < MAX_DIFF_PREVIEW_ROWS) {
            push('add', afterMid[j], null, prefix + j + 1);
            j += 1;
        }
    } else {
        // Fallback for large regions: show only changed middle bands, not entire file.
        beforeMid.forEach((line, idx) => push('del', line, prefix + idx + 1, null));
        afterMid.forEach((line, idx) => push('add', line, null, prefix + idx + 1));
    }

    if (out.length >= MAX_DIFF_PREVIEW_ROWS) {
        out.push({kind: 'meta', text: '... (diff preview truncated)', oldLine: null, newLine: null});
    }
    return out;
}

function looksLikeAssistantMessage(content) {
    const text = String(content || '').trim();
    if (!text) return false;
    const head = text.slice(0, 600).toLowerCase();
    const patterns = [
        /\bwould you like me to proceed\b/,
        /\blet me know if (you|i)\b/,
        /\bi can (also |help|update|apply)\b/,
        /\bi('| a)m (going to|ready to|able to)\b/,
        /\bhere(?:'s| is) (what|the update|the change)\b/,
        /\bsummary\b[:]/,
        /\bnext steps?\b[:]/,
    ];
    return patterns.some(p => p.test(head));
}

function extractSingleFencedBlock(content) {
    const raw = String(content || '').replace(/\r\n/g, '\n');
    const trimmed = raw.trim();
    const fenceRe = /^```[^\n]*\n([\s\S]*?)\n```$/;
    const m = trimmed.match(fenceRe);
    if (!m) return null;
    return m[1];
}

function normalizeWriteContent(rawContent) {
    const raw = String(rawContent ?? '');
    const fenced = extractSingleFencedBlock(raw);
    return fenced !== null ? fenced : raw;
}

function hashText(text) {
    return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

function buildConversationInput(messages, fileContext) {
    const transcript = (Array.isArray(messages) ? messages : [])
        .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .map(m => `${m.role.toUpperCase()}:\n${m.content.trim()}`)
        .join('\n\n');

    const contextFiles = [];
    if (fileContext && Array.isArray(fileContext.files)) {
        for (const f of fileContext.files) {
            if (!f || !f.path || typeof f.content !== 'string') continue;
            contextFiles.push({
                path: f.path,
                name: f.name || path.basename(f.path),
                content: f.content.slice(0, MAX_CONTEXT_CHARS_PER_FILE),
                truncated: f.content.length > MAX_CONTEXT_CHARS_PER_FILE,
            });
            if (contextFiles.length >= MAX_CONTEXT_FILES) break;
        }
    }

    const contextBlock = contextFiles.length === 0
        ? 'No file context was provided by the UI for this turn.'
        : contextFiles.map((f, idx) => (
            `Context file ${idx + 1}: ${f.name}\n` +
            `Path: ${f.path}\n` +
            `${f.truncated ? '(truncated)\n' : ''}` +
            `---\n${f.content}`
        )).join('\n\n');

    const workingDir = fileContext?.workingDir ? path.resolve(fileContext.workingDir) : '';

    return [
        'Conversation transcript:',
        transcript || '(empty transcript)',
        '',
        `Working directory: ${workingDir || '(not provided)'}`,
        '',
        'Editor-provided context files:',
        contextBlock,
        '',
        'Important: editor-provided context may be truncated; use tools to read full files before whole-file edits.',
        'Respond to the latest user request. Use tools when you need to inspect or modify files on disk.',
    ].join('\n');
}

function buildFilePolicy(fileContext, options = {}) {
    const files = Array.isArray(fileContext?.files) ? fileContext.files : [];
    const filePaths = files
        .map(f => (f && typeof f.path === 'string' ? f.path : ''))
        .filter(Boolean)
        .map(p => path.resolve(p));

    const roots = new Set();
    for (const p of filePaths) roots.add(path.dirname(p));
    if (fileContext?.primaryPath) roots.add(path.dirname(path.resolve(fileContext.primaryPath)));
    const workingDir = fileContext?.workingDir ? path.resolve(fileContext.workingDir) : '';
    if (workingDir) roots.add(workingDir);
    if (roots.size === 0) roots.add(os.homedir());

    const primaryPath = fileContext?.primaryPath ? path.resolve(fileContext.primaryPath) : (filePaths[0] || '');
    const baseDir = workingDir || (primaryPath ? path.dirname(primaryPath) : Array.from(roots)[0]);
    const latestUserPrompt = String(options.latestUserPrompt || '').toLowerCase();
    const allowAppend = /\bappend\b|\badd to (the )?end\b|\bat end\b|\bappend to\b/.test(latestUserPrompt);
    return {
        baseDir,
        workingDir,
        primaryPath,
        roots: Array.from(roots),
        allowAppend,
        requestWriteApproval: typeof options.requestWriteApproval === 'function' ? options.requestWriteApproval : null,
        onFileMutated: typeof options.onFileMutated === 'function' ? options.onFileMutated : null,
    };
}

function buildFileTools(agents, policy) {
    const {tool} = agents;
    const observedHashes = new Map();
    const fileKey = filePath => path.resolve(filePath).toLowerCase();
    const rememberObserved = (filePath, text) => {
        observedHashes.set(fileKey(filePath), hashText(text));
    };
    const getObserved = filePath => observedHashes.get(fileKey(filePath));
    const listFiles = (dirPath, recursive, limit, out) => {
        const entries = fs.readdirSync(dirPath, {withFileTypes: true});
        for (const entry of entries) {
            if (out.length >= limit) break;
            const abs = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                if (recursive) listFiles(abs, recursive, limit, out);
                continue;
            }
            const ext = path.extname(entry.name).toLowerCase();
            if (ALLOWED_TEXT_EXTENSIONS.has(ext)) out.push(abs);
        }
    };

    return [
        tool({
            name: 'list_directory',
            description: 'List directory entries (folders and files) inside allowed roots. Defaults to current working directory.',
            strict: false,
            parameters: {
                type: 'object',
                properties: {
                    directory: {type: 'string'},
                    recursive: {type: 'boolean'},
                    limit: {type: 'integer', minimum: 1, maximum: MAX_LIST_RESULTS},
                },
                required: [],
                additionalProperties: false,
            },
            execute: ({directory, recursive = false, limit = 100} = {}) => {
                const dirPath = resolveFilePath(directory || '.', policy.baseDir);
                ensureWithinRoots(dirPath, policy.roots);
                if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
                    throw new Error('Directory does not exist.');
                }

                const max = Math.min(MAX_LIST_RESULTS, Number(limit) || 100);
                const out = [];
                const walk = (base) => {
                    const entries = fs.readdirSync(base, {withFileTypes: true});
                    for (const entry of entries) {
                        if (out.length >= max) break;
                        if (entry.name.startsWith('.')) continue;
                        const abs = path.join(base, entry.name);
                        const type = entry.isDirectory() ? 'dir' : (entry.isFile() ? 'file' : 'other');
                        out.push({
                            type,
                            name: entry.name,
                            path: abs,
                            ext: type === 'file' ? path.extname(entry.name).toLowerCase() : '',
                        });
                        if (recursive && entry.isDirectory()) walk(abs);
                    }
                };
                walk(dirPath);
                return JSON.stringify({directory: dirPath, recursive: Boolean(recursive), count: out.length, entries: out});
            },
        }),
        tool({
            name: 'search_text_in_files',
            description: 'Search text/markdown files for a string or regex pattern under a directory (defaults to working directory).',
            strict: false,
            parameters: {
                type: 'object',
                properties: {
                    directory: {type: 'string'},
                    pattern: {type: 'string'},
                    useRegex: {type: 'boolean'},
                    caseSensitive: {type: 'boolean'},
                    recursive: {type: 'boolean'},
                    fileLimit: {type: 'integer', minimum: 1, maximum: MAX_LIST_RESULTS},
                    matchLimit: {type: 'integer', minimum: 1, maximum: MAX_SEARCH_MATCHES},
                },
                required: ['pattern'],
                additionalProperties: false,
            },
            execute: ({
                directory,
                pattern,
                useRegex = false,
                caseSensitive = false,
                recursive = true,
                fileLimit = 120,
                matchLimit = 120,
            }) => {
                const dirPath = resolveFilePath(directory || '.', policy.baseDir);
                ensureWithinRoots(dirPath, policy.roots);
                if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
                    throw new Error('Directory does not exist.');
                }
                const query = String(pattern || '');
                if (!query) throw new Error('Pattern is required.');

                const files = [];
                listFiles(dirPath, Boolean(recursive), Math.min(MAX_LIST_RESULTS, Number(fileLimit) || 120), files);
                const regex = (() => {
                    if (useRegex) return new RegExp(query, `${caseSensitive ? 'g' : 'gi'}m`);
                    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    return new RegExp(escaped, caseSensitive ? 'g' : 'gi');
                })();

                const maxMatches = Math.min(MAX_SEARCH_MATCHES, Number(matchLimit) || 120);
                const matches = [];

                for (const filePath of files) {
                    if (matches.length >= maxMatches) break;
                    let text = '';
                    try {
                        text = safeReadText(filePath);
                    } catch {
                        continue;
                    }
                    const lines = text.split(/\r?\n/);
                    for (let i = 0; i < lines.length; i += 1) {
                        regex.lastIndex = 0;
                        if (!regex.test(lines[i])) continue;
                        matches.push({
                            path: filePath,
                            line: i + 1,
                            preview: lines[i].slice(0, 300),
                        });
                        if (matches.length >= maxMatches) break;
                    }
                }

                return JSON.stringify({
                    directory: dirPath,
                    searchedFiles: files.length,
                    pattern: query,
                    useRegex: Boolean(useRegex),
                    caseSensitive: Boolean(caseSensitive),
                    matches,
                    truncated: matches.length >= maxMatches,
                });
            },
        }),
        tool({
            name: 'read_text_file',
            description: 'Read UTF-8 markdown/text file content. Supports optional line ranges.',
            strict: false,
            parameters: {
                type: 'object',
                properties: {
                    path: {type: 'string', description: 'Absolute or relative file path.'},
                    startLine: {type: 'integer', minimum: 1},
                    endLine: {type: 'integer', minimum: 1},
                },
                required: ['path'],
                additionalProperties: false,
            },
            execute: ({path: inputPath, startLine, endLine}) => {
                const target = resolveFilePath(inputPath, policy.baseDir);
                ensureAllowedTextPath(target);
                ensureWithinRoots(target, policy.roots);
                const text = safeReadText(target);
                rememberObserved(target, text);
                const lines = text.split(/\r?\n/);
                const from = Math.max(1, Number(startLine) || 1);
                const to = Math.max(from, Math.min(lines.length, Number(endLine) || lines.length));
                return JSON.stringify({
                    path: target,
                    lineCount: lines.length,
                    startLine: from,
                    endLine: to,
                    content: lines.slice(from - 1, to).join('\n'),
                });
            },
        }),
        tool({
            name: 'list_text_files',
            description: 'List markdown/text files under a directory inside allowed roots. Defaults to current working directory.',
            strict: false,
            parameters: {
                type: 'object',
                properties: {
                    directory: {type: 'string'},
                    recursive: {type: 'boolean'},
                    limit: {type: 'integer', minimum: 1, maximum: MAX_LIST_RESULTS},
                },
                required: [],
                additionalProperties: false,
            },
            execute: ({directory, recursive = true, limit = 100} = {}) => {
                const dirPath = resolveFilePath(directory || '.', policy.baseDir);
                ensureWithinRoots(dirPath, policy.roots);
                if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
                    throw new Error('Directory does not exist.');
                }
                const out = [];
                listFiles(dirPath, Boolean(recursive), Math.min(MAX_LIST_RESULTS, Number(limit) || 100), out);
                return JSON.stringify({directory: dirPath, count: out.length, files: out});
            },
        }),
        tool({
            name: 'write_text_file',
            description: 'Write UTF-8 markdown/text file content. Overwrite or append mode.',
            strict: false,
            parameters: {
                type: 'object',
                properties: {
                    path: {type: 'string'},
                    content: {type: 'string'},
                    mode: {type: 'string', enum: ['overwrite', 'append']},
                    createDirs: {type: 'boolean'},
                },
                required: ['path', 'content'],
                additionalProperties: false,
            },
            execute: async ({path: inputPath, content, mode = 'overwrite', createDirs = false}) => {
                const target = resolveFilePath(inputPath, policy.baseDir);
                ensureAllowedTextPath(target);
                ensureWithinRoots(target, policy.roots);
                if (typeof content !== 'string') throw new Error('Content must be a string.');
                let normalizedContent = normalizeWriteContent(content);
                if (normalizedContent.length > MAX_TOOL_CONTENT_CHARS) throw new Error('Content is too large for this tool call.');
                if (mode === 'append' && !policy.allowAppend) {
                    throw new Error('Append mode is only allowed when the user explicitly asks to append. Use overwrite for rewrites/edits.');
                }

                let originalText = null;
                if (fs.existsSync(target)) {
                    const stat = fs.statSync(target);
                    if (!stat.isFile()) throw new Error('Target path is not a file.');
                    originalText = fs.readFileSync(target, 'utf8');
                }
                if (mode === 'overwrite' && originalText !== null) {
                    const observed = getObserved(target);
                    const currentHash = hashText(originalText);
                    if (observed && observed !== currentHash) {
                        throw new Error('File changed since last read. Read the file again before overwrite to avoid clobbering changes.');
                    }
                    if (originalText === normalizedContent) {
                        rememberObserved(target, originalText);
                        return JSON.stringify({ok: true, path: target, mode, changed: false});
                    }
                    if (looksLikeAssistantMessage(normalizedContent)) {
                        throw new Error('Refusing overwrite: content looks like assistant chat text instead of raw file content.');
                    }
                }

                if (policy.requestWriteApproval) {
                    let diffRows = null;
                    if (mode === 'overwrite' && originalText !== null) {
                        diffRows = buildPreviewDiffRows(originalText, content);
                    }
                    const ok = await policy.requestWriteApproval({
                        action: mode === 'append' ? 'append' : 'write',
                        path: target,
                        contentPreview: normalizedContent,
                        contentLength: normalizedContent.length,
                        diffRows,
                    });
                    if (!ok) throw new Error('Write action denied by user.');
                }

                const dirPath = path.dirname(target);
                if (!fs.existsSync(dirPath)) {
                    if (!createDirs) throw new Error('Parent directory does not exist. Set createDirs=true to create it.');
                    fs.mkdirSync(dirPath, {recursive: true});
                }
                if (mode === 'append') {
                    fs.appendFileSync(target, normalizedContent, 'utf8');
                } else {
                    writeFileAtomic(target, normalizedContent);
                }
                const verified = fs.readFileSync(target, 'utf8');
                if (mode === 'append') {
                    if (!verified.endsWith(normalizedContent)) {
                        throw new Error('Append verification failed: file content does not include appended text.');
                    }
                } else if (verified !== normalizedContent) {
                    throw new Error('Overwrite verification failed: written content does not match expected content.');
                }
                rememberObserved(target, verified);
                if (policy.onFileMutated) policy.onFileMutated(target);
                return JSON.stringify({
                    ok: true,
                    path: target,
                    mode,
                    changed: true,
                    contentLength: verified.length,
                });
            },
        }),
        tool({
            name: 'edit_text_file',
            description: 'Find/replace text in a markdown/text file, with optional regex.',
            strict: false,
            parameters: {
                type: 'object',
                properties: {
                    path: {type: 'string'},
                    search: {type: 'string'},
                    replace: {type: 'string'},
                    replaceAll: {type: 'boolean'},
                    useRegex: {type: 'boolean'},
                    caseSensitive: {type: 'boolean'},
                },
                required: ['path', 'search', 'replace'],
                additionalProperties: false,
            },
            execute: async ({path: inputPath, search, replace, replaceAll = true, useRegex = false, caseSensitive = true}) => {
                const target = resolveFilePath(inputPath, policy.baseDir);
                ensureAllowedTextPath(target);
                ensureWithinRoots(target, policy.roots);
                const original = safeReadText(target);
                if (!search) throw new Error('Search pattern cannot be empty.');

                let next = original;
                let replacements = 0;
                let totalMatchesBefore = 0;
                if (useRegex) {
                    // Always enable multiline so ^/$ behave per-line in text files.
                    const flags = `${replaceAll ? 'g' : ''}${caseSensitive ? '' : 'i'}m`;
                    const regex = new RegExp(search, flags);
                    const countRegex = new RegExp(search, `${caseSensitive ? '' : 'i'}gm`);
                    totalMatchesBefore = (original.match(countRegex) || []).length;
                    next = original.replace(regex, () => {
                        replacements += 1;
                        return replace;
                    });
                } else {
                    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const flags = `${replaceAll ? 'g' : ''}${caseSensitive ? '' : 'i'}`;
                    const regex = new RegExp(escaped, flags);
                    const countRegex = new RegExp(escaped, `${caseSensitive ? '' : 'i'}g`);
                    totalMatchesBefore = (original.match(countRegex) || []).length;
                    next = original.replace(regex, () => {
                        replacements += 1;
                        return replace;
                    });
                }

                if (replacements === 0) {
                    return JSON.stringify({ok: true, path: target, replacements: 0, totalMatchesBefore, changed: false});
                }
                if (policy.requestWriteApproval) {
                    const diffRows = buildPreviewDiffRows(original, next);
                    const ok = await policy.requestWriteApproval({
                        action: 'edit',
                        path: target,
                        searchPreview: String(search),
                        replacePreview: String(replace),
                        replacements,
                        diffRows,
                    });
                    if (!ok) throw new Error('Edit action denied by user.');
                }
                writeFileAtomic(target, next);
                const verified = safeReadText(target);
                rememberObserved(target, verified);
                const changedLineNumbers = [];
                const beforeLines = original.split(/\r?\n/);
                const afterLines = verified.split(/\r?\n/);
                const maxLineCount = Math.max(beforeLines.length, afterLines.length);
                for (let i = 0; i < maxLineCount; i += 1) {
                    if ((beforeLines[i] || '') !== (afterLines[i] || '')) changedLineNumbers.push(i + 1);
                }
                const remainingMatches = (() => {
                    if (useRegex) {
                        const remRegex = new RegExp(search, `${caseSensitive ? '' : 'i'}gm`);
                        return (verified.match(remRegex) || []).length;
                    }
                    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const remRegex = new RegExp(escaped, `${caseSensitive ? '' : 'i'}g`);
                    return (verified.match(remRegex) || []).length;
                })();
                if (policy.onFileMutated) policy.onFileMutated(target);
                return JSON.stringify({
                    ok: true,
                    path: target,
                    replacements,
                    totalMatchesBefore,
                    remainingMatches,
                    changed: true,
                    changedLineCount: changedLineNumbers.length,
                    changedLineNumbers: changedLineNumbers.slice(0, 30),
                });
            },
        }),
        tool({
            name: 'delete_text_file',
            description: 'Delete a markdown/text file after explicit approval.',
            strict: false,
            parameters: {
                type: 'object',
                properties: {
                    path: {type: 'string'},
                },
                required: ['path'],
                additionalProperties: false,
            },
            execute: async ({path: inputPath}) => {
                const target = resolveFilePath(inputPath, policy.baseDir);
                ensureAllowedTextPath(target);
                ensureWithinRoots(target, policy.roots);
                if (!fs.existsSync(target)) {
                    return JSON.stringify({ok: true, path: target, deleted: false, reason: 'not-found'});
                }
                const stat = fs.statSync(target);
                if (!stat.isFile()) throw new Error('Target path is not a file.');

                if (policy.requestWriteApproval) {
                    const ok = await policy.requestWriteApproval({
                        action: 'delete',
                        path: target,
                    });
                    if (!ok) throw new Error('Delete action denied by user.');
                }
                fs.unlinkSync(target);
                if (policy.onFileMutated) policy.onFileMutated(target);
                return JSON.stringify({ok: true, path: target, deleted: true});
            },
        }),
    ];
}

class AgentChatService {
    constructor() {
        this.activeAbort = null;
        this.activeTextStream = null;
    }

    cancel() {
        if (this.activeAbort) this.activeAbort.abort();
        if (this.activeTextStream && typeof this.activeTextStream.destroy === 'function') {
            try { this.activeTextStream.destroy(); } catch {}
        }
        this.activeAbort = null;
        this.activeTextStream = null;
    }

    async send({config, messages, fileContext, onChunk, onDone, onError, requestWriteApproval, onFileMutated}) {
        this.cancel();
        const apiUrl = (config.aiApiUrl || '').trim();
        const apiKey = (config.aiApiKey || '').trim();
        const model = (config.aiModel || 'gpt-4o-mini').trim();
        if (!apiUrl || !apiKey) throw new Error('Please configure AI API URL and API Key in Settings -> AI Chat.');

        const agents = require('@openai/agents');
        const {Agent, Runner, OpenAIProvider} = agents;
        const latestUserPrompt = [...(Array.isArray(messages) ? messages : [])]
            .reverse()
            .find(m => m && m.role === 'user' && typeof m.content === 'string')?.content || '';
        const policy = buildFilePolicy(fileContext || {}, {requestWriteApproval, onFileMutated, latestUserPrompt});
        const baseURL = normalizeBaseUrl(apiUrl);
        const allowBuiltInWebSearch = shouldUseResponses(baseURL);
        const provider = new OpenAIProvider({
            apiKey,
            baseURL,
            useResponses: shouldUseResponses(baseURL),
        });
        const fileTools = buildFileTools(agents, policy);
        const webTools = (allowBuiltInWebSearch && typeof agents.webSearchTool === 'function')
            ? [agents.webSearchTool({searchContextSize: 'medium'})]
            : [];

        const agent = new Agent({
            name: 'MandyFileAgent',
            model,
            tools: [...fileTools, ...webTools],
            instructions: [
                'You are Mandy assistant embedded in a desktop markdown/text editor.',
                'Primary role: help users read, write, and edit markdown/text files accurately.',
                'First evaluate task scope and complexity before acting.',
                'If the request is large or multi-step, provide a short plan, then execute it step by step in order.',
                'For large tasks, report progress between major steps and keep following the plan until completion.',
                'Always use tools when verifying file content or performing file changes.',
                'After each meaningful step, perform a quick self-check: confirm result with tool evidence, then decide next step.',
                'When you start a re-evaluation or verification pass, post a brief user-facing status update first (for example: "Rechecking applied changes...").',
                'If a check fails or results are partial, correct course immediately instead of claiming success.',
                'Do not repeat or paste full file content in your final response after operations.',
                'After completing operations, respond concisely with what changed, which files were affected, and verification outcome only.',
                'When user asks to explore files/folders, use list_directory first.',
                'For deep analysis tasks, continue tool exploration until you can justify conclusions with concrete file evidence.',
                'When needed, combine list_directory/search_text_in_files/read_text_file in multiple passes; do not stop after superficial sampling.',
                'Only perform file modifications when the user request is explicit.',
                'Before edits, reason about the minimal safe change. After edits, summarize what changed.',
                'Do not ask the user for a second confirmation like "should I proceed?" when the user already requested an edit/write/delete.',
                'If a file change is needed to fulfill the current request, call the tool directly and rely on the app permission prompt for approval.',
                'Never respond with phrases like "Would you like me to proceed with these updates?" or "Let me know if I should apply this."',
                'When user intent is to modify files, your same response turn must execute the required tool call(s) so the permission prompt appears immediately.',
                'When calling write_text_file, the content must be raw target file text only, never conversational prose, summaries, or chat explanations.',
                'For whole-file tasks (translation, rewrite, tone/style conversion, full cleanup), never rely on editor context alone.',
                'For whole-file tasks, follow this exact sequence: read_text_file (entire file) -> write_text_file (mode=overwrite with full new content) -> read_text_file verify.',
                'Never call write_text_file overwrite on an existing file unless you have read that file in the current run first.',
                'Use write_text_file mode=append only when the user explicitly asks to append content at the end.',
                'Do not claim completion unless verification shows the intended whole-file transformation is complete.',
                'Before final response, run a final review against the user request and confirm nothing requested was missed.',
                'For delete requests, use delete_text_file and only report deletion when tool output confirms deleted=true.',
                'If you cannot complete a whole-file transformation in one pass (length/turn limits), explicitly continue in additional passes and report what remains.',
                'When local files are insufficient and current/external information is needed, use web_search.',
                'When you use web_search, include source links in your response.',
                'When reporting edits, use exact tool output fields (replacements, changedLineCount, remainingMatches) and do not guess.',
                'If a path is outside allowed roots or extension policy, explain clearly and ask for a permitted path.',
            ].join(' '),
        });

        const runner = new Runner({
            modelProvider: provider,
            tracingDisabled: true,
        });
        const abort = new AbortController();
        this.activeAbort = abort;

        try {
            const streamResult = await runner.run(
                agent,
                buildConversationInput(messages, fileContext || {}),
                {stream: true, maxTurns: 60, signal: abort.signal, context: {policy}},
            );
            const textStream = streamResult.toTextStream({compatibleWithNodeStreams: true});
            this.activeTextStream = textStream;
            textStream.on('data', chunk => {
                const delta = String(chunk || '');
                if (delta && typeof onChunk === 'function') onChunk(delta);
            });

            await streamResult.completed;
            if (typeof onDone === 'function') onDone();
        } catch (err) {
            if (abort.signal.aborted) {
                if (typeof onDone === 'function') onDone();
                return;
            }
            if (typeof onError === 'function') onError((err && err.message) ? err.message : String(err));
        } finally {
            this.activeAbort = null;
            this.activeTextStream = null;
        }
    }
}

module.exports = {
    AgentChatService,
};
