// Timing harness mimicking the scorer's heat: 1 warm-up + 9 timed rounds on
// 1 CPU (taskset -c 0), trimmed mean (drop 2 fastest + 2 slowest).
// Each round runs the entry's main.ts driver in a fresh process against the
// same input dir and reports that process's CPU time (process.cpuUsage,
// user+system, which includes node start-up and JSON I/O — the same bill
// the grader's net-CPU measure sees, modulo the do-nothing control).
//
// Usage:
//   node scripts/harness.mjs <repoDir> [inputDir] [rounds]
// Prints per-round CPU ms and the trimmed mean.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoDir = process.argv[2];
const inputDir = process.argv[3] ?? '/home/hatch/workspace/makefun/prep-kits/site-generator-speed-01-run-20261122/site-generator-speed-01-run-20261122-kit/practice/input';
const rounds = Number(process.argv[4] ?? 9);
if (!repoDir) {
  console.error('usage: node scripts/harness.mjs <repoDir> [inputDir] [rounds]');
  process.exit(2);
}

const here = fileURLToPath(new URL('.', import.meta.url));
const runner = join(here, 'run-driver.mjs');

function oneRound() {
  const outDir = mkdtempSync(join(tmpdir(), 'mf-out-'));
  try {
    const t0 = performance.now();
    const r = spawnSync('taskset', ['-c', '0', 'node', runner, repoDir, inputDir, outDir], { encoding: 'utf8' });
    const wallMs = performance.now() - t0;
    if (r.status !== 0) {
      console.error('driver failed:', r.stderr?.slice(-2000));
      process.exit(1);
    }
    const cpuMs = JSON.parse(r.stdout.trim()).cpuMs;
    return { cpuMs, wallMs };
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

console.log(`repo: ${repoDir}`);
console.log(`input: ${inputDir}`);
console.log('warm-up...');
oneRound();
const times = [];
for (let k = 0; k < rounds; k++) {
  const { cpuMs, wallMs } = oneRound();
  times.push(cpuMs);
  console.log(`round ${k + 1}: cpu ${cpuMs.toFixed(1)} ms, wall ${wallMs.toFixed(1)} ms`);
}
const sorted = [...times].sort((a, b) => a - b);
const trimmed = sorted.slice(2, -2);
const mean = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
console.log(`trimmed mean (drop 2 fastest + 2 slowest): ${mean.toFixed(1)} ms over ${trimmed.length} rounds`);
console.log(`all rounds sorted: ${sorted.map((t) => t.toFixed(0)).join(', ')}`);
