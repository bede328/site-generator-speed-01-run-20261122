// Per-case phase profile in a fresh process: which phases stay slow in
// cases 2-3 (per-case work, e.g. template compile) vs warm up after case 1.
// Usage: node scripts/per-case-profile.mjs <solve.js> <cases.json>

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [solvePath, casesPath] = process.argv.slice(2);
const { run } = await import(pathToFileURL(solvePath).href);
const cases = JSON.parse(readFileSync(casesPath, 'utf8'));
globalThis.__MF_PROFILE = true;
for (const c of cases) {
  globalThis.__MF_TPL = [];
  const t0 = performance.now();
  run(c.input);
  const wall = performance.now() - t0;
  const prof = globalThis.__MF_PROFILE_RESULT;
  const tpl = globalThis.__MF_TPL.reduce((a, b) => a + b, 0);
  const parts = Object.entries(prof).map(([k, v]) => `${k}=${v.toFixed(0)}`).join(' ');
  console.log(`${c.id}: wall ${wall.toFixed(0)} ms | templates ${tpl.toFixed(0)} ms | ${parts}`);
}
