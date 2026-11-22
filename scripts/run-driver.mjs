// Run one entry's driver (main.ts) in this process and print its CPU time.
// Invoked by scripts/harness.mjs under taskset; not used by the grader.
//
// Usage: node scripts/run-driver.mjs <repoDir> <inputDir> <outputDir>

import { mkdirSync } from 'node:fs';

const [repoDir, inputDir, outputDir] = process.argv.slice(2);
process.env.MAKEFUN_INPUT_DIR = inputDir;
process.env.MAKEFUN_OUTPUT_DIR = outputDir;
mkdirSync(outputDir, { recursive: true });
await import(`${repoDir}/main.ts`);
const u = process.cpuUsage();
console.log(JSON.stringify({ cpuMs: (u.user + u.system) / 1000 }));
