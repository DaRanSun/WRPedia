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

    function renderStandings() {
        const el = document.getElementById("standings-body");
        const wrap = document.getElementById("standings-wrap");
        if (!el || !wrap) return;
        const rows = WR.LeagueSummary.standings();
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

    function renderMatches() {
        const el = document.getElementById("matchlist-root");
        if (!el) return;
        // Playoff rounds have their own sub-tab (playoffs.html).
        const rounds = (league.rounds || []).filter(function (round) { return !WR.isPlayoffRound(round); });
        if (!rounds.length) {
            el.innerHTML = '<div class="empty-note">暂无赛程数据</div>';
            return;
        }

        const shown = rounds.filter(function (round) { return round.matches && round.matches.length; });
        let html = '<nav class="round-jump" aria-label="跳转到轮次">' + shown.map(function (round) {
            return '<a href="#round-' + WR.escapeHtml(round.id) + '">' + WR.escapeHtml((round.title || round.id).split("（")[0]) + "</a>";
        }).join("") + "</nav>";
        rounds.forEach(function (round, ri) {
            if (!round.matches || !round.matches.length) return;
            html += '<div class="matchlist" id="round-' + WR.escapeHtml(round.id || ri) + '"><div class="matchlist-title"><span>' +
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
                html += WR.MatchList.matchRow(round, m);
            });
            html += "</div>";
        });
        el.innerHTML = html;
        WR.MatchList.bind(el);
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
    });
})();
