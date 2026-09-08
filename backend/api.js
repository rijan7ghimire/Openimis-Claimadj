// Transport-independent API: the same functions serve the Express routes (server.js) and the in-browser
// static build (frontend/src/api.js when VITE_STATIC=true, used for GitHub Pages). Errors are thrown as
// Error objects with an optional `.status`.
import { STATUS_NAME, REVIEW_NAME } from './engine/store.js';
import { SCENARIOS } from './scenarios.js';
import { RULES, WEIGHT, R3_WINDOW_DAYS } from './engine/rules.js';
import { REJECTION_CODES } from './engine/existing.js';

const fail = (status, message) => { const e = new Error(message); e.status = status; return e; };

export function createApi(store) {
  const findFacility = (name) => Object.values(store.facilities).find(f => f.name === name);
  const facilityDraft = (d) => {
    const f = findFacility(d.facility); if (!f) throw fail(500, 'scenario facility not found: ' + d.facility);
    return { ...d, facility_id: f.hf_id, nmc_no: f.doctors?.[0] || '', date_to: d.date_to || d.date_from };
  };
  return {
    reference: () => ({
      meta: store.meta, priceList: store.priceList,
      protocol: Object.fromEntries(Object.entries(store.protocol).map(([k, v]) => [k, { label: v.label, allow: v.allowList, max_los: v.max_los, ipd: v.ipd }])),
      facilities: Object.values(store.facilities), districts: store.districts, rules: RULES, weights: WEIGHT, r3_window_days: R3_WINDOW_DAYS,
      rejectionCodes: REJECTION_CODES, statusNames: STATUS_NAME, reviewNames: REVIEW_NAME,
    }),
    persons: (q, limit = 12) => store.searchPersons(q, Number(limit) || 12),
    personHistory: (id) => store.personHistory(id),
    scenarios: () => SCENARIOS.map(({ id, title, tagline, expect, truth, hard }) => ({ id, title, tagline, expect, truth: truth || 'legitimate', hard: !!hard, loaded: store.loadedScenarios.has(id) })),
    loadScenario: (id) => {
      const s = SCENARIOS.find(x => x.id === id); if (!s) throw fail(404, 'no such scenario');
      store.forgetScenario(s.id);
      let priors;
      if (store.loadedScenarios.has(s.id)) priors = store.claims.filter(c => c.scenario === s.id + ':prior').map(c => store.summary(c));
      else {
        priors = s.priors.map(d => store.summary(store.submit(s.person, facilityDraft(d), { scenario: s.id + ':prior', truth: 'legitimate', note: 'scenario prior' })));
        store.loadedScenarios.add(s.id);
      }
      return { scenario: { ...s, priors: undefined }, person: s.person, priors, draft: facilityDraft(s.claim) };
    },
    submit: (person, draft, scenario, truth) => {
      if (!person || !draft) throw fail(400, 'person and draft required');
      const c = store.submit(person, draft, { scenario: scenario || null, truth: truth || 'unknown' });
      return store.detail(c.claim_id);
    },
    claim: (id) => { const d = store.detail(id); if (!d) throw fail(404, 'not found'); return d; },
    queue: (mode, limit = 60) => store.queue(mode === 'random' ? 'random' : 'triage', Number(limit) || 60),
    review: (id, decision, note, reviewer) => {
      if (!['confirm', 'clear', 'release'].includes(decision)) throw fail(400, 'decision must be confirm | clear | release');
      store.review(id, decision, note, reviewer); return store.detail(id);
    },
    settle: (id) => {
      const c = store.byId.get(id); if (!c) throw fail(404, 'not found');
      if (c.paid) return store.detail(c.claim_id);
      if (c.status !== 4 || (c.flags.length && !c.review)) throw fail(400, 'claim is not ready for payment');
      store.settle(c); return store.detail(c.claim_id);
    },
    metrics: () => store.metrics(),
    providers: () => store.providers(),
  };
}
