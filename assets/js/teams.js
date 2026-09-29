(function () {
    'use strict';
    const WR = window.WR, esc = WR.escapeHtml, byRole = WR.TeamStats.playerOrder;
    function playerUrl(id, version) { return 'player.html?player=' + encodeURIComponent(id) + (version === 'all' ? '' : '&amp;version=' + version); }
    function logo(team, size) {
        return team.logo ? '<img class="club-logo ' + (size || '') + '" src="' + esc(team.logo) + '" alt="' + esc(team.id) + ' 队标">' :
            '<span class="club-logo empty ' + (size || '') + '" role="img" aria-label="' + esc(team.id) + ' 队标预留位置"></span>';
    }
    function chip(label, value) { return '<span class="stat-chip">' + label + ' <b>' + value + '</b></span>'; }
    function rosterCard(stat, version) {
        const p = stat.player;
        const breakdown = WR.TeamStats.rankedRoles(stat).map(([role, n]) => WR.roleNames[role] + ' ' + n + ' 局').join(' · ');
        return '<a class="roster-card" href="' + playerUrl(p.id, version) + '" data-player="' + p.id + '" aria-label="' + esc(p.name) + ' 的选手档案">' +
            '<span class="roster-position" title="' + esc(breakdown) + '">' + esc(WR.TeamStats.roleText(stat)) + '</span><strong>' + esc(p.name) + '</strong>' +
            '<span>' + stat.games + ' 小局 · ' + (stat.games ? WR.pct(stat.wins, stat.losses) + ' 胜率' : '暂无出场') + '</span>' +
            '<span class="roster-mvp">MVP <b>' + stat.mvp + '</b></span><span class="player-open-hint">选手档案 →</span></a>';
    }
    function banPanel(side, sideLabel, cls) {
        const rows = Object.entries(side.bans).sort((a, b) => b[1] - a[1] || WR.championName(a[0]).localeCompare(WR.championName(b[0]), 'zh'));
        const table = entries => '<table class="wikitable striped team-ban-table"><thead><tr><th>英雄</th><th>禁用</th><th>该方禁用率</th></tr></thead><tbody>' + entries.map(([slug, n]) =>
            '<tr data-ban-champion="' + slug + '"><td><span class="champ-cell">' + WR.champImg(slug, 'sm') + ' ' + esc(WR.championName(slug)) + '</span></td><td class="num">' + n +
            '</td><td class="num">' + WR.fmtPercent(n / side.games * 100) + '</td></tr>').join('') + '</tbody></table>';
        return '<section class="team-ban-panel ' + cls + '"><h3>' + sideLabel + '禁用倾向 <span>' + side.games + ' 小局</span></h3>' +
            (rows.length ? table(rows.slice(0, 8)) + (rows.length > 8 ? '<details class="ban-more"><summary>查看其余 ' + (rows.length - 8) + ' 位英雄</summary>' + table(rows.slice(8)) + '</details>' : '') :
                '<p class="empty-note">该范围内暂无' + sideLabel + '禁用记录。</p>') +
            (side.emptyBans ? '<p class="scope-note">空 Ban ' + side.emptyBans + ' 次，保留在对局记录中。</p>' : '') + '</section>';
    }
    function scheduleRows(rows, title) {
        if (!rows.length) return '';
        return '<h3 class="team-schedule-heading">' + title + '<span>' + rows.length + ' 场</span></h3><div class="team-schedule-list">' + rows.map(function (r) {
            const m = r.match;
            return '<a class="team-match" href="schedule.html#match-' + esc(m.id) + '"><time>' + esc(m.date) + '<small>' + esc(m.timezone || '') + '</small></time>' +
                '<span class="team-match-opponent">vs <b>' + esc(r.opponent) + '</b></span><span class="team-match-score ' + (r.finished ? r.wins > r.losses ? 'won' : 'lost' : '') + '">' +
                (r.played ? r.wins + '–' + r.losses : '待赛') + '</span><span class="team-match-patch">' + (r.played ? esc(r.patch) : 'BO' + (m.bestOf || 3)) + '</span><span class="team-match-link">' + (r.played ? '查看 BP →' : '查看赛程 →') + '</span></a>';
        }).join('') + '</div>';
    }
    document.addEventListener('DOMContentLoaded', function () {
        const directory = document.getElementById('teams-grid'), root = document.getElementById('team-root');
        if (directory) {
            directory.innerHTML = WR.league.teams.map(function (team) {
                const st = WR.TeamStats.compute(team.id);
                return '<a class="club-card" href="team.html?team=' + team.id + '">' + logo(team) + '<div class="club-card-name"><h2>' + esc(team.id) + '</h2><span>' +
                    esc(team.name === team.id ? '2026 WRL 秋季赛' : team.name) + '</span></div><div class="club-card-meta"><span>' + Object.keys(st.players).length + ' 位选手</span><b>' +
                    st.seriesWins + ' 胜 ' + st.seriesLosses + ' 负</b></div><span class="club-card-link">阵容、英雄与赛程 <span aria-hidden="true">↗</span></span></a>';
            }).join('');
            return;
        }
        if (!root) return;
        let version = 'all', teamId = '', current;
        function save(push) {
            const params = new URLSearchParams({ team: teamId });
            if (version !== 'all') params.set('version', version);
            window.history[push ? 'pushState' : 'replaceState'](null, '', 'team.html?' + params);
        }
        function render() {
            current = WR.TeamStats.compute(teamId, version);
            if (!current) { root.innerHTML = '<div class="empty-state"><strong>未找到这支战队</strong><p><a href="teams.html">返回全部战队</a></p></div>'; return; }
            const t = current.team, roster = Object.values(current.players).sort(byRole);
            document.title = t.id + ' · 战队 · WRpedia';
            const mvps = roster.slice().sort((a, b) => b.mvp - a.mvp || byRole(a, b));
            const future = current.schedule.filter(r => !r.finished).sort((a, b) => a.match.date.localeCompare(b.match.date));
            const past = current.schedule.filter(r => r.finished).sort((a, b) => b.match.date.localeCompare(a.match.date));
            root.innerHTML = '<div class="team-hero">' + logo(t, 'large') + '<div><span class="eyebrow">2026 WRL · 秋季赛</span><h1>' + esc(t.id) + '</h1><p>' +
                esc(t.name === t.id ? '战队档案' : t.name) + '</p></div><label class="team-switch-label">切换战队<select id="team-switch" aria-label="切换战队">' +
                WR.league.teams.map(v => '<option value="' + v.id + '"' + (v.id === t.id ? ' selected' : '') + '>' + esc(v.id) + '</option>').join('') + '</select></label></div>' +
                '<nav class="version-tabs" aria-label="战队统计版本">' + [['all', '总览', '全部版本'], ['7.2', '7.2', '第 1–5 周'], ['7.3', '7.3', '第 6 周起']].map(([v, label, sub]) =>
                    '<a href="team.html?team=' + t.id + (v === 'all' ? '' : '&amp;version=' + v) + '" data-team-version="' + v + '" class="' + (v === version ? 'active' : '') + '"' +
                    (v === version ? ' aria-current="page"' : '') + '>' + label + '<span>' + sub + '</span></a>').join('') + '</nav><div class="stats-summary">' +
                chip('大场', current.seriesWins + ' 胜 ' + current.seriesLosses + ' 负') + chip('小局', current.wins + ' 胜 ' + current.losses + ' 负') + chip('小局胜率', WR.pct(current.wins, current.losses)) +
                chip('平均时长', WR.TeamStats.formatDuration(current.averageDuration.all)) + chip('胜场平均', WR.TeamStats.formatDuration(current.averageDuration.wins)) + chip('败场平均', WR.TeamStats.formatDuration(current.averageDuration.losses)) + '</div>' +
                '<nav class="team-section-nav" aria-label="战队页内容"><a href="#roster">阵容与选手</a><a href="#team-mvp">队内 MVP</a><a href="#team-bans">禁用倾向</a><a href="#team-schedule">战队赛程</a></nav>' +
                '<section id="roster"><h2 class="section">阵容与选手 <span class="muted">' + roster.length + ' 位 · 点击查看选手档案</span></h2>' +
                '<p class="scope-note">位置按当前版本范围内的实际出场次数由多到少排列；换线按该局实际分路统计。</p><div class="team-roster">' +
                roster.map(st => rosterCard(st, version)).join('') + '</div></section>' +
                '<section id="team-mvp"><h2 class="section">队内 MVP <span class="muted">共 ' + current.mvpRecorded + ' 次</span></h2><div class="team-mvp-list">' + mvps.map((st, i) =>
                    '<a class="team-mvp-row" href="' + playerUrl(st.player.id, version) + '"><span class="text-muted">' + (st.mvp ? mvps.findIndex(p => p.mvp === st.mvp) + 1 : '—') + '</span><strong>' + esc(st.player.name) +
                    '</strong><span>' + esc(WR.TeamStats.roleText(st)) + '</span><b>' + st.mvp + '</b></a>').join('') + '</div><p class="scope-note">按小局累计 MVP；并列选手显示相同名次。</p></section>' +
                '<section id="team-bans"><h2 class="section">红蓝方禁用倾向</h2><p class="scope-note">统计本队在各方主动禁用的英雄。禁用率 = 该英雄禁用次数 ÷ 本队该方已录入小局数。</p><div class="team-bans-grid">' +
                banPanel(current.sides.blue, '蓝方', 'blue') + banPanel(current.sides.red, '红方', 'red') + '</div></section>' +
                '<section id="team-schedule"><h2 class="section">战队赛程 <span class="muted">' + current.schedule.length + ' 场 · 比分从本队视角展示</span></h2>' +
                scheduleRows(future, '待赛 / 进行中') + scheduleRows(past, '已结束') + '</section>';
            root.querySelectorAll('[data-team-version]').forEach(a => a.addEventListener('click', function (event) {
                if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                event.preventDefault(); version = a.dataset.teamVersion; save(true); render();
            }));
            document.getElementById('team-switch').addEventListener('change', function (event) { teamId = event.target.value; save(true); render(); });
        }
        function restore() {
            const params = new URLSearchParams(window.location.search);
            teamId = params.get('team') || ''; version = ['7.2', '7.3'].includes(params.get('version')) ? params.get('version') : 'all';
            const legacyPlayer = WR.getPlayer(params.get('player'));
            if (legacyPlayer && legacyPlayer.teamId === teamId) {
                window.location.replace('player.html?player=' + encodeURIComponent(legacyPlayer.id) + '&version=' + version); return;
            }
            render();
        }
        window.addEventListener('popstate', restore); restore();
    });
})();
