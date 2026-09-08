// Honest evaluation: runs the UNCHANGED engines on (A) the training book the rules were developed against and
// (B) the independent, behaviour-based validation book, and writes data/evaluation.json for the dashboard.
//   node evaluate.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store, FRAUD } from './engine/store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const load = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, 'data', f), 'utf-8'));
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function evaluate(name, data, note) {
  const store = new Store(data);
  const ds = store.claims;
  const m = store.datasetMetrics;
  const isFraud = (c) => FRAUD.has(c.truth);
  const flagged = ds.filter(c => c.flags?.length), frauds = ds.filter(isFraud);
  // false positives grouped by what the generator says the claim actually was
  const fpCause = {};
  for (const c of flagged.filter(c => !isFraud(c))) {
    const k = (c.note || 'legitimate look-alike').replace(/\d+ ?d(ay)?s?\b/g, 'N d').replace(/ \(lag .*?\)/, '').slice(0, 70);
    fpCause[k] = fpCause[k] || { n: 0, rules: {} }; fpCause[k].n++;
    for (const r of new Set(c.flags.map(f => f.rule))) fpCause[k].rules[r] = (fpCause[k].rules[r] || 0) + 1;
  }
  // misses grouped by fraud type and by the note (why the rule could not see it)
  const missCause = {};
  for (const c of frauds.filter(c => !c.flags?.length)) {
    const k = `${c.truth} — ${(c.note || '').replace(/\d+ ?d(ay)?s?\b/g, 'N d').slice(0, 70)}`;
    missCause[k] = (missCause[k] || 0) + 1;
  }
  // random 5 % sample: how many frauds it finds, over many draws
  const budget = Math.max(1, Math.round(0.05 * ds.length));
  const draws = [];
  for (let seed = 1; seed <= 30; seed++) { const rnd = mulberry32(seed); draws.push([...ds].sort(() => rnd() - 0.5).slice(0, budget).filter(isFraud).length); }
  draws.sort((a, b) => a - b);
  const ranked = [...flagged].sort((a, b) => b.suspicion - a.suspicion).slice(0, budget).filter(isFraud).length;
  // what the existing engine did
  const rejected = ds.filter(c => c.status === 1);
  return {
    name, note, claims: ds.length, persons: Object.keys(store.persons).length, frauds: frauds.length, fraud_rate: frauds.length / ds.length,
    flagged: flagged.length, tp: m.tp, fp: m.fp, fn: m.fn, precision: m.precision, recall: m.recall,
    byType: m.byType, byRule: m.byRule,
    existing: { rejected: rejected.length, rejected_fraud: rejected.filter(isFraud).length },
    budget, ranked_frauds: ranked, random: { mean: draws.reduce((a, b) => a + b, 0) / draws.length, min: draws[0], max: draws[draws.length - 1], draws: draws.length },
    fp_causes: Object.entries(fpCause).sort((a, b) => b[1].n - a[1].n).map(([cause, v]) => ({ cause, n: v.n, rules: Object.entries(v.rules).map(([r, n]) => `${r}×${n}`).join(' ') })),
    miss_causes: Object.entries(missCause).sort((a, b) => b[1] - a[1]).map(([cause, n]) => ({ cause, n })),
  };
}

const A = evaluate('training book', load('claims.json'), 'the book the rules were developed and tuned on (nepal_synthetic_claims.py, seed 42)');
const B = fs.existsSync(path.join(__dirname, 'data', 'validation.json'))
  ? evaluate('validation book', load('validation.json'), 'independent, behaviour-based generator written without the rules\' thresholds (nepal_validation_book.py, seed 2026)')
  : null;
const out = {
  generated_at: new Date().toISOString(),
  coupling: 'The same team wrote the rules and the training generator, whose fraud injection is close to the rules written backwards (same date, shared service, ±2 days). Numbers on the training book therefore measure how well the rules hit their own targets. The validation book was generated from simulated behaviour with lags drawn from distributions, fraud concentrated in a few facilities and dual-enrolled patients, fraud types the rules do not target, and honest confounders — and the engines were run on it unchanged.',
  books: [A, B].filter(Boolean),
};
fs.writeFileSync(path.join(__dirname, 'data', 'evaluation.json'), JSON.stringify(out, null, 1));
for (const b of out.books) console.log(`${b.name}: ${b.claims} claims · ${b.frauds} fraud · precision ${(100 * b.precision).toFixed(1)}% · recall ${(100 * b.recall).toFixed(1)}% · ranked ${b.ranked_frauds} vs random ${b.random.mean.toFixed(1)} (${b.random.min}–${b.random.max}) @ ${b.budget}`);
console.log('wrote data/evaluation.json');
