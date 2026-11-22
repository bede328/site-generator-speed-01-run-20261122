// Break down one fresh-process driver run: node start, JSON.parse,
// run() x3, JSON.stringify, write. Usage:
//   node scripts/breakdown.mjs <solve.js> <cases.json> <outDir>

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const t0 = performance.now();
const [solvePath, casesPath, outDir] = process.argv.slice(2);
const { run } = await import(pathToFileURL(solvePath).href);
const tImport = performance.now();
const raw = readFileSync(casesPath, 'utf8');
const tRead = performance.now();
const cases = JSON.parse(raw);
const tParse = performance.now();
const answers = [];
for (const c of cases) answers.push(run(c.input));
const tRun = performance.now();
const text = JSON.stringify(answers);
const tStringify = performance.now();
mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/answers.json`, text);
const tWrite = performance.now();
const u = process.cpuUsage();
console.log(JSON.stringify({
  importMs: +(tImport - t0).toFixed(1),
  readMs: +(tRead - tImport).toFixed(1),
  parseMs: +(tParse - tRead).toFixed(1),
  runMs: +(tRun - tParse).toFixed(1),
  stringifyMs: +(tStringify - tRun).toFixed(1),
  writeMs: +(tWrite - tStringify).toFixed(1),
  cpuMs: +((u.user + u.system) / 1000).toFixed(1),
  wallMs: +(tWrite - t0).toFixed(1),
}));
