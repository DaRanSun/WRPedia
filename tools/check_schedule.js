// Verifies the 2026 WRL Summer regular-season schedule:
// 8 teams, double round-robin, 56 matches expected.
"use strict";

const teams = ["TT", "FP", "RV", "KBG", "WBG", "SS1", "WHG", "ACE"];

// [date, time, team1, team2]  (date as MM-DD)
const matches = [
    // Week 1
    ["08-21", "17:00", "SS1", "RV"],
    ["08-21", "18:00", "KBG", "WBG"],
    ["08-22", "15:00", "KBG", "SS1"],
    ["08-22", "17:00", "RV", "WBG"],
    ["08-22", "19:00", "WHG", "FP"],
    ["08-23", "15:00", "TT", "FP"],
    ["08-23", "17:00", "ACE", "WHG"],
    ["08-23", "19:00", "SS1", "WBG"],
    // Week 2
    ["08-28", "17:00", "ACE", "TT"],
    ["08-28", "19:00", "WHG", "RV"],
    ["08-29", "15:00", "TT", "KBG"],
    ["08-29", "17:00", "ACE", "FP"],
    ["08-29", "19:00", "WBG", "WHG"],
    ["08-30", "15:00", "KBG", "FP"],
    ["08-30", "17:00", "RV", "ACE"],
    ["08-30", "19:00", "SS1", "TT"],
    // Week 3
    ["09-04", "17:00", "WBG", "FP"],
    ["09-04", "19:00", "WHG", "KBG"],
    ["09-05", "15:00", "TT", "RV"],
    ["09-05", "17:00", "ACE", "SS1"],
    ["09-05", "19:00", "FP", "KBG"],
    ["09-06", "15:00", "KBG", "RV"],
    ["09-06", "17:00", "WBG", "TT"],
    ["09-06", "19:00", "SS1", "WHG"],
    // Week 4
    ["09-11", "17:00", "ACE", "WBG"],
    ["09-11", "19:00", "FP", "SS1"],
    ["09-12", "15:00", "KBG", "ACE"],
    ["09-12", "17:00", "FP", "RV"],
    ["09-12", "19:00", "WHG", "TT"],
    ["09-13", "15:00", "RV", "KBG"],
    ["09-13", "17:00", "WHG", "ACE"],
    ["09-13", "19:00", "WBG", "SS1"],
    // Week 5
    ["09-18", "17:00", "FP", "TT"],
    ["09-18", "19:00", "ACE", "RV"],
    ["09-19", "15:00", "WHG", "SS1"],
    ["09-19", "17:00", "WBG", "KBG"],
    ["09-19", "19:00", "RV", "FP"],
    ["09-20", "15:00", "TT", "WBG"],
    ["09-20", "17:00", "KBG", "WHG"],
    ["09-20", "19:00", "SS1", "ACE"],
    // Week 6
    ["09-25", "17:00", "FP", "WHG"],
    ["09-25", "19:00", "KBG", "TT"],
    ["09-26", "15:00", "TT", "SS1"],
    ["09-26", "17:00", "WBG", "ACE"],
    ["09-26", "19:00", "RV", "WHG"],
    ["09-27", "15:00", "FP", "WBG"],
    ["09-27", "17:00", "RV", "TT"],
    ["09-27", "19:00", "SS1", "KBG"],
    // Week 7
    ["10-02", "17:00", "FP", "ACE"],
    ["10-02", "19:00", "WHG", "WBG"],
    ["10-03", "15:00", "TT", "ACE"],
    ["10-03", "17:00", "SS1", "FP"],
    ["10-03", "19:00", "WBG", "RV"],
    ["10-04", "15:00", "ACE", "KBG"],
    ["10-04", "17:00", "RV", "SS1"],
    ["10-04", "19:00", "TT", "WHG"]
];

function run() {
    let failed = 0;
    function check(name, cond) {
        if (!cond) { failed++; console.error("FAIL: " + name); }
        else console.log("ok: " + name);
    }

    // basic validity
    check("56 regular-season matches", matches.length === 56);
    const badTeams = matches.filter(m => !teams.includes(m[2]) || !teams.includes(m[3]));
    check("all team names valid", badTeams.length === 0);

    // exact duplicates on same date/time (same orientation)
    const seen = new Set();
    const exactDup = [];
    for (const m of matches) {
        const key = m.join("|");
        if (seen.has(key)) exactDup.push(key);
        seen.add(key);
    }
    check("no exact duplicate match (date+time+order)", exactDup.length === 0);
    if (exactDup.length) console.error("  exact duplicates:", exactDup.join("; "));

    // per-team match count
    const teamCount = {};
    for (const t of teams) teamCount[t] = 0;
    for (const m of matches) { teamCount[m[2]]++; teamCount[m[3]]++; }
    const badCount = teams.filter(t => teamCount[t] !== 14);
    check("every team plays 14 matches", badCount.length === 0);
    if (badCount.length) console.error("  bad counts:", badCount.map(t => t + "=" + teamCount[t]).join(", "));

    // unordered pair counts (each pair must meet exactly twice)
    const pairCount = {};
    for (const m of matches) {
        const key = [m[2], m[3]].sort().join("-");
        pairCount[key] = (pairCount[key] || 0) + 1;
    }
    const over = Object.keys(pairCount).filter(k => pairCount[k] > 2);
    const under = Object.keys(pairCount).filter(k => pairCount[k] < 2);
    check("28 pairings, each exactly twice", Object.keys(pairCount).length === 28 && over.length === 0 && under.length === 0);
    console.log("  pairings with >2 meetings:", over.length ? over.map(k => k + " (" + pairCount[k] + ")").join(", ") : "none");
    console.log("  pairings with <2 meetings:", under.length ? under.map(k => k + " (" + pairCount[k] + ")").join(", ") : "none");

    // direction counts: each pair should appear once in each direction
    const dirCount = {};
    for (const m of matches) {
        const key = m[2] + ">" + m[3];
        dirCount[key] = (dirCount[key] || 0) + 1;
    }
    const directionIssues = [];
    for (const a of teams) {
        for (const b of teams) {
            if (a >= b) continue;
            const ab = dirCount[a + ">" + b] || 0;
            const ba = dirCount[b + ">" + a] || 0;
            if (ab !== 1 || ba !== 1) directionIssues.push(a + " vs " + b + ": " + a + "->" + b + "=" + ab + ", " + b + "->" + a + "=" + ba);
        }
    }
    check("each pair has one home and one away leg", directionIssues.length === 0);
    directionIssues.forEach(x => console.error("  " + x));

    console.log(failed === 0 ? "\nALL CHECKS PASSED" : "\n" + failed + " CHECK(S) FAILED");
    return failed === 0;
}

module.exports = { teams, matches, run };
if (require.main === module) {
    const ok = run();
    process.exit(ok ? 0 : 1);
}
