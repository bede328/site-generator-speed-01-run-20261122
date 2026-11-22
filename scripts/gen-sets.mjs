// Generate additional test sets from the kit generator with distinct seeds.
// Usage: node scripts/gen-sets.mjs [count] [startIndex]
// Each set lands in ~/workspace/makefun/test-sets-site-generator-speed-01/set-N/{input/cases.json,reference/expected.json}
// (outside the repo: the sets are ~11 MB each and the repo limit is 4 MiB).
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const genDir = '/home/hatch/workspace/makefun/prep-kits/site-generator-speed-01-run-20261122/site-generator-speed-01-run-20261122-kit/program/generator';
const count = Number(process.argv[2] ?? 6);
const start = Number(process.argv[3] ?? 1);

for (let n = start; n < start + count; n++) {
  const seed = createHash('sha256').update(`site-generator-speed-01-extra-set-${n}`).digest('hex');
  const inDir = join(repo, 'test-sets', `set-${n}`, 'in');
  const outDir = join('/home/hatch/workspace/makefun/test-sets-site-generator-speed-01', `set-${n}`);
  mkdirSync(inDir, { recursive: true });
  writeFileSync(join(inDir, 'seed.json'), JSON.stringify({ schema: 'agent-fun/instance-seed/v1', seed }));
  execFileSync('node', ['draw.ts'], {
    cwd: genDir,
    env: { ...process.env, MAKEFUN_INPUT_DIR: inDir, MAKEFUN_OUTPUT_DIR: outDir },
    stdio: 'inherit',
  });
  console.log(`set-${n} done (seed ${seed.slice(0, 12)}...)`);
}
console.log('all sets generated');
