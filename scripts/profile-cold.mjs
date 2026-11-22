// Profile run() per pipeline phase on a cases file, per round (round 1 is
// cold, later rounds are JIT-warmed), so the cold penalty per phase is visible.
// Usage: node scripts/profile-cold.mjs <solve.js> <cases.json> [rounds]

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [solvePath, casesPath] = process.argv.slice(2);
const rounds = Number(process.argv[4] ?? 3);
const { run } = await import(pathToFileURL(solvePath).href);
const cases = JSON.parse(readFileSync(casesPath, 'utf8'));

for (let r = 0; r < rounds; r++) {
  globalThis.__MF_PROFILE = true;
  globalThis.__MF_TPL = [];
  const t0 = performance.now();
  const acc = {};
  for (const c of cases) {
    run(c.input);
    for (const [k, v] of Object.entries(globalThis.__MF_PROFILE_RESULT)) acc[k] = (acc[k] ?? 0) + v;
  }
  const wall = performance.now() - t0;
  globalThis.__MF_PROFILE = false;
  const tpl = globalThis.__MF_TPL.reduce((a, b) => a + b, 0);
  const parts = Object.entries(acc).map(([k, v]) => `${k}=${v.toFixed(0)}`).join(' ');
  const sum = Object.values(acc).reduce((a, b) => a + b, 0);
  console.log(`round ${r + 1}: wall ${wall.toFixed(0)} ms | templates ${tpl.toFixed(0)} ms | phases-sum ${sum.toFixed(0)} ms | ${parts}`);
}
