'use strict';

// Fictional fixture data for development. Never used as a live-feed fallback.
module.exports = function demoData(now = new Date()) {
  const clubs = [
    ['OLY', 'Olympiacos Piraeus'], ['PAN', 'Panathinaikos Athens'],
    ['MAD', 'Real Madrid'], ['FEN', 'Fenerbahce Istanbul'],
    ['BAR', 'FC Barcelona'], ['MON', 'AS Monaco'],
    ['ZAL', 'Zalgiris Kaunas'], ['MIL', 'EA7 Emporio Armani Milan'],
  ].map(([code, name]) => ({ code, name }));
  const today = new Date(now); today.setUTCHours(18, 30, 0, 0);
  const time = (day, hour = 0) => new Date(today.getTime() + day * 86400000 + hour * 3600000).toISOString();
  const game = (id, home, away, status, start, round, homeScore = null, awayScore = null) => ({
    id: String(id), home: clubs[home], away: clubs[away], status, start, round,
    homeScore, awayScore, phase: 'Regular Season', venue: '', clock: status === 'live' ? 'Q3 · 04:32' : '',
  });
  return {
    games: [
      game(1, 0, 2, 'final', time(-2), 3, 86, 80),
      game(2, 1, 3, 'final', time(-2, 1), 3, 79, 83),
      game(3, 4, 5, 'final', time(-1), 3, 91, 88),
      game(4, 6, 7, 'final', time(-1, 1), 3, 74, 71),
      game(5, 1, 0, 'live', time(0), 4, 62, 58),
      game(6, 2, 4, 'scheduled', time(1), 4),
      game(7, 3, 5, 'scheduled', time(1, 1), 4),
      game(8, 7, 6, 'scheduled', time(2), 4),
      game(9, 0, 3, 'scheduled', time(7), 5),
      game(10, 5, 1, 'scheduled', time(7, 1), 5),
    ],
    standings: clubs.map((club, index) => ({ ...club, position: index + 1, wins: [3, 3, 2, 2, 2, 1, 1, 0][index], losses: [0, 0, 1, 1, 1, 2, 2, 3][index], pointsFor: 270 - index * 5, pointsAgainst: 230 + index * 5 })),
  };
};
