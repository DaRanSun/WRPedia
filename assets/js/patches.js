(function () {
    "use strict";
    const WR = window.WR;
    const patches = window.WR_PATCHES || [];
    const esc = function (value) { return WR.escapeHtml(WR.localizeChampionNames(value)); };
    const types = {
        buff: { label: "增强", arrow: "↑", description: "提高技能或属性收益" },
        nerf: { label: "削弱", arrow: "↓", description: "降低强度或增加技能空窗" },
        adjust: { label: "混合调整", arrow: "↕", description: "有增有减，或玩法与收益重新分配" }
    };

    function adoptionStatus(patch) {
        const used = WR.league && WR.league.rounds.some(function (round) {
            return (round.matches || []).some(function (match) {
                return WR.matchPatch(round, match) === patch.id && WR.matchStarted(round, match);
            });
        });
        return used ? '已采用' : patch.status;
    }

    function list(lines) {
        return '<ul class="change-list">' + lines.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>';
    }

    function championCard(change) {
        const c = WR.getChampion(change.slug);
        const type = types[change.type];
        const name = c ? WR.championName(change.slug) : change.name;
        return '<article class="patch-champion ' + change.type + (change.core ? ' is-core' : '') + '">' +
            '<div class="patch-champion-head">' + WR.champImg(change.slug) + '<div class="patch-champion-name"><b>' + esc(name) + '</b>' +
            '<span>' + esc(c ? c.name : change.name) + '</span></div><span class="change-direction ' + change.type + '" aria-label="' + type.label + '">' + type.arrow + '</span></div>' +
            (change.core ? '<span class="core-badge">★ 赛事重点</span>' : '') +
            '<p>' + esc(change.summary) + '</p><details class="champion-values"><summary>数值与机制 <span>' + change.changes.length + ' 项</span></summary>' +
            list(change.changes) + '</details></article>';
    }

    function renderPatch(patch) {
        document.querySelectorAll('[data-patch]').forEach(function (a) {
            const active = a.getAttribute('data-patch') === patch.id;
            a.classList.toggle('active', active);
            if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
        });
        const core = patch.champions.filter(function (c) { return c.core; });
        const article = document.getElementById('patch-content-' + patch.id);
        let html = '<header class="patch-heading"><div><div class="eyebrow">PATCH NOTES · 常规峡谷</div>' +
            '<h2>' + patch.id + '<span>' + esc(patch.title) + '</span></h2><p>' + esc(patch.summary) + '</p></div>' +
            '<div class="patch-source"><span>赛事采用 · ' + esc(patch.weeks) + '</span>' +
            (patch.releaseDate ? '<span>版本上线 · ' + esc(patch.releaseDate) + '</span>' : '') +
            (patch.published ? '<span>官方公告 · ' + esc(patch.published) + '</span>' : '') +
            (patch.postseason ? '<span>' + esc(patch.postseason) + '</span>' : '') +
            (patch.source ? '<a href="' + esc(patch.source) + '" target="_blank" rel="noopener noreferrer">Riot 官方公告 ↗</a>' : '') +
            (patch.sourceCN ? '<a href="' + esc(patch.sourceCN) + '" target="_blank" rel="noopener noreferrer">国服官方公告 ↗</a>' : '') + '</div></header>';
        html += '<div class="patch-toolbar"><span><span class="core-badge">★ 赛事重点</span> ' +
            (core.length ? '本版本 ' + core.length + ' 位重点英雄优先展示' : '大版本系统改动请结合装备、战场与属性附录阅读') +
            '</span><a href="stats.html?version=' + patch.major + '">查看 ' + patch.major + ' 统计 →</a></div>';
        if (patch.id === '7.3') {
            html += '<div class="system-highlights"><div><b>200%</b><span>基础暴击伤害 · 原 175%</span></div>' +
                '<div><b>3.0</b><span>攻速上限 · 原 2.5</span></div><div><b>1,400</b><span>惩戒最终伤害 · 两次升级</span></div>' +
                '<div><b>永久镀层</b><span>防御塔结晶与兵线更新</span></div></div>';
        }
        if (patch.id === '7.3') {
            html += '<div class="patch-hero-preview">';
            Object.keys(types).forEach(function (key) {
                html += '<div><b class="change-direction ' + key + '">' + types[key].arrow + ' ' + types[key].label + '</b><div class="icon-grid">' +
                    patch.champions.filter(function (c) { return c.type === key; }).map(function (c) { return WR.champImg(c.slug); }).join('') + '</div></div>';
            });
            html += '</div><details class="patch-detail-section patch-hero-section"><summary>英雄技能与属性调整<span>' + patch.champions.length + ' 位 · 展开明细</span></summary><div class="patch-hero-body">';
        } else {
            html += '<h3 class="patch-section-heading">英雄调整 <span>' + patch.champions.length + ' 位 · 按直接改动分组</span></h3>';
        }
        html += '<div class="patch-groups">';
        Object.keys(types).forEach(function (key) {
            const rows = patch.champions.filter(function (c) { return c.type === key; }).sort(function (a, b) { return Number(!!b.core) - Number(!!a.core); });
            if (!rows.length) return;
            const t = types[key];
            html += '<section class="patch-group"><h4 class="group-heading ' + key + '"><span>' + t.arrow + ' ' + t.label + '</span><span>' + rows.length + '</span></h4>' +
                '<p class="group-description">' + t.description + '</p>' + rows.map(championCard).join('') + '</section>';
        });
        html += '</div>' + (patch.id === '7.3' ? '</div></details>' : '') + '<div class="patch-section-heading"><h3>装备、战场与其他改动</h3><button type="button" class="btn" id="expand-patch-sections">展开全部明细</button></div>';
        patch.sections.forEach(function (section, si) {
            html += '<details class="patch-detail-section"' + (patch.id !== '7.3' || si === 0 ? ' open' : '') + '><summary>' +
                esc(section.title) + '<span>' + section.entries.length + ' 个条目</span></summary><div class="patch-entries">';
            section.entries.forEach(function (entry) {
                html += '<div class="patch-entry"><h4>' + (entry.slug ? WR.champImg(entry.slug, 'sm') + ' ' + esc(WR.championName(entry.slug)) : esc(entry.name)) + '</h4>' + list(entry.changes) + '</div>';
            });
            html += '</div></details>';
        });
        html += '<p class="scope-note">仅收录常规峡谷改动，英雄与装备名称采用国服译名；赛事采用周次以本赛事记录为准。' +
            (patch.id === '7.3' ? '7.3 另含 51 位英雄生存属性及 141 位英雄攻速参数，见上方附录。' : '') + '</p>';
        article.innerHTML = html;
        document.getElementById('expand-patch-sections').addEventListener('click', function () {
            const sections = Array.from(article.querySelectorAll('.patch-detail-section, .champion-values'));
            const expand = sections.some(function (s) { return !s.open; });
            sections.forEach(function (s) { s.open = expand; });
            this.textContent = expand ? '收起全部明细' : '展开全部明细';
        });
    }

    function selectPatch(id) {
        const selected = patches.find(function (p) { return p.id === id; });
        patches.forEach(function (p) {
            const active = !!selected && p.id === id;
            const row = document.getElementById('patch-details-' + p.id);
            row.hidden = !active;
            const button = document.querySelector('[data-patch="' + p.id + '"]');
            button.setAttribute('aria-expanded', String(active));
            button.classList.toggle('active', active);
            document.getElementById('patch-content-' + p.id).innerHTML = '';
        });
        if (selected) renderPatch(selected);
    }

    document.addEventListener('DOMContentLoaded', function () {
        if (!patches.length) return;
        document.getElementById('patch-index').innerHTML = '<table class="patch-index-table"><caption class="sr-only">版本目录，点击版本展开完整改动</caption><thead><tr><th>版本 / 日期</th><th>赛事采用</th><th>改动概览</th></tr></thead><tbody>' + patches.map(function (p) {
            const core = p.champions.filter(function (c) { return c.core; }).length;
            return '<tr class="patch-index-row" id="patch-' + p.id + '"><td><button type="button" class="patch-select" data-patch="' + p.id + '" aria-expanded="false" aria-controls="patch-details-' + p.id + '"><span class="patch-disclosure" aria-hidden="true">›</span><span><b>' + p.id + '</b><small>' + esc(p.releaseDate ? '上线 ' + p.releaseDate : '公告 ' + p.published) + '</small></span></button></td>' +
                '<td>' + esc(p.weeks) + '<small>' + esc(adoptionStatus(p)) + '</small></td><td>' + p.champions.length + ' 位英雄<small>' + (core ? core + ' 位赛事重点' : '含装备与战场系统') + '</small></td></tr>' +
                '<tr id="patch-details-' + p.id + '" class="patch-expanded-row" hidden><td colspan="3"><div id="patch-content-' + p.id + '" class="patch-expanded-content"></div></td></tr>';
        }).join('') + '</tbody></table>';
        document.querySelectorAll('[data-patch]').forEach(function (button) {
            button.addEventListener('click', function () {
                const id = this.getAttribute('aria-expanded') === 'true' ? '' : this.getAttribute('data-patch');
                window.history.pushState(null, '', window.location.pathname + window.location.search + (id ? '#patch-' + id : ''));
                selectPatch(id);
            });
        });
        function fromHash() { selectPatch(window.location.hash.replace(/^#patch-/, '')); }
        fromHash();
        window.addEventListener('hashchange', fromHash);
        window.addEventListener('popstate', fromHash);
    });
})();
