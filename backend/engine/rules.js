// ENGINE 2 — OUR ADDITION. Compares the incoming claim with the person's claim HISTORY (across facilities and across
// schemes) over a resolved identity, plus a few provider-level signals, and emits weighted, explained flags.
// It never rejects. R1–R5 + STG come from the Week 2 catalog and the HIB expert interview; R6–R8 and the
// revisions of R1/R3/R4/R5/STG come from the claim-adjudication report (2025) and the validation-book findings.

export const WEIGHT = { high: 3, medium: 2, low: 1 };
export const R3_WINDOW_DAYS = 2;    // same episode is often claimed in the other scheme a day or two later
export const R1_NEAR_DAYS = 14;     // identical line set re-billed within two weeks (validation book: re-bills lag 0–14 d)
export const R5_LOOKBACK_DAYS = 14; // validation book: resubmissions lag 1–14 d
export const R8_WINDOW_DAYS = 30;
export const R6_MIN_CLAIMS = 20, R6_RATE_FACTOR = 3, R6_MIN_RATE = 0.25;   // judged on strong flags (R1–R5, STG, R8) over the facility's last 100 claims

const DAY = 86400000;
const d = (s) => new Date(s + 'T00:00:00Z').getTime();
const days = (a, b) => Math.round((d(a) - d(b)) / DAY);

export function identityKey(p) {
  if (p.national_id) return { kind: 'NID', key: 'NID:' + p.national_id };
  const norm = String(p.name || '').toLowerCase().split(/\s+/).filter(Boolean).join(' ');
  return { kind: 'COMPOSITE', key: `COMP:${norm}|${p.dob}|${p.sex}` };
}

export function overlaps(a, b, window = 0) {
  const w = window * DAY;
  const aF = d(a.date_from), aT = d(a.date_to || a.date_from), bF = d(b.date_from), bT = d(b.date_to || b.date_from);
  return aF <= bT + w && bF <= aT + w;
}

const codes = (c) => new Set((c.lines || []).map(l => l.code));
const inter = (A, B) => [...A].filter(x => B.has(x));
const los = (c) => days(c.date_to || c.date_from, c.date_from);
const sameSet = (A, B) => A.size === B.size && [...A].every(x => B.has(x));
// services that legitimately repeat (dialysis, chemotherapy, ward days, consultations) — never evidence on their own
const REPEATABLE = new Set(['DIALYSIS', 'CHEMO-CYCLE', 'WARD-DAY', 'ICU-DAY', 'DRUGS-IPD', 'IV-FLUIDS', 'OXYGEN-DAY', 'CONS-OPD']);
// R8: how often the same service for the same person is plausible in 30 days
const FREQ_LIMIT = (code) => code === 'CONS-OPD' ? 4 : /^(CT|MRI|USG|XRAY|ECHO|ECG)/.test(code) ? 2 : /^LAB/.test(code) ? 3 : 3;

export const RULES = {
  R1: { name: 'Within-scheme duplicate (same day, or identical bill within 14 days)', weight: 'high', source: 'rule catalog R1 · reason 6 (disabled) · validation book: re-bills lag 0–14 d' },
  R2: { name: 'Same-episode split billing (vault)', weight: 'medium', source: 'rule catalog R2 · SSF claim vault (facility + contributor + visit-date)' },
  R3: { name: 'Cross-scheme duplicate (HIB ↔ SSF)', weight: 'high', source: 'rule catalog R3 · independent ledgers (04_duplicate_crossscheme_gap) · composite identity → medium' },
  R4: { name: 'Overlapping inpatient stays (transfer-aware)', weight: 'high', source: 'rule catalog R4 · "impossible day" · report: ghost / phantom hospitalisation · validation book: transfers' },
  R5: { name: 'Resubmission gaming (new code after a rejection)', weight: 'medium', source: 'rule catalog R5 · edit-gaming attack surface · validation book: honest corrections' },
  STG: { name: 'Off-protocol services, over-long stay or unnecessary admission', weight: 'medium', source: 'expert interview: standard treatment protocol · reason 8 (ICD) disabled · report: medical necessity, diagnosis–treatment consistency' },
  R6: { name: 'Provider concentration (facility flag rate far above peers)', weight: 'low', source: 'report: peer benchmarking, PM-JAY provider profiling and de-empanelment · Providers view' },
  R7: { name: 'One doctor, two facilities, same day', weight: 'low', source: 'ontology red flag rfSameProviderManyFacilities · report: ghost hospitalisation, duty-hour billing' },
  R8: { name: 'Service frequency beyond what the diagnosis warrants', weight: 'medium', source: 'report: unnecessary tests (HIB 10 % co-payment, Jan 2024) · Taiwan NHI real-time duplicate-service check · HIRA drug-utilisation review' },
};

/**
 * @param claim    incoming claim (already passed engine 1)
 * @param history  prior claims of the SAME identity, each {claim, verdict}
 * @param ref      {protocol: {dx: {allow:Set, max_los, ipd}}}
 * @param ctx      optional provider context: { facility: {claims, flagged, medianRate}, doctorClaims: [prior claims with the same NMC no.] }
 */
export function matchRules(claim, history, ref, ctx = {}) {
  const flags = [];
  const flag = (rule, matched, because, weight) => flags.push({ rule, ...RULES[rule], ...(weight ? { weight } : {}), claim_id: claim.claim_id, matched, because });
  const cc = codes(claim);
  const nonRepeat = [...cc].filter(x => !REPEATABLE.has(x));
  const proto = ref.protocol[claim.diagnosis];
  // dialysis / chemotherapy protocols legitimately repeat the same bill every few days: no near-duplicate or frequency evidence there
  const repeatDx = !!proto && [...proto.allow].some(x => x === 'DIALYSIS' || x === 'CHEMO-CYCLE');

  for (const { claim: prev, verdict } of history) {
    const pc = codes(prev), shared = inter(pc, cc), gap = Math.abs(days(claim.date_from, prev.date_from));

    // R1 — same person, same scheme, same date, a shared service (high); or the identical bill re-entered within 14 days (medium)
    if (prev.scheme === claim.scheme && prev.date_from === claim.date_from && shared.length) {
      flag('R1', prev.claim_id, `same person, same scheme (${claim.scheme}), same date (${claim.date_from}) and a shared service [${shared.join(', ')}] as ${prev.claim_id} — one service cannot be billed twice.`);
    } else if (!repeatDx && prev.scheme === claim.scheme && gap > 0 && gap <= R1_NEAR_DAYS && nonRepeat.length && sameSet(pc, cc) && prev.diagnosis === claim.diagnosis) {
      flag('R1', prev.claim_id, `the same bill as ${prev.claim_id} (${[...cc].join(', ')}, ${claim.diagnosis}) re-entered ${gap} day(s) later under a new claim code — a re-billed visit, unless the treatment genuinely repeats.`, 'medium');
    }
    // R2 — same person, same facility, same visit date, different lines (the SSF vault key)
    else if (prev.scheme === claim.scheme && prev.facility_id === claim.facility_id && prev.date_from === claim.date_from) {
      flag('R2', prev.claim_id, `same person, same facility (${claim.hf_name}) and same visit date (${claim.date_from}) as ${prev.claim_id}, but different lines — one episode possibly split into two claims.`);
    }
    // R3 — different scheme, overlapping dates (±window), same diagnosis or a shared service; weight follows identity confidence
    if (prev.scheme !== claim.scheme && overlaps(prev, claim, R3_WINDOW_DAYS) && (prev.diagnosis === claim.diagnosis || shared.length)) {
      const id = identityKey(claim);
      flag('R3', prev.claim_id, `same person (matched on ${id.kind === 'NID' ? 'National ID' : 'composite key: name + DOB + sex — could be a namesake'}) with the same diagnosis/service within ${R3_WINDOW_DAYS} days of ${prev.claim_id}, but a DIFFERENT scheme (${prev.scheme} vs ${claim.scheme}) — neither system sees the other today.`, id.kind === 'NID' ? undefined : 'medium');
    }
    // R4 — two inpatient stays overlapping: at different facilities (unless a same-day transfer) or at the same facility (phantom re-admission)
    if (claim.care_type === 'I' && prev.care_type === 'I' && overlaps(prev, claim)) {
      // a transfer: discharged here and admitted there the same day, for the same diagnosis (a referral keeps its diagnosis)
      const transfer = prev.facility_id !== claim.facility_id && prev.diagnosis === claim.diagnosis && (prev.date_to === claim.date_from || claim.date_to === prev.date_from);
      if (transfer) { /* discharged here, admitted there the same day: a referral, not an impossibility */ }
      else if (prev.facility_id !== claim.facility_id) flag('R4', prev.claim_id, `admission ${claim.date_from}..${claim.date_to} at ${claim.hf_name} overlaps the inpatient stay ${prev.date_from}..${prev.date_to} at ${prev.hf_name} (${prev.claim_id}) — a patient cannot be admitted in two places at once.`);
      else flag('R4', prev.claim_id, `a second inpatient stay ${claim.date_from}..${claim.date_to} at ${claim.hf_name} overlaps the stay ${prev.date_from}..${prev.date_to} already billed by the same facility (${prev.claim_id}) — one admission billed twice, or a phantom re-admission.`, 'medium');
    }
    // R5 — a prior REJECTED claim, same diagnosis, within 14 days, and the new claim INTRODUCES a code the rejected one did not have
    if (verdict && !verdict.accepted && prev.diagnosis === claim.diagnosis && gap <= R5_LOOKBACK_DAYS) {
      const introduced = [...cc].filter(x => !pc.has(x));
      if (introduced.length) flag('R5', prev.claim_id, `resembles ${prev.claim_id}, which was rejected (reason ${verdict.code} ${verdict.reason}) ${gap} day(s) earlier for the same diagnosis, and now carries a code it did not have [${introduced.join(', ')}] — a swap to get past the edit. (Simply removing the rejected line would not fire this rule.)`);
    }
  }

  // R8 — the same service for the same person more often in 30 days than the diagnosis warrants
  for (const code of repeatDx ? [] : nonRepeat) {
    const n = history.filter(({ claim: prev }) => codes(prev).has(code) && Math.abs(days(claim.date_from, prev.date_from)) <= R8_WINDOW_DAYS).length;
    if (n >= FREQ_LIMIT(code)) { flag('R8', null, `${code} billed ${n + 1} times for this person in ${R8_WINDOW_DAYS} days (limit ${FREQ_LIMIT(code)}) — repeated tests or visits beyond what ${claim.diagnosis} warrants.`); break; }
  }

  // STG — standard-treatment-protocol conformance (per claim; openIMIS has no diagnosis check)
  if (proto) {
    const off = [...cc].filter(x => !proto.allow.has(x)).sort();
    if (off.length) flag('STG', null, `diagnosis ${claim.diagnosis} (${proto.label}) does not warrant [${off.join(', ')}] under the standard treatment protocol — a possible upcode / unbundling.`);
    else if (claim.care_type === 'I' && proto.ipd === 0) flag('STG', null, `${claim.diagnosis} (${proto.label}) is an outpatient condition under the protocol, yet this is an inpatient admission — unnecessary hospitalisation.`);
    else if (los(claim) > proto.max_los) flag('STG', null, `length of stay ${los(claim)} days exceeds the typical ${proto.max_los} for ${claim.diagnosis} (${proto.label}).`);
  }

  // R7 — the treating doctor's NMC number is on another facility's claim on the same day(s)
  for (const other of ctx.doctorClaims || []) {
    if (other.facility_id !== claim.facility_id && overlaps(other, claim)) {
      flag('R7', other.claim_id, `NMC ${claim.nmc_no} is the treating doctor on ${other.claim_id} at ${other.hf_name} on the same day(s) (${other.date_from}) — one doctor billing from two facilities at once.`); break;
    }
  }
  // R6 — the facility's flag rate is far above its peers (only once there is enough history to judge)
  const f = ctx.facility;
  if (f && f.claims >= R6_MIN_CLAIMS && f.medianRate > 0 && f.flagged / f.claims >= R6_MIN_RATE && f.flagged / f.claims > R6_RATE_FACTOR * f.medianRate) {
    flag('R6', null, `${claim.hf_name} has had ${f.flagged} of its last ${f.claims} claims flagged (${(100 * f.flagged / f.claims).toFixed(0)} %, peers ${(100 * f.medianRate).toFixed(0)} %) — fraud clusters in a few providers, so every claim from here deserves a closer look.`);
  }

  // subsumption: an R4 overlap against the same matched claim as an R3 cross-scheme hit is the same event seen twice
  const r3 = new Set(flags.filter(x => x.rule === 'R3').map(x => x.matched));
  for (const x of flags) if (x.rule === 'R4' && r3.has(x.matched)) x.subsumedBy = 'R3';
  return flags;
}

export const suspicionOf = (flags) => flags.reduce((s, f) => s + (f.subsumedBy ? 0 : WEIGHT[f.weight]), 0);
