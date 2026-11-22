// Edge-case unit tests: my solve.js run(input) vs the vendor oracle build(input)
// on synthetic sites, one per README edge. Run: node test/edge.mjs
// Exit code 0 when every case matches, 1 otherwise.
import { run as mine } from '../solve.js';
const ORACLE_PATH = process.env.MAKEFUN_ORACLE ?? '/home/hatch/workspace/makefun/prep-kits/site-generator-speed-01-run-20261122/site-generator-speed-01-run-20261122-kit/program/generator/vendor/makefun-site/index.js';
const { build: oracle } = await import(ORACLE_PATH);

const SITE = { title: 'T', base_url: 'https://x.test/', per_page: 2, recent: 3 };
const BASE_TEMPLATES = {
  post: '<h1>{{ page.title }}</h1>\n{{ page.content }}',
  page: '<h1>{{ page.title }}</h1>\n{{ page.content }}',
  index: '{% for p in posts %}{{ p.title }}|{% endfor %}',
  tag: '{{ tag.name }}:{% for p in tag.posts %}{{ p.title }},{% endfor %}',
  tags: '{% for t in tags %}{{ t.name }}({{ t.count }}),{% endfor %}',
};

function site(files, templates = {}, site = {}) {
  return {
    site: { ...SITE, ...site },
    templates: { ...BASE_TEMPLATES, ...templates },
    files: files.map(([path, content]) => ({ path, content })),
  };
}
const md = (body, fm = 'title: Hello') => `---\n${fm}\n---\n${body}`;
const post = (body, fm = 'title: Hello\ndate: 2026-01-02') => md(body, fm);

const cases = [];
const add = (name, input) => cases.push({ name, input });

// ---------- front matter: refusal reasons ----------
add('fm-no-front-matter', site([['a.md', 'just text\n']]));
add('fm-not-closed', site([['a.md', '---\ntitle: X\nno close\n']]));
add('fm-bad-line', site([['a.md', '---\ntitle X\n---\nbody\n']]));
add('fm-unknown-key', site([['a.md', '---\ntitle: X\nbogus: 1\n---\nbody\n']]));
add('fm-duplicate-key', site([['a.md', '---\ntitle: X\ntitle: Y\n---\nbody\n']]));
add('fm-no-value', site([['a.md', '---\ntitle:\n---\nbody\n']]));
add('fm-no-title', site([['a.md', '---\ndate: 2026-01-02\n---\nbody\n']]));
add('fm-bad-date', site([['a.md', '---\ntitle: X\ndate: 2026-02-30\n---\nbody\n']]));
add('fm-date-out-of-range', site([['a.md', '---\ntitle: X\ndate: 1969-12-31\n---\nbody\n']]));
add('fm-date-bad-format', site([['a.md', '---\ntitle: X\ndate: 2026-1-2\n---\nbody\n']]));
add('fm-bad-tags-empty-name', site([['a.md', '---\ntitle: X\ntags: [a, , b]\n---\nbody\n']]));
add('fm-bad-tags-quote', site([['a.md', '---\ntitle: X\ntags: [a"b]\n---\nbody\n']]));
add('fm-bad-tags-bracket', site([['a.md', '---\ntitle: X\ntags: [a[b]\n---\nbody\n']]));
add('fm-bad-draft', site([['a.md', '---\ntitle: X\ndraft: yes\n---\nbody\n']]));
add('fm-bad-layout', site([['a.md', '---\ntitle: X\nlayout: Bad_Name!\n---\nbody\n']]));
add('fm-bad-slug', site([['a.md', '---\ntitle: X\nslug: Bad--slug\n---\nbody\n']]));
add('fm-slug-too-long', site([['a.md', '---\ntitle: X\nslug: ' + 'a'.repeat(65) + '\n---\nbody\n']]));
add('fm-bad-title-quote', site([['a.md', '---\ntitle: "unclosed\n---\nbody\n']]));
add('fm-title-bad-escape', site([['a.md', '---\ntitle: "a\\nb"\n---\nbody\n']]));
add('fm-title-quote-inside', site([['a.md', '---\ntitle: "a"b"\n---\nbody\n']]));
add('fm-title-bare-bracket', site([['a.md', '---\ntitle: [x]\n---\nbody\n']]));
add('fm-comment-and-blank', site([['a.md', '---\n# a comment\n\ntitle: X\n   \n---\nbody\n']]));
add('fm-quoted-title', site([['a.md', '---\ntitle: "A \\"Q\\" B \\\\ C"\n---\nbody\n']]));
add('fm-draft-true', site([['a.md', md('body', 'title: X\ndraft: true')]]));
add('fm-draft-false', site([['a.md', md('body', 'title: X\ndraft: false')]]));
add('fm-summary-quoted', site([['a.md', md('body', 'title: X\nsummary: "s & <t>"')]], { post: '{{ page.summary }}' }));
add('fm-tags-empty', site([['posts/p.md', post('body', 'title: P\ntags: []')]]));
add('fm-tags-spaces', site([['posts/p.md', post('body', 'title: P\ntags: [  a , b  ,a ]')]]));
add('fm-line-number', site([['a.md', '---\ntitle: X\nfoo\nbar\n---\nbody\n']]));

// ---------- front matter: checks order / reserved / post / layout ----------
add('check-order-refusal-first', site([['tags/x.md', '---\ntitle X\n---\nbody\n']]));
add('check-order-reserved-before-date', site([['tags/x.md', md('body', 'title: X')]]));
add('check-order-post-date-before-layout', site([['posts/p.md', md('body', 'title: X\nlayout: nope')]]));
add('check-order-layout-before-draft', site([['a.md', md('body', 'title: X\nlayout: nope\ndraft: true')]]));
add('reserved-page-dir', site([['page/x.md', md('body')]]));
add('post-no-date', site([['posts/p.md', md('body')]]));
add('layout-missing', site([['a.md', md('body', 'title: X\nlayout: nope')]]));
add('layout-unparsable', site([['a.md', md('body', 'title: X\nlayout: bad')]], { bad: '{{ unclosed' }));
add('no-newline-eof', site([['a.md', '---\ntitle: X\n---\nbody no newline']]));
add('crlf', site([['a.md', '---\r\ntitle: X\r\n---\r\nline one\r\nline two\r\n']]));
add('crlf-lone-cr', site([['a.md', '---\ntitle: X\n---\nline one\rline two\n']]));

// ---------- slugs ----------
add('slug-nfkd', site([['a.md', md('body', 'title: Café Über Ñoño')]]));
add('slug-combining', site([['a.md', md('body', 'title: éclair')]])); // e + combining acute
add('slug-long-title', site([['a.md', md('body', 'title: ' + 'word '.repeat(30))]]));
add('slug-cut-trailing-dash', site([['a.md', md('body', 'title: ' + 'a'.repeat(63) + ' b')]]));
add('slug-untitled', site([['a.md', md('body', 'title: "!!!"')]]));
add('slug-explicit', site([['a.md', md('body', 'title: X\nslug: my-slug')]]));
add('slug-unique', site([
  ['a.md', md('one', 'title: Same')],
  ['b.md', md('two', 'title: Same')],
  ['c.md', md('three', 'title: Same')],
]));
add('slug-unique-per-dir', site([
  ['d1/a.md', md('one', 'title: Same')],
  ['d2/a.md', md('two', 'title: Same')],
]));
add('slug-reserved-root', site([
  ['posts.md', md('one', 'title: Posts')],
  ['tags.md', md('two', 'title: Tags')],
  ['page.md', md('three', 'title: Page')],
  ['other.md', md('four', 'title: Other')],
]));
add('slug-explicit-collision', site([
  ['a.md', md('one', 'title: A\nslug: s')],
  ['b.md', md('two', 'title: B\nslug: s')],
]));

// ---------- dates / tags / collections ----------
add('date-long', site([['posts/p.md', post('body', 'title: P\ndate: 2026-11-09')]], { post: '{{ page.date_long }}|{{ page.date }}' }));
add('date-long-jan', site([['posts/p.md', post('body', 'title: P\ndate: 2026-01-01')]], { post: '{{ page.date_long }}' }));
add('collections-order', site([
  ['posts/a.md', post('A', 'title: A\ndate: 2026-01-02')],
  ['posts/b.md', post('B', 'title: B\ndate: 2026-01-02')],
  ['posts/c.md', post('C', 'title: C\ndate: 2026-01-05')],
  ['posts/d.md', post('D', 'title: D\ndate: 2025-12-31')],
], { post: '{{ page.newer.title }}|{{ page.older.title }}' }));
add('tags-order-count-slug', site([
  ['posts/a.md', post('A', 'title: A\ndate: 2026-01-01\ntags: [zeta, alpha]')],
  ['posts/b.md', post('B', 'title: B\ndate: 2026-01-02\ntags: [zeta]')],
  ['posts/c.md', post('C', 'title: C\ndate: 2026-01-03\ntags: [beta]')],
]));
add('tags-first-spelling', site([
  ['posts/a.md', post('A', 'title: A\ndate: 2026-01-01\ntags: [Go]')],
  ['posts/b.md', post('B', 'title: B\ndate: 2026-01-02\ntags: [go]')],
]));
add('tags-page-link-missing', site([
  ['posts/a.md', post('A', 'title: A\ndate: 2026-01-01\ntags: [real]')],
  ['x.md', md('body', 'title: X\ntags: [ghost, real]')],
], { page: '{% for t in page.tags %}{{ t.name }}={{ t.url }};{% endfor %}' }));
add('tags-page-tags', site([
  ['posts/a.md', post('A', 'title: A\ndate: 2026-01-01\ntags: [real]')],
  ['x.md', md('body', 'title: X\ntags: [ghost, real]')],
], { page: '{% for t in page.tags %}{{ t.name }}={{ t.url }};{% endfor %}' }));
add('excerpt-reading', site([['posts/p.md', post('First *para* here.\n\nSecond para with more words ' + 'word '.repeat(250), 'title: P\ndate: 2026-01-02')]], { post: 'ex={{ page.excerpt }}|rm={{ page.reading_minutes }}' }));
add('excerpt-empty', site([['posts/p.md', post('# Only heading', 'title: P\ndate: 2026-01-02')]], { post: 'ex={{ page.excerpt }}|rm={{ page.reading_minutes }}' }));

// ---------- pagination ----------
add('pagination-many', site([
  ['posts/a.md', post('A', 'title: A\ndate: 2026-01-01')],
  ['posts/b.md', post('B', 'title: B\ndate: 2026-01-02')],
  ['posts/c.md', post('C', 'title: C\ndate: 2026-01-03')],
  ['posts/d.md', post('D', 'title: D\ndate: 2026-01-04')],
  ['posts/e.md', post('E', 'title: E\ndate: 2026-01-05')],
], { index: 'pg{{ pager.number }}/{{ pager.total }}:{{ pager.url }}|n={{ pager.newer_url }}|o={{ pager.older_url }}|{% for p in posts %}{{ p.title }},{% endfor %}' }));
add('pagination-none', site([['x.md', md('body')]], { index: 'pg{{ pager.number }}/{{ pager.total }}|n={{ pager.newer_url }}|o={{ pager.older_url }}' }));
add('pagination-one-page', site([
  ['posts/a.md', post('A', 'title: A\ndate: 2026-01-01')],
], {}, { per_page: 10 }));
add('index-missing-template', site([['x.md', md('body')]], { index: undefined }));
add('tag-missing-template', site([['posts/a.md', post('A', 'title: A\ndate: 2026-01-01\ntags: [t]')]], { tag: undefined }));

// ---------- statics / shadowing ----------
add('static-shadowed', site([
  ['x.md', md('body', 'title: X')],
  ['x/index.html', 'STATIC'],
]));
add('static-kept', site([
  ['x.md', md('body', 'title: X')],
  ['style.css', 'body{}'],
  ['img/logo.png', 'PNGDATA'],
]));
add('static-in-posts-dir', site([
  ['posts/a.md', post('A', 'title: A\ndate: 2026-01-01')],
  ['posts/readme.txt', 'txt'],
]));

// ---------- links ----------
add('link-broken-once', site([['a.md', md('[one](nope.md) and [two](nope.md) and [three](also-no.md)')]]));
add('link-broken-two-sources', site([
  ['a.md', md('[x](nope.md)')],
  ['b.md', md('[y](nope.md)')],
]));
add('link-dotdot-root', site([
  ['d/a.md', md('[up](../../x.md) [up2](../b.md) [dot](./c.md)')],
  ['b.md', md('B')],
  ['d/c.md', md('C')],
]));
add('link-scheme-slash-hash', site([['a.md', md('[a](https://e.com/x) [b](mailto:a@b.c) [c](/abs) [d](#frag) [e](//proto/x)')]]));
add('link-fragment', site([
  ['a.md', md('[x](b.md#sec) [y](b.md) [z](#own)')],
  ['b.md', md('B')],
]));
add('link-static', site([
  ['a.md', md('[s](style.css) [i](img/logo.png)')],
  ['style.css', 'x'],
  ['img/logo.png', 'y'],
]));
add('link-empty-target', site([['a.md', md('[x]() [y](a b) [z](b.md)')]], { page: '{{ page.content }}' }));
add('link-image-ish', site([['a.md', md('![alt](b.md)')], ['b.md', md('B')]]));

// ---------- markdown blocks ----------
add('md-fence-lang', site([['a.md', md('```js\nconst x = 1 < 2;\n```\n')]]));
add('md-fence-no-lang', site([['a.md', md('```\nplain & <code>\n```\n')]]));
add('md-fence-unclosed', site([['a.md', md('```py\nnever closed\n')]]));
add('md-fence-bad-lang', site([['a.md', md('````\nfour ticks\n````\n')]]));
add('md-fence-spaces-after', site([['a.md', md('```js   \ncode\n```   \n')]]));
add('md-heading-all', site([['a.md', md('# H1\n## H2 ##\n### H3\n#### H4\n##### H5\n###### H6\n####### not\n#\n#no space\n')]]));
add('md-heading-id-unique', site([['a.md', md('# Same\n# Same\n## Same\n')]]));
add('md-heading-toc', site([['a.md', md('# H1\n## H2\n### H3\n#### H4\ntext\n')]], { page: '{% for t in page.toc %}{{ t.level }}:{{ t.id }}:{{ t.html }};{% endfor %}' }));
add('md-hr', site([['a.md', md('text\n---\nmore\n***\nend\n')]]));
add('md-hr-spaces', site([['a.md', md('---   \n****\n--\n')]]));
add('md-blockquote', site([['a.md', md('> quote *one*\n> quote two\n\n> \n> \n')]]));
add('md-blockquote-empty', site([['a.md', md('>\n>\n')]]));
add('md-list-bullet', site([['a.md', md('- one\n- two\n* three\n* four\n')]]));
add('md-list-ordered', site([['a.md', md('3. three\n4. four\n')]]));
add('md-list-continuation', site([['a.md', md('- one\n  continued line\n- two\n')]]));
add('md-list-ends', site([['a.md', md('- one\npara text\n- not a list\n')]]));
add('md-paragraph-join', site([['a.md', md('line one\n  line two  \nline three\n\nnext para\n')]]));
add('md-paragraph-stops', site([['a.md', md('text\n# head\ntext2\n```\ncode\n```\ntext3\n')]]));
add('md-indented-not-code', site([['a.md', md('    indented text\n\tmore\n')]]));
add('md-equals-underline', site([['a.md', md('Title\n=====\nbody\n')]]));

// ---------- markdown inline ----------
add('inline-escapes', site([['a.md', md('a \\* b \\` c \\\\ d \\! e \\[ f \\] g \\( h \\) i \\# j \\+ k \\- l \\. m \\> n \\_ o \\a p\n')]]));
add('inline-code', site([['a.md', md('`code *not* em` and `` double `` and `unclosed\n')]]));
add('inline-strong-em', site([['a.md', md('**bold** and *em* and **unclosed and *unclosed and _under_ and a**b**c\n')]]));
add('inline-strong-empty', site([['a.md', md('**** and ** ** and **x**\n')]]));
add('inline-em-star-adjacent', site([['a.md', md('a *b* c **d** e *f** g\n')]]));
add('inline-link', site([['a.md', md('[text *with* em](b.md) and [esc \\]aped](b.md) and [no paren] and [empty]()\n')], ['b.md', md('B')]]));
add('inline-raw-html', site([['a.md', md('<b>bold</b> & <script>alert(1)</script>\n')]]));
add('inline-entities', site([['a.md', md('a & b < c > d "e" \'f\'\n')]]));

// ---------- templates ----------
add('tpl-if-not', site([['a.md', md('body')]], { page: '{% if not page.is_post %}NOTPOST{% else %}POST{% endif %}|{% if page.is_post %}P{% endif %}' }));
add('tpl-if-false-values', site([['a.md', md('body', 'title: X')]], { page: '{% if page.missing %}Y{% else %}N{% endif %}{% if page.tags %}T{% else %}E{% endif %}' }));
add('tpl-for-non-array', site([['a.md', md('body')]], { page: '{% for x in page.title %}X{% endfor %}done' }));
add('tpl-for-loop-vars', site([['posts/a.md', post('A', 'title: A\ndate: 2026-01-01')], ['posts/b.md', post('B', 'title: B\ndate: 2026-01-02')]], { index: '{% for p in posts %}{{ loop.index }}/{{ loop.length }}:{{ loop.first }}:{{ loop.last }}:{{ p.title }};{% endfor %}' }));
add('tpl-loop-shadow', site([['a.md', md('body')]], { page: '{% for tags in site.tags %}{{ tags.name }}{% endfor %}|{{ site.tags }}' }));
add('tpl-include-deep', site([['a.md', md('body')]], {
  page: 'A{% include "i1" %}',
  i1: '1{% include "i2" %}', i2: '2{% include "i3" %}', i3: '3{% include "i4" %}',
  i4: '4{% include "i5" %}', i5: '5{% include "i6" %}', i6: '6{% include "i7" %}',
  i7: '7{% include "i8" %}', i8: '8{% include "i9" %}', i9: '9{% include "i10" %}', i10: '10',
}));
add('tpl-include-missing', site([['a.md', md('body')]], { page: 'A{% include "nope" %}B' }));
add('tpl-include-same-scope', site([['a.md', md('body')]], { page: '{% for x in site.tags %}X{% endfor %}{% include "inc" %}', inc: '{{ page.title }}' }));
add('tpl-standalone-tag', site([['a.md', md('body')]], { page: 'A\n{% if page.title %}\nB\n{% endif %}\nC' }));
add('tpl-standalone-spaces', site([['a.md', md('body')]], { page: 'A\n  {% if page.title %}  \nB\nC' }));
add('tpl-nonstandalone-tag', site([['a.md', md('body')]], { page: 'A {% if page.title %}B{% endif %} C' }));
add('tpl-raw-triple', site([['a.md', md('body')]], { page: '{{{ page.content }}}|{{ page.content }}' }));
add('tpl-value-types', site([['a.md', md('body')]], { page: '{{ site.recent }}|{{ page.is_post }}|{{ page.tags }}|{{ page.missing }}|{{ page.title }}' }));
add('tpl-path-own-prop', site([['a.md', md('body')]], { page: '{{ page.toString }}|{{ page.constructor }}|{{ page.title.length }}' }));
add('tpl-parse-unclosed-var', site([['a.md', md('body')]], { page: 'A {{ page.title' }));
add('tpl-parse-bad-path', site([['a.md', md('body')]], { page: 'A {{ 1bad }}' }));
add('tpl-parse-unknown-tag', site([['a.md', md('body')]], { page: 'A {% bogus %} B' }));
add('tpl-parse-unclosed-for', site([['a.md', md('body')]], { page: 'A {% for x in site.tags %} B' }));
add('tpl-parse-wrong-close', site([['a.md', md('body')]], { page: 'A {% if page.title %} B {% endfor %}' }));
add('tpl-parse-else-outside', site([['a.md', md('body')]], { page: 'A {% else %} B' }));
add('tpl-spaces-in-braces', site([['a.md', md('body')]], { page: '{{  page.title  }}|{{page.title}}|{%  if page.title  %}Y{% endif %}' }));

// ---------- misc ----------
add('files-order-shuffled', site([
  ['z.md', md('Z', 'title: Z')],
  ['a.md', md('A', 'title: A')],
  ['m.md', md('M', 'title: M')],
]));
add('md-extension-case', site([['a.MD', '---\ntitle: X\n---\nbody\n'], ['b.md', md('B')]]));
add('site-base-trailing', site([['a.md', md('[x](b.md)', 'title: A')], ['b.md', md('B', 'title: B')]], {}, { base_url: 'https://x.test///' }));
add('site-recent-zero', site([['posts/a.md', post('A', 'title: A\ndate: 2026-01-01')]], { index: '{% for p in recent %}R{% endfor %}done' }, { recent: 0 }));
add('empty-site', site([]));
add('only-statics', site([['a.txt', 'hello']]));
add('deep-nesting', site([['a/b/c/d/e.md', md('deep', 'title: Deep')]]));
add('unicode-content', site([['a.md', md('Emoji 😀 and café — ünïcode\n', 'title: Ünïcode 😀')]]));
add('big-body', site([['a.md', md(('word '.repeat(500) + '\n\n').repeat(20), 'title: Big')]]));

// ---------- run ----------
function firstDiff(a, b, path = '') {
  if (a === b) return null;
  if (typeof a !== typeof b) return `${path}: type ${typeof a} vs ${typeof b}`;
  if (a && b && typeof a === 'object') {
    if (Array.isArray(a) !== Array.isArray(b)) return `${path}: array vs object`;
    if (Array.isArray(a)) {
      if (a.length !== b.length) return `${path}: length ${a.length} vs ${b.length}`;
      for (let i = 0; i < a.length; i++) { const d = firstDiff(a[i], b[i], `${path}[${i}]`); if (d) return d; }
      return null;
    }
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (!(k in a)) return `${path}.${k}: only in oracle`;
      if (!(k in b)) return `${path}.${k}: only in mine`;
      const d = firstDiff(a[k], b[k], `${path}.${k}`); if (d) return d;
    }
    return null;
  }
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  return `${path}: ${sa?.slice(0, 120)} vs ${sb?.slice(0, 120)}`;
}

let pass = 0, fail = 0;
for (const c of cases) {
  let got, want;
  try { got = mine(JSON.parse(JSON.stringify(c.input))); } catch (e) { console.log(`FAIL ${c.name}: mine threw ${e.message}`); fail++; continue; }
  try { want = oracle(JSON.parse(JSON.stringify(c.input))); } catch (e) { console.log(`FAIL ${c.name}: oracle threw ${e.message}`); fail++; continue; }
  const d = firstDiff(got, want);
  if (d === null) { pass++; }
  else { fail++; console.log(`FAIL ${c.name}: ${d}`); }
}
console.log(`${pass}/${cases.length} edge cases pass`);
process.exit(fail === 0 ? 0 : 1);
