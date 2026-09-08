// ENGINE 2 — OUR ADDITION. Ported 1:1 from prototype/prototype_rule_engine.py (R1–R5 + STG).
// Compares the incoming claim with the person's claim HISTORY (across facilities and across schemes),
// over a resolved identity, and emits weighted, explained flags. It never rejects.

export const WEIGHT = { high: 3, medium: 2, low: 1 };
export const R3_WINDOW_DAYS = 2;   // same episode is often claimed in the other scheme a day or two later

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

export const RULES = {
  R1: { name: 'Within-scheme exact duplicate', weight: 'high', source: 'rule catalog R1 · reason 6 (disabled in openIMIS)' },
  R2: { name: 'Same-episode split billing (vault)', weight: 'medium', source: 'rule catalog R2 · SSF claim vault (facility + contributor + visit-date)' },
  R3: { name: 'Cross-scheme duplicate (HIB ↔ SSF)', weight: 'high', source: 'rule catalog R3 · independent ledgers (04_duplicate_crossscheme_gap)' },
  R4: { name: 'Impossible overlap (two facilities at once)', weight: 'high', source: 'rule catalog R4 · "impossible day" red flag' },
  R5: { name: 'Resubmission gaming', weight: 'medium', source: 'rule catalog R5 · edit-gaming attack surface' },
  STG: { name: 'Off-protocol services for the diagnosis', weight: 'medium', source: 'expert interview: standard treatment protocol · reason 8 (ICD) disabled' },
};

/**
 * @param claim  incoming claim (already passed engine 1)
 * @param history  prior claims of the SAME identity, each {claim, verdict}
 * @param ref  {protocol: {dx: {allow:Set, max_los}}}
 */
export function matchRules(claim, history, ref) {
  const flags = [];
  const flag = (rule, matched, because) => flags.push({ rule, ...RULES[rule], claim_id: claim.claim_id, matched, because });
  const cc = codes(claim);

  for (const { claim: prev, verdict } of history) {
    const pc = codes(prev), shared = inter(pc, cc);

    // R1 — same person, same scheme, same date, a shared service
    if (prev.scheme === claim.scheme && prev.date_from === claim.date_from && shared.length) {
      flag('R1', prev.claim_id, `same person, same scheme (${claim.scheme}), same date (${claim.date_from}) and a shared service [${shared.join(', ')}] as ${prev.claim_id} — one service cannot be billed twice.`);
    }
    // R2 — same person, same facility, same visit date, different lines (the SSF vault key)
    else if (prev.scheme === claim.scheme && prev.facility_id === claim.facility_id && prev.date_from === claim.date_from) {
      flag('R2', prev.claim_id, `same person, same facility (${claim.hf_name}) and same visit date (${claim.date_from}) as ${prev.claim_id}, but different lines — one episode possibly split into two claims.`);
    }
    // R3 — different scheme, overlapping dates (±window), same diagnosis or a shared service
    if (prev.scheme !== claim.scheme && overlaps(prev, claim, R3_WINDOW_DAYS) && (prev.diagnosis === claim.diagnosis || shared.length)) {
      const id = identityKey(claim);
      flag('R3', prev.claim_id, `same person (matched on ${id.kind === 'NID' ? 'National ID' : 'composite key: name + DOB + sex'}) with the same diagnosis/service within ${R3_WINDOW_DAYS} days of ${prev.claim_id}, but a DIFFERENT scheme (${prev.scheme} vs ${claim.scheme}) — neither system sees the other today.`);
    }
    // R4 — two inpatient stays overlapping at different facilities
    if (claim.care_type === 'I' && prev.care_type === 'I' && prev.facility_id !== claim.facility_id && overlaps(prev, claim)) {
      flag('R4', prev.claim_id, `admission ${claim.date_from}..${claim.date_to} at ${claim.hf_name} overlaps the inpatient stay ${prev.date_from}..${prev.date_to} at ${prev.hf_name} (${prev.claim_id}) — a patient cannot be admitted in two places at once.`);
    }
    // R5 — a prior REJECTED claim, same diagnosis, within 7 days, with changed codes
    if (verdict && !verdict.accepted && prev.diagnosis === claim.diagnosis && Math.abs(days(claim.date_from, prev.date_from)) <= 7 && ([...pc].sort().join() !== [...cc].sort().join())) {
      flag('R5', prev.claim_id, `resembles ${prev.claim_id}, which was rejected (reason ${verdict.code} ${verdict.reason}) ${Math.abs(days(claim.date_from, prev.date_from))} day(s) earlier for the same diagnosis, but the codes were changed ([${[...pc].join(', ')}] → [${[...cc].join(', ')}]).`);
    }
  }

  // STG — standard-treatment-protocol conformance (per claim; openIMIS has no diagnosis check)
  const proto = ref.protocol[claim.diagnosis];
  if (proto) {
    const off = [...cc].filter(x => !proto.allow.has(x)).sort();
    if (off.length) flag('STG', null, `diagnosis ${claim.diagnosis} (${proto.label}) does not warrant [${off.join(', ')}] under the standard treatment protocol — a possible upcode / unbundling.`);
    else if (los(claim) > proto.max_los) flag('STG', null, `length of stay ${los(claim)} days exceeds the typical ${proto.max_los} for ${claim.diagnosis} (${proto.label}).`);
  }
  return flags;
}

export const suspicionOf = (flags) => flags.reduce((s, f) => s + WEIGHT[f.weight], 0);
