(function () {
    'use strict';
    const WR = window.WR, esc = WR.escapeHtml;
    document.addEventListener('DOMContentLoaded', function () {
        const root = document.getElementById('player-root');
        let version = 'all', playerId = '';
        const chip = (label, value) => '<span class="stat-chip">' + label + ' <b>' + value + '</b></span>';
        function render() {
            const player = WR.getPlayer(playerId);
            if (!player) { root.innerHTML = '<div class="empty-state"><strong>未找到这位选手</strong><p><a href="teams.html">查看全部战队</a></p></div>'; return; }
            document.title = player.name + ' · ' + player.teamId + ' · 选手档案 · WRpedia';
            const st = WR.TeamStats.compute(player.teamId, version).players[player.id];
            const records = WR.PickHistory.query({ playerId: player.id, version });
            const heroes = Object.values(st.champions).sort((a, b) => b.games - a.games || b.wins - a.wins || WR.championName(a.slug).localeCompare(WR.championName(b.slug), 'zh'));
            const back = document.getElementById('player-back');
            back.href = 'team.html?team=' + player.teamId + (version === 'all' ? '' : '&version=' + version); back.textContent = '← ' + player.teamId + ' 战队';
            root.innerHTML = '<header class="team-hero player-hero">' + WR.teamBadge(player.teamId) + '<div><span class="eyebrow">' + esc(player.teamId) + ' · 选手档案</span><h1>' + esc(player.name) + '</h1><p>' +
                esc(WR.TeamStats.roleText(st)) + '</p></div></header>' +
                '<nav class="version-tabs" aria-label="选手统计版本">' + [['all', '总览', '全部版本'], ['7.2', '7.2', '第 1–5 周'], ['7.3', '7.3', '第 6 周起']].map(([v, title, sub]) =>
                    '<a href="player.html?player=' + player.id + (v === 'all' ? '' : '&amp;version=' + v) + '" data-player-version="' + v + '"' + (v === version ? ' class="active" aria-current="page"' : '') + '>' + title + '<span>' + sub + '</span></a>').join('') + '</nav>' +
                '<div class="stats-summary">' + chip('出场', st.games) + chip('胜负', st.wins + '–' + st.losses) + chip('胜率', WR.pct(st.wins, st.losses)) + chip('MVP', st.mvp) + chip('使用英雄', heroes.length) + '</div>' +
                '<div class="player-role-counts">' + WR.TeamStats.rankedRoles(st).map(([role, n]) => '<span>' + esc(WR.roleNames[role]) + ' <b>' + n + ' 局</b></span>').join('') + '</div>' +
                '<nav class="team-section-nav" aria-label="选手页内容"><a href="#player-heroes">英雄一览</a><a href="#player-games">逐局记录</a></nav>' +
                '<section id="player-heroes"><h2 class="section">英雄一览 <span class="muted">' + heroes.length + ' 位</span></h2>' +
                (heroes.length ? '<div class="table-responsive"><table class="wikitable striped player-champion-table"><thead><tr><th>英雄 / 实际分路</th><th>选用</th><th>胜–负</th><th>胜率</th></tr></thead><tbody>' + heroes.map(h =>
                    '<tr data-player-champion="' + h.slug + '"><td><button type="button" class="champion-name-button" data-player-games="' + h.slug + '">' + WR.champImg(h.slug, 'sm') + '<span>' + esc(WR.championName(h.slug)) +
                    '<small>' + WR.TeamStats.rankedRoles(h).map(([role, n]) => esc(WR.roleNames[role]) + ' ' + n).join(' / ') + '</small></span></button></td><td class="num">' + h.games + '</td><td class="num">' + h.wins + '–' + h.losses + '</td><td class="num">' + WR.pct(h.wins, h.losses) + '</td></tr>').join('') + '</tbody></table></div>' :
                    '<p class="empty-note">该版本暂无出场记录。</p>') + '</section>' +
                '<section id="player-games"><h2 class="section">逐局记录 <span class="muted">' + records.length + ' 小局</span></h2><p class="scope-note">按比赛日期从近到远排列，同一大场按局号排列。位置以局内实际分路为准；点击 BP 查看完整对局。</p>' +
                (records.length ? '<div class="table-responsive"><table class="wikitable striped player-games-table"><thead><tr><th>比赛 / 局号</th><th>实际位置</th><th>英雄</th><th>结果</th><th>时长</th><th>荣誉 / 详情</th></tr></thead><tbody>' + records.map((r, i) =>
                    '<tr data-player-match="' + esc(r.match.id) + '" data-game="' + (r.gameIndex + 1) + '"><td><a href="schedule.html#match-' + esc(r.match.id) + '">' + esc(player.teamId) + ' vs ' + esc(r.match['opponent' + (r.teamIndex === 1 ? 2 : 1)]) + ' · G' + (r.gameIndex + 1) + '</a><small>' + esc(r.match.date) + ' · ' + esc(r.patch) + '</small></td>' +
                    '<td>' + esc(r.role) + '</td><td><span class="champ-cell">' + WR.champImg(r.champion, 'sm') + esc(WR.championName(r.champion)) + '</span></td><td><span class="player-result ' + (r.won ? 'won' : 'lost') + '">' + (r.won ? '胜' : '负') + '</span></td><td class="num">' + esc(r.game.length || '—') + '</td><td>' +
                    (r.game.mvp && r.game.mvp.playerId === player.id ? '<span class="player-mvp-badge">MVP</span>' : '') + '<button type="button" class="btn" data-game-detail="' + i + '" aria-label="查看第 ' + (r.gameIndex + 1) + ' 局 BP">BP</button></td></tr>').join('') + '</tbody></table></div>' : '<p class="empty-note">该版本暂无出场记录。</p>') + '</section>';
            root.querySelectorAll('[data-player-games]').forEach(button => button.addEventListener('click', function () {
                const subset = records.filter(r => r.champion === button.dataset.playerGames);
                WR.showDialog(subset.map(WR.PickHistory.gameDetails).join(''), player.name + ' · ' + WR.championName(button.dataset.playerGames) + ' · ' + subset.length + ' 小局');
            }));
            root.querySelectorAll('[data-game-detail]').forEach(button => button.addEventListener('click', function () {
                const r = records[Number(button.dataset.gameDetail)];
                WR.showDialog(WR.PickHistory.gameDetails(r), player.name + ' · 第 ' + (r.gameIndex + 1) + ' 局');
            }));
            root.querySelectorAll('[data-player-version]').forEach(a => a.addEventListener('click', function (event) {
                if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                event.preventDefault(); version = a.dataset.playerVersion; window.history.pushState(null, '', a.href); render();
            }));
        }
        function restore() {
            const params = new URLSearchParams(window.location.search); playerId = (params.get('player') || '').toLowerCase();
            version = ['7.2', '7.3'].includes(params.get('version')) ? params.get('version') : 'all'; render();
        }
        window.addEventListener('popstate', restore); restore();
    });
})();
