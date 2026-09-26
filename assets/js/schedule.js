(function () {
    "use strict";

    const WR = window.WR;
    const league = WR.league;

    function renderFormat() {
        const el = document.getElementById("format-list");
        if (!el) return;
        const items = (league.meta && league.meta.formatText) || [];
        if (!items.length) {
            el.innerHTML = '<div class="empty-note">请在 data/schedule.js 的 meta.formatText 中填写赛制说明。</div>';
            return;
        }
        el.innerHTML = "<ul>" + items.map(function (line) {
            let s = WR.escapeHtml(line);
            s = s.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
            return "<li>" + s + "</li>";
        }).join("") + "</ul>";
    }

    function computeStandings() {
        const rows = {};
        (league.teams || []).forEach(function (t) {
            rows[t.id] = { team: t, seriesW: 0, seriesL: 0, gameW: 0, gameL: 0 };
        });

        (league.rounds || []).forEach(function (round) {
            (round.matches || []).forEach(function (m) {
                const games = (m.games || []).filter(function (g) {
                    return g.winner === 1 || g.winner === 2;
                });
                if (!games.length) return;
                const w1 = games.filter(function (g) { return g.winner === 1; }).length;
                const w2 = games.length - w1;
                if (rows[m.opponent1]) {
                    rows[m.opponent1].gameW += w1;
                    rows[m.opponent1].gameL += w2;
                }
                if (rows[m.opponent2]) {
                    rows[m.opponent2].gameW += w2;
                    rows[m.opponent2].gameL += w1;
                }
                if (w1 !== w2) {
                    if (rows[m.opponent1]) w1 > w2 ? rows[m.opponent1].seriesW++ : rows[m.opponent1].seriesL++;
                    if (rows[m.opponent2]) w2 > w1 ? rows[m.opponent2].seriesW++ : rows[m.opponent2].seriesL++;
                }
            });
        });

        const arr = Object.keys(rows).map(function (k) { return rows[k]; });
        arr.sort(function (a, b) {
            if (b.seriesW !== a.seriesW) return b.seriesW - a.seriesW;
            const ad = (a.seriesW - a.seriesL), bd = (b.seriesW - b.seriesL);
            if (bd !== ad) return bd - ad;
            if ((b.gameW - b.gameL) !== (a.gameW - a.gameL)) return (b.gameW - b.gameL) - (a.gameW - a.gameL);
            if (b.gameW !== a.gameW) return b.gameW - a.gameW;
            return a.team.name.localeCompare(b.team.name, "zh");
        });
        return arr;
    }

    function renderStandings() {
        const el = document.getElementById("standings-body");
        const wrap = document.getElementById("standings-wrap");
        if (!el || !wrap) return;
        const rows = computeStandings();
        if (!rows.length) {
            el.innerHTML = '<tr><td colspan="6" class="empty-note">暂无队伍数据</td></tr>';
            return;
        }

        const up = league.meta && league.meta.playoffTeams != null ? league.meta.playoffTeams : 4;
        const down = league.meta && league.meta.eliminatedTeams != null ? league.meta.eliminatedTeams : 4;

        let html = "";
        rows.forEach(function (r, i) {
            let cls = "";
            if (i < up) cls = "rank-up";
            else if (rows.length - i <= down) cls = "rank-down";
            const series = r.seriesW + "-" + r.seriesL;
            const games = r.gameW + "-" + r.gameL;
            const wp = WR.pct(r.gameW, r.gameL);
            html += "<tr>" +
                '<th class="' + cls + '">' + (i + 1) + ".</th>" +
                '<td class="teamcell ' + cls + '"><span class="champ-cell">' + WR.teamBadge(r.team.id) +
                ' <span class="team-name">' + WR.escapeHtml(r.team.name) + "</span></span></td>" +
                '<td class="scorecell ' + cls + '" data-value="' + r.seriesW + '">' + series + "</td>" +
                '<td class="scorecell ' + cls + '" data-value="' + r.gameW + '">' + games + "</td>" +
                '<td class="num ' + cls + '" data-value="' + (r.gameW + r.gameL ? r.gameW / (r.gameW + r.gameL) * 100 : 0) + '">' + wp + "</td>" +
                "</tr>";
        });
        el.innerHTML = html;
    }

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
        html += '<div class="match-date">' + WR.escapeHtml(match.date || round.date || "") +
            (match.timezone ? "<br><span class='text-muted'>" + WR.escapeHtml(match.timezone) + "</span>" : "") +
            (WR.matchStarted(round, match) ? '<div>' + WR.patchLink(WR.matchPatch(round, match)) + '</div>' : '') + "</div>";
        html += '<div class="match-team right' + (winner1 ? " winner" : "") + '"><span class="team-name">' +
            WR.escapeHtml(WR.teamName(match.opponent1)) + "</span>" + WR.teamBadge(match.opponent1) + "</div>";
        html += '<div class="match-score"><div class="score">' +
            (finished
                ? '<span class="' + (winner1 ? "" : "loser") + '">' + w1 + "</span>:<span class=\"" + (winner2 ? "" : "loser") + '">' + w2 + "</span>"
                : '<span class="text-muted">' + (round.completed || match.completed ? '待录入' : 'vs') + '</span>') +
            '</div><div class="bo">Bo' + (match.bestOf || 3) + "</div>" +
            (dots ? '<div class="match-games">' + dots + "</div>" : "") + "</div>";
        html += '<div class="match-team' + (winner2 ? " winner" : "") + '">' + WR.teamBadge(match.opponent2) +
            '<span class="team-name">' + WR.escapeHtml(WR.teamName(match.opponent2)) + "</span></div>";
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

    function renderMatches() {
        const el = document.getElementById("matchlist-root");
        if (!el) return;
        const rounds = league.rounds || [];
        if (!rounds.length) {
            el.innerHTML = '<div class="empty-note">暂无赛程数据</div>';
            return;
        }

        let html = "";
        rounds.forEach(function (round, ri) {
            if (!round.matches || !round.matches.length) return;
            html += '<div class="matchlist"><div class="matchlist-title"><span>' +
                WR.escapeHtml(round.title || ("第 " + (ri + 1) + " 轮")) +
                '</span><span class="muted">' + WR.escapeHtml(round.date || "") + "</span></div>";
            const started = round.matches.some(function (m) { return WR.matchStarted(round, m); });
            const patch = (window.WR_PATCHES || []).find(function (p) { return p.id === round.patch; });
            if (started && patch) {
                html += '<div class="round-patch-note">' + WR.patchLink(patch.id) +
                    '<span>' + WR.escapeHtml(patch.title) + '</span><a href="patches.html#patch-' + patch.id + '">重点与完整改动 →</a></div>';
            }
            if (round.completed && round.matches.some(function (m) { return !(m.games || []).length; })) {
                html += '<p class="pending-results">本周已完赛，部分赛果待录入；统计仅包含已录入的小局。</p>';
            }
            round.matches.forEach(function (m) {
                html += matchRow(round, m);
            });
            html += "</div>";
        });
        el.innerHTML = html;

        el.querySelectorAll(".match-row").forEach(function (row) {
            row.addEventListener("click", function (e) {
                if (e.target.closest("a")) return;
                if (e.target.closest("[data-toggle-details]")) {
                    row.classList.toggle("open");
                    return;
                }
                if (row.querySelector(".match-details")) row.classList.toggle("open");
            });
        });
    }

    function renderMeta() {
        const meta = league.meta || {};
        const map = {
            "name": "赛事名称",
            "ticker": "赛事简称",
            "startDate": "开始日期",
            "endDate": "结束日期",
            "patch": "游戏版本",
            "organizer": "主办方",
            "venue": "比赛地点",
            "prize": "奖金池",
            "teamsCount": "参赛队伍",
            "website": "官方网站"
        };
        Object.keys(map).forEach(function (k) {
            const el = document.getElementById("meta-" + k);
            if (!el) return;
            if (meta[k]) el.textContent = meta[k];
            else el.textContent = "—";
        });
    }

    function renderDemoNotice() {
        const el = document.getElementById("demo-notice");
        if (!el) return;
        if (league.meta && league.meta.demo) {
            el.innerHTML = '<div class="notice warn">⚠ 当前赛程包含示例比赛（demo = true）。正式录入数据后，请删除示例比赛并将 <b>meta.demo</b> 改为 <b>false</b>。</div>';
        } else {
            el.remove();
        }
    }

    document.addEventListener("DOMContentLoaded", function () {
        if (!league) {
            const el = document.getElementById("matchlist-root");
            if (el) el.innerHTML = '<div class="notice warn">未找到赛程数据，请检查 data/schedule.js 是否存在且格式正确。</div>';
            return;
        }
        renderDemoNotice();
        renderMeta();
        renderFormat();
        renderStandings();
        renderMatches();
        function revealMatch() {
            const target = document.getElementById(window.location.hash.slice(1));
            if (target && target.classList.contains('match-row')) {
                target.classList.add('open'); target.scrollIntoView({ block: 'start' });
            }
        }
        if (window.location) { revealMatch(); window.addEventListener('hashchange', revealMatch); }
    });
})();
