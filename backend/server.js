import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './engine/store.js';
import { createApi } from './api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const store = new Store(JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'claims.json'), 'utf-8')));
const api = createApi(store);
const app = express();
app.use(cors()); app.use(express.json({ limit: '1mb' }));

// every route is a thin wrapper over backend/api.js (shared with the in-browser static build)
const wrap = (fn) => (req, res) => {
  try { res.json(fn(req)); } catch (e) { res.status(e.status || 400).json({ error: e.message }); }
};
app.get('/api/reference', wrap(() => api.reference()));
app.get('/api/persons', wrap((req) => api.persons(req.query.q, req.query.limit)));
app.get('/api/persons/:id/history', wrap((req) => api.personHistory(req.params.id)));
app.get('/api/scenarios', wrap(() => api.scenarios()));
app.post('/api/scenarios/:id/load', wrap((req) => api.loadScenario(req.params.id)));
app.post('/api/claims/submit', wrap((req) => { const { person, draft, scenario, truth } = req.body; return api.submit(person, draft, scenario, truth); }));
app.get('/api/claims/:id', wrap((req) => api.claim(req.params.id)));
app.get('/api/queue', wrap((req) => api.queue(req.query.mode, req.query.limit)));
app.post('/api/review/:id', wrap((req) => { const { decision, note, reviewer } = req.body; return api.review(req.params.id, decision, note, reviewer); }));
app.post('/api/claims/:id/settle', wrap((req) => api.settle(req.params.id)));
app.get('/api/metrics', wrap(() => api.metrics()));

// serve the built frontend if present (npm run build)
const dist = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(dist));
app.get(/^(?!\/api).*/, (req, res, next) => { res.sendFile(path.join(dist, 'index.html'), (err) => err && next()); });

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`[api] Claim Journey backend on http://localhost:${PORT}`));
