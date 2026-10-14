// Run: node tools/check_patch_73b.js — 7.3b notes, playoff adoption and minor/major patch isolation.
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.join(__dirname, '..'), ctx = { window: {}, document: { addEventListener() {} }, URLSearchParams };
for (const file of ['data/champions.js', 'data/champion-locales.js', 'data/champion-rules.js', 'data/players.js', 'data/schedule.js',
    'data/patches.js', 'data/patch-7.3.js', 'data/patch-7.3a.js', 'data/patch-7.3b.js', 'assets/js/common.js', 'assets/js/bp-tiers.js',
    'assets/js/role-tiers.js', 'assets/js/stats.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file });
}
const WR = ctx.window.WR, patches = ctx.window.WR_PATCHES, plain = x => JSON.parse(JSON.stringify(x)), rounds = WR.league.rounds;

assert.deepEqual(Array.from(patches, p => p.id), ['7.2c', '7.2d', '7.2e', '7.3', '7.3a', '7.3b']);
const patch = patches.find(p => p.id === '7.3b');
assert.equal(patch.major, '7.3'); assert.equal(patch.published, '2026-10-14'); assert.equal(patch.releaseDate, '2026-10-15');
assert.equal(patch.weeks, '季后赛'); assert.match(patch.sourceCN, /docid=783173403142913451$/); assert.match(patch.source, /wild-rift-patch-notes-7-3b\/$/);
assert.deepEqual(Array.from(patch.champions, c => c.slug).sort(), ['hwei', 'jhin', 'nocturne', 'senna', 'tryndamere', 'volibear', 'yasuo', 'yunara']);
// Site owner: every champion except Tryndamere is a tournament highlight.
assert.deepEqual(Array.from(patch.champions.filter(c => !c.core), c => c.slug), ['tryndamere']);
assert.deepEqual(Array.from(['buff', 'nerf', 'adjust'], t => patch.champions.filter(c => c.type === t).length), [4, 4, 0]);
for (const c of patch.champions) {
    assert.ok(WR.getChampion(c.slug), c.slug);
    assert.ok(c.summary && c.changes.length && c.changes.every(s => typeof s === 'string' && s.length), c.slug);
}
assert.deepEqual(Array.from(patch.sections, s => [s.title, s.entries.length]), [['装备', 6], ['符文', 4], ['战场', 2], ['错误修复', 1]]);
// The Tencent notes are authoritative; Hwei's (3-1)/(3-2) ratio changes only appear there.
const hwei = patch.champions.find(c => c.slug === 'hwei').changes.join('\n');
for (const s of ['（3-1）主题：悚-阴沉变意', '（3-2）主题：悚-滞涩幽瞳', '（3-3）主题：悚-双钩血喉', '国际服公告另列']) assert.ok(hwei.includes(s), s);
assert.ok(!JSON.stringify(patch).match(/大乱斗|魄罗|排行榜/), 'standard Rift only');

const a = patches.find(p => p.id === '7.3a');
assert.equal(a.status, '已采用'); assert.equal(a.postseason, undefined);
const playoffs = rounds.find(r => r.stage === 'playoffs');
assert.equal(playoffs.patch, '7.3b');
assert.ok(playoffs.matches.every(m => !m.patch && WR.matchPatch(playoffs, m) === '7.3b'));
assert.match(WR.league.meta.patch, /7\.3b（季后赛）$/);
console.log('ok: 7.3b notes, highlights, sections, CN-first Hwei entry and playoff adoption');

const all = WR.computeStats(), v73 = WR.computeStats('7.3');
assert.equal(all.patches.find(p => p.id === '7.3b').games, 0);
assert.ok(Object.values(all.stats).every(s => !s.byPatch['7.3b']));
// A playoff game counts as 7.3b inside major 7.3 without touching 7.2 or the earlier 7.3 minors.
const before = { v72: plain(WR.computeStats('7.2')), minors: plain(v73.patches.filter(p => p.id !== '7.3b')), total: v73.totalGames };
const donor = rounds.find(r => r.patch === '7.3a').matches.find(m => m.games.length);
const sf1 = playoffs.matches.find(m => m.id === 'SF1'), saved = { games: sf1.games, o1: sf1.opponent1, o2: sf1.opponent2 };
Object.assign(sf1, { games: plain(donor.games.slice(0, 1)), opponent1: donor.opponent1, opponent2: donor.opponent2 });
const after = WR.computeStats('7.3');
assert.equal(after.totalGames, before.total + 1);
assert.equal(after.patches.find(p => p.id === '7.3b').games, 1);
assert.deepEqual(plain(after.patches.filter(p => p.id !== '7.3b')), before.minors);
assert.deepEqual(plain(WR.computeStats('7.2')), before.v72);
Object.assign(sf1, { games: saved.games, opponent1: saved.o1, opponent2: saved.o2 });
console.log('PASS: 7.3b stays inside major 7.3 and leaves 7.2, 7.3 and 7.3a samples unchanged.');
