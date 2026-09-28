(function () {
    "use strict";
    const WR = window.WR, esc = WR.escapeHtml;
    let selectedRole = "top", currentResult = null, currentSearch = "";
    function badge(row) { return '<span class="tier-badge tier-' + (row.status === 'rated' ? row.label.toLowerCase() : row.status) + '">' + esc(row.label) + '</span>'; }
    function detail(row, lane, version) {
        const query = new URLSearchParams({ champion: row.slug, version: version });
        return '<p>' + esc(lane.name) + ' · ' + badge(row) + (row.provisional ? ' <span class="tier-provisional">初步</span>' : '') + '</p>' +
            '<div class="stats-summary"><span class="stat-chip">本分路 <b>' + row.picks + '</b> 次选用</span><span class="stat-chip"><b>' +
            row.wins + ' 胜 ' + row.losses + ' 负</b></span><span class="stat-chip">胜率 <b>' + WR.pct(row.wins, row.losses) + '</b></span></div>' +
            '<p>标注 Ban 按录入分路统计，双位置各占 50%，三位置各占 1/3。未标注部分按实际出场比例或站主确认分路估算，本路分摊比例为 ' +
            WR.fmtPercent(row.banShare * 100) + '。' + (row.pureBan ? '本路尚无选用战绩，修正胜率取中性 50%，不视为实际胜率。' : '') + '</p>' +
            (row.strength == null ? '' : '<div class="tier-formula">标注 Ban（含多位置均分） = ' + row.recordedBans.toFixed(2) +
            '<br>未标注 Ban 的估算份额 = ' + row.estimatedBans.toFixed(2) + '<br>分路 Ban 合计 = <b>' + row.laneBans.toFixed(2) + '</b><br>' +
            '有效局数 = ' + row.available + '<br>分路热度 = ' + row.heat.toFixed(4) + '<br>本分路修正胜率 = ' + WR.fmtPercent(row.smoothedWinRate * 100) +
            '<br>分路强度 = 热度 × 2 × 修正胜率 = <b>' + row.strength.toFixed(4) + '</b><br>' +
            '本分路比较基准 = ' + lane.anchor.toFixed(4) + '<br>相对分 = ' + (row.score == null ? '待评级' : row.score.toFixed(1)) + '</div>') +
            (row.reason ? '<p>' + esc(row.reason) + '</p>' : '') +
            '<p>选用与胜负仅计算' + esc(lane.name) + '。有效局数继续遵守跨分路的双边无畏锁定；仅未标注分路的 Ban 使用估算。</p>' +
            '<a class="btn accent" href="picks.html?' + esc(query.toString()) + '">查看该英雄的选用小局 →</a>';
    }
    WR.renderRoleTiers = function (res, query) {
        const root = document.getElementById('role-tier-results');
        if (!root || !res.roleTierModel) return;
        currentResult = res; currentSearch = query || '';
        const model = res.roleTierModel, lane = model.roles[selectedRole];
        const unassigned = document.getElementById('role-tier-unassigned');
        if (unassigned) {
            unassigned.hidden = !model.unassigned.length;
            unassigned.textContent = model.unassigned.length ? '以下英雄尚有未标注分路的 Ban，且暂无选用或确认归属可供分摊；这些 Ban 暂未计入分路榜：' +
                model.unassigned.map(WR.championName).join('、') + '。' : '';
        }
        document.querySelectorAll('[data-role-tier]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.roleTier === selectedRole)));
        const count = document.getElementById('role-tier-count');
        let rank = 0;
        const rows = lane.rows.map(row => ({ row: row, rank: row.status === 'rated' ? ++rank : null })).filter(item => WR.championMatches(item.row.slug, currentSearch));
        count.textContent = lane.name + ' · ' + lane.ratedCount + ' 位已评级 · ' + lane.rows.filter(r => r.status === 'pending').length + ' 位待评级' +
            (currentSearch ? ' · 筛选命中 ' + rows.length + ' 位，名次保持不变' : ' · 按相对分排序');
        if (!res.totalGames) { root.innerHTML = '<p class="empty-note">当前版本暂无比赛样本，尚不生成分路梯度。</p>'; return; }
        if (!rows.length) { root.innerHTML = '<p class="empty-note">当前范围内，没有匹配英雄的' + lane.name + '选用或已确认分路的 Ban 记录。</p>'; return; }
        let html = '<div class="table-responsive role-table-scroll"><table class="wikitable striped role-tier-table"><caption class="sr-only">' + lane.name +
            '分路梯度与本分路数据</caption><thead><tr><th>名次</th><th>英雄 / 梯度</th><th>相对分</th><th>选用</th><th>胜率</th><th>分路 Ban<small>标注 + 估算</small></th><th>有效局数</th></tr></thead><tbody>';
        rows.forEach(function (item) {
            const row = item.row;
            html += '<tr data-role-champion="' + row.slug + '"><td class="num">' + (item.rank || '—') + '</td><td class="left"><button type="button" class="champion-name-button" data-role-detail="' + row.slug + '">' +
                WR.champImg(row.slug, 'sm') + '<span>' + esc(WR.championName(row.slug)) + '<small>' + badge(row) +
                (row.provisional ? ' <span class="tier-provisional">初步</span>' : '') + '</small></span></button></td>' +
                '<td class="num">' + (row.score == null ? '—' : '<b>' + row.score.toFixed(1) + '</b><span class="role-score-track"><i style="width:' + row.score + '%"></i></span>') +
                '</td><td class="num">' + row.picks + '</td><td class="num">' + WR.pct(row.wins, row.losses) + '<small>' +
                (row.pureBan ? '未选用 · 中性计算' : row.wins + '胜 ' + row.losses + '负') + '</small></td>' +
                '<td class="num">' + (row.laneBans == null ? '—' : row.laneBans.toFixed(1) + '<small>标注 ' + row.recordedBans.toFixed(1) + ' / 估算 ' + row.estimatedBans.toFixed(1) + '</small>') + '</td><td class="num">' + row.available + '</td></tr>';
        });
        root.innerHTML = html + '</tbody></table></div>';
        root.querySelectorAll('[data-role-detail]').forEach(button => button.addEventListener('click', function () {
            const row = lane.rows.find(r => r.slug === button.dataset.roleDetail);
            WR.showDialog(detail(row, lane, res.version), WR.championName(row.slug) + ' · ' + lane.name + '梯度');
        }));
    };
    document.addEventListener('DOMContentLoaded', function () {
        document.querySelectorAll('[data-role-tier]').forEach(button => button.addEventListener('click', function () {
            selectedRole = button.dataset.roleTier;
            if (currentResult) WR.renderRoleTiers(currentResult, currentSearch);
        }));
    });
})();
