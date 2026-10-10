'use strict';

const API = 'https://api-live.euroleague.net';

function seasonFor(date = new Date()) {
  return `E${date.getUTCFullYear() - (date.getUTCMonth() < 6 ? 1 : 0)}`;
}

function validSeason(value) {
  return /^E20\d{2}$/.test(value);
}

function number(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function team(side) {
  const club = side?.club || side?.team || side;
  if (!club || !club.name || !club.code) throw new Error('Μη αναγνωρίσιμη ομάδα στο EuroLeague API.');
  return { code: String(club.code), name: String(club.name) };
}

function normalizeGame(raw) {
  const home = raw.local || raw.home;
  const away = raw.road || raw.away;
  const id = raw.gameCode ?? raw.code;
  if (!id || !Number.isFinite(Number(id))) throw new Error('Μη αναγνωρίσιμο αναγνωριστικό αγώνα.');
  const statusText = String(raw.status?.name || raw.status?.code || raw.status || '').toLowerCase();
  const played = raw.played === true || raw.played === 'true';
  const status = played || /^(finished|final|ended|played)$/.test(statusText) ? 'final'
    : /^(live|inprogress|in_progress|playing)$/.test(statusText) ? 'live'
      : /^(postponed|cancelled|canceled)$/.test(statusText) ? 'postponed' : 'scheduled';
  const date = raw.utcDate ?? raw.dateTime ?? raw.date;
  // Never invent a timezone for an ambiguous provider timestamp.
  const unambiguous = typeof date === 'string' && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(date);
  const start = unambiguous && Number.isFinite(Date.parse(date)) ? new Date(date).toISOString() : null;
  return {
    id: String(id), round: number(raw.round ?? raw.roundNumber),
    phase: String(raw.phaseType?.name || raw.phaseType?.code || ''),
    home: team(home), away: team(away), start, status,
    homeScore: ['live', 'final'].includes(status) ? number(home?.score) : null,
    awayScore: ['live', 'final'].includes(status) ? number(away?.score) : null,
    venue: String(raw.venue?.name || raw.venue || ''),
    clock: String(raw.clock || ''),
  };
}

function normalizeStandings(payload) {
  if (!Array.isArray(payload?.teams)) throw new Error('Μη αναγνωρίσιμη απάντηση βαθμολογίας.');
  return payload.teams.map((entry) => {
    const wins = number(entry.wins ?? entry.won);
    const losses = number(entry.losses ?? entry.lost);
    const position = number(entry.position ?? entry.rank);
    if (wins === null || losses === null || position === null) throw new Error('Ελλιπή στοιχεία επίσημης βαθμολογίας.');
    return { ...team(entry), position, wins, losses,
      pointsFor: number(entry.pointsFor ?? entry.pointsScored),
      pointsAgainst: number(entry.pointsAgainst ?? entry.pointsReceived),
    };
  }).sort((a, b) => a.position - b.position);
}

function createProvider({ fetchImpl = fetch, baseUrl = API } = {}) {
  async function get(path) {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      headers: { accept: 'application/json', 'user-agent': 'EuroLeague-Score-Updater/1.0' },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`EuroLeague API: HTTP ${response.status}`);
    return response.json();
  }
  return {
    async games(season) {
      if (!validSeason(season)) throw new Error('Μη έγκυρη σεζόν.');
      const all = new Map();
      let offset = 0;
      for (let page = 0; page < 20; page++) {
        const payload = await get(`/v2/competitions/E/seasons/${season}/games?limit=100&offset=${offset}`);
        if (!Array.isArray(payload?.data)) throw new Error('Μη αναγνωρίσιμη απάντηση αγώνων.');
        const before = all.size;
        for (const item of payload.data) {
          const game = normalizeGame(item);
          all.set(game.id, game);
        }
        const total = number(payload.total ?? payload.totalResults ?? payload.totalItems);
        if ((total !== null && all.size >= total) || (total === null && payload.data.length < 100)) {
          return [...all.values()].sort((a, b) => (a.start || '9999').localeCompare(b.start || '9999'));
        }
        if (before === all.size) throw new Error('Το API δεν επέστρεψε την επόμενη σελίδα αγώνων.');
        offset += payload.data.length;
      }
      throw new Error('Υπέρβαση ορίου σελίδων API.');
    },
    async standings(season, round) {
      if (!validSeason(season) || !Number.isInteger(round) || round < 1) throw new Error('Μη έγκυρη αγωνιστική.');
      return normalizeStandings(await get(`/v3/competitions/E/seasons/${season}/rounds/${round}/basicstandings`));
    },
  };
}

module.exports = { createProvider, normalizeGame, normalizeStandings, seasonFor, validSeason };
