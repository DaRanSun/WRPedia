// Regression checks for patch-scoped statistics. No dependencies; node tools/check_versions.js.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert/strict");
const root = path.join(__dirname, "..");
const context = { window: {}, document: { addEventListener() {} }, URLSearchParams };
function load(file) { vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file }); }
load("data/champions.js");
load("data/champion-locales.js");
load("data/schedule.js");
load("data/patches.js");
load("data/patch-7.3.js");
load("data/champion-rules.js");
load("assets/js/common.js");
load("assets/js/bp-tiers.js");
load("assets/js/stats.js");
const { WR, WR_LEAGUE: league, WR_PATCHES: patches } = context.window;
const actual = JSON.stringify(league.rounds);
assert.deepEqual(Array.from(league.rounds, r => r.patch), ["7.2c", "7.2d", "7.2d", "7.2e", "7.2e", "7.3", "7.3"]);
const all = WR.computeStats("all");
const v72 = WR.computeStats("7.2");
const v73 = WR.computeStats("7.3");
assert.equal(all.totalGames, 103);
assert.equal(v72.totalGames, 92);
assert.equal(v73.totalGames, 11);
assert.equal(all.totalGames, v72.totalGames + v73.totalGames);
assert.equal(Object.values(v73.stats).reduce((n, s) => n + s.picks, 0), 110);
assert.equal(Object.values(v73.stats).reduce((n, s) => n + s.bans, 0), 109);
assert.equal(league.rounds[4].completed, true);
assert.equal(league.rounds[4].matches.flatMap(m => m.games).length, 20);
assert.ok(league.rounds[4].matches.every(m => m.games.length >= 2));
assert.equal(WR.matchStarted(league.rounds[5], league.rounds[5].matches[0]), true);
assert.equal(WR.matchStarted(league.rounds[4], league.rounds[4].matches[0]), true);
console.log("ok: all 92 games from completed weeks 1–5 remain in 7.2; 7.3 has 11 recorded games");
assert.equal(WR.championName('hwei'), '彗');
assert.equal(v72.stats.hwei.available, 0);
assert.equal(all.stats.hwei.available, 8);
assert.equal(all.stats.hwei.tier.score, null);
assert.deepEqual(Array.from(Object.keys(all.stats.hwei.byPatch)), ["7.3"]);
for (const patch of ['7.2c', '7.2e', '6.9', '']) assert.equal(WR.championAvailable('hwei', patch), false);
for (const patch of ['7.3', '7.3a', '7.10', '8.1']) assert.equal(WR.championAvailable('hwei', patch), true);

// Independently known two-series fixture: repeated picks in a later fearless game
// are ignored, but the lock resets in a new series on another patch.
function game(pick, ban, winner, length) {
    return { winner, length, team1: { side: "blue", picks: [pick], bans: [ban] }, team2: { side: "red", picks: ["ahri"], bans: [] } };
}
league.rounds = [
    { patch: "7.2e", matches: [{ opponent1: "TT", opponent2: "FP", games: [game("yone", "zed", 1, "12:00"), game("yone", "yone", 2, "22:00")] }] },
    { patch: "7.3", matches: [{ opponent1: "FP", opponent2: "TT", games: [game("zed", "yone", 2, "31:00")] }] }
];
const a = WR.computeStats(), b = WR.computeStats("7.2"), c = WR.computeStats("7.3");
assert.equal(a.totalGames, 3);
assert.equal(b.totalGames, 2);
assert.equal(c.totalGames, 1);
assert.equal(b.stats.yone.available, 1);
assert.equal(b.stats.yone.picks, 1);
assert.equal(b.stats.yone.bans, 0);
assert.equal(c.stats.yone.available, 1);
assert.equal(c.stats.yone.picks, 0);
assert.equal(c.stats.yone.bans, 1);
assert.equal(b.stats.zed.available, 2);
assert.equal(b.stats.zed.bans, 1);
assert.equal(c.stats.zed.picks, 1);
assert.equal(c.stats.zed.available, 1);
assert.equal(b.blueWins, 1);
assert.equal(c.redWins, 1);
assert.equal(b.lengths.m10_15, 1);
assert.equal(b.lengths.m20_25, 1);
assert.equal(c.lengths.gt30, 1);
assert.equal(c.stats.zed.teams.FP.losses, 1);
assert.equal(c.stats.zed.againstMap.ahri.losses, 1);
assert.equal(c.stats.zed.roles.top.picks, 1);
assert.equal(a.stats.hwei.available, 1, 'new hero only gets available games from its eligible version');
assert.equal(b.stats.hwei.available, 0);
assert.equal(c.stats.hwei.available, 1);
assert.equal(b.stats.zed.roles.top.picks, 0);
for (const slug of Object.keys(a.stats)) {
    for (const key of ["available", "picks", "bans", "wins", "losses", "bluePicks", "redPicks", "banEarly", "banLate"]) {
        assert.equal(a.stats[slug][key], b.stats[slug][key] + c.stats[slug][key], slug + " " + key);
    }
}
league.rounds[0].matches[0].patch = "7.3";
assert.equal(WR.computeStats("7.2").totalGames, 0);
assert.equal(WR.computeStats("7.3").totalGames, 3);
league.rounds[0].matches[0].games.push({ winner: null, team1: {}, team2: {} });
assert.equal(WR.computeStats().totalGames, 3);
league.rounds = [{ patch: '7.3', matches: [{ opponent1: 'TT', opponent2: 'FP', games: [
    game('zed', 'hwei', 1, '12:00'), game('hwei', 'yone', 2, '13:00'), game('yone', 'hwei', 1, '14:00')
] }] }];
const hwei = WR.computeStats().stats.hwei;
assert.equal(hwei.available, 2); assert.equal(hwei.picks, 1); assert.equal(hwei.bans, 1);
assert.equal(hwei.losses, 1); assert.equal(hwei.byPatch['7.3'].available, 2);
league.rounds = JSON.parse(actual);
console.log("ok: version scope covers fearless denominators, wins, roles, teams, opponents, lengths and match overrides");

assert.deepEqual(Array.from(patches.slice(0, 3), p => p.champions.filter(c => c.core).length), [4, 10, 3]);
assert.deepEqual(Array.from(patches.slice(0, 3), p => p.champions.length), [9, 13, 5]);
for (const patch of patches) {
    assert.equal(new Set(patch.champions.map(c => c.slug)).size, patch.champions.length);
    for (const c of patch.champions) {
        assert.ok(["buff", "nerf", "adjust"].includes(c.type));
        assert.ok(c.changes.length);
        const champ = WR.getChampion(c.slug);
        assert.ok(champ, c.slug);
        assert.ok(fs.existsSync(path.join(root, champ.icon)), champ.icon);
    }
}
assert.equal(patches[0].champions.find(c => c.slug === "rumble").type, "adjust");
const p73 = patches.find(p => p.id === "7.3");
const items = p73.sections.filter(s => s.title.startsWith('装备')).flatMap(s => s.entries);
const translations = JSON.parse(fs.readFileSync(path.join(root, 'tools/patch-item-names.json'), 'utf8')).names;
assert.equal(items.length, 77);
for (const entry of items) assert.ok(Object.values(translations).includes(entry.name.replace('[新增] ', '')), entry.name + ' has a verified CN name');
assert.ok(items.find(e => e.name === '夺萃之镰').changes.some(line => line.includes('耀光') && line.includes('考尔菲德的战锤')));
assert.ok(items.find(e => e.name === '凡性的提醒').changes.some(line => line.includes('绝境制裁')));
assert.ok(!/納什之爪|吸血鬼權杖|移魂奪舍|雅瑪蘭守護像/.test(JSON.stringify(items)));
const hweiNote = p73.sections.flatMap(s => s.entries).find(e => e.slug === 'hwei');
assert.ok(hweiNote.changes.some(s => s.includes('即时可用')));
assert.ok(fs.existsSync(path.join(root, WR.getChampion('hwei').icon)));
assert.ok(fs.existsSync(path.join(root, WR.getChampion('hwei').portrait)));
assert.equal(p73.sections.find(s => s.title.includes("生存属性")).entries.length, 51);
assert.equal(p73.sections.find(s => s.title.includes("攻速参数")).entries.length, 141);
assert.ok(!JSON.stringify(p73).match(/增幅裝置|無盡飢渴|瀆神九頭蛇|終極法書/));
console.log("ok: all 17 highlighted champions, portraits, mixed Rumble changes and standard-mode-only 7.3 records");
console.log("ALL VERSION CHECKS PASSED");
