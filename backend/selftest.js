// Runs every guided scenario through the engines and checks the expected rule fires — no server needed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './engine/store.js';
import { SCENARIOS } from './scenarios.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const store = new Store(JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'claims.json'), 'utf-8')));
const byName = (n) => Object.values(store.facilities).find(f => f.name === n);
const fd = (d) => ({ ...d, facility_id: byName(d.facility).hf_id, date_to: d.date_to || d.date_from });

const EXPECT = { clean: [], within_dup: ['R1'], cross_scheme: ['R3', 'R4'], cross_composite: ['R3'], cross_hard: [], overlap: ['R4'],
  resubmission: ['R5'], upcode: ['STG'], legit_split: ['R2'], lapsed: [] };
let ok = 0, bad = 0;
for (const s of SCENARIOS) {
  for (const p of s.priors) { const pc = store.submit(s.person, fd(p), { scenario: s.id + ':prior' }); if (pc.flags.length) { console.log(`FAIL  ${s.id} prior ${pc.code} unexpectedly flagged: ${pc.flags.map(f => f.rule)}`); bad++; } }
  const c = store.submit(s.person, fd(s.claim), { scenario: s.id, truth: s.truth || 'legitimate' });
  const got = [...new Set(c.flags.map(f => f.rule))].sort().join(',');
  const want = EXPECT[s.id].sort().join(',');
  const e1 = c.engine1.accepted ? 'ACCEPT' : `REJECT ${c.engine1.code}`;
  const pass = got === want && (s.id !== 'lapsed' || !c.engine1.accepted) && (s.id !== 'resubmission' || c.flags.length);
  pass ? ok++ : bad++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${s.id.padEnd(16)} engine1=${e1.padEnd(10)} rules=[${got}] expected=[${want}] suspicion=${c.suspicion}`);
}
const m = store.datasetMetrics;
console.log(`\ndataset: ${m.claims} claims · ${m.frauds} fraud · precision ${(m.precision * 100).toFixed(1)}% · recall ${(m.recall * 100).toFixed(1)}% · triage ${m.triage.frauds} vs random ${m.random.frauds} @ ${m.budget}`);
console.log(`${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
