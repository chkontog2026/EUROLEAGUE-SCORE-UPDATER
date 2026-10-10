'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createProvider, seasonFor, validSeason } = require('./provider');
const demoData = require('./demo');

function createApp({ provider = createProvider(), demo = false, season = seasonFor(), now = () => new Date(), refreshMs = 20000 } = {}) {
  if (!validSeason(season)) throw new Error('EUROLEAGUE_SEASON must be E followed by a year, e.g. E2026.');
  const state = { season, demo, games: [], standings: [], lastAttempt: null, lastSuccess: null, error: null, standingsError: null };
  let refreshing = null;
  let timer;

  async function update() {
    state.lastAttempt = now().toISOString();
    if (demo) {
      Object.assign(state, demoData(now()), { lastSuccess: state.lastAttempt, error: null, standingsError: null });
      return;
    }
    try {
      const games = await provider.games(season);
      state.games = games;
      state.lastSuccess = now().toISOString();
      state.error = null;
      // Official standings are for the regular season, not playoff rounds.
      const regular = games.filter(g => /regular|^rs$/i.test(g.phase));
      const played = regular.filter(g => g.status === 'final' || g.status === 'live');
      const round = Math.max(0, ...played.map(g => g.round || 0));
      if (round) {
        try {
          state.standings = await provider.standings(season, round);
          state.standingsError = null;
        } catch (error) { state.standingsError = error.message; }
      } else {
        state.standingsError = 'Δεν υπάρχει διαθέσιμη αγωνιστική κανονικής περιόδου για τη βαθμολογία.';
      }
    } catch (error) {
      state.error = error.message;
    }
  }
  function refresh() {
    if (!refreshing) refreshing = update().finally(() => { refreshing = null; });
    return refreshing;
  }
  const files = new Map([
    ['/', ['index.html', 'text/html; charset=utf-8']],
    ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
    ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
    ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
  ]);
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/dashboard' || url.pathname === '/health') {
      const stale = !state.lastSuccess || Boolean(state.error) || now() - new Date(state.lastSuccess) > refreshMs * 3;
      const health = { ok: !stale, demo, season, lastAttempt: state.lastAttempt, lastSuccess: state.lastSuccess, error: state.error, standingsError: state.standingsError };
      res.writeHead(url.pathname === '/health' && stale ? 503 : 200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify(url.pathname === '/health' ? health : { ...state, stale }));
      return;
    }
    const file = files.get(url.pathname);
    if (!file) { res.writeHead(404); res.end('Not found'); return; }
    try {
      const content = await fs.readFile(path.join(__dirname, 'public', file[0]));
      res.writeHead(200, { 'Content-Type': file[1], 'Content-Length': content.length, 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch { res.writeHead(500); res.end('Unable to load application'); }
  });
  return {
    server, refresh,
    async start(port = 3091, host = '0.0.0.0') {
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
      await refresh();
      timer = setInterval(refresh, refreshMs); timer.unref();
      return server.address();
    },
    async stop() { clearInterval(timer); await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); },
  };
}

if (require.main === module) {
  const demo = process.argv.includes('--demo') || process.env.DEMO_MODE === 'true';
  const app = createApp({ demo, season: process.env.EUROLEAGUE_SEASON || seasonFor() });
  app.start(Number(process.env.PORT || 3091)).then(address => {
    console.log(`EuroLeague Score Updater · port ${address.port} · ${demo ? 'DEMO — fictional data' : 'EuroLeague API'}`);
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => app.stop().then(() => process.exit(0)));
}

module.exports = { createApp };
