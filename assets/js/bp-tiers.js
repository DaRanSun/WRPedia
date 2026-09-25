(function () {
    "use strict";

    // WRpedia BP + win-rate model v2. These are editorial weights, not fitted
    // win-probability estimates or statistical confidence intervals.
    const CONFIG = Object.freeze({
        id: "BP v2", priorGames: 8, winPriorGames: 10, minGames: 12, provisionalGames: 30,
        bpWeight: 0.9, banWeight: 0.1
    });
    const LEVELS = Object.freeze([
        { label: "OP", min: 85, description: "最高优先级" },
        { label: "T0", min: 70, description: "核心争夺" },
        { label: "T1", min: 50, description: "热门选择" },
        { label: "T2", min: 30, description: "常规选择" },
        { label: "T3", min: 10, description: "较低优先级" },
        { label: "T4", min: 0, description: "低频或未涉及 BP" }
    ].map(function (level) { return Object.freeze(level); }));

    function valid(st) {
        return [st.available, st.picks, st.bans, st.wins, st.losses].every(function (n) { return Number.isInteger(n) && n >= 0; }) &&
            st.picks + st.bans <= st.available && st.wins + st.losses === st.picks;
    }

    function levelFor(score) {
        return LEVELS.find(function (level) { return score >= level.min; });
    }

    function evaluate(stats, exclusions) {
        exclusions = exclusions || {};
        const slugs = Object.keys(stats);
        let available = 0, events = 0, bans = 0;
        slugs.forEach(function (slug) {
            const st = stats[slug];
            if (!valid(st) || exclusions[slug]) return;
            available += st.available;
            events += st.picks + st.bans;
            bans += st.bans;
        });
        // Empirical baseline: pooled champion opportunities in this exact scope.
        // Unpicked/unbanned eligible heroes are included in the denominator.
        const baselineBP = available ? events / available : 0;
        const baselineBan = available ? bans / available : 0;
        const ratings = {};
        slugs.forEach(function (slug) {
            const st = stats[slug];
            let reason = "", status = "rated";
            if (exclusions[slug]) { status = "excluded"; reason = String(exclusions[slug]); }
            else if (!valid(st)) { status = "invalid"; reason = "BP、胜负次数或有效局数异常，需核对记录。"; }
            else if (!st.available) { status = "pending"; reason = "当前统计范围暂无有效比赛样本。"; }
            else if (st.available < CONFIG.minGames) {
                status = "pending";
                reason = "有效局数 " + st.available + "/" + CONFIG.minGames + "，暂不分档。";
            }
            if (status !== "rated") {
                ratings[slug] = { status: status, label: status === "excluded" ? "不参与" : status === "invalid" ? "待核对" : "待评级", score: null, reason: reason, provisional: false };
                return;
            }
            const smoothedBP = (st.picks + st.bans + CONFIG.priorGames * baselineBP) / (st.available + CONFIG.priorGames);
            const smoothedBan = (st.bans + CONFIG.priorGames * baselineBan) / (st.available + CONFIG.priorGames);
            const bpPoints = 100 * CONFIG.bpWeight * smoothedBP;
            const banPoints = 100 * CONFIG.banWeight * smoothedBan;
            const basePoints = bpPoints + banPoints;
            // Beta(5, 5) prior: ten neutral games. Zero picks produces exactly
            // a neutral multiplier; every champion follows the same rule.
            const smoothedWinRate = (st.wins + CONFIG.winPriorGames / 2) / (st.picks + CONFIG.winPriorGames);
            const winMultiplier = 2 * smoothedWinRate;
            const adjustedPoints = basePoints * winMultiplier;
            // Display and classification share the SAME rounded value.
            const score = Math.round(Math.min(100, Math.max(0, adjustedPoints)) * 10) / 10;
            const baseScore = Math.round(basePoints * 10) / 10;
            ratings[slug] = {
                status: "rated", label: levelFor(score).label, score: score,
                smoothedBP: smoothedBP, smoothedBan: smoothedBan,
                bpPoints: bpPoints, banPoints: banPoints,
                baseScore: baseScore, smoothedWinRate: smoothedWinRate,
                winMultiplier: winMultiplier, capped: adjustedPoints > 100,
                winAdjustment: Math.round((score - baseScore) * 10) / 10,
                provisional: st.available < CONFIG.provisionalGames,
                reason: st.available < CONFIG.provisionalGames ? "有效样本不足 " + CONFIG.provisionalGames + " 局，梯度为初步结果。" : ""
            };
        });
        return { config: CONFIG, levels: LEVELS, baselineBP: baselineBP, baselineBan: baselineBan, ratings: ratings };
    }

    window.WR.BPTiers = Object.freeze({ config: CONFIG, levels: LEVELS, evaluate: evaluate, levelFor: levelFor });
})();
