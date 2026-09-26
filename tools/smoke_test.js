// Minimal DOM stub smoke test for WRpedia pages (Node only).
"use strict";

const path = require("path");
const fs = require("fs");
const root = path.join(__dirname, "..");

const listeners = {};
const elements = new Map();
function makeEl(id) {
    return {
        id,
        innerHTML: "",
        textContent: "",
        dataset: {},
        classList: { add() {}, remove() {}, toggle() {} },
        getAttribute() { return null; },
        setAttribute() {},
        removeAttribute() {},
        addEventListener() {},
        querySelectorAll() { return []; },
        querySelector() { return null; },
        appendChild() {},
        remove() {}
    };
}
global.window = {};
global.document = {
    body: makeEl("body"),
    getElementById(id) {
        if (!elements.has(id)) elements.set(id, makeEl(id));
        return elements.get(id);
    },
    querySelectorAll() { return []; },
    addEventListener(type, fn) {
        if (!listeners[type]) listeners[type] = [];
        listeners[type].push(fn);
    },
    createElement() { return makeEl("created"); }
};

function load(file) {
    const code = fs.readFileSync(path.join(root, file), "utf8");
    (0, eval)(code);
}

load("data/champions.js");
load("data/champion-locales.js");
load("data/schedule.js");

let failed = 0;
function check(name, cond) {
    if (!cond) {
        failed++;
        console.error("FAIL: " + name);
    } else {
        console.log("ok: " + name);
    }
}

// ---------- data integrity ----------
const league = window.WR_LEAGUE;
check("142 champions", window.WR_CHAMPIONS.length === 142);
check("8 teams", league.teams.length === 8);
check("demo flag is false", league.meta.demo === false);

const rounds = league.rounds;
const matches = rounds.flatMap(r => r.matches);
check("7 regular rounds", rounds.length === 7);
check("56 regular matches", matches.length === 56);

const pairCounts = {};
for (const m of matches) {
    const a = m.opponent1, b = m.opponent2;
    const key = [a, b].sort().join("-");
    pairCounts[key] = pairCounts[key] || { total: 0, ab: 0, ba: 0 };
    pairCounts[key].total++;
    if (a < b) pairCounts[key].ab++; else pairCounts[key].ba++;
}
const pairKeys = Object.keys(pairCounts);
check("28 unordered pairs", pairKeys.length === 28);
check("every pair meets exactly twice", pairKeys.every(k => pairCounts[k].total === 2));
check("every pair has home and away legs", pairKeys.every(k => pairCounts[k].ab === 1 && pairCounts[k].ba === 1));

// Recorded results: weeks 1–5 and the first five series of week 6.
const slugs = new Set(window.WR_CHAMPIONS.map(c => c.slug));
const played = matches.filter(m => (m.games || []).length > 0);
check("45 matches filled with games (weeks 1–5 plus five week 6 series)", played.length === 45);
check("every game has 5+5 picks and 5+5 bans, valid slugs", played.every(m =>
    m.games.every(g =>
        [g.team1, g.team2].every(t =>
            t.picks.length === 5 && t.bans.length === 5 &&
            t.picks.every(s => slugs.has(s)) && t.bans.every(s => s === null || slugs.has(s))))));
check("winner is 1 or 2 and sides are blue/red", played.every(m =>
    m.games.every(g => [1, 2].includes(g.winner) &&
        g.team1.side !== g.team2.side && ["blue", "red"].includes(g.team1.side) && ["blue", "red"].includes(g.team2.side))));
check("no champion picked twice in a match (fearless draft)", played.every(m => {
    const seen = new Set();
    return m.games.every(g => {
        const picks = [...g.team1.picks, ...g.team2.picks];
        if (picks.some(s => seen.has(s))) return false;
        picks.forEach(s => seen.add(s));
        return true;
    });
}));
check("no champion banned twice within a game", played.every(m =>
    m.games.every(g => { const bans = [...g.team1.bans, ...g.team2.bans].filter(Boolean); return new Set(bans).size === bans.length; })));
check("no pick banned in the same game", played.every(m =>
    m.games.every(g => ![...g.team1.picks, ...g.team2.picks].some(s =>
        g.team1.bans.includes(s) || g.team2.bans.includes(s)))));

// ---------- synthetic fearless-draft scenario ----------
// 新口径：有效局数 = 未被无畏征召锁定的小局数（被选用的大场内，仅选用局及之前计入；
// 未被选用的大场全部小局计入，无论是否被禁用）。
// T1: yone/aatrox picked in game 1 -> T1 内 available = 1；T2 全程未被选用 -> +3，合计 4。
//     morgana 两个大场均未被选用 -> available = 3+3 = 6, bans = 4（T1 G1/G2 + T1 G3 + T2 G2）。
//     riven picked T1 G2、T2 G3 -> available = 2 + 3 = 5。
//     zed banned T1 G1、picked T1 G2；T2 G3 picked -> available = 2 + 3 = 5, bans = 1, picks = 2。
//     fiora T1 全程未被选用（仅 ban）-> +3；T2 G2 picked -> +2，合计 5；bans = 3, picks = 1。
//     diana T1 全程未出现 -> +3；T2 G1 banned、G2 picked -> +2，合计 5。
const synthetic = {
    meta: { name: "TEST", demo: false, playoffTeams: 1, eliminatedTeams: 0 },
    teams: [
        { id: "TT", name: "TT", short: "TT", region: "", logo: "" },
        { id: "FP", name: "FP", short: "FP", region: "", logo: "" }
    ],
    rounds: [
        {
            id: "t1",
            title: "Test Round",
            date: "2026-08-21",
            matches: [
                {
                    id: "T1", date: "2026-08-21 17:00", timezone: "UTC+8", bestOf: 3,
                    opponent1: "TT", opponent2: "FP",
                    games: [
                        { length: "20:00", winner: 1,
                          team1: { side: "blue", picks: ["yone", "aatrox", "ahri", "jinx", "lulu"], bans: ["zed", "morgana"] },
                          team2: { side: "red",  picks: ["camille", "wukong", "corki", "varus", "gragas"], bans: ["yasuo", "fiora"] } },
                        { length: "22:00", winner: 2,
                          team1: { side: "red",  picks: ["riven", "lee-sin", "orianna", "ashe", "thresh"], bans: ["yone", "morgana"] },
                          team2: { side: "blue", picks: ["renekton", "olaf", "zed", "lucian", "rakan"], bans: ["aatrox", "fiora"] } },
                        { length: "25:00", winner: 1,
                          team1: { side: "blue", picks: ["darius", "vi", "galio", "kogmaw", "braum"], bans: ["morgana"] },
                          team2: { side: "red",  picks: ["shen", "ekko", "swain", "ziggs", "alistar"], bans: ["fiora", "riven"] } }
                    ]
                },
                {
                    id: "T2", date: "2026-08-28 17:00", timezone: "UTC+8", bestOf: 3,
                    opponent1: "TT", opponent2: "FP",
                    games: [
                        { length: "18:00", winner: 2,
                          team1: { side: "blue", picks: ["garen", "jax", "syndra", "caitlyn", "sona"], bans: ["diana"] },
                          team2: { side: "red",  picks: ["nasus", "khazix", "twisted-fate", "samira", "braum"], bans: ["karma"] } },
                        { length: "21:00", winner: 1,
                          team1: { side: "red",  picks: ["fiora", "vi", "galio", "tristana", "nami"], bans: ["morgana"] },
                          team2: { side: "blue", picks: ["shen", "ekko", "diana", "ziggs", "alistar"], bans: ["braum"] } },
                        { length: "24:00", winner: 2,
                          team1: { side: "blue", picks: ["riven", "lee-sin", "orianna", "ashe", "thresh"], bans: ["fiora"] },
                          team2: { side: "red",  picks: ["renekton", "olaf", "zed", "lucian", "rakan"], bans: ["diana"] } }
                    ]
                }
            ]
        }
    ]
};

window.WR_LEAGUE = synthetic;
load("data/champion-rules.js");
load("assets/js/common.js");
load("assets/js/bp-tiers.js");
load("assets/js/stats.js");
load("assets/js/schedule.js");

// ---------- run page scripts ----------
if (listeners.DOMContentLoaded) listeners.DOMContentLoaded.forEach(fn => fn());

const S = window.WR_STATS;
check("stats computed for 6 games", S && S.totalGames === 6);
check("yone available = 4 (1 in T1 + 3 in T2)", S.stats.yone.available === 4);
check("yone picks = 1", S.stats.yone.picks === 1);
check("yone later ban ignored", S.stats.yone.bans === 0);
check("yone pick rate 25% (1/4)", Math.abs(S.stats.yone.picks / S.stats.yone.available * 100 - 25) < 1e-9);
check("riven available = 5 (2 in T1, 3 in T2)", S.stats.riven.available === 5);
check("fiora available = 5 (3 banned-only in T1, 2 in T2)", S.stats.fiora.available === 5);
check("fiora bans = 3, picks = 1", S.stats.fiora.bans === 3 && S.stats.fiora.picks === 1);
check("morgana available = 6, bans = 4", S.stats.morgana.available === 6 && S.stats.morgana.bans === 4);
check("diana available = 5 (3 in T1 + 2 in T2), ban+picked = 2 events", S.stats.diana.available === 5 && S.stats.diana.bans === 1 && S.stats.diana.picks === 1);
check("zed available = 5", S.stats.zed.available === 5);

const summary = document.getElementById("stats-summary").innerHTML;
check("stats summary counts 6 games", summary.includes("总局数 <b>6</b>"));

const champTable = document.getElementById("champion-stats-table").innerHTML;
check("champion table rendered in Chinese with six core columns", champTable.includes("选用次数") && champTable.includes("永恩") && !champTable.includes("蓝方选用"));

const standings = document.getElementById("standings-body").innerHTML;
if (!standings.includes("TT")) console.error("standings HTML:", standings.slice(0, 600));
check("standings rendered (TT 1-1, 3-3)", standings.includes("TT") && standings.includes("1-1") && standings.includes("3-3"));

const matchlist = document.getElementById("matchlist-root").innerHTML;
check("matchlist rendered with picks", matchlist.includes("T1") && matchlist.includes("Test Round") && matchlist.includes("永恩"));

const unpicked = document.getElementById("unpicked-count").textContent;
const expectedUnpicked = Object.values(S.stats).filter(st => st.available > 0 && st.picks === 0).length;
check("unpicked count matches stats", Number(unpicked) === expectedUnpicked);

console.log(failed === 0 ? "\nALL CHECKS PASSED" : "\n" + failed + " CHECK(S) FAILED");
process.exit(failed === 0 ? 0 : 1);
