// Run: node tools/check_player_profiles.js. Complete historical ownership, lane changes and profile/overview statistics.
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.join(__dirname, '..'), ctx = { window: {}, document: { addEventListener() {} }, URLSearchParams };
for (const file of ['data/champions.js', 'data/champion-locales.js', 'data/players.js', 'data/schedule.js', 'assets/js/common.js',
    'assets/js/team-stats.js', 'assets/js/pick-history.js', 'assets/js/league-summary.js']) vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file });
const WR = ctx.window.WR, plain = x => JSON.parse(JSON.stringify(x)), matches = WR.league.rounds.flatMap(r => r.matches);
const match = id => matches.find(m => m.id === id), side = (id, gi, team) => match(id).games[gi]['team' + (match(id).opponent1 === team ? 1 : 2)];
const operator = (id, gi, team, hero) => { const s = side(id, gi, team), index = s.picks.indexOf(hero); return [s.pickPlayers[index], s.pickRoles[index]]; };
assert.equal(WR.players.length, 50); assert.equal(new Set(WR.players.map(p => p.id.toLowerCase())).size, 50);
assert.ok(WR.players.every(p => !p.status));
let games = 0, mvps = 0, appearances = 0;
for (const m of matches) for (const g of m.games) {
    games++; const winner = g['team' + g.winner];
    assert.equal(g.mvp.teamId, m['opponent' + g.winner]);
    assert.ok(winner.pickPlayers.includes(g.mvp.playerId));
    assert.equal(g.mvp.role, winner.pickRoles[winner.pickPlayers.indexOf(g.mvp.playerId)]); mvps++;
    for (const index of [1, 2]) {
        const s = g['team' + index]; assert.equal(s.pickPlayers.length, 5); assert.equal(new Set(s.pickPlayers).size, 5);
        assert.deepEqual(Array.from(s.pickRoles).sort(), ['bot', 'jungle', 'mid', 'support', 'top']);
        assert.deepEqual(Object.values(s.lineup).sort(), Array.from(s.pickPlayers).sort());
        s.pickPlayers.forEach(id => { assert.equal(WR.getPlayer(id).teamId, m['opponent' + index]); appearances++; });
    }
}
assert.equal(games, 109); assert.equal(mvps, 109); assert.equal(appearances, 1090);
// Owner's correction: Awen keeps Gwen and goes top; Zhou keeps Poppy and goes mid.
assert.deepEqual(operator('W1M5', 0, 'WHG', 'gwen'), ['whg-awen', 'top']);
assert.deepEqual(operator('W1M5', 0, 'WHG', 'poppy'), ['whg-zhou', 'mid']);
assert.deepEqual(operator('W2M6', 0, 'KBG', 'camille'), ['kbg-xzhen', 'mid']);
assert.deepEqual(operator('W2M6', 0, 'KBG', 'poppy'), ['kbg-jimeng', 'top']);
// Explicit final mappings override any inference from draft position.
assert.deepEqual(operator('W2M5', 1, 'WHG', 'wukong'), ['whg-awen', 'jungle']);
assert.deepEqual(operator('W2M5', 1, 'WHG', 'aurelion-sol'), ['whg-hli', 'mid']);
assert.deepEqual(operator('W2M2', 0, 'WHG', 'ambessa'), ['whg-zhou', 'jungle']);
assert.deepEqual(operator('W2M2', 0, 'WHG', 'renekton'), ['whg-awen', 'top']);
assert.deepEqual(operator('W6M5', 0, 'WHG', 'ambessa'), ['whg-zhou', 'mid']);
assert.deepEqual(operator('W6M8', 0, 'KBG', 'gwen'), ['kbg-jimeng', 'top']);
assert.equal(side('W1M8', 0, 'WBG').lineup.top, 'wbg-zihan7');
for (const gi of [1, 2]) assert.equal(side('W1M8', gi, 'WBG').lineup.top, 'wbg-yuntu');
assert.equal(side('W2M5', 0, 'WBG').lineup.top, 'wbg-yuntu');
assert.equal(side('W3M7', 0, 'TT').lineup.top, 'tt-dawn128'); assert.equal(side('W3M7', 1, 'TT').lineup.top, 'tt-xin');
for (const gi of [1, 2]) assert.equal(side('W5M6', gi, 'WBG').lineup.top, 'wbg-zihan7');
assert.equal(side('W6M4', 0, 'WBG').lineup.top, 'wbg-yuntu', 'later explicitly provided lineup remains authoritative');
assert.equal(side('W1M1', 0, 'RV').lineup.top, 'rv-tbb'); assert.equal(side('W1M4', 0, 'RV').lineup.top, 'rv-xzhang');
assert.equal(side('W1M2', 0, 'KBG').lineup.mid, 'kbg-xzhen');
assert.equal(side('W1M7', 0, 'ACE').lineup.bot, 'ace-shuangyi'); assert.equal(side('W2M1', 0, 'ACE').lineup.bot, 'ace-tenmiss');
assert.equal(WR.TeamStats.compute('FP', '7.2').players['fp-xiaomai'].games, 23);
assert.equal(WR.TeamStats.compute('FP', '7.2').players['fp-xhao'].games, 0);
assert.equal(WR.TeamStats.compute('FP', '7.3').players['fp-xhao'].games, 4);
const awen = WR.TeamStats.compute('WHG').players['whg-awen'], zhou = WR.TeamStats.compute('WHG').players['whg-zhou'];
assert.deepEqual(plain(WR.TeamStats.rankedRoles(awen)), [['top', 20], ['mid', 5], ['jungle', 1]]);
assert.deepEqual(plain(WR.TeamStats.rankedRoles(zhou)), [['mid', 18], ['top', 6], ['jungle', 2]]);
assert.deepEqual(plain(WR.TeamStats.rankedRoles({ roles: { top: 4, mid: 5 } })), [['mid', 5], ['top', 4]]);
const before = JSON.stringify(WR.league);
for (const team of WR.league.teams) for (const version of ['all', '7.2', '7.3']) {
    const s = WR.TeamStats.compute(team.id, version);
    assert.equal(s.games, s.rosterGames); assert.equal(s.mvpRecorded, s.wins);
    assert.equal(Object.values(s.players).reduce((n, p) => n + p.games, 0), s.games * 5);
    for (const st of Object.values(s.players)) {
        const history = WR.PickHistory.query({ playerId: st.player.id, version });
        assert.equal(history.length, st.games); assert.equal(history.filter(r => r.won).length, st.wins);
        assert.equal(history.filter(r => r.game.mvp.playerId === st.player.id).length, st.mvp);
        assert.equal(Object.values(st.roles).reduce((a, b) => a + b, 0), st.games);
        for (const h of Object.values(st.champions)) assert.equal(WR.PickHistory.query({ playerId: st.player.id, champion: h.slug, version }).length, h.games);
    }
}
assert.equal(JSON.stringify(WR.league), before);
assert.equal(WR.PickHistory.query({ playerId: 'unknown' }).length, 0);
const html = WR.draftSideHtml(side('W1M5', 0, 'WHG'));
assert.ok(!html.includes('按队内选取顺序')); assert.ok(html.includes('Awen') && html.includes('格温'));
assert.deepEqual(plain(WR.LeagueSummary.standings().slice(0, 4).map(r => r.team.id)), ['TT', 'FP', 'RV', 'WBG']);
assert.deepEqual(plain(WR.LeagueSummary.topMvps().map(p => [p.rank, p.player.id, p.mvp])), [
    [1, 'fp-jiangzhi', 7], [1, 'rv-huiba', 7], [1, 'tt-qingshan', 7], [1, 'tt-z', 7], [1, 'wbg-xiaog', 7]
]);
assert.equal(WR.LeagueSummary.upcoming()[0].match.id, 'W7M1'); assert.equal(WR.LeagueSummary.upcoming(20).length, 8);
// Independent duration fixture: 10:00 and 20:01 wins; a 30:02 loss; malformed time excluded.
const saved = WR.league.rounds;
function game(length, winner) { return { length, winner, team1: { side: 'blue', picks: [], bans: [] }, team2: { side: 'red', picks: [], bans: [] } }; }
WR.league.rounds = [{ patch: '7.3', matches: [{ opponent1: 'FP', opponent2: 'TT', games: [game('10:00', 1), game('20:01', 1), game('30:02', 2), game('not recorded', 2)] }] }];
const averages = WR.TeamStats.compute('FP').averageDuration;
assert.equal(averages.all, 1201); assert.equal(averages.wins, 900.5); assert.equal(averages.losses, 1802);
assert.equal(WR.TeamStats.formatDuration(averages.wins), '15:01'); assert.equal(WR.TeamStats.formatDuration(null), '—');
WR.league.rounds[0].matches[0].games = [game('10:00', 1)];
assert.equal(WR.TeamStats.compute('FP').averageDuration.losses, null);
assert.ok(WR.LeagueSummary.standings().every(r => r.seriesW === 0 && r.seriesL === 0), 'one unfinished BO3 must not award a series');
WR.league.rounds = saved;
// Include everyone tied at the fifth player, with competition ranks (not five distinct score groups).
const original = WR.TeamStats;
const sample = [9, 8, 7, 6, 6, 6, 5].map((mvp, i) => ({ player: { id: 'test-' + i, name: String(i), teamId: 'TT' }, mvp }));
WR.TeamStats = { compute: id => ({ players: id === 'TT' ? Object.fromEntries(sample.map(p => [p.player.id, p])) : {} }) };
assert.deepEqual(plain(WR.LeagueSummary.topMvps().map(p => p.rank)), [1, 2, 3, 4, 4, 4]);
WR.TeamStats = original;
console.log('PASS: 50 players, 109 MVPs, 1090 appearances, ordinary and explicit lane changes, substitutions, role ranking, profile histories, averages, shared standings and MVP cutoff ties.');
