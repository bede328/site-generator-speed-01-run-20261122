// Time run() per case in a fresh process, in order, to see how much of
// the cold (JIT) penalty the first case absorbs.
// Usage: node scripts/per-case.mjs <solve.js> <cases.json>

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [solvePath, casesPath] = process.argv.slice(2);
const { run } = await import(pathToFileURL(solvePath).href);
const cases = JSON.parse(readFileSync(casesPath, 'utf8'));
const cpu0 = process.cpuUsage();
const t00 = performance.now();
for (const c of cases) {
  const t0 = performance.now();
  run(c.input);
  console.log(`${c.id}: ${(performance.now() - t0).toFixed(1)} ms`);
}
const du = process.cpuUsage(cpu0);
console.log(`loop wall: ${(performance.now() - t00).toFixed(1)} ms, loop cpu: ${((du.user + du.system) / 1000).toFixed(1)} ms`);
