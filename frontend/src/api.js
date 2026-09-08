// Two transports behind one `api` object:
//  - default: HTTP calls to the Express backend (npm run dev / npm start)
//  - VITE_STATIC=true: the whole engine runs in the browser (GitHub Pages build) — backend/engine + backend/api.js
//    are bundled, and the claim book is fetched once from <base>/data/claims.json. The honest-evaluation results are
//    precomputed by backend/evaluate.js and shipped as data/evaluation.json in both modes.
const STATIC = import.meta.env.VITE_STATIC === 'true';

const j = async (r) => { if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || r.statusText); } return r.json(); };
const get = (u) => fetch(u).then(j);
const post = (u, body) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then(j);

const httpApi = {
  reference: () => get('/api/reference'),
  persons: (q) => get('/api/persons?q=' + encodeURIComponent(q || '')),
  personHistory: (id) => get(`/api/persons/${id}/history`),
  scenarios: () => get('/api/scenarios'),
  loadScenario: (id) => post(`/api/scenarios/${id}/load`),
  submit: (person, draft, scenario, truth) => post('/api/claims/submit', { person, draft, scenario, truth }),
  claim: (id) => get('/api/claims/' + id),
  queue: (mode, limit = 60) => get(`/api/queue?mode=${mode}&limit=${limit}`),
  review: (id, decision, note, reviewer) => post('/api/review/' + id, { decision, note, reviewer }),
  settle: (id) => post(`/api/claims/${id}/settle`),
  metrics: () => get('/api/metrics'),
  providers: () => get('/api/providers'),
  evaluation: () => get('/api/evaluation'),
};

let localReady = null;
async function local() {
  if (!localReady) localReady = (async () => {
    const [{ Store }, { createApi }, data] = await Promise.all([
      import('../../backend/engine/store.js'),
      import('../../backend/api.js'),
      fetch(import.meta.env.BASE_URL + 'data/claims.json').then(j),
    ]);
    return createApi(new Store(data));
  })();
  return localReady;
}
// same signatures as httpApi; results are deep-copied so React state never aliases the store's objects
const call = (name) => async (...args) => { const a = await local(); return JSON.parse(JSON.stringify(a[name](...args))); };
const localApi = {
  reference: call('reference'), persons: call('persons'), personHistory: call('personHistory'), scenarios: call('scenarios'),
  loadScenario: call('loadScenario'), submit: call('submit'), claim: call('claim'), queue: call('queue'),
  review: call('review'), settle: call('settle'), metrics: call('metrics'), providers: call('providers'),
  evaluation: () => fetch(import.meta.env.BASE_URL + 'data/evaluation.json').then(j),
};

export const api = STATIC ? localApi : httpApi;
export const STATIC_MODE = STATIC;

export const npr = (n) => 'NPR ' + Number(n || 0).toLocaleString();
export const pct = (x, d = 0) => (100 * (x || 0)).toFixed(d) + '%';
