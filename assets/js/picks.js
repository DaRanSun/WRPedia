(function () {
    "use strict";
    const WR = window.WR, esc = WR.escapeHtml;
    document.addEventListener('DOMContentLoaded', function () {
        const team = document.getElementById('pick-team'), version = document.getElementById('pick-version');
        const input = document.getElementById('pick-champion-search'), choices = document.getElementById('pick-champion-choices');
        const results = document.getElementById('pick-results'), summary = document.getElementById('pick-summary');
        let selected = '';
        (WR.league.teams || []).forEach(function (t) {
            const option = document.createElement('option'); option.value = t.id;
            option.textContent = t.id === t.name ? t.id : t.id + ' · ' + t.name;
            team.appendChild(option);
        });
        function save(push) {
            const params = new URLSearchParams();
            if (team.value !== 'all') params.set('team', team.value);
            if (version.value !== 'all') params.set('version', version.value);
            if (selected) params.set('champion', selected);
            else if (input.value.trim()) params.set('q', input.value.trim());
            window.history[push ? 'pushState' : 'replaceState'](null, '', 'picks.html' + (params.size ? '?' + params.toString() : ''));
        }
        function render() {
            const query = input.value.trim();
            const candidates = query ? WR.champions.filter(c => WR.championMatches(c.slug, query)) : [];
            choices.innerHTML = candidates.map(c => '<button type="button" class="hero-choice" data-pick-hero="' + c.slug + '" aria-pressed="' +
                (c.slug === selected) + '">' + WR.champImg(c.slug, 'sm') + '<span>' + esc(WR.championName(c.slug)) + '<small>' + esc(c.name) + '</small></span></button>').join('');
            choices.querySelectorAll('[data-pick-hero]').forEach(button => button.addEventListener('click', function () {
                selected = button.dataset.pickHero; input.value = WR.championName(selected); save(true); render();
            }));
            if (!selected) {
                summary.textContent = '';
                results.innerHTML = '<div class="empty-state"><strong>' + (query ? candidates.length ? '请选择一位英雄' : '未找到匹配的英雄' : '先选择要查询的英雄') +
                    '</strong><p>' + (query && candidates.length ? '该名称或昵称对应多位英雄，请点击上方头像。' : '支持中文、英文和昵称，例如：泰坦、球女、奶龙。') + '</p></div>';
                return;
            }
            const records = WR.PickHistory.query({ team: team.value, champion: selected, version: version.value });
            const wins = records.filter(r => r.won).length;
            summary.innerHTML = '<span class="stat-chip">' + esc(team.value === 'all' ? '全部队伍' : WR.teamName(team.value)) + '</span><span class="stat-chip">' +
                esc(WR.championName(selected)) + '</span><span class="stat-chip">' + esc(version.value === 'all' ? '全部版本' : version.value) + '</span>' +
                '<span class="stat-chip">选用 <b>' + records.length + '</b> 次</span>' + (records.length ? '<span class="stat-chip"><b>' + wins + ' 胜 ' +
                (records.length - wins) + ' 负</b> · ' + WR.pct(wins, records.length - wins) + '</span>' : '');
            results.innerHTML = records.length ? records.map(WR.PickHistory.gameDetails).join('') : '<div class="empty-state"><strong>' +
                (team.value === 'all' ? '该英雄暂无选用记录' : '该英雄未被此队伍选取') + '</strong><p>查询范围：' +
                esc(version.value === 'all' ? '全部版本的已录入小局' : version.value + ' 版本的已录入小局') + '</p></div>';
        }
        function restore() {
            const params = new URLSearchParams(window.location.search);
            team.value = WR.league.teams.some(t => t.id === params.get('team')) ? params.get('team') : 'all';
            version.value = ['7.2', '7.3'].includes(params.get('version')) ? params.get('version') : 'all';
            selected = WR.getChampion(params.get('champion')) ? params.get('champion') : '';
            input.value = selected ? WR.championName(selected) : params.get('q') || '';
            render();
        }
        input.addEventListener('input', function () {
            const q = input.value.trim(), candidates = q ? WR.champions.filter(c => WR.championMatches(c.slug, q)) : [];
            selected = candidates.length === 1 ? candidates[0].slug : '';
            save(false); render();
        });
        [team, version].forEach(select => select.addEventListener('change', function () { save(true); render(); }));
        document.getElementById('clear-pick-search').addEventListener('click', function () { selected = ''; input.value = ''; save(true); render(); input.focus(); });
        window.addEventListener('popstate', restore);
        restore();
    });
})();
