// Match rows with expandable per-game BP details, shared by the schedule and playoffs pages.
(function () {
    "use strict";

    const WR = window.WR;

    function fearlessIssues(match) {
        const seen = {};
        const issues = [];
        (match.games || []).forEach(function (game, gi) {
            if (!game.team1 || !game.team2) return;
            [game.team1, game.team2].forEach(function (side) {
                (side.picks || []).forEach(function (slug) {
                    if (seen[slug] != null) {
                        issues.push("Game " + (gi + 1) + " 重复选用 " + WR.escapeHtml(slug) +
                            "（此前在 Game " + (seen[slug] + 1) + " 已选用）");
                    } else {
                        seen[slug] = gi;
                    }
                });
            });
        });
        return issues;
    }

    function gameBlock(match, game, gi) {
        if (!game.team1 || !game.team2) return '<div class="empty-note">Game ' + (gi + 1) + " 暂无数据</div>";
        const t1 = game.team1, t2 = game.team2;
        const t1Blue = t1.side === "blue";
        const sides = [
            { teamId: match.opponent1, data: t1, blue: t1Blue },
            { teamId: match.opponent2, data: t2, blue: !t1Blue }
        ].sort((a, b) => Number(b.blue) - Number(a.blue));
        const winnerId = game.winner === 1 ? match.opponent1 : game.winner === 2 ? match.opponent2 : null;

        let html = '<div class="game-block">';
        html += '<div class="game-header"><span>Game ' + (gi + 1) + "</span>" +
            (game.length ? "<span>时长 " + WR.escapeHtml(game.length) + "</span>" : "") +
            (winnerId ? '<span class="strong">胜者：' + WR.escapeHtml(WR.teamName(winnerId)) + "</span>" : '<span class="text-muted">未结束</span>') +
            (WR.gameMvpLabel(game) ? '<span>MVP：' + WR.escapeHtml(WR.gameMvpLabel(game)) + '</span>' : '') + "</div>";
        html += '<div class="game-sides">';
        sides.forEach(function (s) {
            const boxCls = s.blue ? "blue" : "red";
            const sideLabel = s.blue ? "蓝方" : "红方";
            html += '<div class="side-box ' + boxCls + '">' +
                '<div class="side-label"><span class="strong">' + WR.escapeHtml(WR.teamName(s.teamId)) + "（" + sideLabel + "）</span></div>" +
                WR.draftSideHtml(s.data);
            html += "</div>";
        });
        html += '</div>' + WR.gameNotesHtml(game) + '</div>';
        return html;
    }

    function matchRow(round, match) {
        const games = (match.games || []).filter(function (g) { return g.winner === 1 || g.winner === 2; });
        const w1 = games.filter(function (g) { return g.winner === 1; }).length;
        const w2 = games.length - w1;
        const finished = games.length > 0;
        const winner1 = finished && w1 > w2;
        const winner2 = finished && w2 > w1;
        const dots = (match.games || []).map(function (g, i) {
            if (g.winner !== 1 && g.winner !== 2) return '<span class="game-dot" title="Game ' + (i + 1) + " 未结束\">–</span>";
            const cls = g.winner === 1 ? "win" : "lose";
            return '<span class="game-dot ' + cls + '" title="Game ' + (i + 1) + '">' + g.winner + "</span>";
        }).join("");

        const mvp = match.mvp && match.mvp.length ? "MVP: " + WR.escapeHtml(match.mvp.join(", ")) : "";
        let links = "";
        if (match.vod) links += '<a class="link-chip" href="' + WR.escapeHtml(match.vod) + '" target="_blank" rel="noopener">VOD</a>';
        if (match.youtube) links += '<a class="link-chip" href="' + WR.escapeHtml(match.youtube) + '" target="_blank" rel="noopener">YouTube</a>';
        if (match.twitch) links += '<a class="link-chip" href="' + WR.escapeHtml(match.twitch) + '" target="_blank" rel="noopener">Twitch</a>';

        let html = '<div class="match-row" id="match-' + WR.escapeHtml(match.id) + '" data-match="' + WR.escapeHtml(match.id) + '">';
        html += '<div class="match-date">' + (match.label ? '<b class="match-label">' + WR.escapeHtml(match.label) + "</b><br>" : "") +
            WR.escapeHtml(match.date || round.date || "") +
            (match.timezone ? "<br><span class='text-muted'>" + WR.escapeHtml(match.timezone) + "</span>" : "") +
            (WR.matchStarted(round, match) ? '<div>' + WR.patchLink(WR.matchPatch(round, match)) + '</div>' : '') + "</div>";
        html += '<div class="match-team right' + (winner1 ? " winner" : "") + (match.opponent1 ? "" : " tbd") + '"><span class="team-name">' +
            WR.escapeHtml(WR.opponentLabel(match, 1)) + "</span>" + WR.teamBadge(match.opponent1) + "</div>";
        html += '<div class="match-score"><div class="score">' +
            (finished
                ? '<span class="' + (winner1 ? "" : "loser") + '">' + w1 + "</span>:<span class=\"" + (winner2 ? "" : "loser") + '">' + w2 + "</span>"
                : '<span class="text-muted">' + (round.completed || match.completed ? '待录入' : 'vs') + '</span>') +
            '</div><div class="bo">Bo' + (match.bestOf || 3) + "</div>" +
            (dots ? '<div class="match-games">' + dots + "</div>" : "") + "</div>";
        html += '<div class="match-team' + (winner2 ? " winner" : "") + (match.opponent2 ? "" : " tbd") + '">' + WR.teamBadge(match.opponent2) +
            '<span class="team-name">' + WR.escapeHtml(WR.opponentLabel(match, 2)) + "</span></div>";
        html += '<div class="match-actions">' +
            (mvp ? '<span class="link-chip" title="' + mvp + '">' + mvp + "</span>" : "") +
            links +
            (match.games && match.games.length ? '<button class="btn accent" data-toggle-details>详情</button>' : "") +
            "</div>";

        if (match.games && match.games.length) {
            html += '<div class="match-details">';
            const issues = fearlessIssues(match);
            if (issues.length) {
                html += '<div class="notice warn">⚠ 双边无畏征召校验：<br>' + issues.join("<br>") + "</div>";
            }
            match.games.forEach(function (g, gi) {
                html += gameBlock(match, g, gi);
            });
            html += "</div>";
        }
        html += "</div>";
        return html;
    }

    // Clicking a row toggles its details; "#match-ID" in the URL opens and scrolls to that match.
    function bind(root) {
        root.querySelectorAll(".match-row").forEach(function (row) {
            row.addEventListener("click", function (e) {
                if (e.target.closest("a")) return;
                if (e.target.closest("[data-toggle-details]") || row.querySelector(".match-details")) row.classList.toggle("open");
            });
        });
        function revealMatch() {
            let id = window.location.hash.slice(1);
            try { id = decodeURIComponent(id); } catch (_) { /* keep the raw hash */ }
            const target = id && document.getElementById(id);
            if (target && target.classList.contains("match-row")) {
                target.classList.add("open"); target.scrollIntoView({ block: "start" });
            }
        }
        if (window.location) { revealMatch(); window.addEventListener("hashchange", revealMatch); }
    }

    WR.MatchList = Object.freeze({ matchRow: matchRow, bind: bind });
})();
