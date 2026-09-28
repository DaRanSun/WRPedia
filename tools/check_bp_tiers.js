// Run: node tools/check_bp_tiers.js. Deterministic model and version-scope checks.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert/strict");
const root = path.join(__dirname, "..");
const ctx = { window: {}, document: { addEventListener() {} }, URLSearchParams };
function load(file) { vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), ctx, { filename: file }); }
load("data/champions.js");
load("data/champion-locales.js");
load("data/schedule.js");
load("data/champion-rules.js");
load("assets/js/common.js");
load("assets/js/bp-tiers.js");
load("assets/js/stats.js");
const { WR, WR_LEAGUE: league } = ctx.window;
const { evaluate, levelFor } = WR.BPTiers;
const counts = (available, picks = 0, bans = 0, wins = Math.floor(picks / 2)) => ({ available, picks, bans, wins, losses: picks - wins });

// Hand-calculated fixture: q = 30/100, b = 10/100.
// A: smoothed BP = 32.4/48 = .675; bans = 10.8/48 = .225.
// W = 10: smoothed win rate = 15/30 = .5, multiplier = 1.
// Score = (90*.675 + 10*.225) * 1 = 63.0, T1.
const known = { a: counts(40, 20, 10), b: counts(60) };
const result = evaluate(known);
assert.equal(result.baselineBP, 0.3);
assert.equal(result.baselineBan, 0.1);
assert.equal(result.ratings.a.score, 63);
assert.equal(result.ratings.a.label, "T1");
assert.equal(result.ratings.b.score, 3.3);
assert.equal(result.ratings.b.label, "T4");
assert.equal(known.a.tier, undefined, "pure model must not mutate inputs");
console.log("ok: independently calculated weighted baseline, smoothing and score");

for (const [score, label] of [[100, "OP"], [85, "OP"], [84.9, "T0"], [70, "T0"], [69.9, "T1"], [50, "T1"], [49.9, "T2"], [30, "T2"], [29.9, "T3"], [10, "T3"], [9.9, "T4"], [0, "T4"]]) {
    assert.equal(levelFor(score).label, label);
}
for (const n of [0, 1, 11, 12, 29, 30]) {
    const rating = evaluate({ hero: counts(n, 0, n), background: counts(1000) }).ratings.hero;
    assert.equal(rating.status, n < 12 ? "pending" : "rated");
    assert.equal(rating.score === null, n < 12);
    assert.equal(rating.provisional, n >= 12 && n < 30);
}
const lowPriority = evaluate({ a: counts(100, 2, 2), b: counts(100) });
assert.ok(Object.values(lowPriority.ratings).every(r => r.label === "T4"), "do not force top tiers by rank");
console.log("ok: all six thresholds, zero samples, minimum and provisional sample boundaries");

const comparison = evaluate({ small: counts(20, 10, 8), large: counts(100, 50, 40), background: counts(10000) });
assert.ok(comparison.ratings.large.score > comparison.ratings.small.score, "same high rates need more evidence to retain score");
const pickHeavy = evaluate({ hero: counts(100, 80, 10), background: counts(10000) });
const banHeavy = evaluate({ hero: counts(100, 10, 80), background: counts(10000) });
assert.ok(banHeavy.ratings.hero.score > pickHeavy.ratings.hero.score, "same BP rate, higher bans give modest additional priority");
const noWins = evaluate({ a: { ...known.a, wins: 0, losses: 20 }, b: known.b });
const allWins = evaluate({ a: { ...known.a, wins: 20, losses: 0 }, b: known.b });
assert.equal(noWins.ratings.a.smoothedWinRate, 1 / 6);
assert.equal(noWins.ratings.a.score, 21);
assert.equal(noWins.ratings.a.label, "T3");
assert.equal(allWins.ratings.a.score, 100);
assert.equal(allWins.ratings.a.capped, true);
assert.equal(noWins.ratings.a.baseScore, result.ratings.a.baseScore);
assert.equal(allWins.ratings.a.baseScore, result.ratings.a.baseScore);
assert.deepEqual(noWins.ratings.b, allWins.ratings.b, "other heroes' wins cannot affect BP priors or own win factor");
const alwaysBanned = evaluate({ anyName: counts(72, 0, 72), background: counts(10000) }).ratings.anyName;
assert.equal(alwaysBanned.label, "OP");
assert.equal(alwaysBanned.winMultiplier, 1);
assert.equal(alwaysBanned.winAdjustment, 0);
assert.equal(alwaysBanned.score, alwaysBanned.baseScore);
const oneWin = evaluate({ hero: counts(72, 1, 0, 1), background: counts(10000) }).ratings.hero;
const tenWins = evaluate({ hero: counts(72, 10, 0, 10), background: counts(10000) }).ratings.hero;
assert.ok(oneWin.smoothedWinRate > 0.5 && oneWin.smoothedWinRate < 0.55);
assert.ok(oneWin.winMultiplier < tenWins.winMultiplier, "more evidence allows a greater win adjustment");
assert.equal(oneWin.label, "T4", "a single win at low BP cannot create a high tier");
console.log("ok: neutral wins preserve BP; losses lower tiers, wins raise them, small samples shrink and all-ban heroes stay eligible");

for (const invalid of [counts(5, 4, 4), counts(-1), counts(10, NaN), counts(Infinity), counts(5, 1.5), counts(20, 10, 0, 11), { ...counts(20, 10), losses: 0 }, { ...counts(20, 10), wins: undefined }]) {
    const r = evaluate({ invalid, valid: counts(20, 10) });
    assert.equal(r.ratings.invalid.status, "invalid");
    assert.equal(r.ratings.invalid.score, null);
    assert.equal(r.baselineBP, 0.5);
}
const excluded = evaluate({ a: counts(100, 0, 100), b: counts(100, 10) }, { a: "测试赛事限制" });
assert.equal(excluded.ratings.a.status, "excluded");
assert.equal(excluded.ratings.a.score, null);
assert.equal(excluded.baselineBP, 0.1);
assert.equal(excluded.ratings.a.reason, "测试赛事限制");
console.log("ok: invalid inputs and explicit exclusions do not contaminate the baseline");

// Properties over a wide set of legal pick/ban counts; no exact result mirrors.
for (let n = 12; n <= 120; n += 9) {
    for (let picks = 0; picks <= n; picks += 3) {
        let previous = -1;
        for (let bans = 0; bans <= n - picks; bans += 3) {
            const r = evaluate({ hero: counts(n, picks, bans), background: counts(1000, 100, 100) }).ratings.hero;
            assert.ok(Number.isFinite(r.score) && r.score >= 0 && r.score <= 100);
            assert.ok(r.score >= previous, "adding a legal ban cannot decrease priority");
            assert.equal(r.label, levelFor(Number(r.score.toFixed(1))).label, "display and threshold must agree");
            previous = r.score;
        }
    }
}
console.log("ok: score bounds, monotonicity and displayed-score/grade agreement");

for (const picks of [1, 2, 10, 26, 50, 72]) {
    let previous = -1;
    for (let wins = 0; wins <= picks; wins++) {
        const r = evaluate({ hero: counts(72, picks, 0, wins), background: counts(1000) }).ratings.hero;
        assert.ok(r.score >= previous, "replacing a loss with a win must not reduce the score");
        assert.equal(r.winAdjustment, Number((r.score - r.baseScore).toFixed(1)));
        previous = r.score;
    }
}
console.log("ok: increasing wins is monotone and displayed adjustments reconcile with final scores");

const actual = WR.computeStats("7.2");
assert.equal(actual.stats.zilean.tier.label, "OP");
assert.equal(actual.stats.zilean.tier.score, actual.stats.zilean.tier.baseScore);
assert.equal(actual.stats.zilean.tier.winAdjustment, 0);
assert.equal(actual.stats.renekton.picks, 32);
assert.equal(actual.stats.renekton.wins, 10);
assert.ok(actual.stats.renekton.tier.baseScore > actual.stats.renekton.tier.score);
assert.equal(actual.stats.renekton.tier.score, 49.4);
assert.equal(actual.stats.renekton.tier.label, "T2");
assert.ok(Number.isFinite(WR.computeStats("7.3").stats.hwei.tier.score));
assert.equal(WR.computeStats("7.3").stats.gwen.tier.score, null, "fearless denominator under 12 remains pending");
assert.deepEqual(actual.tierModel, WR.computeStats("7.2").tierModel);
console.log("current tiers:", actual.tierModel.levels.map(level => level.label + "=" + Object.values(actual.stats).filter(st => st.tier.label === level.label).length).join(" "));

// Regression: KBG (red) won W4M3 Game 2 in 13:15, completing a 2–0.
const corrected = league.rounds.flatMap(r => r.matches).find(m => m.id === "W4M3");
assert.equal(corrected.opponent1, "KBG");
assert.equal(corrected.opponent2, "ACE");
assert.equal(corrected.games.length, 2);
assert.ok(corrected.games.every(g => g.winner === 1));
const game = corrected.games[1];
assert.equal(game.length, "13:15");
assert.equal(game.team1.side, "red");
assert.equal(game.team2.side, "blue");
game.winner = 2;
const priorResult = WR.computeStats("7.2");
game.winner = 1;
assert.equal(actual.totalGames, priorResult.totalGames);
assert.equal(actual.redWins, priorResult.redWins + 1);
assert.equal(actual.blueWins, priorResult.blueWins - 1);
for (const [slug, st] of Object.entries(actual.stats)) {
    const before = priorResult.stats[slug];
    const delta = game.team1.picks.includes(slug) ? 1 : game.team2.picks.includes(slug) ? -1 : 0;
    assert.equal(st.wins, before.wins + delta, slug + " corrected win count");
    assert.equal(st.losses, before.losses - delta, slug + " corrected loss count");
    for (const field of ["picks", "bans", "available"]) assert.equal(st[field], before[field], slug + " preserved " + field);
    assert.equal(st.tier.baseScore, before.tier.baseScore, slug + " preserved BP base score");
}
assert.ok(actual.stats.aatrox.tier.score > priorResult.stats.aatrox.tier.score);
assert.ok(actual.stats.gwen.tier.score < priorResult.stats.gwen.tier.score);
console.log("ok: corrected series outcome propagates to side wins, hero records and tiers without changing BP counts");

function match(pick, ban) {
    return { opponent1: "TT", opponent2: "FP", games: [{ winner: 1, length: "20:00", team1: { side: "blue", picks: [pick], bans: [ban] }, team2: { side: "red", picks: ["garen"], bans: [] } }] };
}
league.rounds = [
    { patch: "7.2e", matches: Array.from({ length: 32 }, () => match("yone", "zed")) },
    { patch: "7.3", matches: Array.from({ length: 32 }, () => match("ahri", "vi")) }
];
const future = WR.computeStats("7.3");
assert.equal(future.stats.yone.tier.label, "T4");
assert.notEqual(WR.computeStats("7.2").stats.yone.tier.label, "T4");
assert.ok(WR.computeStats().stats.yone.tier.score < WR.computeStats("7.2").stats.yone.tier.score);
league.rounds[0].matches.push(...Array.from({ length: 20 }, () => match("yone", "vi")));
assert.deepEqual(WR.computeStats("7.3").tierModel, future.tierModel, "unselected version must not change priors or scores");
console.log("ok: real data, small-sample new version, separate patch priors and combined total-board recalculation");
console.log("ALL BP TIER CHECKS PASSED");
