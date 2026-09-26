// Run: node tools/check_teams.js. Player identity, roster snapshots, lane swaps and team statistics.
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.join(__dirname, '..'), ctx = { window: {}, document: { addEventListener() {} }, URLSearchParams };
for (const file of ['data/champions.js', 'data/champion-locales.js', 'data/champion-rules.js', 'data/players.js', 'data/site.js', 'data/schedule.js',
    'assets/js/common.js', 'assets/js/bp-tiers.js', 'assets/js/role-tiers.js', 'assets/js/stats.js', 'assets/js/pick-history.js', 'assets/js/team-stats.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file });
}
const WR = ctx.window.WR, plain = value => JSON.parse(JSON.stringify(value)), roles = Object.keys(WR.roleNames);
const snapshot = JSON.stringify(WR.league), matches = WR.league.rounds.flatMap(r => r.matches), find = id => matches.find(m => m.id === id);
assert.equal(ctx.window.WR_SITE.version, '1.1.1');
assert.equal(WR.players.length, 43); assert.equal(new Set(WR.players.map(p => p.id)).size, 43);
assert.equal(WR.resolvePlayer('FP', 'xhao').id, 'fp-xhao');
assert.equal(WR.resolvePlayer('TT', 'niuniu').id, 'tt-niuniu');
assert.equal(WR.resolvePlayer('WHG', 'tenes').id, 'whg-tenes');
assert.equal(WR.getPlayer('TT.XYZ'), null);
const ss = find('W6M3'), wbg = find('W6M4'), rv = find('W6M5');
assert.deepEqual(plain(ss.games.map(g => [g.length, g.winner, g.team1.side, g.mvp.playerId])), [
    ['17:18', 2, 'red', 'ss1-yousa'], ['17:03', 1, 'blue', 'tt-xiaobai'], ['16:49', 1, 'red', 'tt-qingshan']]);
assert.deepEqual(plain(wbg.games.map(g => [g.length, g.winner, g.team1.side, g.mvp.playerId])), [['24:34', 1, 'blue', 'wbg-xiaog'], ['13:15', 1, 'blue', 'wbg-skyfl']]);
assert.deepEqual(plain(rv.games.map(g => [g.length, g.winner, g.mvp.playerId])), [['16:43', 1, 'rv-tak'], ['19:11', 1, 'rv-berry']]);
assert.equal(wbg.games[0].team1.bans[4], 'lee-sin'); assert.equal(wbg.games[0].team1.banRoles[4], 'jungle');
for (const m of matches.filter(m => m.id.startsWith('W6') && m.games.length)) {
    const seen = new Set();
    for (const g of m.games) {
        const mvp = WR.getPlayer(g.mvp.playerId);
        assert.equal(mvp.teamId, m['opponent' + g.winner]);
        assert.ok(g['team' + g.winner].pickPlayers.includes(mvp.id));
        for (const idx of [1, 2]) {
            const s = g['team' + idx], teamId = m['opponent' + idx];
            assert.equal(s.picks.length, 5); assert.equal(s.bans.length, 5);
            assert.equal(new Set(s.pickPlayers).size, 5); assert.equal(s.pickPlayers.length, 5);
            assert.deepEqual(Object.keys(s.lineup).sort(), roles.slice().sort());
            assert.deepEqual(Array.from(s.pickRoles).sort(), roles.slice().sort());
            assert.deepEqual(Array.from(s.pickPlayers).sort(), Object.values(s.lineup).sort());
            s.pickPlayers.forEach(id => assert.equal(WR.getPlayer(id).teamId, teamId));
            s.picks.forEach(slug => { assert.ok(WR.getChampion(slug)); assert.ok(!seen.has(slug), m.id + ' fearless'); seen.add(slug); });
            s.bans.forEach((slug, i) => { if (slug) { assert.ok(WR.getChampion(slug)); assert.equal(Object.values(WR.banRoleShares(s, i)).reduce((a, b) => a + b, 0), 1); } });
            for (const slug of s.picks) assert.ok(!g.team1.bans.includes(slug) && !g.team2.bans.includes(slug));
        }
    }
}
assert.equal(ss.games[0].team1.lineup.top, 'tt-xin');
assert.equal(ss.games[0].team1.lineup.jungle, 'tt-niuniu');
for (const g of ss.games.slice(1)) {
    assert.equal(g.team1.lineup.top, 'tt-dawn128'); assert.equal(g.team1.lineup.jungle, 'tt-xiaobai');
}
assert.equal(ss.games[1].substitutions.length, 2);
const stats = WR.computeStats(), v73 = WR.computeStats('7.3');
assert.equal(stats.totalGames, 103); assert.equal(v73.totalGames, 11); assert.equal(WR.computeStats('7.2').totalGames, 92);
assert.equal(Object.values(v73.stats).reduce((n, s) => n + s.picks, 0), 110);
assert.equal(Object.values(v73.stats).reduce((n, s) => n + s.bans, 0), 109);
assert.deepEqual(plain(v73.stats.ziggs.bansByRole), { top: 0, jungle: 0, mid: 0.5, bot: 0.5, support: 0 });
assert.equal(v73.stats.olaf.bansByRole.top, 1.5); assert.equal(v73.stats.olaf.bansByRole.mid, 0.5);
assert.equal(v73.stats.ambessa.roles.mid.picks, 1); assert.equal(v73.stats.malphite.roles.top.picks, 4);
const tt = WR.TeamStats.compute('TT', '7.3'), whg = WR.TeamStats.compute('WHG', '7.3');
assert.deepEqual([tt.games, tt.wins, tt.losses, tt.seriesWins, tt.seriesLosses], [5, 4, 1, 2, 0]);
assert.equal(tt.rosterGames, 5);
for (const id of ['tt-xin', 'tt-niuniu']) assert.equal(tt.players[id].games, 3);
for (const id of ['tt-dawn128', 'tt-xiaobai']) assert.equal(tt.players[id].games, 2);
assert.equal(tt.players['tt-qingshan'].mvp, 3); assert.equal(tt.players['tt-xiaobai'].mvp, 1);
assert.equal(tt.sides.blue.games, 1); assert.equal(tt.sides.red.games, 4);
assert.equal(tt.sides.red.bans.zilean, 4); assert.equal(tt.sides.blue.bans.ziggs, 1);
assert.equal(whg.players['whg-zhou'].champions.ambessa.games, 2);
assert.equal(whg.players['whg-zhou'].champions.yone.games, 1);
assert.equal(whg.players['whg-awen'].champions.malphite.games, 1);
assert.equal(whg.players['whg-awen'].champions.mordekaiser.games, 1);
assert.equal(whg.players['whg-zhou'].champions.malphite, undefined);
assert.equal(whg.players['whg-awen'].champions.ambessa, undefined);
assert.deepEqual(plain(whg.players['whg-zhou'].champions.ambessa.roles), { top: 1, mid: 1 });
assert.equal(WR.TeamStats.compute('FP', '7.3').players['fp-xiaomai'].games, 0);
assert.equal(WR.TeamStats.compute('FP', '7.3').players['fp-lin11'].mvp, 1);
assert.equal(WR.TeamStats.compute('FP', '7.3').players['fp-jiangzhi'].mvp, 1);
assert.equal(WR.TeamStats.compute('WBG', '7.3').sides.blue.bans['lee-sin'], 1);
let playerGames = 0, mvpCount = 0;
for (const t of WR.league.teams) {
    const all = WR.TeamStats.compute(t.id), before = WR.TeamStats.compute(t.id, '7.2'), current = WR.TeamStats.compute(t.id, '7.3');
    assert.equal(all.schedule.length, 14); assert.equal(all.games, before.games + current.games);
    assert.equal(before.rosterGames, 0); assert.equal(before.mvpRecorded, 0);
    assert.ok(Object.values(before.players).every(p => p.games === 0 && !Object.keys(p.champions).length));
    assert.equal(Object.values(current.players).reduce((n, p) => n + p.games, 0), current.games * 5);
    for (const p of Object.values(current.players)) {
        assert.equal(p.wins + p.losses, p.games); assert.ok(p.mvp <= p.wins);
        assert.equal(Object.values(p.champions).reduce((n, h) => n + h.games, 0), p.games);
        playerGames += p.games; mvpCount += p.mvp;
        for (const h of Object.values(p.champions)) {
            const rows = WR.PickHistory.query({ champion: h.slug, team: t.id, playerId: p.player.id, version: '7.3' });
            assert.equal(rows.length, h.games); assert.equal(rows.filter(r => r.won).length, h.wins);
        }
    }
    for (const side of ['blue', 'red']) assert.equal(Object.values(current.sides[side].bans).reduce((n, c) => n + c, 0) + current.sides[side].emptyBans, current.sides[side].games * 5);
}
assert.equal(playerGames, 110); assert.equal(mvpCount, 11);
assert.equal(WR.TeamStats.compute('not-a-team'), null);
assert.equal(JSON.stringify(WR.league), snapshot, 'queries never mutate roster snapshots');
// Missing historical ownership must remain unknown; roster membership alone is insufficient.
const rounds = WR.league.rounds;
WR.league.rounds = [{ patch: '7.3', matches: [{ opponent1: 'FP', opponent2: 'TT', games: [{ winner: 1,
    team1: { side: 'blue', picks: ['garen'], bans: [null], lineup: { top: 'fp-xhao' } },
    team2: { side: 'red', picks: ['ahri'], bans: ['zilean'] }
}] }] }];
assert.equal(WR.TeamStats.compute('FP').players['fp-xhao'].games, 0);
assert.equal(WR.TeamStats.compute('FP').rosterGames, 0);
WR.league.rounds = rounds;
console.log('PASS: 103 games, 43 unique players, explicit ownership, substitutes persist, lane swaps, player hero wins, side bans, 11 MVPs, historical missingness and query reconciliation.');
