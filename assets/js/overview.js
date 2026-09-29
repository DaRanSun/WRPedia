(function () {
    'use strict';
    const WR = window.WR, esc = WR.escapeHtml;
    document.addEventListener('DOMContentLoaded', function () {
        const upcoming = WR.LeagueSummary.upcoming();
        const leaders = WR.LeagueSummary.standings().slice(0, 4);
        const mvps = WR.LeagueSummary.topMvps();
        document.getElementById('overview-upcoming').innerHTML = upcoming.length ? upcoming.map(({ round, match }) =>
            '<a class="overview-match" href="schedule.html#match-' + esc(match.id) + '"><time>' + esc(match.date.slice(5)) + '<small>' + esc(match.timezone || 'UTC+8') + ' · BO' + match.bestOf + '</small></time>' +
            '<span class="overview-team">' + WR.teamBadge(match.opponent1) + '<b>' + esc(match.opponent1) + '</b></span><span class="overview-vs">VS</span>' +
            '<span class="overview-team">' + WR.teamBadge(match.opponent2) + '<b>' + esc(match.opponent2) + '</b></span><span class="overview-week">' + esc(round.title.split('（')[0]) + ' →</span></a>').join('') : '<p class="empty-note">当前赛程已全部结束，敬请期待后续比赛。</p>';
        document.getElementById('overview-standings').innerHTML = '<table class="wikitable overview-table"><thead><tr><th>排名 / 战队</th><th>大场</th><th>小局</th></tr></thead><tbody>' + leaders.map((r, i) =>
            '<tr data-overview-team="' + r.team.id + '"><td><a class="overview-rank-team" href="team.html?team=' + r.team.id + '"><span class="overview-rank">' + (i + 1) + '</span>' + WR.teamBadge(r.team.id) + '<b>' + esc(r.team.id) + '</b></a></td><td>' + r.seriesW + '–' + r.seriesL + '</td><td>' + r.gameW + '–' + r.gameL + '</td></tr>').join('') + '</tbody></table>';
        document.getElementById('overview-mvps').innerHTML = mvps.length ? '<div class="overview-mvp-list">' + mvps.map(st =>
            '<a class="overview-mvp" href="player.html?player=' + st.player.id + '" target="_blank" rel="noopener" data-overview-player="' + st.player.id + '" aria-label="' + esc(st.player.name) + ' 的选手档案（新标签页）"><span class="overview-rank">' + st.rank + '</span>' + WR.teamBadge(st.player.teamId) +
            '<span><strong>' + esc(st.player.name) + '</strong><small>' + esc(st.player.teamId) + ' · ' + esc(WR.TeamStats.roleText(st)) + '</small></span><b class="overview-mvp-score">' + st.mvp + '<small>MVP</small></b></a>').join('') + '</div>' : '<p class="empty-note">暂无 MVP 记录。</p>';
    });
})();
