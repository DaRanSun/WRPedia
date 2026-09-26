// Run: node tools/check_draft_roles.js — explicit draft roles, split positions and unused bans.
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.join(__dirname, '..'), ctx = { window: {}, document: { addEventListener() {} }, URLSearchParams };
for (const file of ['data/champions.js', 'data/champion-locales.js', 'data/champion-rules.js', 'data/schedule.js', 'assets/js/common.js',
    'assets/js/bp-tiers.js', 'assets/js/role-tiers.js', 'assets/js/stats.js', 'assets/js/pick-history.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file });
}
const { WR } = ctx.window, plain = x => JSON.parse(JSON.stringify(x)), roles = Object.keys(WR.roleNames);
// Keep this batch regression fixed to the first four 7.3 games; check_teams covers later batches.
WR.league.rounds.forEach(r => { if (r.patch === '7.3') r.matches = r.matches.filter(m => ['W6M1', 'W6M2'].includes(m.id)); });
const all = WR.computeStats(), v72 = WR.computeStats('7.2'), v73 = WR.computeStats('7.3');
const matches = WR.league.rounds.flatMap(r => r.matches), fp = matches.find(m => m.id === 'W6M1'), kbg = matches.find(m => m.id === 'W6M2');
const snapshot = JSON.stringify(WR.league);
assert.deepEqual(plain(fp.games.map(g => [g.length, g.winner, g.team1.side])), [['16:51', 1, 'blue'], ['13:36', 1, 'red']]);
assert.deepEqual(plain(kbg.games.map(g => [g.length, g.winner, g.team1.side])), [['14:25', 2, 'blue'], ['16:15', 2, 'blue']]);
assert.deepEqual(plain(fp.startingLineups), { FP: ['xhao', 'Jiangzhi', 'Soldier', 'lin11', 'Awei'], WHG: ['Zhou', 'Ran', 'Awen', 'spark', 'Tenes'] });
assert.deepEqual(plain(kbg.startingLineups), { KBG: ['Xzhen', 'DaT', 'Jimeng', 'Xiaoma', 'Uu'], TT: ['Xin', 'Niuniu', 'Z', 'KK', 'qingshan'] });
assert.deepEqual(plain(fp.games.concat(kbg.games).map(g => ({ teamId: g.mvp.teamId, role: g.mvp.role }))), [{ teamId: 'FP', role: 'bot' }, { teamId: 'FP', role: 'jungle' }, { teamId: 'TT', role: 'support' }, { teamId: 'TT', role: 'support' }]);
for (const match of [fp, kbg]) for (const game of match.games) {
    assert.equal(game.draftOrder, 'recorded');
    assert.equal(game.mvp.teamId, match['opponent' + game.winner]);
    for (const side of [game.team1, game.team2]) {
        assert.equal(side.picks.length, 5); assert.equal(side.bans.length, 5);
        assert.equal(side.pickRoles.length, 5); assert.equal(side.banRoles.length, 5);
        assert.deepEqual(Array.from(side.pickRoles).sort(), roles.slice().sort(), 'these games have five distinct final roles');
        side.picks.forEach((slug, i) => { assert.ok(WR.getChampion(slug)); assert.equal(Object.values(WR.pickRoleShares(side, i)).reduce((a, b) => a + b, 0), 1); });
        side.bans.forEach((slug, i) => {
            if (slug === null) assert.equal(side.banRoles[i], null);
            else { assert.ok(WR.getChampion(slug)); assert.equal(Object.values(WR.banRoleShares(side, i)).reduce((a, b) => a + b, 0), 1); }
        });
    }
}
assert.deepEqual(plain(fp.games[0].team1.picks), ['malphite', 'chogath', 'karma', 'sivir', 'yasuo']);
assert.deepEqual(plain(fp.games[1].team1.picks), ['senna', 'ornn', 'sion', 'tristana', 'twisted-fate']);
assert.deepEqual(plain(kbg.games[0].team1.picks), ['hwei', 'camille', 'ashe', 'gragas', 'renekton']);
assert.deepEqual(plain(kbg.games[1].team2.picks), ['nunu-and-willump', 'ryze', 'senna', 'skarner', 'singed']);
assert.deepEqual(plain(fp.games[1].team2.bans), ['hwei', 'syndra', null, 'nidalee', 'lillia']);
assert.deepEqual(plain(kbg.games[0].team2.bans.slice(3)), ['lee-sin', 'xin-zhao'], 'intentional second-phase jungle bans retained');
assert.equal(v73.totalGames, 4); assert.equal(all.totalGames, 96); assert.equal(v72.totalGames, 92);
assert.equal(Object.values(v73.stats).reduce((n, s) => n + s.picks, 0), 40);
assert.equal(Object.values(v73.stats).reduce((n, s) => n + s.bans, 0), 39);
assert.equal(v73.blueWins, 1); assert.equal(v73.redWins, 3);
assert.equal(v73.stats.nidalee.banLate, 2); assert.equal(v73.stats.nidalee.banEarly, 0, 'empty slot must not shift later bans forward');
assert.equal(v73.stats.lillia.banLate, 1);
assert.equal(v73.stats.singed.bans, 1);
assert.equal(v73.stats.singed.bansByRole.top, 0.5); assert.equal(v73.stats.singed.bansByRole.mid, 0.5);
assert.equal(v73.stats.hwei.available, 3); assert.equal(v73.stats.hwei.picks, 1); assert.equal(v73.stats.hwei.bans, 2);
assert.equal(v72.stats.hwei.available, 0);
for (const [slug, role, wins, losses] of [['tristana', 'jungle', 1, 0], ['camille', 'jungle', 0, 1], ['ryze', 'top', 1, 0],
    ['ryze', 'mid', 0, 1], ['jax', 'mid', 0, 1], ['skarner', 'support', 1, 0], ['ornn', 'support', 1, 0]]) {
    assert.deepEqual(plain(v73.stats[slug].roles[role]), { picks: wins + losses, wins, losses });
}
function lane(result, slug, role) { return result.roleTierModel.roles[role].rows.find(r => r.slug === slug); }
assert.equal(lane(v73, 'camille', 'top').recordedBans, 1);
assert.equal(lane(v73, 'camille', 'top').picks, 0);
assert.equal(lane(v73, 'camille', 'jungle').laneBans, 0, 'explicit top ban cannot be reassigned to the picked jungle lane');
assert.equal(lane(v73, 'singed', 'top').laneBans, 0.5);
assert.equal(lane(v73, 'singed', 'mid').laneBans, 0.5);
for (const result of [all, v72, v73]) for (const st of Object.values(result.stats)) {
    const rows = Object.values(result.roleTierModel.roles).flatMap(r => r.rows).filter(r => r.slug === st.slug);
    assert.ok(rows.every(r => r.status !== 'invalid'), st.slug + ' valid role accounting');
    assert.ok(Math.abs(rows.reduce((n, r) => n + r.laneBans, 0) - st.bans) < 1e-9, st.slug + ' ban conservation');
    for (const key of ['picks', 'wins', 'losses']) assert.equal(Object.values(st.roles).reduce((n, r) => n + r[key], 0), st[key]);
}
for (const [slug, st] of Object.entries(all.stats)) for (const key of ['picks', 'bans', 'wins', 'losses', 'available', 'unassignedBans']) {
    assert.equal(st[key], v72.stats[slug][key] + v73.stats[slug][key]);
}
assert.equal(lane(all, 'camille', 'top').recordedBans, 1);
assert.equal(lane(all, 'camille', 'jungle').recordedBans, 0);
assert.ok(Math.abs(lane(all, 'camille', 'jungle').estimatedBans - all.stats.camille.unassignedBans * all.stats.camille.roles.jungle.picks / all.stats.camille.picks) < 1e-9);
const history = WR.PickHistory.query({ champion: 'tristana', team: 'FP', version: '7.3' });
assert.equal(history.length, 1); assert.equal(history[0].pickIndex, 3); assert.equal(history[0].role, '打野'); assert.equal(history[0].won, true);
const html = WR.PickHistory.gameDetails(history[0]);
assert.ok(html.includes('4. 打野')); assert.ok(html.includes('3. 空 Ban')); assert.ok(!html.includes('champ-unknown'));
assert.ok(html.indexOf('WHG · 蓝方') < html.indexOf('FP · 红方')); assert.ok(html.includes('MVP：FP · 打野'));
assert.ok(WR.draftSideHtml(fp.games[0].team1).includes('各 50%'));
assert.equal(JSON.stringify(WR.league), snapshot, 'statistics and rendering do not rewrite input BP order');
console.log('ok: 4 games, scores/sides/times, 20 starters, 4 MVPs, explicit roles, split bans, empty slots, conservation and history rendering');
// Synthetic half-role picks and mixed tagged/untagged bans: exercise the general format,
// rather than assuming that positions can be inferred from draft order.
const saved = WR.league.rounds;
WR.league.rounds = [{ patch: '7.3', matches: [{ id: 'fixture', opponent1: 'FP', opponent2: 'TT', games: [{ winner: 1,
    team1: { side: 'blue', picks: ['ahri'], pickRoles: [['top', 'mid']], bans: ['zilean', null, 'ryze'], banRoles: ['support', null, 'top'] },
    team2: { side: 'red', picks: ['garen'], pickRoles: ['jungle'], bans: ['zed'], banRoles: [null] }
}] }] }];
const fractional = WR.computeStats('7.3');
assert.equal(fractional.stats.ahri.roles.top.picks, 0.5); assert.equal(fractional.stats.ahri.roles.mid.wins, 0.5);
assert.equal(lane(fractional, 'ahri', 'top').status, 'pending');
assert.equal(lane(fractional, 'ryze', 'top').recordedBans, 1, 'tag alone establishes a lane without a pure-ban fallback');
assert.deepEqual(plain(fractional.roleTierModel.unassigned), ['zed']);
assert.equal(WR.PickHistory.query({ champion: 'ahri' })[0].role, '上单／中路');
WR.league.rounds = [];
assert.ok(Object.values(WR.computeStats().roleTierModel.roles).every(r => !r.rows.length));
WR.league.rounds = saved;
console.log('ok: fractional picks/wins, tagged-only heroes, unknown-ban fallback, empty scopes and non-mutation');
console.log('ALL DRAFT ROLE CHECKS PASSED');
