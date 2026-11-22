// Profile run() per pipeline phase on a cases file.
// Usage: node scripts/profile.mjs <solve.js> <cases.json> [rounds]

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [solvePath, casesPath] = process.argv.slice(2);
const rounds = Number(process.argv[4] ?? 3);
const { run } = await import(pathToFileURL(solvePath).href);
const cases = JSON.parse(readFileSync(casesPath, 'utf8'));

const totals = {};
for (let r = 0; r < rounds; r++) {
  globalThis.__MF_PROFILE = true;
  for (const c of cases) run(c.input);
  const prof = globalThis.__MF_PROFILE_RESULT;
  for (const [k, v] of Object.entries(prof)) totals[k] = (totals[k] ?? 0) + v;
  globalThis.__MF_PROFILE = false;
}
const names = Object.keys(totals);
const grand = names.reduce((a, k) => a + totals[k], 0);
console.log(`per-phase ms (total over ${rounds} rounds x ${cases.length} cases):`);
for (const k of names) console.log(`  ${k.padEnd(14)} ${(totals[k] / rounds).toFixed(1)} ms/round`);
console.log(`  TOTAL          ${(grand / rounds).toFixed(1)} ms/round`);
