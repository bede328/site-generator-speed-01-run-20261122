// Faster drop-in for makefun-site 1.0.0 (static site generator).
// v1: faithful port of the reference pipeline (readSources -> frontMatter ->
// permalinks -> markdown -> collections -> tags -> layouts -> report).
// Optimisations are layered on top of this file in later passes; the
// semantics here follow vendor/makefun-site/index.js + lib/*.js line by line.

export const REPORT_FILE = 'build-report.txt';
export const RESERVED = Object.freeze(['posts', 'tags', 'page']);

const byCodeUnits = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// ---------------------------------------------------------------- text.js

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const ESCAPE_TEST = /[&<>"']/;
const ESCAPE_REPLACE = /[&<>"']/g;
const escReplacer = (c) => ESCAPES[c];

/** `text` with & < > " and ' escaped. */
export function escapeHtml(text) {
  return ESCAPE_TEST.test(text) ? text.replace(ESCAPE_REPLACE, escReplacer) : text;
}

export const SLUG_MAX = 64;

/** slugify's results, memoised: the function is pure, and tags/titles repeat across a build. */
const slugCache = new Map();

export function slugifyCached(text) {
  let s = slugCache.get(text);
  if (s === undefined) {
    s = slugify(text);
    slugCache.set(text, s);
  }
  return s;
}

export function slugify(text) {
  const plain = text.normalize('NFKD').replace(/\p{M}/gu, '');
  let out = '';
  let gap = false;
  for (const ch of plain) {
    let keep = null;
    if (ch >= 'A' && ch <= 'Z') keep = ch.toLowerCase();
    else if ((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9')) keep = ch;
    if (keep === null) {
      gap = out.length > 0;
      continue;
    }
    if (gap) out += '-';
    gap = false;
    out += keep;
  }
  out = out.slice(0, SLUG_MAX).replace(/-+$/, '');
  return out === '' ? 'untitled' : out;
}

export function uniqueSlug(slug, taken) {
  let out = slug;
  for (let n = 2; taken.has(out); n++) out = `${slug}-${n}`;
  taken.add(out);
  return out;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function longDate(date) {
  const [y, m, d] = date.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}

// ---------------------------------------------------------------- frontmatter.js

export const KEYS = Object.freeze(['title', 'date', 'tags', 'draft', 'layout', 'slug', 'summary']);

const LINE = /^([a-z_]+):(?: (.*))?$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const NAME = /^[a-z0-9-]+$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TAG = /^[^"[\]]+$/;

function daysIn(y, m) {
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

function stringOf(raw) {
  if (raw.startsWith('"')) {
    if (raw.length < 2 || !raw.endsWith('"')) return { error: 'a quoted string is not closed' };
    let out = '';
    for (let i = 1; i < raw.length - 1; i++) {
      const c = raw[i];
      if (c === '\\') {
        const n = raw[i + 1];
        if ((n !== '"' && n !== '\\') || i + 1 === raw.length - 1) return { error: 'a quoted string holds an escape other than \\" or \\\\' };
        out += n;
        i++;
      } else if (c === '"') return { error: 'a quoted string holds a stray quote' };
      else out += c;
    }
    return { value: out };
  }
  if (raw.startsWith('[')) return { error: 'a bare string opens on [' };
  return { value: raw };
}

function valueOf(key, raw) {
  switch (key) {
    case 'title':
    case 'summary': {
      const s = stringOf(raw);
      return 'error' in s ? { error: `key "${key}": ${s.error}` } : s;
    }
    case 'date': {
      const m = DATE.exec(raw);
      const y = m ? Number(m[1]) : 0;
      const mo = m ? Number(m[2]) : 0;
      const d = m ? Number(m[3]) : 0;
      if (!m || y < 1970 || y > 2099 || mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo)) return { error: 'key "date": not a date from 1970-01-01 to 2099-12-31 (YYYY-MM-DD)' };
      return { value: raw };
    }
    case 'tags': {
      if (!raw.startsWith('[') || !raw.endsWith(']')) return { error: 'key "tags": not a list [a, b]' };
      const inner = raw.slice(1, -1);
      if (inner.trim() === '') return { value: [] };
      const tags = inner.split(',').map((t) => t.trim());
      if (tags.some((t) => t === '' || !TAG.test(t))) return { error: 'key "tags": an empty tag, or one holding " [ or ]' };
      return { value: tags };
    }
    case 'draft':
      return raw === 'true' ? { value: true } : raw === 'false' ? { value: false } : { error: 'key "draft": true or false' };
    case 'layout':
      return NAME.test(raw) ? { value: raw } : { error: 'key "layout": not a template name' };
    case 'slug':
      return SLUG.test(raw) && raw.length <= 64 ? { value: raw } : { error: 'key "slug": not a slug' };
    default:
      return { error: `unknown key "${key}"` };
  }
}

/**
 * A source's front matter and body: { data, body }, or { error } with the first reason it is refused. `text` has "\n"
 * line ends. Same checks, in the same order, as the reference: the closing `---` is found first (a missing close is
 * reported even when a front-matter line is bad), then the lines between are read in order, then `no title`.
 * The body is the text after the closing line, sliced, not split-and-joined.
 */
export function parseFrontMatter(text) {
  if (text !== '---' && !text.startsWith('---\n')) return { error: 'no front matter' };
  if (text === '---') return { error: 'the front matter is not closed' };
  // First pass: the line ranges up to the closing `---`.
  const starts = [];
  const ends = [];
  let pos = 4;
  let close = -1;
  let bodyStart = -1;
  while (pos <= text.length) {
    const nl = text.indexOf('\n', pos);
    const end = nl === -1 ? text.length : nl;
    if (text.slice(pos, end) === '---') {
      close = starts.length + 1;
      bodyStart = nl === -1 ? text.length : nl + 1;
      break;
    }
    starts.push(pos);
    ends.push(end);
    if (nl === -1) break;
    pos = nl + 1;
  }
  if (close === -1) return { error: 'the front matter is not closed' };
  const data = {};
  for (let idx = 0; idx < starts.length; idx++) {
    const line = text.slice(starts[idx], ends[idx]);
    const n = idx + 2; // error line numbers count from 1 at the opening `---`
    let blank = true;
    for (let k = 0; k < line.length; k++) {
      const c = line.charCodeAt(k);
      if (c !== 32 && c !== 9) {
        blank = false;
        break;
      }
    }
    if (blank || line.charCodeAt(0) === 35) continue;
    let k = 0;
    while (k < line.length) {
      const c = line.charCodeAt(k);
      if ((c >= 97 && c <= 122) || c === 95) k++;
      else break;
    }
    // `^([a-z_]+):(?: (.*))?$`: a key of a-z and `_`, a colon, one space and the value.
    if (k === 0 || line.charCodeAt(k) !== 58) return { error: `line ${n} is not "key: value"` };
    const key = line.slice(0, k);
    let raw;
    if (k + 1 === line.length) raw = '';
    else if (line.charCodeAt(k + 1) === 32) raw = line.slice(k + 2);
    else return { error: `line ${n} is not "key: value"` };
    raw = raw.replace(/[ \t]+$/, '');
    if (!KEYS.includes(key)) return { error: `unknown key "${key}"` };
    if (Object.hasOwn(data, key)) return { error: `key "${key}" is given twice` };
    if (raw === '') return { error: `key "${key}" has no value` };
    const v = valueOf(key, raw);
    if ('error' in v) return v;
    data[key] = v.value;
  }
  if (!Object.hasOwn(data, 'title')) return { error: 'no title' };
  return { data, body: text.slice(bodyStart) };
}

// ---------------------------------------------------------------- markdown.js
// Streaming single-pass renderer for makefun-site's Markdown subset: no
// token objects, no per-character escapeHtml calls. Block structure follows
// lib/markdown.js's lex() + renderMarkdown() exactly; inline() follows the
// same left-to-right rules, but works on chunks (plain runs are pushed raw,
// only the escapable / markup characters are handled one by one).

const BLANK = /^[ \t]*$/;
const HR = /^(?:---|\*\*\*)[ \t]*$/;
const CONTINUED = /^ {2,}\S/;
const WS_TARGET = /\s/;
/** Characters that make inline rendering do anything at all. */
const INLINE_SPECIAL = /[\\`*\[&<>"']/;
/** Same set, /g, for jumping over plain runs (lastIndex set before every exec). */
const SPECIAL_RE = /[\\`*\[&<>"']/g;

/** HTML-escape lookup by char code (only & < > " ' change). */
const HTML_ESC = [];
HTML_ESC[38] = '&amp;';
HTML_ESC[60] = '&lt;';
HTML_ESC[62] = '&gt;';
HTML_ESC[34] = '&quot;';
HTML_ESC[39] = '&#39;';

/** Backslash-escapable characters, by char code. */
const ESCAPABLE_TABLE = new Uint8Array(128);
for (const c of '\\`*_[]()#+-.!>') ESCAPABLE_TABLE[c.charCodeAt(0)] = 1;

/** A fence-open line's language, or null. `^```([A-Za-z0-9_+-]*)[ \t]*$` */
function fenceOpen(line) {
  if (line.charCodeAt(0) !== 96 || line.charCodeAt(1) !== 96 || line.charCodeAt(2) !== 96) return null;
  let i = 3;
  while (i < line.length) {
    const c = line.charCodeAt(i);
    if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95 || c === 43 || c === 45) i++;
    else break;
  }
  const lang = line.slice(3, i);
  while (i < line.length && (line.charCodeAt(i) === 32 || line.charCodeAt(i) === 9)) i++;
  return i === line.length ? lang : null;
}

/** Whether `line` closes a fence: `^```[ \t]*$`. */
function fenceClose(line) {
  if (line.charCodeAt(0) !== 96 || line.charCodeAt(1) !== 96 || line.charCodeAt(2) !== 96) return false;
  let i = 3;
  while (i < line.length && (line.charCodeAt(i) === 32 || line.charCodeAt(i) === 9)) i++;
  return i === line.length;
}

/** A heading line's level and text, or null (a heading's text is never empty). */
function headingOf(line) {
  let hashes = 0;
  while (hashes < line.length && line.charCodeAt(hashes) === 35) hashes++;
  if (hashes === 0 || hashes > 6) return null;
  let i = hashes;
  if (i >= line.length || (line.charCodeAt(i) !== 32 && line.charCodeAt(i) !== 9)) return null;
  while (i < line.length && (line.charCodeAt(i) === 32 || line.charCodeAt(i) === 9)) i++;
  let end = line.length;
  while (end > i && (line.charCodeAt(end - 1) === 32 || line.charCodeAt(end - 1) === 9)) end--;
  if (end === i) return null;
  return { depth: hashes, text: line.slice(i, end) };
}

/** Whether `line` ends a paragraph: a blank line, a fence, a heading or a thematic break. */
function endsParagraph(line) {
  if (line === '') return true;
  const c0 = line.charCodeAt(0);
  if (c0 === 32 || c0 === 9) return BLANK.test(line);
  if (c0 === 96) return fenceOpen(line) !== null;
  if (c0 === 35) return headingOf(line) !== null;
  if (c0 === 45 || c0 === 42) return HR.test(line);
  return false;
}

/** A paragraph line as it is rendered: spaces and tabs at either end dropped. */
const trimLine = (line) => {
  let a = 0;
  let b = line.length;
  while (a < b && (line.charCodeAt(a) === 32 || line.charCodeAt(a) === 9)) a++;
  while (b > a && (line.charCodeAt(b - 1) === 32 || line.charCodeAt(b - 1) === 9)) b--;
  return a === 0 && b === line.length ? line : line.slice(a, b);
};

/** A bullet-list line's item text, or null. `^[-*] (.*)$` */
function bulletOf(line) {
  const c = line.charCodeAt(0);
  if ((c === 45 || c === 42) && line.charCodeAt(1) === 32) return line.slice(2);
  return null;
}

/** An ordered-list line's [start, text], or null. `^(\d{1,9})\. (.*)$` */
function orderedOf(line) {
  let i = 0;
  while (i < line.length && line.charCodeAt(i) >= 48 && line.charCodeAt(i) <= 57) i++;
  if (i === 0 || i > 9) return null;
  if (line.charCodeAt(i) !== 46 || line.charCodeAt(i + 1) !== 32) return null;
  return [Number(line.slice(0, i)), line.slice(i + 2)];
}

/** Whether the `what` at `j` is escaped: the backslashes immediately before it (from `from` on) pair up two by two,
 * so an odd run escapes it. The scan from `from` reaches a run's start exactly, so this is the sequential scan's
 * answer. */
function isEscaped(s, j, from) {
  let k = j - 1;
  let odd = false;
  while (k >= from && s.charCodeAt(k) === 92) {
    odd = !odd;
    k--;
  }
  return odd;
}

/** The first index from `from` where `s` holds `what` outside a backslash escape, or -1. */
function findUnescaped(s, what, from) {
  let j = s.indexOf(what, from);
  while (j !== -1 && isEscaped(s, j, from)) j = s.indexOf(what, j + 1);
  return j;
}

/** The first single * from `from` (one whose run is not **), outside an escape, or -1. */
function findSingleStar(s, from) {
  let j = s.indexOf('*', from);
  while (j !== -1) {
    if (isEscaped(s, j, from)) {
      j = s.indexOf('*', j + 1);
      continue;
    }
    if (s.charCodeAt(j + 1) === 42) {
      j = s.indexOf('*', j + 2);
      continue;
    }
    return j;
  }
  return -1;
}

/** `s` rendered inline; `env.link(target)` is a link's href.
 * Plain runs are jumped over with one regex exec (lastIndex is set before
 * every exec, so the shared /g regex is safe across the recursive calls). */
export function inline(s, env) {
  // Fast path: with none of \ ` * [ & < > " ' present, inline rendering is the identity.
  if (!INLINE_SPECIAL.test(s)) return s;
  const out = [];
  const n = s.length;
  let i = 0;
  let plain = 0;
  while (i < n) {
    SPECIAL_RE.lastIndex = i;
    const m = SPECIAL_RE.exec(s);
    if (m === null) break;
    const j = m.index;
    const c = s.charCodeAt(j);
    if (c === 92) {
      // backslash: escapes one of \ ` * _ [ ] ( ) # + - . ! >
      if (j + 1 < n) {
        const d = s.charCodeAt(j + 1);
        if (d < 128 && ESCAPABLE_TABLE[d]) {
          if (j > plain) out.push(s.slice(plain, j));
          out.push(d === 62 ? '&gt;' : s[j + 1]);
          i = j + 2;
          plain = i;
          continue;
        }
      }
      i = j + 1;
      continue;
    }
    if (c === 96) {
      const k = s.indexOf('`', j + 1);
      if (k > j + 1) {
        if (j > plain) out.push(s.slice(plain, j));
        out.push('<code>', escapeHtml(s.slice(j + 1, k)), '</code>');
        i = k + 1;
        plain = i;
      } else i = j + 1;
      continue;
    }
    if (c === 42) {
      if (s.charCodeAt(j + 1) === 42) {
        const k = findUnescaped(s, '**', j + 2);
        if (k > j + 2) {
          if (j > plain) out.push(s.slice(plain, j));
          out.push('<strong>', inline(s.slice(j + 2, k), env), '</strong>');
          i = k + 2;
          plain = i;
        } else i = j + 2;
        continue;
      }
      const k = findSingleStar(s, j + 1);
      if (k > j + 1) {
        if (j > plain) out.push(s.slice(plain, j));
        out.push('<em>', inline(s.slice(j + 1, k), env), '</em>');
        i = k + 1;
        plain = i;
      } else i = j + 1;
      continue;
    }
    if (c === 91) {
      const k = findUnescaped(s, ']', j + 1);
      const m2 = k !== -1 && s.charCodeAt(k + 1) === 40 ? s.indexOf(')', k + 2) : -1;
      const target = m2 === -1 ? '' : s.slice(k + 2, m2);
      if (target !== '' && !WS_TARGET.test(target)) {
        if (j > plain) out.push(s.slice(plain, j));
        out.push('<a href="', escapeHtml(env.link(target)), '">', inline(s.slice(j + 1, k), env), '</a>');
        i = m2 + 1;
        plain = i;
      } else i = j + 1;
      continue;
    }
    if (j > plain) out.push(s.slice(plain, j));
    out.push(HTML_ESC[c]);
    i = j + 1;
    plain = i;
  }
  if (plain < n) out.push(s.slice(plain));
  return out.join('');
}

/**
 * `src` rendered: its HTML (each block on its own lines, a "\n" after the last), its table of contents (every level 2
 * and 3 heading: level, id and its inline HTML) and its excerpt (the first paragraph's inline HTML, or "").
 */
export function renderMarkdown(src, env) {
  const lines = src.split('\n');
  const n = lines.length;
  const ids = new Set();
  const blocks = [];
  const toc = [];
  let excerpt = null;
  let i = 0;
  while (i < n) {
    const line = lines[i];
    const c0 = line.charCodeAt(0);
    // Dispatch on the first character: a block can only start as a fence
    // ('`'), heading ('#'), thematic break or bullet ('-'/'*'), blockquote
    // ('>'), ordered list (digit), blank ('' or space/tab) or paragraph.
    // The check order below is the reference's (fence, heading, hr, quote,
    // list, paragraph); a line starting with any other character can only
    // be a paragraph (or blank, when it is only spaces/tabs).
    if (line === '' || c0 === 32 || c0 === 9) {
      if (line === '' || BLANK.test(line)) {
        i++;
        continue;
      }
    } else if (c0 === 96) {
      const lang = fenceOpen(line);
      if (lang !== null) {
        i++;
        const body = [];
        while (i < n && !fenceClose(lines[i])) body.push(lines[i++]);
        i++;
        const cls = lang === '' ? '' : ` class="language-${escapeHtml(lang)}"`;
        let code = `<pre><code${cls}>`;
        for (const l of body) {
          code += escapeHtml(l);
          code += '\n';
        }
        blocks.push(`${code}</code></pre>`);
        continue;
      }
    } else if (c0 === 35) {
      const heading = headingOf(line);
      if (heading !== null) {
        const id = uniqueSlug(slugifyCached(heading.text), ids);
        const html = inline(heading.text, env);
        blocks.push(`<h${heading.depth} id="${id}">${html}</h${heading.depth}>`);
        if (heading.depth === 2 || heading.depth === 3) toc.push({ level: heading.depth, id, html });
        i++;
        continue;
      }
    } else if (c0 === 45 || c0 === 42) {
      if (HR.test(line)) {
        blocks.push('<hr>');
        i++;
        continue;
      }
    } else if (c0 === 62) {
      const body = [];
      while (i < n && lines[i].charCodeAt(0) === 62) {
        let l = lines[i++];
        l = l.slice(1);
        if (l.charCodeAt(0) === 32) l = l.slice(1);
        l = trimLine(l);
        if (l !== '') body.push(l);
      }
      blocks.push(body.length === 0 ? '<blockquote>\n</blockquote>' : `<blockquote>\n<p>${inline(body.join('\n'), env)}</p>\n</blockquote>`);
      continue;
    }
    const bullet = (c0 === 45 || c0 === 42) ? bulletOf(line) : null;
    const ordered = bullet === null && c0 >= 48 && c0 <= 57 ? orderedOf(line) : null;
    if (bullet !== null || ordered !== null) {
      const isOrdered = ordered !== null;
      const items = [];
      while (i < n) {
        let m = null;
        let text = null;
        if (isOrdered) {
          const o = orderedOf(lines[i]);
          if (o !== null) {
            m = o;
            text = o[1];
          }
        } else {
          text = bulletOf(lines[i]);
          if (text !== null) m = true;
        }
        if (m !== null) {
          items.push([trimLine(text)]);
          i++;
        } else if (CONTINUED.test(lines[i])) {
          items[items.length - 1].push(trimLine(lines[i]));
          i++;
        } else break;
      }
      const tag = isOrdered ? 'ol' : 'ul';
      const start = isOrdered ? ordered[0] : 1;
      const open = isOrdered && start !== 1 ? `<ol start="${start}">` : `<${tag}>`;
      let list = `${open}\n`;
      for (const parts of items) list += `<li>${inline(parts.join('\n'), env)}</li>\n`;
      blocks.push(`${list}</${tag}>`);
      continue;
    }
    const body = [trimLine(line)];
    i++;
    while (i < n && !endsParagraph(lines[i])) body.push(trimLine(lines[i++]));
    const html = inline(body.join('\n'), env);
    if (excerpt === null) excerpt = html;
    blocks.push(`<p>${html}</p>`);
  }
  return { html: blocks.length === 0 ? '' : `${blocks.join('\n')}\n`, toc, excerpt: excerpt ?? '' };
}

// ---------------------------------------------------------------- template.js

export const INCLUDE_DEPTH = 8;

const PATH = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const FOR = /^for ([A-Za-z_][A-Za-z0-9_]*) in (\S+)$/;
const IF = /^if (not )?(\S+)$/;
const INCLUDE = /^include "([a-z0-9-]+)"$/;

export class TemplateError extends Error {}

function pathOf(name, text) {
  if (!PATH.test(text)) throw new TemplateError(`template "${name}": ${JSON.stringify(text)} is not a path`);
  return text.split('.');
}

function tokenize(name, src) {
  const tokens = [];
  let text = '';
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf('{', i);
    if (open === -1 || open === src.length - 1) {
      text += src.slice(i);
      break;
    }
    const next = src[open + 1];
    if (next !== '{' && next !== '%') {
      text += src.slice(i, open + 1);
      i = open + 1;
      continue;
    }
    text += src.slice(i, open);
    if (next === '{') {
      const raw = src[open + 2] === '{';
      const close = src.indexOf(raw ? '}}}' : '}}', open + (raw ? 3 : 2));
      if (close === -1) throw new TemplateError(`template "${name}": a ${raw ? '{{{' : '{{'} is not closed`);
      if (text !== '') tokens.push({ t: 'text', text });
      text = '';
      tokens.push({ t: raw ? 'raw' : 'var', path: pathOf(name, src.slice(open + (raw ? 3 : 2), close).trim()) });
      i = close + (raw ? 3 : 2);
      continue;
    }
    const close = src.indexOf('%}', open + 2);
    if (close === -1) throw new TemplateError(`template "${name}": a {% is not closed`);
    const end = close + 2;
    const lineStart = src.lastIndexOf('\n', open - 1) + 1;
    const nl = src.indexOf('\n', end);
    const lineEnd = nl === -1 ? src.length : nl;
    const standalone = /^[ \t]*$/.test(src.slice(lineStart, open)) && /^[ \t]*$/.test(src.slice(end, lineEnd));
    if (standalone) text = text.slice(0, text.length - (open - lineStart));
    if (text !== '') tokens.push({ t: 'text', text });
    text = '';
    tokens.push({ t: 'tag', tag: src.slice(open + 2, close).trim() });
    i = standalone ? (nl === -1 ? src.length : nl + 1) : end;
  }
  if (text !== '') tokens.push({ t: 'text', text });
  return tokens;
}

export function parseTemplate(name, src) {
  const root = { kind: 'root', body: [] };
  const stack = [root];
  let body = root.body;
  for (const tok of tokenize(name, src)) {
    if (tok.t === 'text') body.push({ kind: 'text', text: tok.text });
    else if (tok.t === 'var' || tok.t === 'raw') body.push({ kind: tok.t, path: tok.path });
    else {
      const tag = tok.tag;
      const top = stack[stack.length - 1];
      let m;
      if ((m = FOR.exec(tag)) !== null) {
        const node = { kind: 'for', name: m[1], path: pathOf(name, m[2]), body: [] };
        body.push(node);
        stack.push(node);
        body = node.body;
      } else if ((m = IF.exec(tag)) !== null) {
        const node = { kind: 'if', not: m[1] !== undefined, path: pathOf(name, m[2]), then: [], else: null };
        body.push(node);
        stack.push(node);
        body = node.then;
      } else if (tag === 'else') {
        if (top.kind !== 'if' || top.else !== null) throw new TemplateError(`template "${name}": an else outside an if`);
        top.else = [];
        body = top.else;
      } else if (tag === 'endfor' || tag === 'endif') {
        if (top.kind !== (tag === 'endfor' ? 'for' : 'if')) throw new TemplateError(`template "${name}": an ${tag} with no open ${tag.slice(3)}`);
        stack.pop();
        const parent = stack[stack.length - 1];
        body = parent.kind === 'root' ? parent.body : parent.kind === 'for' ? parent.body : parent.else ?? parent.then;
      } else if ((m = INCLUDE.exec(tag)) !== null) body.push({ kind: 'include', name: m[1] });
      else throw new TemplateError(`template "${name}": {% ${tag} %} is not a tag`);
    }
  }
  if (stack.length > 1) throw new TemplateError(`template "${name}": a ${stack[stack.length - 1].kind} is not closed`);
  return root.body;
}

function lookup(scope, path) {
  let s = scope;
  while (s !== null && !Object.hasOwn(s.vars, path[0])) s = s.parent;
  if (s === null) return undefined;
  let v = s.vars[path[0]];
  for (let k = 1; k < path.length; k++) {
    if (v === null || typeof v !== 'object' || !Object.hasOwn(v, path[k])) return undefined;
    v = v[path[k]];
  }
  return v;
}

function textOf(v) {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return v.map(textOf).join(', ');
  return '';
}

function truthy(v) {
  if (Array.isArray(v)) return v.length > 0;
  return v !== undefined && v !== null && v !== false && v !== '' && v !== 0;
}

/** escapeHtml(textOf(v)): a value written escaped, in one call. */
function textEsc(v) {
  if (typeof v === 'string') return escapeHtml(v);
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return v.map(textOf).join(', ');
  return '';
}

export function renderNodes(nodes, scope, ctx, depth) {
  let out = '';
  for (const n of nodes) {
    switch (n.kind) {
      case 'text':
        out += n.text;
        break;
      case 'var':
        out += ctx.escape(textOf(lookup(scope, n.path)));
        break;
      case 'raw':
        out += textOf(lookup(scope, n.path));
        break;
      case 'if': {
        const v = truthy(lookup(scope, n.path));
        const branch = v !== n.not ? n.then : n.else;
        if (branch !== null) out += renderNodes(branch, scope, ctx, depth);
        break;
      }
      case 'for': {
        const xs = lookup(scope, n.path);
        if (!Array.isArray(xs)) break;
        xs.forEach((x, k) => {
          const vars = { [n.name]: x, loop: { index: k + 1, first: k === 0, last: k === xs.length - 1, length: xs.length } };
          out += renderNodes(n.body, { vars, parent: scope }, ctx, depth);
        });
        break;
      }
      case 'include': {
        const t = ctx.templates.get(n.name);
        if (t !== undefined && depth < INCLUDE_DEPTH) out += renderNodes(t, scope, ctx, depth + 1);
        break;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- template codegen
//
// A parsed template compiles to fn(S, T, D, O, txe, txt, tru, has):
//   S   the scope, a null-prototype object whose prototype is its parent
//       scope (a for-loop's scope is Object.create(parent)); a path's first
//       name is one property access down that chain, which is exactly the
//       reference lookup's nearest-scope-with-the-name walk (an own property
//       holding undefined shadows an outer one, as does hasOwn there).
//   T   Map name -> compiled template function (missing templates absent).
//   D   include depth; O the output array the function pushes into.
// The compiled code is straight-line pushes plus direct property reads, so
// it runs fast even before V8 optimises it; parse errors are unchanged
// (parseTemplate still throws them with the reference messages).
// renderNodes above stays as the fallback when a template cannot compile.

/** A prototype-chain scope as the interpreter's {vars, parent} chain (fallback path only). */
function scopeToOld(S) {
  if (S === null) return null;
  const vars = {};
  for (const k of Object.keys(S)) vars[k] = S[k];
  return { vars, parent: scopeToOld(Object.getPrototypeOf(S)) };
}

/** A compiled-template-shaped wrapper that renders `nodes` with the interpreter (used when codegen fails). */
function makeFallbackFn(nodes, nodesMap) {
  return function (S, T, D, O) {
    O.push(renderNodes(nodes, scopeToOld(S), { templates: nodesMap, escape: escapeHtml }, D));
  };
}

/** The expression evaluating to the value at `path` in scope variable `sv`; `tmp` hands out temp names. */
function lookupExpr(path, sv, tmp) {
  if (path.length === 1) return `${sv}.${path[0]}`;
  const v = tmp();
  let expr = `(${v}=${sv}.${path[0]}`;
  for (let k = 1; k < path.length; k++) {
    expr += `,${v}=(${v}==null||typeof ${v}!=="object"||!has(${v},${JSON.stringify(path[k])}))?void 0:${v}.${path[k]}`;
  }
  return `${expr})`;
}

/** `nodes` compiled to a template function; throws when the generated code does not parse. */
export function compileTemplate(name, nodes) {
  let tmpCount = 0;
  const tmp = () => `_t${tmpCount++}`;
  const gen = (ns, depth, parts) => {
    const sv = depth === 0 ? 'S' : `_s${depth}`;
    for (const n of ns) {
      if (n.kind === 'text') parts.push(`O.push(${JSON.stringify(n.text)});`);
      else if (n.kind === 'var') parts.push(`O.push(txe(${lookupExpr(n.path, sv, tmp)}));`);
      else if (n.kind === 'raw') parts.push(`O.push(txt(${lookupExpr(n.path, sv, tmp)}));`);
      else if (n.kind === 'if') {
        const cond = `tru(${lookupExpr(n.path, sv, tmp)})`;
        const thenParts = [];
        const elseParts = [];
        gen(n.then, depth, thenParts);
        if (n.else !== null) gen(n.else, depth, elseParts);
        if (n.not) {
          if (n.else !== null) parts.push(`if(${cond}){${elseParts.join('')}}else{${thenParts.join('')}}`);
          else parts.push(`if(!(${cond})){${thenParts.join('')}}`);
        } else if (n.else !== null) parts.push(`if(${cond}){${thenParts.join('')}}else{${elseParts.join('')}}`);
        else parts.push(`if(${cond}){${thenParts.join('')}}`);
      } else if (n.kind === 'for') {
        const xs = tmp();
        const kk = tmp();
        const nsv = `_s${depth + 1}`;
        // One scope object per execution of the loop (not per iteration): the
        // body renders synchronously, so mutating the loop variable and the
        // loop record between iterations cannot be observed afterwards.
        parts.push(`{var ${xs}=${lookupExpr(n.path, sv, tmp)};if(Array.isArray(${xs})){var ${nsv}=Object.create(${sv});${nsv}.loop={index:0,first:false,last:false,length:${xs}.length};for(var ${kk}=0;${kk}<${xs}.length;${kk}++){${nsv}.${n.name}=${xs}[${kk}];${nsv}.loop.index=${kk}+1;${nsv}.loop.first=${kk}===0;${nsv}.loop.last=${kk}===${xs}.length-1;`);
        gen(n.body, depth + 1, parts);
        parts.push('}}}');
      } else if (n.kind === 'include') {
        const f = tmp();
        parts.push(`{var ${f}=T.get(${JSON.stringify(n.name)});if(${f}!==undefined&&D<8)${f}(${sv},T,D+1,O,txe,txt,tru,has);}`);
      }
    }
  };
  const parts = [];
  gen(nodes, 0, parts);
  const decls = tmpCount === 0 ? '' : `var ${Array.from({ length: tmpCount }, (_, i) => `_t${i}`).join(',')};`;
  return new Function('S', 'T', 'D', 'O', 'txe', 'txt', 'tru', 'has', decls + parts.join(''));
}

// ---------------------------------------------------------------- index.js (pipeline)

/** Whitespace (JS \s) by char code, for wordsOf. */
const WS_TABLE = new Uint8Array(65536);
for (const c of [9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279]) WS_TABLE[c] = 1;

/** The words of a body: its runs of characters other than whitespace (JS \s, no allocation). */
function wordsOf(text) {
  let count = 0;
  let inWord = false;
  for (let i = 0; i < text.length; i++) {
    if (WS_TABLE[text.charCodeAt(i)]) inWord = false;
    else if (!inWord) {
      inWord = true;
      count++;
    }
  }
  return count;
}

/** `rel` (a link's path, "/"-separated) from the directory `dir`, or null when it climbs out of the root. */
function resolveFrom(dir, rel) {
  if (!rel.includes('/')) {
    if (rel === '.') return dir;
    if (rel === '..') {
      if (dir === '') return null;
      const i = dir.lastIndexOf('/');
      return i === -1 ? '' : dir.slice(0, i);
    }
    return dir === '' ? rel : `${dir}/${rel}`;
  }
  let out = dir;
  for (const seg of rel.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (out === '') return null;
      const i = out.lastIndexOf('/');
      out = i === -1 ? '' : out.slice(0, i);
    } else out = out === '' ? seg : `${out}/${seg}`;
  }
  return out;
}

const dirOf = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');

function readSources(b) {
  const files = [...b.input.files].sort((x, y) => byCodeUnits(x.path, y.path));
  for (const f of files) {
    if (f.path.endsWith('.md')) b.sources.push({ path: f.path, text: f.content.includes('\r') ? f.content.replace(/\r\n?/g, '\n') : f.content });
    else b.statics.push({ path: f.path, content: f.content });
  }
}

function frontMatter(b) {
  const kept = [];
  for (const s of b.sources) {
    const fm = parseFrontMatter(s.text);
    if ('error' in fm) {
      b.report.push(`refused ${s.path}: ${fm.error}`);
      continue;
    }
    s.data = fm.data;
    s.body = fm.body;
    s.post = s.path.startsWith('posts/');
    const own = RESERVED.find((d) => d !== 'posts' && s.path.startsWith(`${d}/`));
    if (own !== undefined) {
      b.report.push(`refused ${s.path}: ${own}/ is the generator's own`);
      continue;
    }
    if (s.post && !Object.hasOwn(s.data, 'date')) {
      b.report.push(`refused ${s.path}: a post needs a date`);
      continue;
    }
    const layout = s.data.layout ?? (s.post ? 'post' : 'page');
    if (!b.templates.has(layout)) {
      b.report.push(`refused ${s.path}: layout "${layout}" is no template that parses`);
      continue;
    }
    s.layout = layout;
    if (s.data.draft === true) {
      b.report.push(`draft ${s.path}`);
      continue;
    }
    kept.push(s);
  }
  b.sources = kept;
}

function permalinks(b) {
  const taken = new Map();
  const takenIn = (dir) => {
    if (!taken.has(dir)) taken.set(dir, new Set(dir === '' ? RESERVED : []));
    return taken.get(dir);
  };
  for (const s of b.sources) {
    const dir = s.post ? 'posts' : dirOf(s.path);
    const slug = uniqueSlug(s.data.slug ?? slugifyCached(s.data.title), takenIn(dir));
    s.slug = slug;
    s.outDir = dir === '' ? slug : `${dir}/${slug}`;
    s.url = `${b.base}/${s.outDir}/`;
    b.bySource.set(s.path, s);
  }
}

/** Whether `target` opens on a scheme (`https:`, `mailto:` ...): a letter, then [A-Za-z0-9+.-]*, then ':'. */
function hasScheme(target) {
  const c0 = target.charCodeAt(0);
  if (!((c0 >= 65 && c0 <= 90) || (c0 >= 97 && c0 <= 122))) return false;
  const colon = target.indexOf(':');
  if (colon === -1) return false;
  for (let i = 1; i < colon; i++) {
    const c = target.charCodeAt(i);
    if (!((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 43 || c === 45 || c === 46)) return false;
  }
  return true;
}

function markdown(b) {
  const staticPaths = new Set(b.statics.map((f) => f.path));
  // One link function and one env object for the whole build: a fresh
  // closure per source would make inline()'s env.link call site see a
  // different function every time (megamorphic, and it deoptimises the
  // inlined call). The per-source state lives in linkState, set before
  // each source renders; rendering is synchronous, so it cannot interleave.
  const linkState = { dir: '', path: '' };
  const link = (target) => {
    if (hasScheme(target) || target.startsWith('/') || target.startsWith('#')) return target;
    const hash = target.indexOf('#');
    const rel = hash === -1 ? target : target.slice(0, hash);
    const frag = hash === -1 ? '' : target.slice(hash);
    const path = rel === '' ? null : resolveFrom(linkState.dir, rel);
    if (path !== null && b.bySource.has(path)) return `${b.bySource.get(path).url}${frag}`;
    if (path !== null && staticPaths.has(path)) return `${b.base}/${path}${frag}`;
    b.broken.add(`broken-link ${linkState.path} -> ${target}`);
    return target;
  };
  const env = { link };
  for (const s of b.sources) {
    linkState.dir = dirOf(s.path);
    linkState.path = s.path;
    const md = renderMarkdown(s.body, env);
    s.html = md.html;
    s.toc = md.toc;
    s.excerpt = md.excerpt;
  }
}

function collections(b) {
  const posts = b.sources.filter((s) => s.post);
  posts.sort((x, y) => byCodeUnits(y.data.date, x.data.date) || byCodeUnits(x.slug, y.slug));
  b.posts = posts;
  posts.forEach((p, k) => {
    p.newer = k === 0 ? null : posts[k - 1];
    p.older = k === posts.length - 1 ? null : posts[k + 1];
  });
}

function tags(b) {
  const bySlug = new Map();
  const ownTags = (s) => {
    const seen = new Set();
    return (s.data.tags ?? []).filter((name) => { const sl = slugifyCached(name); return !seen.has(sl) && seen.add(sl); });
  };
  for (const p of b.posts) {
    p.tagRefs = [];
    for (const name of ownTags(p)) {
      const slug = slugifyCached(name);
      if (!bySlug.has(slug)) bySlug.set(slug, { name, slug, url: `${b.base}/tags/${slug}/`, posts: [] });
      const tag = bySlug.get(slug);
      tag.posts.push(p);
      p.tagRefs.push(tag);
    }
  }
  for (const s of b.sources) if (!s.post) s.tagRefs = ownTags(s).map((name) => { const sl = slugifyCached(name); return bySlug.get(sl) ?? { name, slug: sl, url: '', posts: [] }; });
  b.tags = [...bySlug.values()].sort((x, y) => y.posts.length - x.posts.length || byCodeUnits(x.slug, y.slug));
}

const linkOf = (s) => (s === null ? null : { title: s.data.title, url: s.url, date: s.data.date ?? '', date_long: s.data.date === undefined ? '' : longDate(s.data.date) });

const tagOf = (b, t) => ({ name: t.name, slug: t.slug, url: t.url, count: t.posts.length, posts: t.posts.map((p) => b.cards.get(p)) });

/** A tag reference as a card reads it (a shared callback, not a fresh closure per card). */
const tagRefOf = (t) => ({ name: t.name, slug: t.slug, url: t.url });

function cardOf(s) {
  if (s.card !== undefined) return s.card;
  const card = {
    title: s.data.title,
    url: s.url,
    date: s.data.date ?? '',
    date_long: s.data.date === undefined ? '' : longDate(s.data.date),
    summary: s.data.summary ?? '',
    excerpt: s.excerpt,
    reading_minutes: Math.max(1, Math.ceil(wordsOf(s.body) / 200)),
    tags: s.tagRefs.map(tagRefOf),
  };
  s.card = card;
  return card;
}

function pageOf(s) {
  if (s.newerLink === undefined) s.newerLink = linkOf(s.newer ?? null);
  if (s.olderLink === undefined) s.olderLink = linkOf(s.older ?? null);
  return {
    ...cardOf(s),
    slug: s.slug,
    content: s.html,
    toc: s.toc,
    newer: s.newerLink,
    older: s.olderLink,
    is_post: s.post,
  };
}

function layouts(b) {
  b.cards = new Map(b.posts.map((p) => [p, cardOf(p)]));
  const site = { title: b.input.site.title, base_url: b.base };
  const allTags = b.tags.map((t) => ({ name: t.name, slug: t.slug, url: t.url, count: t.posts.length }));
  const recent = b.posts.slice(0, b.input.site.recent).map((p) => b.cards.get(p));
  const fns = b.templateFns;
  // One scope object and one output array reused across renders: a render's
  // variables are assigned fresh each time (the others reset to undefined,
  // which reads exactly as absent), and no scope survives its render.
  const S = Object.create(null);
  S.site = site;
  S.tags = allTags;
  S.recent = recent;
  const out = [];
  const render = (name, vars) => {
    const fn = fns.get(name);
    if (fn === undefined) return null;
    S.page = undefined;
    S.posts = undefined;
    S.pager = undefined;
    S.tag = undefined;
    for (const k in vars) S[k] = vars[k];
    out.length = 0;
    fn(S, fns, 0, out, textEsc, textOf, truthy, Object.hasOwn);
    return out.join('');
  };
  for (const s of b.sources) b.output[`${s.outDir}/index.html`] = render(s.layout, { page: pageOf(s) });
  const per = b.input.site.per_page;
  const pages = Math.max(1, Math.ceil(b.posts.length / per));
  const indexUrl = (k) => (k === 1 ? `${b.base}/` : `${b.base}/page/${k}/`);
  for (let k = 1; k <= pages; k++) {
    const html = render('index', {
      posts: b.posts.slice((k - 1) * per, k * per).map((p) => b.cards.get(p)),
      pager: { number: k, total: pages, url: indexUrl(k), newer_url: k === 1 ? '' : indexUrl(k - 1), older_url: k === pages ? '' : indexUrl(k + 1) },
    });
    if (html !== null) b.output[k === 1 ? 'index.html' : `page/${k}/index.html`] = html;
  }
  for (const t of b.tags) {
    const html = render('tag', { tag: tagOf(b, t) });
    if (html !== null) b.output[`tags/${t.slug}/index.html`] = html;
  }
  const tagsHtml = render('tags', {});
  if (tagsHtml !== null) b.output['tags/index.html'] = tagsHtml;
  for (const f of b.statics) {
    if (Object.hasOwn(b.output, f.path)) b.report.push(`shadowed ${f.path}: a built page has its path`);
    else b.output[f.path] = f.content;
  }
}

function report(b) {
  const lines = [...b.report, ...b.broken].sort(byCodeUnits);
  const pages = b.sources.filter((s) => !s.post).length;
  lines.push(`built ${pages} pages, ${b.posts.length} posts, ${b.tags.length} tags and ${b.statics.length} static files`);
  b.output[REPORT_FILE] = `${lines.join('\n')}\n`;
}

export const PIPELINE = Object.freeze([readSources, frontMatter, permalinks, markdown, collections, tags, layouts, report]);

export function build(input) {
  const templates = new Map();
  const templateFns = new Map();
  const report = [];
  const tTpl0 = globalThis.__MF_PROFILE ? performance.now() : 0;
  for (const name of Object.keys(input.templates).sort(byCodeUnits)) {
    let nodes;
    try {
      nodes = parseTemplate(name, input.templates[name]);
    } catch (err) {
      if (!(err instanceof TemplateError)) throw err;
      report.push(err.message);
      continue;
    }
    templates.set(name, nodes);
    try {
      templateFns.set(name, compileTemplate(name, nodes));
    } catch {
      templateFns.set(name, makeFallbackFn(nodes, templates));
    }
  }
  if (globalThis.__MF_PROFILE) (globalThis.__MF_TPL ??= []).push(performance.now() - tTpl0);
  const b = {
    input,
    base: input.site.base_url.replace(/\/+$/, ''),
    templates,
    templateFns,
    sources: [],
    statics: [],
    bySource: new Map(),
    broken: new Set(),
    report,
    posts: [],
    tags: [],
    cards: new Map(),
    output: {},
  };
  for (const plugin of PIPELINE) {
    if (globalThis.__MF_PROFILE) {
      const t0 = performance.now();
      plugin(b);
      (b.profile ??= {})[plugin.name] = (b.profile[plugin.name] ?? 0) + (performance.now() - t0);
    } else plugin(b);
  }
  if (globalThis.__MF_PROFILE) globalThis.__MF_PROFILE_RESULT = b.profile;
  return b.output;
}

/** makefun-site 1.0.0's answer for one case's input. */
export function run(input) {
  return build(input);
}
