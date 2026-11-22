// Verify solve.js against an expected.json (practice set) or against the
// oracle's answers for a generated set. Compares as JSON values (scorer
// semantics: same type, strings code-unit for code-unit, arrays in order,
// object keys in any order). Reports per-case pass/fail and the first
// differing path + values when a case differs.
//
// Usage:
//   node scripts/verify.mjs <solve.js> <cases.json> <expected.json>
// expected.json may be either the practice reference file
// ({cases:[{id, output}]}) or a generated oracle answers file
// ({answers:[...]}) — see scripts/gen-extra.mjs output format.

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [solvePath, casesPath, expectedPath] = process.argv.slice(2);
if (!solvePath || !casesPath || !expectedPath) {
  console.error('usage: node scripts/verify.mjs <solve.js> <cases.json> <expected.json>');
  process.exit(2);
}

const { run } = await import(pathToFileURL(solvePath).href);
const cases = JSON.parse(readFileSync(casesPath, 'utf8'));
const expectedDoc = JSON.parse(readFileSync(expectedPath, 'utf8'));
const expected = expectedDoc.cases
  ? expectedDoc.cases.map((c) => c.output)
  : expectedDoc.answers;

if (cases.length !== expected.length) {
  console.error(`case count mismatch: ${cases.length} cases vs ${expected.length} expected`);
  process.exit(1);
}

/** First differing path between two JSON values, or null when equal. */
function firstDiff(a, b, path = '$') {
  if (a === b) return null;
  if (typeof a !== typeof b) return { path, a: typeof a, b: typeof b };
  if (a === null || b === null) return { path, a, b };
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return { path, a: Array.isArray(a) ? `array[${a.length}]` : a, b: Array.isArray(b) ? `array[${b.length}]` : b };
    for (let i = 0; i < a.length; i++) {
      const d = firstDiff(a[i], b[i], `${path}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  if (typeof a === 'object') {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    if (ka.join('\0') !== kb.join('\0')) return { path, a: `keys ${ka.join(',')}`, b: `keys ${kb.join(',')}` };
    for (const k of ka) {
      const d = firstDiff(a[k], b[k], `${path}.${k}`);
      if (d) return d;
    }
    return null;
  }
  return { path, a, b };
}

let pass = 0;
for (let i = 0; i < cases.length; i++) {
  const id = cases[i].id ?? `case-${i}`;
  let got;
  try {
    got = run(cases[i].input);
  } catch (err) {
    console.log(`FAIL ${id}: run() threw ${err}`);
    continue;
  }
  const d = firstDiff(got, expected[i]);
  if (d === null) {
    pass++;
    console.log(`PASS ${id}`);
  } else {
    console.log(`FAIL ${id}: first diff at ${d.path}`);
    const show = (v) => (typeof v === 'string' ? JSON.stringify(v.slice(0, 300)) : JSON.stringify(v)?.slice(0, 300));
    console.log(`  got:      ${show(d.a)}`);
    console.log(`  expected: ${show(d.b)}`);
  }
}
console.log(`${pass}/${cases.length} cases pass`);
process.exit(pass === cases.length ? 0 : 1);
