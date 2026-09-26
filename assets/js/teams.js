(function () {
    'use strict';
    const WR = window.WR, esc = WR.escapeHtml, roleOrder = Object.keys(WR.roleNames);
    const byRole = (a, b) => roleOrder.indexOf(a.player.role) - roleOrder.indexOf(b.player.role) || a.player.name.localeCompare(b.player.name);
    function logo(team, size) {
        return team.logo ? '<img class="club-logo ' + (size || '') + '" src="' + esc(team.logo) + '" alt="' + esc(team.id) + ' 队标">' :
            '<span class="club-logo empty ' + (size || '') + '" role="img" aria-label="' + esc(team.id) + ' 队标预留位置"></span>';
    }
    function chip(label, value) { return '<span class="stat-chip">' + label + ' <b>' + value + '</b></span>'; }
    function rosterCard(stat, selected) {
        const p = stat.player;
        return '<button type="button" class="roster-card" data-player="' + p.id + '" aria-pressed="' + (p.id === selected) + '">' +
            '<span class="roster-position">' + esc(WR.roleNames[p.role]) + (p.status ? ' · ' + esc(p.status) : '') + '</span><strong>' + esc(p.name) + '</strong>' +
            '<span>' + stat.games + ' 小局 · ' + (stat.games ? WR.pct(stat.wins, stat.losses) + ' 胜率' : '选用记录待补充') + '</span>' +
            '<span class="roster-mvp">已录入 MVP <b>' + stat.mvp + '</b></span></button>';
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
        let version = 'all', selected = '', teamId = '', current;
        function save(push) {
            const params = new URLSearchParams({ team: teamId });
            if (version !== 'all') params.set('version', version);
            if (selected) params.set('player', selected);
            window.history[push ? 'pushState' : 'replaceState'](null, '', 'team.html?' + params);
        }
        function renderPlayer() {
            const st = current.players[selected], panel = document.getElementById('player-detail');
            if (!st) { panel.innerHTML = '<p class="empty-note">选手资料待补充。</p>'; return; }
            root.querySelectorAll('[data-player]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.player === selected)));
            const p = st.player, heroes = Object.values(st.champions).sort((a, b) => b.games - a.games || b.wins - a.wins || WR.championName(a.slug).localeCompare(WR.championName(b.slug), 'zh'));
            panel.innerHTML = '<div class="player-detail-heading"><div><span class="eyebrow">' + esc(current.team.id) + ' · ' + esc(WR.roleNames[p.role]) + '</span><h3>' + esc(p.name) +
                ' <span>英雄选用</span></h3></div><span class="text-muted">' + esc(version === 'all' ? '全部版本' : version) + '</span></div><div class="stats-summary">' +
                chip('已录入出场', st.games) + chip('胜负', st.wins + '–' + st.losses) + chip('选用胜率', WR.pct(st.wins, st.losses)) + chip('已录入 MVP', st.mvp) + '</div>' +
                (heroes.length ? '<div class="table-responsive"><table class="wikitable striped player-champion-table"><thead><tr><th>英雄 / 实际分路</th><th>选用</th><th>胜–负</th><th>胜率</th></tr></thead><tbody>' + heroes.map(h =>
                    '<tr data-player-champion="' + h.slug + '"><td><button type="button" class="champion-name-button" data-player-games="' + h.slug + '">' + WR.champImg(h.slug, 'sm') + '<span>' +
                    esc(WR.championName(h.slug)) + '<small>' + Object.entries(h.roles).map(([role, n]) => esc(WR.roleNames[role]) + ' ' + n).join(' / ') + '</small></span></button></td><td class="num">' +
                    h.games + '</td><td class="num">' + h.wins + '–' + h.losses + '</td><td class="num">' + WR.pct(h.wins, h.losses) + '</td></tr>').join('') + '</tbody></table></div><p class="scope-note">点击英雄查看该选手使用此英雄的小局。换线按实际操作者归属，表内分路为局内分路。</p>' :
                    '<div class="empty-state"><strong>' + (version === '7.2' ? '7.2 选手记录待补充' : '当前范围暂无已确认的选用记录') + '</strong><p>暂无记录不代表未出场；获得补充数据后会继续更新。</p></div>');
            panel.querySelectorAll('[data-player-games]').forEach(button => button.addEventListener('click', function () {
                const records = WR.PickHistory.query({ team: teamId, champion: button.dataset.playerGames, playerId: selected, version });
                WR.showDialog(records.map(WR.PickHistory.gameDetails).join(''), p.name + ' · ' + WR.championName(button.dataset.playerGames) + ' · ' + records.length + ' 小局');
            }));
        }
        function render() {
            current = WR.TeamStats.compute(teamId, version);
            if (!current) { root.innerHTML = '<div class="empty-state"><strong>未找到这支战队</strong><p><a href="teams.html">返回全部战队</a></p></div>'; return; }
            const t = current.team, roster = Object.values(current.players).sort(byRole);
            if (!current.players[selected]) selected = roster.length ? roster[0].player.id : '';
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
                chip('选手记录覆盖', current.rosterGames + ' / ' + current.games + ' 小局') + '</div>' +
                '<nav class="team-section-nav" aria-label="战队页内容"><a href="#roster">阵容与选手</a><a href="#team-mvp">队内 MVP</a><a href="#team-bans">禁用倾向</a><a href="#team-schedule">战队赛程</a></nav>' +
                '<section id="roster"><h2 class="section">阵容与选手 <span class="muted">' + roster.length + ' 位 · 点击选手查看英雄</span></h2>' +
                '<p class="scope-note">选手选用与 MVP 仅统计已确认人员的小局；7.2 选手记录待补充。名单位置为常规位置，换线小局单独标注。</p><div class="team-roster">' +
                roster.map(st => rosterCard(st, selected)).join('') + '</div><section id="player-detail" aria-live="polite"></section></section>' +
                '<section id="team-mvp"><h2 class="section">队内 MVP <span class="muted">已录入 ' + current.mvpRecorded + ' 次</span></h2><div class="team-mvp-list">' + mvps.map((st, i) =>
                    '<button type="button" class="team-mvp-row" data-select-player="' + st.player.id + '"><span class="text-muted">' + (st.mvp ? i + 1 : '—') + '</span><strong>' + esc(st.player.name) +
                    '</strong><span>' + esc(WR.roleNames[st.player.role]) + '</span><b>' + st.mvp + '</b></button>').join('') + '</div><p class="scope-note">仅计已录入且归属已确认的单局 MVP，零次表示当前记录中没有该选手的 MVP。</p></section>' +
                '<section id="team-bans"><h2 class="section">红蓝方禁用倾向</h2><p class="scope-note">统计本队在各方主动禁用的英雄。禁用率 = 该英雄禁用次数 ÷ 本队该方已录入小局数。</p><div class="team-bans-grid">' +
                banPanel(current.sides.blue, '蓝方', 'blue') + banPanel(current.sides.red, '红方', 'red') + '</div></section>' +
                '<section id="team-schedule"><h2 class="section">战队赛程 <span class="muted">' + current.schedule.length + ' 场 · 比分从本队视角展示</span></h2>' +
                scheduleRows(future, '待赛 / 进行中') + scheduleRows(past, '已结束') + '</section>';
            renderPlayer();
            function selectPlayer(id, scroll) { selected = id; save(true); renderPlayer(); if (scroll) document.getElementById('player-detail').scrollIntoView({ block: 'start', behavior: 'smooth' }); }
            root.querySelectorAll('[data-player]').forEach(b => b.addEventListener('click', () => selectPlayer(b.dataset.player, false)));
            root.querySelectorAll('[data-select-player]').forEach(b => b.addEventListener('click', () => selectPlayer(b.dataset.selectPlayer, true)));
            root.querySelectorAll('[data-team-version]').forEach(a => a.addEventListener('click', function (event) {
                if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                event.preventDefault(); version = a.dataset.teamVersion; save(true); render();
            }));
            document.getElementById('team-switch').addEventListener('change', function (event) { teamId = event.target.value; selected = ''; save(true); render(); });
        }
        function restore() {
            const params = new URLSearchParams(window.location.search);
            teamId = params.get('team') || ''; version = ['7.2', '7.3'].includes(params.get('version')) ? params.get('version') : 'all';
            selected = (params.get('player') || '').toLowerCase(); render();
        }
        window.addEventListener('popstate', restore); restore();
    });
})();
