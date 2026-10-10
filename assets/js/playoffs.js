// Playoffs page: bracket, seeds, final placements and the playoff matches with BP details.
(function () {
    "use strict";

    const WR = window.WR, esc = WR.escapeHtml;
    const league = WR.league;

    function dayLabel(match) {
        const m = /^\d{4}-(\d{2})-(\d{2})/.exec((match && match.date) || "");
        return m ? Number(m[1]) + " 月 " + Number(m[2]) + " 日" : "";
    }

    function teamRow(round, match, index, score) {
        const id = match["opponent" + index], other = match["opponent" + (index === 1 ? 2 : 1)], seeds = round.seeds || {};
        const won = score.winner === index, lost = score.winner && !won;
        // Only the semifinal rule is confirmed: the higher-ranked team chooses side in game 1.
        const sideChoice = match.stage === "semifinal" && id && other && seeds[id] && seeds[other] && seeds[id] < seeds[other];
        const team = id && WR.teamById(id);
        return '<div class="bm-team' + (won ? " won" : lost ? " lost" : "") + (id ? "" : " tbd") + '">' +
            '<span class="bm-seed">' + (id && seeds[id] ? "#" + seeds[id] : "") + "</span>" + WR.teamBadge(id) +
            '<span class="bm-name"' + (team && team.name !== id ? ' title="' + esc(team.name) + '"' : "") + ">" + esc(id || WR.opponentLabel(match, index)) + "</span>" +
            (sideChoice ? '<small class="bm-tag" title="排名上位的队伍拥有第一局的选边权">G1 选边</small>' : "") +
            '<span class="bm-score">' + (score.played ? (index === 1 ? score.w1 : score.w2) : "–") + "</span></div>";
    }

    function matchBox(round, match) {
        const score = WR.seriesScore(match);
        const state = score.winner ? "done" : score.played ? "live" : "";
        return '<a class="bracket-match ' + esc(match.stage || "") + " " + state + '" href="#match-' + encodeURIComponent(match.id) +
            '" data-bracket-match="' + esc(match.id) + '"><div class="bm-head"><b>' + esc(match.label || match.id) + "</b><span>" +
            esc((match.date || "").slice(5)) + " · BO" + (match.bestOf || 3) + "</span><em>" + (score.winner ? "已结束" : score.played ? "进行中" : "未开始") + "</em></div>" +
            teamRow(round, match, 1, score) + teamRow(round, match, 2, score) + "</a>";
    }

    function placements(round) {
        const out = [];
        [["final", "冠军", "亚军"], ["third", "季军", "殿军"]].forEach(function (def) {
            const match = round.matches.find(function (m) { return m.stage === def[0]; });
            const winner = match ? WR.seriesScore(match).winner : 0;
            if (winner) out.push([def[1], match["opponent" + winner]], [def[2], match["opponent" + (winner === 1 ? 2 : 1)]]);
        });
        return out;
    }

    function renderBracket(round) {
        const el = document.getElementById("bracket-root");
        const semis = round.matches.filter(function (m) { return m.stage === "semifinal"; });
        const final = round.matches.find(function (m) { return m.stage === "final"; });
        const third = round.matches.find(function (m) { return m.stage === "third"; });
        if (semis.length !== 2 || !final) {
            el.innerHTML = '<div class="bracket-simple">' + round.matches.map(function (m) { return matchBox(round, m); }).join("") + "</div>";
            return;
        }
        const champion = placements(round).find(function (p) { return p[0] === "冠军"; });
        el.innerHTML = '<div class="bracket" role="group" aria-label="季后赛对阵图">' +
            '<div class="bracket-title for-semis">半决赛<small>' + esc(dayLabel(semis[0])) + '</small></div><div class="bracket-gap"></div>' +
            '<div class="bracket-title for-final">冠军决胜<small>' + esc(dayLabel(final)) + "</small></div>" +
            '<div class="bracket-semis">' + semis.map(function (m) { return '<div class="bracket-cell">' + matchBox(round, m) + "</div>"; }).join("") + "</div>" +
            '<div class="bracket-link" aria-hidden="true"><i class="elbow"></i><i class="stem"></i></div>' +
            '<div class="bracket-final">' + matchBox(round, final) +
            (champion ? '<div class="bracket-champion"><span>冠军</span>' + WR.teamBadge(champion[1]) + "<b>" + esc(WR.teamName(champion[1])) + "</b></div>" : "") + "</div>" +
            '<p class="bracket-legend"># 为常规赛排名。半决赛中排名上位的队伍拥有第一局的选边权。点击对阵查看每小局 BP。</p><div class="bracket-gap"></div>' +
            (third ? '<div class="bracket-third"><div class="bracket-title">季军争夺战<small>' + esc(dayLabel(third)) + "</small></div>" + matchBox(round, third) + "</div>" : "<div></div>") +
            "</div>";
    }

    function renderFormat() {
        const items = (league.meta && league.meta.playoffFormatText) || [];
        document.getElementById("playoff-format").innerHTML = items.length ? "<ul>" + items.map(function (line) {
            return "<li>" + esc(line).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>") + "</li>";
        }).join("") + "</ul>" : '<div class="empty-note">暂无赛制说明。</div>';
    }

    function renderInfo(round) {
        const patches = Array.from(new Set(round.matches.map(function (m) { return WR.matchPatch(round, m); }).filter(Boolean)));
        document.getElementById("playoff-patch").innerHTML = patches.length ? patches.map(WR.patchLink).join(" ") : "待定";
        const seeds = Object.entries(round.seeds || {}).sort(function (a, b) { return a[1] - b[1]; });
        const table = Object.fromEntries(WR.LeagueSummary.standings().map(function (r) { return [r.team.id, r]; }));
        document.getElementById("playoff-seeds").innerHTML = seeds.map(function (entry) {
            const row = table[entry[0]];
            return '<a class="seed-row" href="team.html?team=' + encodeURIComponent(entry[0]) + '"><span class="bm-seed">#' + entry[1] + "</span>" + WR.teamBadge(entry[0]) +
                "<b>" + esc(WR.teamName(entry[0])) + "</b><span>" + (row ? row.seriesW + "–" + row.seriesL : "") + "</span></a>";
        }).join("");
        const places = placements(round), box = document.getElementById("playoff-placements");
        box.hidden = !places.length;
        document.getElementById("playoff-placement-list").innerHTML = places.map(function (p) {
            return '<a class="seed-row" href="team.html?team=' + encodeURIComponent(p[1]) + '"><span class="place">' + p[0] + "</span>" + WR.teamBadge(p[1]) + "<b>" + esc(WR.teamName(p[1])) + "</b></a>";
        }).join("");
    }

    function renderMatches(rounds) {
        const el = document.getElementById("playoff-matches");
        el.innerHTML = rounds.map(function (round) {
            const patch = (window.WR_PATCHES || []).find(function (p) { return p.id === round.patch; });
            const started = round.matches.some(function (m) { return (m.games || []).length; });
            return '<div class="matchlist"><div class="matchlist-title"><span>' + esc(round.title || "季后赛") + '</span><span class="muted">' + esc(round.date || "") + "</span></div>" +
                (started && patch ? '<div class="round-patch-note">' + WR.patchLink(patch.id) + "<span>" + esc(patch.title) + '</span><a href="patches.html#patch-' + esc(patch.id) + '">重点与完整改动 →</a></div>' : "") +
                round.matches.map(function (m) { return WR.MatchList.matchRow(round, m); }).join("") + "</div>";
        }).join("");
        WR.MatchList.bind(el);
    }

    document.addEventListener("DOMContentLoaded", function () {
        const rounds = ((league && league.rounds) || []).filter(WR.isPlayoffRound);
        if (!rounds.length) {
            document.getElementById("bracket-root").innerHTML = '<div class="notice">季后赛赛程尚未公布。</div>';
            return;
        }
        renderBracket(rounds[0]);
        renderFormat();
        renderInfo(rounds[0]);
        renderMatches(rounds);
    });
})();
