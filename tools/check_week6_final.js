// Run: node tools/check_week6_final.js — 9/27 ownership, three-lane bans and the 7.3a adoption boundary.
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.join(__dirname, '..'), ctx = { window: {}, document: { addEventListener() {} }, URLSearchParams };
for (const file of ['data/champions.js', 'data/champion-locales.js', 'data/champion-rules.js', 'data/players.js', 'data/schedule.js',
    'data/patches.js', 'data/patch-7.3.js', 'data/patch-7.3a.js', 'assets/js/common.js', 'assets/js/bp-tiers.js', 'assets/js/role-tiers.js',
    'assets/js/stats.js', 'assets/js/pick-history.js', 'assets/js/team-stats.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file });
}
const WR = ctx.window.WR, plain = x => JSON.parse(JSON.stringify(x)), rounds = WR.league.rounds;
const match = id => rounds.flatMap(r => r.matches).find(m => m.id === id);
for (const [id, expected] of Object.entries({
    W6M6: [['18:09', 1, 'blue', 'fp-jiangzhi'], ['18:48', 1, 'red', 'fp-xhao']],
    W6M7: [['16:15', 2, 'blue', 'tt-kk'], ['22:44', 2, 'blue', 'tt-dawn128']],
    W6M8: [['18:08', 2, 'blue', 'kbg-dat'], ['16:18', 2, 'blue', 'kbg-dat']]
})) {
    const m = match(id);
    assert.equal(m.date.slice(0, 10), '2026-09-27');
    assert.deepEqual(plain(m.games.map(g => [g.length, g.winner, g.team1.side, g.mvp.playerId])), expected);
    assert.equal(WR.matchPatch(rounds[5], m), '7.3');
}
assert.equal(rounds[5].completed, true); assert.equal(rounds[6].patch, '7.3a');
assert.ok(rounds[6].matches.every(m => !WR.matchStarted(rounds[6], m)));
assert.ok(!JSON.stringify(WR.league).includes('摇摆'));
assert.equal(WR.resolvePlayer('RV', 'XZhang').id, 'rv-xzhang');
assert.equal(WR.resolvePlayer('WBG', 'zihan7').name, 'ZiHan7');
for (const g of match('W6M7').games) {
    assert.equal(g.team2.lineup.top, 'tt-dawn128'); assert.equal(g.team2.lineup.jungle, 'tt-niuniu');
}
const wbg = WR.TeamStats.compute('WBG', '7.3');
assert.equal(wbg.players['wbg-zihan7'].games, 2); assert.equal(wbg.players['wbg-yuntu'].games, 2);
assert.deepEqual(Object.keys(wbg.players['wbg-zihan7'].champions).sort(), ['garen', 'malphite']);
const kbg = WR.TeamStats.compute('KBG', '7.3');
assert.deepEqual(plain(kbg.players['kbg-jimeng'].champions.gwen.roles), { top: 1 });
assert.deepEqual(plain(kbg.players['kbg-xzhen'].champions.malphite.roles), { mid: 1 });
assert.equal(kbg.players['kbg-dat'].mvp, 2);
const tt = WR.TeamStats.compute('TT', '7.3');
assert.deepEqual(plain(tt.players['tt-kk'].champions.ryze.roles), { bot: 1 });
const record = WR.PickHistory.query({ team: 'KBG', champion: 'gwen', playerId: 'kbg-jimeng', version: '7.3' });
assert.equal(record.length, 1); assert.equal(record[0].role, '上单');
assert.ok(WR.PickHistory.gameDetails(record[0]).includes('各 1/3'));
// No rounding before allocation: a three-lane Ban is exactly one original Ban.
const bans = WR.banRoleShares(match('W6M8').games[0].team1, 4);
assert.deepEqual(plain(bans), { top: 1 / 3, mid: 1 / 3, jungle: 1 / 3 });
assert.equal(Object.values(bans).reduce((a, b) => a + b, 0), 1);
for (const invalid of [['top', 'top', 'mid'], ['top', 'mid', 'unknown'], ['top', 'mid', 'bot', 'support']]) assert.deepEqual(plain(WR.roleShares(invalid)), {});
const stats = WR.computeStats('7.3');
assert.equal(stats.stats.camille.bansByRole.top, 3 + 1 / 3);
assert.equal(stats.stats.camille.bansByRole.jungle, 1 / 3);
assert.equal(stats.stats.camille.bansByRole.mid, 1 / 3);
for (const result of [WR.computeStats(), stats]) for (const s of Object.values(result.stats)) {
    const rows = Object.values(result.roleTierModel.roles).flatMap(r => r.rows).filter(r => r.slug === s.slug);
    assert.ok(rows.every(r => r.status !== 'invalid'), s.slug);
    assert.ok(Math.abs(rows.reduce((n, r) => n + r.laneBans, 0) - s.bans) < 1e-9, s.slug + ' Ban conservation');
}
const patch = ctx.window.WR_PATCHES.find(p => p.id === '7.3a');
assert.equal(patch.major, '7.3'); assert.equal(patch.releaseDate, '2026-09-29');
assert.equal(patch.weeks, '第 7 周'); assert.equal(patch.postseason, '季后赛版本待定');
assert.equal(patch.champions.length, 12);
assert.deepEqual(Array.from(patch.champions.filter(c => c.core), c => c.slug).sort(), ['caitlyn', 'hwei', 'malphite', 'senna', 'syndra']);
assert.deepEqual(Array.from(patch.sections, s => s.entries.length), [4, 3]);
assert.deepEqual(Array.from(['buff', 'nerf', 'adjust'], t => patch.champions.filter(c => c.type === t).length), [4, 6, 2]);
for (const p of ctx.window.WR_PATCHES) assert.ok(p.champions.every(c => c.slug !== 'yuumi' || !c.core));
assert.ok(ctx.window.WR_PATCHES.find(p => p.id === '7.2d').champions.find(c => c.slug === 'yuumi').changes.length);
assert.equal(stats.patches.find(p => p.id === '7.3a').games, 0);
assert.ok(Object.values(stats.stats).every(s => !s.byPatch['7.3a']));
// A future minor patch remains within major 7.3, but must not change 7.2 or earlier minor samples.
const old72 = plain(WR.computeStats('7.2')), old73 = plain(stats.stats.syndra.byPatch['7.3']);
rounds[6].matches[0].games = plain(match('W6M6').games);
assert.equal(WR.computeStats('7.3').totalGames, 19);
assert.deepEqual(plain(WR.computeStats('7.3').stats.syndra.byPatch['7.3']), old73);
assert.equal(WR.computeStats('7.3').stats.syndra.byPatch['7.3a'].picks, 1);
assert.deepEqual(plain(WR.computeStats('7.2')), old72);
console.log('PASS: September 27 results, player identities and lane swaps, exact thirds, Ban conservation, 7.3a highlights and minor/major patch isolation.');
