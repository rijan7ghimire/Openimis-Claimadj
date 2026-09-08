// In-memory claim book: loads the Nepal synthetic dataset, runs both engines over it in submission order
// (so the review queue is realistic from the first second), and accepts new claims from the app.
import { validateExisting } from './existing.js';
import { matchRules, identityKey, suspicionOf, RULES, WEIGHT } from './rules.js';

// openIMIS status codes (claim/models.py:256-272)
export const STATUS = { REJECTED: 1, ENTERED: 2, CHECKED: 4, PROCESSED: 8, VALUATED: 16 };
export const REVIEW = { IDLE: 1, NOT_SELECTED: 2, SELECTED: 4, DELIVERED: 8, BYPASSED: 16 };
export const STATUS_NAME = { 1: 'Rejected', 2: 'Entered', 4: 'Checked', 8: 'Processed', 16: 'Valuated' };
export const REVIEW_NAME = { 1: 'Idle', 2: 'Not selected', 4: 'Selected', 8: 'Delivered', 16: 'Bypassed' };
const FRAUD = new Set(['within_dup', 'same_episode', 'cross_scheme', 'impossible_overlap', 'resubmission', 'stg_upcode']);

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export class Store {
  constructor(data) {           // the parsed claims.json (Node reads the file; the browser fetches it)
    if (typeof data === 'string') throw new Error('Store expects the parsed dataset object');
    this.meta = data.meta;
    this.priceList = data.price_list;
    this.protocol = Object.fromEntries(Object.entries(data.protocol).map(([k, v]) => [k, { ...v, allow: new Set(v.allow), allowList: v.allow }]));
    this.facilities = Object.fromEntries(data.facilities.map(f => [f.hf_id, f]));
    this.districts = data.districts;
    this.persons = Object.fromEntries(data.persons.map(p => [p.insuree_id, p]));
    this.ref = { priceList: this.priceList, protocol: this.protocol, facilities: this.facilities };
    this.claims = [];            // in submission order
    this.byId = new Map();
    this.index = new Map();      // identity key -> [{claim, verdict}]
    this.seq = { HIB: 0, SSF: 0 };
    this.sessionSeq = 0;
    this.feedback = [];          // reviewer decisions
    this.ruleStats = Object.fromEntries(Object.keys(RULES).map(r => [r, { fired: 0, confirmed: 0, cleared: 0, released: 0 }]));
    this.loadedScenarios = new Set();
    const t0 = Date.now();
    for (const c of data.claims) this.process({ ...c, session: false });
    this.datasetMetrics = this.computeDatasetMetrics();
    console.log(`[store] ${this.claims.length} claims processed in ${Date.now() - t0} ms · ${this.datasetMetrics.flagged} flagged`);
  }

  // ---- the two engines, in order -------------------------------------------------------
  process(c) {
    c.lines = c.lines || [];
    c.timeline = [];
    const stamp = (hop, detail, status) => c.timeline.push({ hop, detail, status });
    stamp('Care delivered', `${c.care_type === 'I' ? 'Inpatient stay' : 'Outpatient visit'} at ${c.hf_name} · ${c.date_from}${c.date_to && c.date_to !== c.date_from ? ' → ' + c.date_to : ''}`);
    c.status = STATUS.ENTERED; c.review_status = REVIEW.IDLE; c.rejection_reason = 0;
    stamp('Claim entered', `code ${c.code} · ${c.scheme} · claimed NPR ${this.amount(c).toLocaleString()}`, 'Entered');

    c.engine1 = validateExisting(c, this.ref);
    const id = identityKey({ name: c.person_name, dob: c.dob, sex: c.sex, national_id: c.national_id });
    c.identity = id;
    const hist = this.index.get(id.key) || [];
    c.history_size = hist.length;
    if (c.engine1.accepted) {
      c.status = STATUS.CHECKED;
      stamp('Automated edits (openIMIS)', c.engine1.because, 'Checked');
      c.flags = matchRules(c, hist, this.ref);
      c.suspicion = suspicionOf(c.flags);
      for (const f of c.flags) this.ruleStats[f.rule].fired++;
      if (c.flags.length) {
        c.review_status = REVIEW.SELECTED; c.routed = 'review';
        stamp('Our layer screened', `${c.flags.length} flag(s): ${c.flags.map(f => f.rule).join(', ')} · suspicion ${c.suspicion} → routed to the review queue`, 'Selected for review');
      } else {
        c.routed = 'payment';
        stamp('Our layer screened', `compared with ${hist.length} prior claim(s) of this person — no rule fired → clean`, 'Clean');
      }
    } else {
      c.status = STATUS.REJECTED; c.rejection_reason = c.engine1.code; c.flags = []; c.suspicion = 0; c.routed = 'rejected';
      stamp('Automated edits (openIMIS)', `REJECTED — reason ${c.engine1.code} ${c.engine1.reason}: ${c.engine1.because}`, 'Rejected');
    }
    // remember everything (a rejected claim is exactly what R5 looks back to)
    if (!this.index.has(id.key)) this.index.set(id.key, []);
    this.index.get(id.key).push({ claim: c, verdict: c.engine1 });
    this.claims.push(c); this.byId.set(c.claim_id, c);
    return c;
  }

  amount(c) { return (c.lines || []).reduce((s, l) => s + (this.priceList[l.code] || 0) * l.qty, 0); }

  nextCode(scheme) { this.seq[scheme]++; return (scheme === 'HIB' ? '' : 'SSF-') + this.meta.fiscal_year_prefix + 'A' + String(this.seq[scheme]).padStart(5, '0'); }

  // ---- new claims from the app --------------------------------------------------------
  submit(person, draft, opts = {}) {
    const fac = this.facilities[draft.facility_id];
    if (!fac) throw new Error('unknown facility ' + draft.facility_id);
    this.sessionSeq++;
    const c = {
      claim_id: 'S' + String(this.sessionSeq).padStart(4, '0'), code: this.nextCode(draft.scheme), scheme: draft.scheme,
      insuree_id: person.insuree_id, person_name: draft.name_override || person.name, dob: person.dob, sex: person.sex,
      national_id: person.national_id || null, facility_id: fac.hf_id, hf_name: fac.name, district: fac.district, province: fac.province,
      care_type: draft.care_type, date_from: draft.date_from, date_to: draft.care_type === 'I' ? draft.date_to : draft.date_from,
      diagnosis: draft.diagnosis, lines: draft.lines.map(l => ({ code: l.code, qty: Number(l.qty) || 1 })),
      policy_active: draft.scheme === 'HIB' ? person.hib_policy_active !== false : true,
      chf_id: draft.scheme === 'HIB' ? (person.hib_id || '') : (person.ssf_id || ''), nmc_no: draft.nmc_no || (fac.doctors?.[0] ?? ''),
      truth: opts.truth || 'unknown', note: opts.note || '', linked_claim: null, injected: false, session: true, scenario: opts.scenario || null,
    };
    return this.process(c);
  }

  /** Re-running a scenario should feel fresh: drop the claims submitted for it earlier this session (priors stay). */
  forgetScenario(id) {
    const drop = this.claims.filter(c => c.session && c.scenario === id);
    if (!drop.length) return 0;
    const ids = new Set(drop.map(c => c.claim_id));
    for (const c of drop) for (const f of c.flags || []) this.ruleStats[f.rule].fired = Math.max(0, this.ruleStats[f.rule].fired - 1);
    this.claims = this.claims.filter(c => !ids.has(c.claim_id));
    for (const i of ids) this.byId.delete(i);
    for (const [k, arr] of this.index) { const kept = arr.filter(e => !ids.has(e.claim.claim_id)); kept.length ? this.index.set(k, kept) : this.index.delete(k); }
    return drop.length;
  }

  // ---- review ---------------------------------------------------------------------------
  review(id, decision, note = '', reviewer = 'Medical Officer') {
    const c = this.byId.get(id); if (!c) throw new Error('unknown claim');
    const stamp = (hop, detail, status) => c.timeline.push({ hop, detail, status });
    c.review_status = REVIEW.DELIVERED; c.review = { decision, note, reviewer, at: new Date().toISOString() };
    for (const f of c.flags) this.ruleStats[f.rule][decision === 'confirm' ? 'confirmed' : decision === 'clear' ? 'cleared' : 'released']++;
    this.feedback.push({ claim_id: id, decision, rules: c.flags.map(f => f.rule), truth: c.truth, note });
    if (decision === 'confirm') {
      c.status = STATUS.REJECTED; c.rejection_reason = 6;
      stamp('Review delivered', `${reviewer} CONFIRMED the flag · rejection reason 6 "Item/Service duplicated"${note ? ' · ' + note : ''}`, 'Rejected');
      stamp('Feedback to the rule base', `decision recorded against ${c.flags.map(f => f.rule).join(', ')} — confirmed (weights up)`);
    } else {
      stamp('Review delivered', `${reviewer} ${decision === 'clear' ? 'CLEARED the flag (false positive)' : 'RELEASED the claim'}${note ? ' · ' + note : ''}`, 'Delivered');
      stamp('Feedback to the rule base', `decision recorded against ${c.flags.map(f => f.rule).join(', ')} — ${decision === 'clear' ? 'cleared (weights down)' : 'released'}`);
      this.settle(c);
    }
    return c;
  }

  settle(c) {
    const stamp = (hop, detail, status) => c.timeline.push({ hop, detail, status });
    c.status = STATUS.PROCESSED; stamp('Processed', 'valuation: ceilings, deductibles and co-payments applied per product', 'Processed');
    c.status = STATUS.VALUATED; stamp('Valuated', `approved NPR ${this.amount(c).toLocaleString()}`, 'Valuated');
    stamp('Batch run', 'monthly relative-price batch for the facility\'s district (claim_batch) — payment now irreversible');
    stamp('Accounts section', 'settlement recommendation prepared');
    stamp('Executive Director approval', 'payment approved');
    stamp('Paid to facility', `NPR ${this.amount(c).toLocaleString()} transferred to ${c.hf_name}`, 'Paid');
    c.paid = true;
  }

  // ---- queue ---------------------------------------------------------------------------
  queue(mode = 'triage', limit = 60) {
    const pool = this.claims.filter(c => c.status === STATUS.CHECKED && c.review_status !== REVIEW.DELIVERED);
    const budget = Math.max(1, Math.round(0.05 * this.claims.length));
    const flagged = pool.filter(c => c.flags.length).sort((a, b) => b.suspicion - a.suspicion || (a.session === b.session ? a.claim_id.localeCompare(b.claim_id) : a.session ? -1 : 1));
    const rnd = mulberry32(7); const shuffled = [...pool].sort(() => rnd() - 0.5).slice(0, budget);
    const frauds = (arr) => arr.filter(c => FRAUD.has(c.truth)).length;
    const items = (mode === 'random' ? shuffled : flagged).slice(0, limit).map(c => this.summary(c));
    return {
      mode, budget, total_pool: pool.length, total_flagged: flagged.length, items,
      comparison: { triage: { reviewed: Math.min(budget, flagged.length), frauds: frauds(flagged.slice(0, budget)) }, random: { reviewed: shuffled.length, frauds: frauds(shuffled) } },
    };
  }

  summary(c) {
    return {
      claim_id: c.claim_id, code: c.code, scheme: c.scheme, person_name: c.person_name, hf_name: c.hf_name, district: c.district,
      date_from: c.date_from, date_to: c.date_to, care_type: c.care_type, diagnosis: c.diagnosis, dx_label: this.protocol[c.diagnosis]?.label || '',
      amount: this.amount(c), status: c.status, status_name: STATUS_NAME[c.status], review_status: c.review_status, review_name: REVIEW_NAME[c.review_status],
      rejection_reason: c.rejection_reason, suspicion: c.suspicion || 0, rules: [...new Set((c.flags || []).map(f => f.rule))], truth: c.truth, session: !!c.session,
      identity: c.identity?.kind, national_id: c.national_id, chf_id: c.chf_id, nmc_no: c.nmc_no, routed: c.routed, paid: !!c.paid,
    };
  }

  detail(id) {
    const c = this.byId.get(id); if (!c) return null;
    const matched = [...new Set((c.flags || []).map(f => f.matched).filter(Boolean))].map(m => ({ ...this.summary(this.byId.get(m)), lines: this.byId.get(m).lines, national_id: this.byId.get(m).national_id, person_name: this.byId.get(m).person_name }));
    return { ...this.summary(c), lines: c.lines, engine1: c.engine1, flags: c.flags, identity: c.identity, history_size: c.history_size, timeline: c.timeline,
      matched, review: c.review || null, note: c.note, linked_claim: c.linked_claim, dob: c.dob, sex: c.sex, policy_active: c.policy_active, province: c.province, scenario: c.scenario || null };
  }

  personHistory(insuree_id) { return this.claims.filter(c => c.insuree_id === insuree_id).map(c => this.summary(c)); }

  searchPersons(q, limit = 12) {
    const s = (q || '').toLowerCase().trim();
    const out = [];
    for (const p of Object.values(this.persons)) {
      if (!s || p.name.toLowerCase().includes(s) || p.insuree_id.toLowerCase().includes(s) || (p.national_id || '').toLowerCase().includes(s) || (p.hib_id || '').includes(s) || (p.ssf_id || '').includes(s)) {
        out.push({ ...p, claims: this.claims.filter(c => c.insuree_id === p.insuree_id).length });
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  // ---- metrics --------------------------------------------------------------------------
  computeDatasetMetrics() {
    const ds = this.claims.filter(c => !c.session);
    const frauds = ds.filter(c => FRAUD.has(c.truth));
    const flagged = ds.filter(c => c.flags.length);
    const tp = flagged.filter(c => FRAUD.has(c.truth)).length, fp = flagged.length - tp, fn = frauds.length - tp;
    const exRej = ds.filter(c => c.status === STATUS.REJECTED), exRejFraud = exRej.filter(c => FRAUD.has(c.truth)).length;
    const kind = (c) => c.truth === 'cross_scheme' && (c.note || '').startsWith('HARD') ? 'cross_scheme (hard: no NID + name variant)' : c.truth;
    const byType = {};
    for (const c of frauds) { const k = kind(c); byType[k] = byType[k] || { planted: 0, caught: 0 }; byType[k].planted++; if (c.flags.length) byType[k].caught++; }
    const byRule = {};
    for (const c of flagged) for (const r of new Set(c.flags.map(f => f.rule))) { byRule[r] = byRule[r] || { fired: 0, fraud: 0 }; byRule[r].fired++; if (FRAUD.has(c.truth)) byRule[r].fraud++; }
    const budget = Math.max(1, Math.round(0.05 * ds.length));
    const ranked = [...flagged].sort((a, b) => b.suspicion - a.suspicion).slice(0, budget);
    const rnd = mulberry32(7); const sample = [...ds].sort(() => rnd() - 0.5).slice(0, budget);
    const fr = (arr) => arr.filter(c => FRAUD.has(c.truth)).length;
    return {
      claims: ds.length, frauds: frauds.length, fraud_rate: frauds.length / ds.length, flagged: flagged.length, tp, fp, fn,
      precision: tp / (flagged.length || 1), recall: tp / (frauds.length || 1), existing_rejected: exRej.length, existing_rejected_fraud: exRejFraud,
      byType, byRule, budget, triage: { reviewed: ranked.length, frauds: fr(ranked) }, random: { reviewed: sample.length, frauds: fr(sample) },
      schemes: { HIB: ds.filter(c => c.scheme === 'HIB').length, SSF: ds.filter(c => c.scheme === 'SSF').length },
      inpatient: ds.filter(c => c.care_type === 'I').length, persons: Object.keys(this.persons).length,
      dual: Object.values(this.persons).filter(p => p.hib_id && p.ssf_id).length, with_nid: Object.values(this.persons).filter(p => p.national_id).length,
    };
  }

  metrics() {
    const session = this.claims.filter(c => c.session);
    return { dataset: this.datasetMetrics, rules: RULES, weights: WEIGHT, ruleStats: this.ruleStats, feedback: this.feedback,
      session: { submitted: session.length, flagged: session.filter(c => c.flags.length).length, reviewed: session.filter(c => c.review).length, paid: session.filter(c => c.paid).length, rejected: session.filter(c => c.status === STATUS.REJECTED).length } };
  }
}
