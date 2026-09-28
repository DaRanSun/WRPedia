// Run: node tools/check_role_and_picks.js
"use strict";
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.join(__dirname, '..'), ctx = { window: {}, document: { addEventListener() {} }, URLSearchParams };
for (const file of ['data/champions.js', 'data/champion-locales.js', 'data/schedule.js', 'data/champion-rules.js', 'assets/js/common.js',
    'assets/js/bp-tiers.js', 'assets/js/role-tiers.js', 'assets/js/stats.js', 'assets/js/pick-history.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file });
}
const { WR } = ctx.window, plain = value => JSON.parse(JSON.stringify(value));
const roles = Object.keys(WR.RoleTiers.roles);
function counts(n, picks, bans, wins, role = 'bot') {
    return { available: n, picks, bans, wins, losses: picks - wins,
        roles: Object.fromEntries(roles.map(r => [r, r === role ? { picks, wins, losses: picks - wins } : { picks: 0, wins: 0, losses: 0 }])) };
}
function rating(stats, slug = 'hero', role = 'bot') { return WR.RoleTiers.evaluate(stats).roles[role].rows.find(r => r.slug === slug); }
// Independent calculation: all 30 bans go to the only played lane; heat (20+30)/88 = 25/44.
// 10 wins of 20 with Beta(4,4) stays 50%, so the final strength is also 25/44.
const fixture = { hero: counts(80, 20, 30, 10), second: counts(100, 10, 0, 5), third: counts(100, 8, 0, 4) };
const before = JSON.stringify(fixture), known = rating(fixture);
assert.equal(known.estimatedBans, 30);
assert.ok(Math.abs(known.strength - 25 / 44) < 1e-12);
assert.equal(known.smoothedWinRate, 0.5); assert.equal(known.score, 100); assert.equal(known.label, 'OP');
assert.equal(JSON.stringify(fixture), before, 'model must not mutate its inputs');
const badWin = { ...fixture, hero: counts(80, 20, 30, 0) };
assert.ok(rating(badWin).score < known.score); assert.notEqual(rating(badWin).label, 'OP');
assert.equal(rating({ hero: counts(80, 1, 70, 1) }).status, 'pending', 'one pick must not allocate a high tier');
assert.equal(rating({ hero: counts(11, 3, 0, 3) }).status, 'pending');
assert.equal(rating({ hero: counts(12, 3, 0, 3) }).status, 'rated');
assert.equal(rating({ hero: counts(80, 0, 80, 0) }), undefined, 'pure bans cannot establish a lane');
assert.deepEqual(plain(WR.RoleTiers.evaluate({ hero: counts(80, 0, 80, 0) }).unassigned), ['hero']);
const pure = { zilean: counts(80, 0, 80, 0), second: counts(80, 8, 0, 4, 'support'), third: counts(80, 10, 0, 5, 'support') };
const onlyBan = rating(pure, 'zilean', 'support');
assert.equal(onlyBan.estimatedBans, 80); assert.equal(onlyBan.smoothedWinRate, 0.5);
assert.equal(onlyBan.picks, 0); assert.equal(onlyBan.label, 'OP'); assert.equal(onlyBan.banSource, 'confirmed');
const custom = WR.RoleTiers.evaluate({ hero: counts(80, 0, 80, 0) }, null, { hero: { banOnlyRoles: { top: 0.75, jungle: 0.25 } } });
assert.equal(custom.roles.top.rows[0].estimatedBans, 60); assert.equal(custom.roles.jungle.rows[0].estimatedBans, 20);
assert.equal(custom.roles.mid.rows.length, 0);
for (const shares of [{ top: 1, jungle: 1 }, { top: -1, jungle: 2 }, { typo: 1 }]) {
    const model = WR.RoleTiers.evaluate({ hero: counts(80, 0, 80, 0) }, null, { hero: { banOnlyRoles: shares } });
    assert.deepEqual(plain(model.unassigned), ['hero'], 'invalid owner shares must not allocate bans');
}
const picked = rating({ zilean: counts(80, 10, 20, 5, 'mid') }, 'zilean', 'mid');
assert.equal(picked.estimatedBans, 20); assert.equal(picked.banSource, 'picks');
assert.equal(rating({ zilean: counts(80, 10, 20, 5, 'mid') }, 'zilean', 'support'), undefined, 'real picks replace pure-ban fallback');
assert.equal(rating({ hero: counts(100, 3, 0, 1) }).label, 'T4', 'a low-heat leader is not automatically OP');
assert.equal(rating({ hero: counts(100, 30, 30, 10) }).label, 'T0', 'OP needs neutral-or-better lane wins and a lane gap');
const mixed = counts(90, 20, 25, 10);
mixed.picks += 10; mixed.wins += 2; mixed.losses += 8; mixed.roles.mid = { picks: 10, wins: 2, losses: 8 };
const mixedBefore = rating({ hero: mixed });
mixed.wins += 8; mixed.losses -= 8; mixed.roles.mid.wins = 10; mixed.roles.mid.losses = 0;
assert.deepEqual(rating({ hero: mixed }), mixedBefore, 'off-role wins must not alter the bot rating');
const allocated = Object.values(WR.RoleTiers.evaluate({ hero: mixed }).roles).flatMap(r => r.rows).reduce((sum, r) => sum + r.estimatedBans, 0);
assert.ok(Math.abs(allocated - mixed.bans) < 1e-12, 'all bans are allocated exactly once across roles');
assert.ok(Math.abs(mixedBefore.estimatedBans - 25 * 2 / 3) < 1e-12, '20 bot picks out of 30 total means two thirds of bans');
assert.equal(rating({ hero: { ...mixed, wins: 999 } }).status, 'invalid');
assert.equal(WR.RoleTiers.evaluate(fixture, { hero: 'fixture exclusion' }).roles.bot.rows.find(r => r.slug === 'hero').status, 'excluded');
for (let w = 0, previous = -1; w <= 20; w++) {
    const r = rating({ ...fixture, hero: counts(80, 20, 30, w) });
    assert.ok(r.score >= previous && r.score <= 100); previous = r.score;
}
console.log('ok: manual formula, lane-only wins, ban allocation, sample guards, OP gates, exclusions and win monotonicity');

const actual = WR.computeStats(), snapshot = JSON.stringify(WR.league);
const historicalRoles = WR.computeStats('7.2').roleTierModel;
assert.equal(actual.totalGames, 109);
assert.ok(Object.values(WR.computeStats('7.3').roleTierModel.roles).some(r => r.rows.some(s => s.status === 'rated')));
assert.ok(Object.values(WR.computeStats('7.3').roleTierModel.roles).every(r => r.rows.every(s => s.status !== 'invalid')));
assert.equal(actual.stats.zilean.tier.label, 'OP', 'overall all-ban rating is preserved');
assert.equal(actual.roleTierModel.roles.support.rows.find(r => r.slug === 'zilean').label, 'OP');
assert.equal(actual.roleTierModel.unassigned.length, 0);
for (const [slug, role] of Object.entries({ zilean: 'support', alistar: 'support', aurora: 'mid', taliyah: 'jungle', warwick: 'top' })) {
    const rows = Object.values(actual.roleTierModel.roles).flatMap(r => r.rows).filter(r => r.slug === slug);
    assert.equal(rows.length, 1); assert.equal(rows[0].role, role);
    assert.equal(rows[0].laneBans, actual.stats[slug].bans);
    assert.equal(rows[0].status, ['zilean', 'aurora'].includes(slug) ? 'rated' : 'pending');
}
for (const st of Object.values(actual.stats).filter(s => s.bans)) {
    const sum = Object.values(actual.roleTierModel.roles).flatMap(r => r.rows).filter(r => r.slug === st.slug).reduce((n, r) => n + r.laneBans, 0);
    assert.ok(Math.abs(sum - st.bans) < 1e-9, st.slug + ' all actual bans allocated');
}
for (const role of roles) {
    for (const row of actual.roleTierModel.roles[role].rows) {
        assert.equal(row.picks, actual.stats[row.slug].roles[role].picks);
        assert.equal(row.wins, actual.stats[row.slug].roles[role].wins);
        if (row.status === 'rated') assert.ok(Number.isFinite(row.score) && row.score >= 0 && row.score <= 100);
    }
}
for (const champion of WR.champions) {
    const records = WR.PickHistory.query({ champion: champion.slug });
    assert.equal(records.length, actual.stats[champion.slug].picks, champion.slug + ' total history');
    for (const team of WR.league.teams) {
        const found = WR.PickHistory.query({ champion: champion.slug, team: team.id });
        const st = actual.stats[champion.slug].teams[team.id] || { picks: 0, wins: 0 };
        assert.equal(found.length, st.picks, champion.slug + ' ' + team.id);
        assert.equal(found.filter(r => r.won).length, st.wins);
        for (const record of found) {
            assert.equal(record.game['team' + record.teamIndex].picks[record.roleIndex], champion.slug);
            assert.equal(record.match['opponent' + record.teamIndex], team.id);
            assert.ok(record.match.games[record.gameIndex] === record.game);
        }
    }
    assert.equal(WR.PickHistory.query({ champion: champion.slug, version: '7.3' }).length, WR.computeStats('7.3').stats[champion.slug].picks);
}
assert.equal(WR.PickHistory.query({ team: 'KBG', champion: 'zilean' }).length, 0);
assert.equal(WR.PickHistory.query({ champion: 'unknown' }).length, 0);
assert.equal(JSON.stringify(WR.league), snapshot, 'lookups never edit the original match data');
console.log('ok: all ' + WR.champions.length + ' heroes × 8 teams reconcile with pick/win statistics; empty and version-scoped queries');

const saved = WR.league.rounds;
const futureGame = plain(saved[0].matches[0]); futureGame.id = 'future';
WR.league.rounds = saved.concat([{ id: 'future', patch: '7.3', matches: [futureGame] }]);
assert.deepEqual(WR.computeStats('7.2').roleTierModel, historicalRoles, 'future version never alters an existing role baseline');
WR.league.rounds = [{ patch: '7.2e', matches: [{ id: 'indices', opponent1: 'FP', opponent2: 'TT', games: [
    { winner: null, team1: { picks: ['gwen'] }, team2: { picks: [] } },
    { winner: 1, length: '13:15', team1: { side: 'red', picks: ['gwen'], bans: [] }, team2: { side: 'blue', picks: ['olaf'], bans: [] } }
] }] }];
const record = WR.PickHistory.query({ champion: 'gwen', team: 'FP' })[0];
assert.equal(record.gameIndex, 1); assert.equal(record.won, true); assert.equal(record.role, '上单');
const html = WR.PickHistory.gameDetails(record);
assert.ok(html.indexOf('TT · 蓝方') < html.indexOf('FP · 红方'));
assert.ok(html.includes('第 2 局')); assert.ok(html.includes('时长 13:15'));
WR.league.rounds = saved;
console.log('ok: version isolation, unfinished-game skip, original game numbers and red-side winner rendering');
console.log('ALL ROLE AND PICK HISTORY CHECKS PASSED');
