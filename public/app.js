'use strict';

const $ = id => document.getElementById(id);
let data;
let view = 'games';
let filter = 'upcoming';
let fetching = false;
let connectionError = false;
let favorites;
try { favorites = new Set(JSON.parse(localStorage.getItem('courtside-favorites') || '[]')); }
catch { favorites = new Set(); }
const labels = { scheduled: 'ΠΡΟΣΕΧΩΣ', live: 'LIVE', final: 'ΤΕΛΙΚΟ', postponed: 'ΑΝΑΒΟΛΗ' };
const timeFormat = new Intl.DateTimeFormat('el-GR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Athens' });
const dateFormat = new Intl.DateTimeFormat('el-GR', { day: 'numeric', month: 'short', timeZone: 'Europe/Athens' });

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function badge(game) { return el('span', `badge ${game.status}`, labels[game.status] || 'ΠΡΟΣΕΧΩΣ'); }
function crest(team) { const node = el('span', 'crest', team.code); node.setAttribute('aria-hidden', 'true'); return node; }
function favoriteButton(team) {
  const saved = favorites.has(team.code);
  const button = el('button', `favorite${saved ? ' saved' : ''}`, saved ? '★' : '☆');
  button.type = 'button';
  button.setAttribute('aria-label', `${saved ? 'Αφαίρεση' : 'Προσθήκη'} ${team.name} ${saved ? 'από' : 'στα'} αγαπημένα`);
  button.setAttribute('aria-pressed', String(saved));
  button.dataset.team = team.code;
  return button;
}
function gameLink(game) {
  const a = el('a', '', 'Game center ↗');
  a.href = `https://www.euroleaguebasketball.net/euroleague/game-center/${data.season}/${game.id}/`;
  a.target = '_blank'; a.rel = 'noopener';
  return a;
}
function gameDate(game) { return game.start ? `${dateFormat.format(new Date(game.start))} · ${timeFormat.format(new Date(game.start))}` : 'Η ώρα θα ανακοινωθεί'; }
function card(game) {
  const node = el('article', `game-card${game.status === 'live' ? ' is-live' : ''}`);
  const top = el('div', 'card-top');
  top.append(el('span', '', `${game.round ? `Αγωνιστική ${game.round}` : 'EuroLeague'} · ${gameDate(game)}`), badge(game));
  node.append(top);
  for (const [team, score, other] of [[game.home, game.homeScore, game.awayScore], [game.away, game.awayScore, game.homeScore]]) {
    const winner = game.status === 'final' && score !== null && other !== null && score > other;
    const row = el('div', `team-row${winner ? ' winner' : ''}`);
    row.append(crest(team), el('span', 'team-name', team.name), favoriteButton(team), el('span', 'team-score', score ?? '—'));
    node.append(row);
  }
  const bottom = el('div', 'card-bottom');
  bottom.append(el('span', '', data.demo ? 'Δοκιμαστικός αγώνας' : game.clock || game.venue || 'EuroLeague'));
  if (!data.demo) bottom.append(gameLink(game));
  node.append(bottom);
  return node;
}
function spotlight() {
  const game = data.games.find(g => g.status === 'live') || data.games.find(g => g.status === 'scheduled') || data.games.at(-1);
  $('spotlight').hidden = !game;
  if (!game) return;
  const top = el('div', 'spotlight-top');
  top.append(el('span', '', `ΣΤΟ ΕΠΙΚΕΝΤΡΟ / ${game.round ? `ΑΓΩΝΙΣΤΙΚΗ ${game.round}` : 'EUROLEAGUE'}`));
  top.append(data.demo ? el('span', 'badge demo', 'DEMO · ΕΙΚΟΝΙΚΑ ΔΕΔΟΜΕΝΑ') : badge(game));
  const match = el('div', 'spotlight-match');
  const home = el('div', 'spot-team'); home.append(crest(game.home), el('span', '', game.home.name));
  const away = el('div', 'spot-team away'); away.append(crest(game.away), el('span', '', game.away.name));
  const score = el('div', 'score-focus');
  score.append(el('strong', '', game.status === 'scheduled' || game.status === 'postponed' ? 'VS' : `${game.homeScore ?? '—'} : ${game.awayScore ?? '—'}`));
  score.append(el('p', '', game.clock || labels[game.status]));
  match.append(home, score, away);
  const bottom = el('div', 'spotlight-bottom');
  bottom.append(el('span', '', `${gameDate(game)} · Ώρα Ελλάδας`));
  if (!data.demo) bottom.append(gameLink(game));
  $('spotlight').replaceChildren(top, match, bottom);
}
function renderGames() {
  const query = $('search').value.trim().toLocaleLowerCase('el-GR');
  const round = $('round-filter').value;
  const games = data.games.filter(g => {
    const category = filter === 'upcoming' ? ['live', 'scheduled', 'postponed'].includes(g.status) : g.status === filter;
    const favorite = view !== 'favorites' || favorites.has(g.home.code) || favorites.has(g.away.code);
    return category && favorite && (!round || String(g.round) === round) && (!query || `${g.home.name} ${g.away.name} ${g.home.code} ${g.away.code}`.toLocaleLowerCase('el-GR').includes(query));
  });
  if (filter === 'final') games.reverse();
  $('game-count').textContent = `${games.length} αγώνες`;
  const message = view === 'favorites' && !favorites.size ? 'Επίλεξε το ☆ δίπλα σε μια ομάδα για να εμφανίζονται εδώ οι αγώνες της.' : !data.games.length && data.error ? 'Δεν ήταν δυνατή η λήψη αγώνων. Έλεγξε τη σύνδεση με την πηγή δεδομένων και δοκίμασε ξανά.' : 'Δεν βρέθηκαν αγώνες με αυτά τα φίλτρα.';
  $('games').replaceChildren(...(games.length ? games.map(card) : [el('p', 'empty', message)]));
}
function renderStandings() {
  const notice = $('standings-notice'); notice.hidden = !data.standingsError;
  notice.textContent = data.standingsError ? `Η βαθμολογία δεν ενημερώθηκε: ${data.standingsError}${data.standings.length ? ' Εμφανίζονται τα τελευταία διαθέσιμα στοιχεία.' : ''}` : '';
  const rows = data.standings.map(team => {
    const row = el('tr');
    const rank = el('td'); rank.append(el('span', 'rank', team.position));
    const name = el('td'); const group = el('div', 'table-team'); group.append(crest(team), el('span', '', team.name)); name.append(group);
    row.append(rank, name, el('td', '', team.wins + team.losses), el('td', '', team.wins), el('td', '', team.losses));
    const diff = team.pointsFor !== null && team.pointsAgainst !== null ? team.pointsFor - team.pointsAgainst : null;
    row.append(el('td', '', `${team.pointsFor ?? '—'} / ${team.pointsAgainst ?? '—'}`), el('td', '', diff === null ? '—' : `${diff > 0 ? '+' : ''}${diff}`));
    const star = el('td'); star.append(favoriteButton(team)); row.append(star);
    return row;
  });
  if (!rows.length) { const row = el('tr'); const cell = el('td', 'empty', 'Η επίσημη βαθμολογία δεν είναι διαθέσιμη ακόμη.'); cell.colSpan = 8; row.append(cell); rows.push(row); }
  $('standings').replaceChildren(...rows);
}
function renderNotice() {
  const messages = [];
  if (data.demo) messages.push('Δοκιμαστική λειτουργία: οι αγώνες, τα σκορ και η βαθμολογία είναι εικονικά.');
  if (connectionError) messages.push('Χάθηκε η σύνδεση με τον server. Εμφανίζονται τα τελευταία διαθέσιμα δεδομένα.');
  else if (data.stale) messages.push(data.error ? `Η πηγή δεν ενημερώθηκε: ${data.error}. ${data.lastSuccess ? 'Τα σκορ μπορεί να είναι παλιά.' : 'Δεν υπάρχουν ακόμη επαληθευμένα δεδομένα.'}` : 'Αναμονή για ενημέρωση από την πηγή δεδομένων.');
  $('feed-notice').hidden = !messages.length; $('feed-notice').textContent = messages.join(' ');
}
function render() {
  if (!data) return;
  $('season').textContent = `${data.season.slice(1)} / ${String(Number(data.season.slice(1)) + 1).slice(-2)}`;
  $('favorite-count').textContent = favorites.size;
  const live = data.games.filter(g => g.status === 'live').length;
  $('stat-games').textContent = data.games.length;
  $('stat-live').textContent = live;
  $('live-count').textContent = live;
  $('stat-teams').textContent = new Set(data.games.flatMap(g => [g.home.code, g.away.code])).size;
  $('stat-update').textContent = data.lastSuccess ? timeFormat.format(new Date(data.lastSuccess)) : '—';
  renderNotice();
  const currentRound = $('round-filter').value;
  const rounds = [...new Set(data.games.map(g => g.round).filter(Boolean))].sort((a, b) => a - b);
  const all = el('option', '', 'Όλες οι αγωνιστικές'); all.value = '';
  $('round-filter').replaceChildren(all, ...rounds.map(round => { const option = el('option', '', `Αγωνιστική ${round}`); option.value = round; return option; }));
  $('round-filter').value = rounds.includes(Number(currentRound)) ? currentRound : '';
  $('games-view').hidden = view === 'standings';
  $('standings-view').hidden = view !== 'standings';
  $('spotlight').hidden = view !== 'games';
  if (view === 'games') spotlight();
  $('games-title').textContent = view === 'favorites' ? 'Οι αγώνες των ομάδων σου' : 'Η αγωνιστική δράση';
  $('page-title').textContent = view === 'standings' ? 'Η βαθμολογία.' : view === 'favorites' ? 'Οι ομάδες σου.' : 'Στο παρκέ.';
  $('page-subtitle').textContent = view === 'standings' ? 'Η εικόνα της σεζόν, ομάδα προς ομάδα.' : view === 'favorites' ? 'Οι αγαπημένες σου ομάδες, σε πρώτο πλάνο.' : 'Το πρόγραμμα, οι στιγμές, το σκορ. Όλα εδώ.';
  renderGames(); renderStandings();
}
async function load() {
  if (fetching) return;
  fetching = true; $('refresh').disabled = true;
  try {
    const response = await fetch('/api/dashboard', { signal: AbortSignal.timeout(10000), cache: 'no-store' });
    if (!response.ok) throw new Error('Server unavailable');
    data = await response.json(); connectionError = false; render();
  } catch {
    connectionError = true;
    if (data) renderNotice();
    else { $('feed-notice').hidden = false; $('feed-notice').textContent = 'Δεν ήταν δυνατή η σύνδεση. Πάτησε Ανανέωση για νέα προσπάθεια.'; $('games').replaceChildren(el('p', 'empty', 'Η εφαρμογή δεν μπορεί να συνδεθεί στον server.')); }
  } finally { fetching = false; $('refresh').disabled = false; }
}
document.addEventListener('click', event => {
  const star = event.target.closest('button[data-team]');
  if (star) {
    const code = star.dataset.team;
    favorites.has(code) ? favorites.delete(code) : favorites.add(code);
    try { localStorage.setItem('courtside-favorites', JSON.stringify([...favorites])); } catch { /* Preferences remain in memory when storage is unavailable. */ }
    render();
    const replacement = [...document.querySelectorAll('button[data-team]')].find(button => button.dataset.team === code);
    replacement?.focus();
  }
  const nav = event.target.closest('[data-view]');
  if (nav) { view = nav.dataset.view; document.querySelectorAll('[data-view]').forEach(button => { button.classList.toggle('active', button === nav); button === nav ? button.setAttribute('aria-current', 'page') : button.removeAttribute('aria-current'); }); render(); }
  const tab = event.target.closest('[data-filter]');
  if (tab) { filter = tab.dataset.filter; document.querySelectorAll('[data-filter]').forEach(button => { button.classList.toggle('selected', button === tab); button.setAttribute('aria-pressed', String(button === tab)); }); if (data) renderGames(); }
});
$('round-filter').addEventListener('change', () => { if (data) renderGames(); });
$('search').addEventListener('input', () => { if (data) renderGames(); });
$('refresh').addEventListener('click', load);
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
load();
setInterval(() => { if (!document.hidden) load(); }, 20000);
