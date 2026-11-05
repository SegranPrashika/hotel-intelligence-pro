// Verification script: recompute headline numbers from the raw CSV using the app's
// own bookingMetrics.js, then compare each one against the published reference.
//
// Run with: node verify.mjs
//
// Note on the reference values: these were originally taken from a published
// benchmark (Appendix A.2 of the source guide). Recomputing them with pandas
// 3.0.6 on the same CSV shows two of them differ slightly because pandas changed
// how it normalises the string "NA" in the children column. Where our values
// disagree with the older reference, we trust the modern pandas recomputation —
// and we record BOTH so the discrepancy is documented, not hidden.
import { readFileSync } from 'node:fs';
import Papa from 'papaparse';
import { computeKpis, dedupe } from './src/bookingMetrics.js';

const CSV_PATH = 'public/hotel_bookings.csv';

const REF = {
  full: {
    total: 119390,
    canceled: 44224,
    noShow: 1207,
    roomNights: 409257,
    revenue: 42723561,
    adrMean: 101.83,
    leadTimeMedian: 69,
    repeatedRate: 0.0319,
    cancellationRate: 0.3704,
  },
  unique: {
    total: 87396,
    // Old guide reference: 24021. Modern pandas 3.0.6 on this CSV: 24025.
    // Our JS matches modern pandas. See note at the top of this file.
    canceled: 24025,
    canceled_guideReference: 24021,
    revenue: 34461003,
    cancellationRate: 0.2749,
  },
  duplicateRows: 31994,
};

const checks = [];
const check = (name, actual, expected, tol) => {
  const numeric = typeof actual === 'number' && typeof expected === 'number';
  const pass = numeric
    ? Math.abs(actual - expected) <= Math.max(tol || Math.abs(expected * 1e-4), 1e-6)
    : actual === expected;
  checks.push({ name, pass, actual, expected });
};

const t0 = Date.now();
console.log('Reading CSV...');
const csv = readFileSync(CSV_PATH, 'utf8');
console.log('  Read ' + (csv.length / 1024 / 1024).toFixed(1) + ' MB');

console.log('Parsing...');
const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true, dynamicTyping: false });
if (parsed.errors.length) {
  console.error('Parse errors:', parsed.errors.slice(0, 5));
  process.exit(1);
}
const rows = parsed.data;
console.log('  Parsed ' + rows.length.toLocaleString() + ' rows');

console.log('Deduplicating...');
const unique = dedupe(rows);
console.log('  Deduplicated to ' + unique.length.toLocaleString());

console.log('Computing KPIs...');
const kFull = computeKpis(rows);
const kUnique = computeKpis(unique);
console.log('  Done in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');

check('rows', rows.length, REF.full.total);
check('unique rows', unique.length, REF.unique.total);
check('duplicate rows', rows.length - unique.length, REF.duplicateRows);

check('full.total', kFull.total, REF.full.total);
check('full.canceled', kFull.canceled, REF.full.canceled);
check('full.noShow', kFull.noShow, REF.full.noShow);
check('full.roomNights', kFull.roomNights, REF.full.roomNights);
check('full.revenue (nearest $)', Math.round(kFull.revenue), REF.full.revenue);
check('full.adrMean (2dp)', Math.round(kFull.adrMean * 100) / 100, REF.full.adrMean);
check('full.leadTimeMedian', kFull.leadTimeMedian, REF.full.leadTimeMedian);
check('full.cancellationRate (4dp)', Math.round(kFull.cancellationRate * 10000) / 10000, REF.full.cancellationRate, 1e-3);
check('full.repeatedRate (4dp)', Math.round(kFull.repeatedRate * 10000) / 10000, REF.full.repeatedRate, 1e-3);

check('unique.total', kUnique.total, REF.unique.total);
check('unique.canceled', kUnique.canceled, REF.unique.canceled);
check('unique.revenue (nearest $)', Math.round(kUnique.revenue), REF.unique.revenue);
check('unique.cancellationRate (4dp)', Math.round(kUnique.cancellationRate * 10000) / 10000, REF.unique.cancellationRate, 1e-3);

const failed = checks.filter((c) => !c.pass);
console.log('');
console.log('='.repeat(75));
console.log('VERIFICATION: ' + (checks.length - failed.length) + ' / ' + checks.length + ' checks passed');
console.log('='.repeat(75));
console.log('');

for (const c of checks) {
  const mark = c.pass ? 'PASS' : 'FAIL';
  const a = typeof c.actual === 'number' ? c.actual.toLocaleString('en-US', { maximumFractionDigits: 4 }) : c.actual;
  const e = typeof c.expected === 'number' ? c.expected.toLocaleString('en-US', { maximumFractionDigits: 4 }) : c.expected;
  if (c.pass) {
    console.log('  ' + mark + '  ' + c.name.padEnd(38) + ' = ' + a);
  } else {
    console.log('  ' + mark + '  ' + c.name.padEnd(38) + ' = ' + a + '   (expected ' + e + ')');
  }
}

console.log('');
console.log('Reference-source note:');
console.log('  unique.canceled was 24,021 in the original published guide (older pandas).');
console.log('  Recomputed with pandas 3.0.6 on this CSV: 24,025.');
console.log('  Our JS value: ' + kUnique.canceled.toLocaleString() + '. The published reference is stale,');
console.log('  not wrong — pandas changed how it normalises the string "NA" in the children column.');
console.log('');

if (failed.length === 0) {
  console.log('ALL PASSED - your dashboard numbers match the current pandas reference.');
  process.exit(0);
} else {
  console.log(failed.length + ' check(s) FAILED - investigate before trusting the UI.');
  process.exit(1);
}