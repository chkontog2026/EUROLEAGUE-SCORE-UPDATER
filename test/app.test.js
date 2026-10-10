'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server');
const { createProvider, normalizeGame, normalizeStandings, seasonFor } = require('../provider');

test('normalizes the official standings fields observed on the VPS', () => {
  const rows = normalizeStandings({ teams: [{
    position: 1, gamesPlayed: 2, gamesWon: 2, gamesLost: 0,
    club: { code: 'PAN', name: 'Panathinaikos AKTOR Athens' },
    winPercentage: '100%', pointsDifference: '+42', pointsFor: 193, pointsAgainst: 151,
  }] });
  assert.deepEqual(rows, [{
    code: 'PAN', name: 'Panathinaikos AKTOR Athens', position: 1,
    wins: 2, losses: 0, pointsFor: 193, pointsAgainst: 151,
  }]);
});

const rawGame = (overrides = {}) => ({
  gameCode: 1, round: 2, date: '2026-10-09T18:00:00Z', played: false,
  phaseType: { name: 'Regular Season' },
  local: { club: { code: 'OLY', name: 'Olympiacos' }, score: 0 },
  road: { club: { code: 'PAN', name: 'Panathinaikos' }, score: 0 },
  ...overrides,
});

test('season rolls over in July; scheduled scores are unknown and ambiguous dates are not guessed', () => {
  assert.equal(seasonFor(new Date('2026-05-01')), 'E2025');
  assert.equal(seasonFor(new Date('2026-10-01')), 'E2026');
  assert.equal(normalizeGame(rawGame()).homeScore, null);
  assert.equal(normalizeGame(rawGame({ date: '2027-04-16T20:30:00', utcDate: '2027-04-16T18:30:00Z' })).start, '2027-04-16T18:30:00.000Z');
  assert.equal(normalizeGame(rawGame({ date: '2026-10-09T18:00:00' })).start, null);
  assert.equal(normalizeGame(rawGame({ status: 'InProgress' })).status, 'live');
  assert.equal(normalizeGame(rawGame({ played: 'false' })).status, 'scheduled');
  assert.equal(normalizeGame(rawGame({ played: true })).status, 'final');
  assert.throws(() => normalizeGame(rawGame({ local: {} })), /ομάδα/);
});

test('provider paginates without silently repeating the first page', async () => {
  const calls = [];
  const provider = createProvider({ fetchImpl: async url => {
    calls.push(url);
    const offset = new URL(url).searchParams.get('offset');
    const data = offset === '0' ? Array.from({ length: 100 }, (_, i) => rawGame({ gameCode: i + 1 })) : [rawGame({ gameCode: 101 })];
    return { ok: true, json: async () => ({ data, total: 101 }) };
  } });
  assert.equal((await provider.games('E2026')).length, 101);
  assert.match(calls[1], /offset=100/);
  const stuck = createProvider({ fetchImpl: async () => ({ ok: true, json: async () => ({ data: [rawGame()], total: 2 }) }) });
  await assert.rejects(stuck.games('E2026'), /επόμενη σελίδα/);
});

test('live HTTP workflow normalizes official-shaped data and retains stale scores on upstream failure', async t => {
  let failed = false;
  const calls = [];
  const provider = createProvider({ fetchImpl: async url => {
    calls.push(url);
    if (failed) return { ok: false, status: 403 };
    return { ok: true, json: async () => url.includes('basicstandings') ? {
      teams: [{ club: { code: 'OLY', name: 'Olympiacos' }, position: 1, wins: 2, losses: 0, pointsFor: 170, pointsAgainst: 150 }],
    } : { data: [rawGame({ played: true, local: { club: { code: 'OLY', name: 'Olympiacos' }, score: 85 }, road: { club: { code: 'PAN', name: 'Panathinaikos' }, score: 75 } })], total: 1 } };
  } });
  const app = createApp({ provider, season: 'E2026' });
  const address = await app.start(0, '127.0.0.1');
  t.after(() => app.stop());
  const base = `http://127.0.0.1:${address.port}`;
  const first = await (await fetch(`${base}/api/dashboard`)).json();
  assert.equal(first.games[0].homeScore, 85);
  assert.equal(first.standings[0].wins, 2);
  assert.equal(first.demo, false);
  assert.equal(first.stale, false);
  assert(calls.some(url => url.includes('/rounds/2/basicstandings')));
  assert.equal((await fetch(`${base}/health`)).status, 200);
  failed = true;
  await app.refresh();
  const stale = await (await fetch(`${base}/api/dashboard`)).json();
  assert.equal(stale.games[0].homeScore, 85);
  assert.equal(stale.stale, true);
  assert.match(stale.error, /403/);
  assert.equal(stale.demo, false);
  assert.equal((await fetch(`${base}/health`)).status, 503);
});

test('first feed failure exposes no fictional data and no healthy status', async t => {
  const app = createApp({ provider: { games: async () => { throw new Error('Proxy 403'); } } });
  const address = await app.start(0, '127.0.0.1'); t.after(() => app.stop());
  const base = `http://127.0.0.1:${address.port}`;
  const data = await (await fetch(`${base}/api/dashboard`)).json();
  assert.deepEqual(data.games, []);
  assert.equal(data.lastSuccess, null);
  assert.equal(data.stale, true);
  assert.equal((await fetch(`${base}/health`)).status, 503);
});

test('explicit demo serves HTML/assets and labelled data; unknown files and mutations are rejected', async t => {
  const app = createApp({ demo: true });
  const address = await app.start(0, '127.0.0.1'); t.after(() => app.stop());
  const base = `http://127.0.0.1:${address.port}`;
  const response = await fetch(base);
  assert.match(await response.text(), /Στο παρκέ/);
  assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
  const data = await (await fetch(`${base}/api/dashboard`)).json();
  assert.equal(data.demo, true);
  assert.equal(data.games.length, 10);
  assert.equal(data.standings.length, 8);
  assert.equal((await fetch(`${base}/app.js`)).status, 200);
  assert.equal((await fetch(`${base}/styles.css`, { method: 'HEAD' })).status, 200);
  assert.equal((await fetch(`${base}/package.json`)).status, 404);
  assert.equal((await fetch(base, { method: 'POST' })).status, 405);
});
