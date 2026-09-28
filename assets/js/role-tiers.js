(function () {
    "use strict";
    const WR = window.WR;
    const ROLES = Object.freeze({ top: "上单", jungle: "打野", mid: "中路", bot: "下路", support: "辅助" });
    const CONFIG = Object.freeze({ id: "分路 v3", opportunityPrior: 8, winPrior: 8,
        minPicks: 3, minGames: 12, provisionalPicks: 10, anchorFloor: 0.25 });
    const LEVELS = Object.freeze([
        { label: "OP", min: 90 }, { label: "T0", min: 75 }, { label: "T1", min: 55 },
        { label: "T2", min: 35 }, { label: "T3", min: 15 }, { label: "T4", min: 0 }
    ]);

    function recordedBan(st, role) { return st.bansByRole && st.bansByRole[role] != null ? st.bansByRole[role] : 0; }
    function unknownBans(st) {
        return st.unassignedBans == null ? st.bans - Object.keys(ROLES).reduce((sum, r) => sum + recordedBan(st, r), 0) : st.unassignedBans;
    }
    function valid(st) {
        const recorded = Object.keys(ROLES).map(r => recordedBan(st, r));
        return [st.available, st.picks, st.bans, st.wins, st.losses].every(n => Number.isInteger(n) && n >= 0) &&
            st.picks + st.bans <= st.available && st.wins + st.losses === st.picks &&
            recorded.every(n => Number.isFinite(n) && n >= 0) && Number.isInteger(unknownBans(st)) && unknownBans(st) >= 0 &&
            Math.abs(recorded.reduce((sum, n) => sum + n, 0) + unknownBans(st) - st.bans) < 1e-9 &&
            Object.keys(ROLES).every(r => st.roles && st.roles[r] &&
                [st.roles[r].picks, st.roles[r].wins, st.roles[r].losses].every(n => Number.isFinite(n) && n >= 0) &&
                Math.abs(st.roles[r].wins + st.roles[r].losses - st.roles[r].picks) < 1e-9) &&
            ["picks", "wins", "losses"].every(k => Math.abs(Object.keys(ROLES).reduce((sum, r) => sum + st.roles[r][k], 0) - st[k]) < 1e-9);
    }

    function evaluate(stats, exclusions, banOnlyRules) {
        const rules = banOnlyRules || WR.championRules || {};
        function assignedShares(slug) {
            const shares = rules[slug] && rules[slug].banOnlyRoles;
            if (!shares || !Object.keys(shares).length || Object.keys(shares).some(r =>
                !ROLES[r] || !Number.isFinite(shares[r]) || shares[r] < 0)) return null;
            return Math.abs(Object.values(shares).reduce((sum, n) => sum + n, 0) - 1) < 1e-9 ? shares : null;
        }
        const unassigned = Object.keys(stats).filter(slug => stats[slug].picks === 0 && unknownBans(stats[slug]) > 0 &&
            !(exclusions && exclusions[slug]) && !assignedShares(slug));
        const roles = {};
        Object.keys(ROLES).forEach(function (role) {
            const rows = [];
            Object.keys(stats).forEach(function (slug) {
                const st = stats[slug], part = st.roles && st.roles[role];
                const shares = st.picks === 0 ? assignedShares(slug) : null;
                const share = st.picks === 0 ? (shares && shares[role]) || 0 : part && part.picks / st.picks;
                const recorded = recordedBan(st, role), estimated = unknownBans(st) * share;
                if (!part || !(part.picks > 0 || recorded + estimated > 0)) return;
                const pureBan = part.picks === 0;
                const row = { slug: slug, role: role, picks: part.picks, wins: part.wins, losses: part.losses,
                    banShare: share, banSource: recorded > 0 ? (estimated > 0 ? "mixed" : "recorded") : (st.picks ? "picks" : "confirmed"), pureBan: pureBan,
                    available: st.available, score: null, strength: null, estimatedBans: null, recordedBans: null, laneBans: null,
                    status: "pending", label: "待评级", provisional: false, reason: "" };
                if (exclusions && exclusions[slug]) { row.status = "excluded"; row.label = "不参与"; row.reason = String(exclusions[slug]); }
                else if (!valid(st)) { row.status = "invalid"; row.label = "待核对"; row.reason = "分路或 BP 记录不完整。"; }
                else {
                    // Explicit (including equal multi-role shares) lane tags take priority. Only untagged bans
                    // are estimated from picks or owner-confirmed pure-ban assignments.
                    row.recordedBans = recorded;
                    row.estimatedBans = estimated;
                    row.laneBans = recorded + estimated;
                    row.smoothedWinRate = (part.wins + CONFIG.winPrior / 2) / (part.picks + CONFIG.winPrior);
                    row.heat = (part.picks + row.laneBans) / (st.available + CONFIG.opportunityPrior);
                    row.strength = row.heat * 2 * row.smoothedWinRate;
                    const sample = pureBan ? row.laneBans : part.picks;
                    if (sample < CONFIG.minPicks || st.available < CONFIG.minGames) {
                        row.reason = "至少需本分路 " + CONFIG.minPicks + (pureBan ? " 次 Ban" : " 次选用") +
                            "和 " + CONFIG.minGames + " 个有效小局。";
                    } else {
                        row.status = "rated";
                        row.provisional = sample < CONFIG.provisionalPicks || st.available < 30;
                    }
                }
                rows.push(row);
            });
            const rated = rows.filter(row => row.status === "rated");
            const ordered = rated.map(row => row.strength).sort((a, b) => a - b);
            const median = ordered.length ? (ordered[Math.floor((ordered.length - 1) / 2)] + ordered[Math.floor(ordered.length / 2)]) / 2 : 0;
            const anchor = Math.max(CONFIG.anchorFloor, ...ordered);
            rated.forEach(function (row) {
                row.score = Math.round(1000 * row.strength / anchor) / 10;
                row.opEligible = (row.pureBan ? row.laneBans : row.picks) >= 8 && row.available >= 30 && row.smoothedWinRate >= 0.5 && row.strength >= median * 1.5;
                row.label = LEVELS.find(level => row.score >= level.min).label;
                if (row.label === "OP" && !row.opEligible) {
                    row.label = "T0";
                    row.reason = "OP 还需本分路至少 8 次" + (row.pureBan ? " Ban" : "选用") +
                        "、30 个有效小局、修正胜率 ≥ 50%，且强度达到本分路中位数的 1.5 倍。";
                }
            });
            rows.sort((a, b) => (b.score == null ? -1 : b.score) - (a.score == null ? -1 : a.score) ||
                b.picks - a.picks || (b.laneBans || 0) - (a.laneBans || 0) || a.slug.localeCompare(b.slug));
            roles[role] = { name: ROLES[role], rows: rows, anchor: anchor, median: median, ratedCount: rated.length };
        });
        return { config: CONFIG, levels: LEVELS, roles: roles, unassigned: unassigned };
    }
    WR.RoleTiers = Object.freeze({ config: CONFIG, roles: ROLES, levels: LEVELS, evaluate: evaluate });
})();
