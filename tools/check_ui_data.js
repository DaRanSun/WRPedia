// Run: node tools/check_ui_data.js. Match entry, CN search and patch-history regressions.
"use strict";
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict');
const root = path.join(__dirname, '..');
const ctx = { window: {}, document: { addEventListener() {} }, URLSearchParams };
for (const file of ['data/champions.js', 'data/champion-locales.js', 'data/schedule.js', 'data/patches.js', 'data/champion-rules.js', 'assets/js/common.js', 'assets/js/bp-tiers.js', 'assets/js/stats.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file });
}
const { WR } = ctx.window;
const plain = x => JSON.parse(JSON.stringify(x));
assert.equal(Object.keys(ctx.window.WR_CHAMPION_LOCALES).length, WR.champions.length);
for (const [query, slug, name] of [['泰坦', 'nautilus', '诺提勒斯'], ['日女', 'leona', '蕾欧娜'], ['球女', 'syndra', '辛德拉'], ['鳄鱼', 'renekton', '雷克顿'], ['剑魔', 'aatrox', '亚托克斯'], ['女枪', 'miss-fortune', '厄运小姐'], ['刀妹', 'irelia', '艾瑞莉娅'], ['norRA', 'norra', '诺拉'], ['Lee Sin', 'lee-sin', '李青'], ['jarvanIV', 'jarvan-iv', '嘉文四世']]) {
    assert.ok(WR.championMatches(slug, query), query);
    assert.equal(WR.championName(slug), name);
}
assert.ok(WR.championMatches('nautilus', 'ＮＡＵＴＩＬＵＳ'));
assert.ok(!WR.champions.some(c => WR.championMatches(c.slug, '不存在的英雄')));
assert.equal(WR.localizeChampionNames('星朵拉與納帝魯斯'), '辛德拉與诺提勒斯');
assert.equal(WR.localizeChampionNames('關'), '格温');
assert.equal(WR.localizeChampionNames('關鍵改動：關、汎'), '關鍵改動：格温、薇恩');
console.log('ok: all ' + WR.champions.length + ' CN names, colloquial aliases, English and full-width search normalization');

function search(query) { return Array.from(WR.champions.filter(c => WR.championMatches(c.slug, query)), c => c.slug).sort(); }
for (const [slug, aliases] of Object.entries({
    sett: ['劲夫', '万豪'], yunara: ['云', '云狗', '芸狗'], ksante: ['黑叔叔', '老黑'],
    seraphine: ['酸辣粉', '歌女'], milio: ['丁真'], aurora: ['小兔', '兔子', '阿罗拉'],
    zyra: ['花女'], morgana: ['地沟油'], senna: ['黑枪'], ambessa: ['狼母'], zilean: ['时光'], ezreal: ['ez', ' ＥＺ '],
    hwei: ['彗', 'Hwei', '毛笔人', '上官婉儿']
})) {
    for (const alias of aliases) assert.deepEqual(search(alias), [slug], alias + ' exact alias must not include unrelated substring matches');
}
assert.ok(search('伊泽').includes('ezreal'), 'partial Chinese names still work');
assert.ok(search('aurelion').includes('aurelion-sol'), 'partial English names still work');
assert.deepEqual(search('jl'), ['zilean', 'zyra'], 'shared abbreviations preserve all exact candidates');
console.log('ok: all owner-supplied nicknames, exact aliases before substrings and shared abbreviation ambiguity');

assert.deepEqual(search('芸够'), [], 'replaced typo must no longer match');
for (const [query, expected] of Object.entries({
    uzi: ['vayne', 'kaisa', 'rumble'],
    faker: ['zed', 'ryze', 'syndra', 'orianna', 'yone', 'galio', 'ahri'],
    '翻山': ['zeri'], '反向q': ['varus'], '文森特': ['draven'], '区': ['aurelion-sol'], '纸袋': ['zoe']
})) assert.deepEqual(search(query), expected.slice().sort(), query + ' must match exactly the requested hero group');
assert.deepEqual(search(' ＵＺＩ '), search('uzi'));
assert.deepEqual(search('Faker'), search('faker'));
assert.deepEqual(search('反向Q'), ['varus']);
console.log('ok: corrected 芸狗, rabbit nickname, all player/meme keyword groups and case/full-width normalization');

const match = WR.league.rounds[4].matches.find(m => m.id === 'W5M1');
assert.equal(WR.matchPatch(WR.league.rounds[4], match), '7.2e');
assert.equal(match.opponent1, 'FP'); assert.equal(match.opponent2, 'TT');
assert.deepEqual(plain(match.games.map(g => [g.winner, g.length, g.team1.side, g.team2.side])), [[2, '20:23', 'blue', 'red'], [2, '19:57', 'red', 'blue']]);
assert.deepEqual(plain(match.games[0].team1.picks), ['olaf', 'poppy', 'yone', 'ziggs', 'galio']);
assert.deepEqual(plain(match.games[0].team2.picks), ['camille', 'vi', 'ryze', 'corki', 'gragas']);
assert.deepEqual(plain(match.games[1].team1.picks), ['gwen', 'jarvan-iv', 'yasuo', 'lucian', 'milio']);
assert.deepEqual(plain(match.games[1].team2.picks), ['ksante', 'ambessa', 'syndra', 'zeri', 'karma']);
assert.deepEqual(plain(match.games[0].team1.bans), ['ezreal', 'jax', 'gwen', 'nautilus', 'bard']);
assert.deepEqual(plain(match.games[0].team2.bans), ['zilean', 'nunu-and-willump', 'syndra', 'lee-sin', 'xin-zhao']);
assert.deepEqual(plain(match.games[1].team1.bans), ['zilean', 'ezreal', 'lee-sin', 'yunara', 'xayah']);
assert.deepEqual(plain(match.games[1].team2.bans), ['nunu-and-willump', 'xin-zhao', 'nidalee', 'varus', 'bard']);
console.log('ok: FP 0–2 TT, both sides, durations, all picks and ordered bans');

const total = WR.computeStats();
assert.deepEqual(plain(total.patches), [{ id: '7.2c', games: 20 }, { id: '7.2d', games: 34 }, { id: '7.2e', games: 38 }, { id: '7.3', games: 4 }]);
assert.deepEqual(plain(Object.values(total.stats.syndra.byPatch).map(p => p.picks)), [0, 4, 11, 0]);
assert.equal(total.stats.syndra.byPatch['7.2d'].available, 31);
assert.equal(total.stats.syndra.byPatch['7.2e'].available, 27);
assert.deepEqual(plain(total.stats.syndra.byPatch['7.3']), { picks: 0, bans: 3, wins: 0, losses: 0, available: 4 });
for (const st of Object.values(total.stats)) {
    for (const key of ['picks', 'bans', 'wins', 'losses', 'available']) {
        assert.equal(Object.values(st.byPatch).reduce((sum, p) => sum + p[key], 0), st[key], st.slug + ' ' + key);
    }
}
const saved = WR.league.rounds;
// Hero picked in first fearless game: later pick/ban does not enter history either.
function game(pick, ban) { return { winner: 1, team1: { side: 'blue', picks: [pick], bans: [ban] }, team2: { side: 'red', picks: ['ahri'], bans: [] } }; }
WR.league.rounds = [{ patch: '7.2c', matches: [{ opponent1: 'TT', opponent2: 'FP', games: [game('yone', 'zed'), game('yone', 'yone')] }] }, { patch: '7.3', matches: [{ opponent1: 'TT', opponent2: 'FP', games: [game('yone', 'zed')] }] }];
const v72 = WR.computeStats('7.2'), v73 = WR.computeStats('7.3');
assert.deepEqual(plain(v72.stats.yone.byPatch), { '7.2c': { picks: 1, bans: 0, wins: 1, losses: 0, available: 1 } });
assert.deepEqual(plain(v73.stats.yone.byPatch), { '7.3': { picks: 1, bans: 0, wins: 1, losses: 0, available: 1 } });
WR.league.rounds[0].matches[0].patch = '7.2e';
assert.ok(WR.computeStats('7.2').stats.yone.byPatch['7.2e']);
assert.equal(WR.computeStats('7.2').stats.yone.byPatch['7.2c'], undefined);
WR.league.rounds = saved;
console.log('ok: patch history sums, Syndra 0/4/11, fearless denominators, version isolation and match overrides');
console.log('ALL UI DATA CHECKS PASSED');
