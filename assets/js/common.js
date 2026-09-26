(function () {
    "use strict";

    const CHAMPIONS = window.WR_CHAMPIONS || [];
    const INDEX = {};
    const originalNames = [];
    CHAMPIONS.forEach(function (c) {
        const local = (window.WR_CHAMPION_LOCALES || {})[c.slug];
        if (local) {
            originalNames.push([c.nameZh, local.name]);
            c.nameTw = c.nameZh;
            c.nameZh = local.name;
            c.titleZh = local.title;
            c.aliases = local.aliases;
        }
        INDEX[c.slug] = c;
    });
    originalNames.sort(function (a, b) { return b[0].length - a[0].length; });

    function championName(slug) {
        const c = INDEX[slug];
        return c ? c.nameZh || c.name : slug;
    }

    function normalizeSearch(value) {
        return String(value || "").normalize("NFKC").toLowerCase().replace(/[\s\-'’‘·.]/g, "");
    }

    const searchFields = {};
    const exactSearch = new Map();
    CHAMPIONS.forEach(function (c) {
        const fields = [c.name, c.nameZh, c.nameTw, c.titleZh, c.slug].concat(c.aliases || []).map(normalizeSearch).filter(Boolean);
        searchFields[c.slug] = fields;
        fields.forEach(function (field) {
            if (!exactSearch.has(field)) exactSearch.set(field, new Set());
            exactSearch.get(field).add(c.slug);
        });
    });

    function championMatches(slug, query) {
        const term = normalizeSearch(query);
        if (!term) return true;
        // Exact nicknames take precedence: 云 should find 芸阿娜, and ez
        // should not match unrelated pinyin fragments in other heroes' names.
        if (exactSearch.has(term)) return exactSearch.get(term).has(slug);
        return (searchFields[slug] || []).some(function (field) { return field.includes(term); });
    }

    function localizeChampionNames(value) {
        let text = String(value || "");
        originalNames.forEach(function (names) {
            if (!names[0] || names[0] === names[1]) return;
            // Single-character TW names (e.g. Gwen's 關) must not alter words
            // such as 關鍵. Whole labels or separated names are safe to replace.
            if (names[0].length === 1) {
                const boundary = '[\\s、，。；：！？（）「」『』/·]';
                text = text.replace(new RegExp('(^|' + boundary + ')' + names[0] + '(?=$|' + boundary + ')', 'g'), function (_, before) { return before + names[1]; });
            } else text = text.split(names[0]).join(names[1]);
        });
        return text;
    }

    const LEAGUE = window.WR_LEAGUE || null;
    const PLAYERS = window.WR_PLAYERS || [];
    const PLAYER_INDEX = Object.fromEntries(PLAYERS.map(p => [p.id.toLowerCase(), p]));
    function getPlayer(id) { return PLAYER_INDEX[String(id || '').toLowerCase()] || null; }
    function resolvePlayer(teamId, name) {
        return PLAYERS.find(p => p.teamId === teamId && p.name.toLowerCase() === String(name || '').trim().toLowerCase()) || null;
    }
    const ROLE_NAMES = Object.freeze({ top: "上单", jungle: "打野", mid: "中路", bot: "下路", support: "辅助" });
    const ROLE_KEYS = Object.keys(ROLE_NAMES);

    function roleShares(value) {
        const roles = Array.isArray(value) ? value : value ? [value] : [];
        if (!roles.length || roles.length > 2 || new Set(roles).size !== roles.length || roles.some(r => !ROLE_NAMES[r])) return {};
        return Object.fromEntries(roles.map(r => [r, 1 / roles.length]));
    }

    function pickRoleShares(side, index) {
        // Only legacy records infer roles from array positions. New arrays are draft order.
        return roleShares(Array.isArray(side.pickRoles) ? side.pickRoles[index] : ROLE_KEYS[index]);
    }

    function banRoleShares(side, index) {
        return roleShares(Array.isArray(side.banRoles) ? side.banRoles[index] : null);
    }

    function roleLabel(shares) {
        return Object.keys(shares).map(r => ROLE_NAMES[r]).join("／") || "分路未标注";
    }

    function draftSideHtml(side, selected) {
        const ordered = Array.isArray(side.pickRoles);
        let html = '<div class="bans-label">选用 · ' + (ordered ? '按队内选取顺序' : '按分路排列') + '</div><div class="history-picks">';
        (side.picks || []).forEach(function (slug, index) {
            const chosen = selected === slug, shares = pickRoleShares(side, index);
            const player = getPlayer((side.pickPlayers || [])[index]);
            html += '<div class="history-pick' + (chosen ? ' selected' : '') + '" data-pick-slot="' + (index + 1) + '"><span>' +
                (ordered ? (index + 1) + '. ' : '') + escapeHtml(roleLabel(shares)) + '</span>' + champImg(slug) +
                '<b>' + escapeHtml(championName(slug)) + '</b>' + (Object.keys(shares).length === 2 ? '<small>各 50%</small>' : '') +
                (player ? '<small class="draft-player">' + escapeHtml(player.name) + '</small>' : '') +
                (chosen ? '<small>查询英雄</small>' : '') + '</div>';
        });
        html += '</div><div class="bans-label">禁用 · 按队内顺位</div><div class="history-bans">';
        (side.bans || []).forEach(function (slug, index) {
            const shares = banRoleShares(side, index), count = Object.keys(shares).length;
            html += '<span data-ban-slot="' + (index + 1) + '">' + (slug ? champImg(slug, 'ban') : '<span class="empty-ban" aria-hidden="true">—</span>') +
                '<small>' + (index + 1) + '. ' + (slug ? escapeHtml(championName(slug)) : '空 Ban') + '</small>' +
                (slug && count ? '<small>' + escapeHtml(roleLabel(shares)) + (count === 2 ? '<br>各 50%' : '') + '</small>' : '') + '</span>';
        });
        return html + '</div>';
    }

    function gameMvpLabel(game) {
        const mvp = game.mvp;
        const player = mvp && getPlayer(mvp.playerId);
        return mvp && mvp.teamId ? teamName(mvp.teamId) + ' · ' + (ROLE_NAMES[mvp.role] || mvp.role || '未标注分路') +
            (player ? '（' + player.name + '）' : '') : '';
    }

    function gameNotesHtml(game) {
        const notes = (game.notes || []).slice();
        (game.substitutions || []).forEach(function (sub) {
            const before = getPlayer(sub.out), after = getPlayer(sub.in);
            if (before && after) notes.push('换人 · ' + sub.teamId + ' ' + (ROLE_NAMES[sub.role] || '') + '：' + before.name + ' → ' + after.name);
        });
        return notes.length ? '<p class="game-notes">' + notes.map(escapeHtml).join('<br>') + '</p>' : '';
    }

    function matchPatch(round, match) {
        return (match && match.patch) || (round && round.patch) || "";
    }

    function majorPatch(patch) {
        const match = /^(\d+\.\d+)/.exec(patch || "");
        return match ? match[1] : "";
    }

    function championAvailable(slug, patch) {
        const from = ((window.WR_CHAMPION_RULES || {})[slug] || {}).availableFrom;
        if (!from) return true;
        const current = /^(\d+)\.(\d+)([a-z]*)$/i.exec(patch || "");
        const start = /^(\d+)\.(\d+)([a-z]*)$/i.exec(from);
        if (!current || !start) return false;
        for (let i = 1; i <= 2; i++) {
            if (+current[i] !== +start[i]) return +current[i] > +start[i];
        }
        return current[3].toLowerCase() >= start[3].toLowerCase();
    }

    function patchLink(patch) {
        if (!patch) return "";
        return '<a class="patch-badge" href="patches.html#patch-' + escapeHtml(patch) +
            '" title="查看 ' + escapeHtml(patch) + ' 版本改动">' + escapeHtml(patch) + '</a>';
    }

    function matchStarted(round, match) {
        return !!(round.completed || match.started || match.completed || (match.games || []).length);
    }

    function escapeHtml(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function getChampion(slug) {
        return INDEX[slug] || null;
    }

    function champImg(slug, cls) {
        const c = INDEX[slug];
        if (!c) {
            return '<span class="champ-unknown" title="' + escapeHtml(slug) + '">' + escapeHtml(slug) + "</span>";
        }
        const title = championName(slug) + " · " + c.name;
        return '<img class="champ-icon ' + (cls || "") + '" src="' + c.icon +
            '" alt="' + escapeHtml(championName(slug)) + '" title="' + escapeHtml(title) + '" loading="lazy">';
    }

    function teamById(id) {
        if (!LEAGUE) return null;
        const t = LEAGUE.teams.find(function (x) { return x.id === id; });
        return t || null;
    }

    function teamBadge(id, cls) {
        const t = teamById(id);
        if (!t) return '<span class="text-muted">' + escapeHtml(id) + "</span>";
        let hue = 200;
        if (t.color) hue = t.color;
        else {
            let h = 0;
            for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
            hue = h;
        }
        const logo = t.logo
            ? '<img class="team-logo" src="' + escapeHtml(t.logo) + '" alt="' + escapeHtml(t.name) + '">'
            : '<span class="team-badge" style="--team-hue:' + hue + '">' + escapeHtml(t.short || id) + "</span>";
        return logo;
    }

    function teamName(id) {
        const t = teamById(id);
        return t ? t.name : id;
    }

    function pct(w, l) {
        const total = w + l;
        if (!total) return "-";
        return ((w / total) * 100).toFixed(2) + "%";
    }

    function fmtPercent(v) {
        if (v == null || isNaN(v)) return "-";
        return v.toFixed(2) + "%";
    }

    function parseDuration(str) {
        if (!str) return null;
        const parts = String(str).trim().split(":").map(Number);
        if (parts.some(isNaN)) return null;
        let mins = 0;
        if (parts.length === 2) mins = parts[0] + parts[1] / 60;
        else if (parts.length === 3) mins = parts[0] * 60 + parts[1] + parts[2] / 60;
        return mins;
    }

    function makeSortable(table) {
        if (!table) return;
        const headers = Array.prototype.slice.call(table.querySelectorAll("thead th[data-sort]"));
        headers.forEach(function (th, order) {
            const colAttr = th.getAttribute("data-col");
            const col = colAttr != null && !isNaN(Number(colAttr)) ? Number(colAttr) : order;
            th.addEventListener("click", function () {
                const dir = th.getAttribute("data-dir") === "asc" ? "desc" : "asc";
                headers.forEach(function (h) {
                    h.removeAttribute("data-dir");
                    h.removeAttribute("aria-sort");
                    h.classList.remove("asc", "desc");
                });
                th.setAttribute("data-dir", dir);
                th.setAttribute("aria-sort", dir === "asc" ? "ascending" : "descending");
                th.classList.add(dir);
                const tbody = table.tBodies[0];
                if (!tbody) return;
                const rows = Array.prototype.slice.call(tbody.rows);
                rows.sort(function (a, b) {
                    const av = a.cells[col] ? a.cells[col].getAttribute("data-value") : "";
                    const bv = b.cells[col] ? b.cells[col].getAttribute("data-value") : "";
                    let cmp = 0;
                    if (av !== "" && bv !== "" && !isNaN(Number(av)) && !isNaN(Number(bv))) {
                        cmp = Number(av) - Number(bv);
                    } else {
                        cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
                    }
                    return dir === "asc" ? cmp : -cmp;
                });
                rows.forEach(function (r) { tbody.appendChild(r); });
            });
        });
    }

    function initTabs() {
        const page = document.body.getAttribute("data-page");
        const siteVersion = (window.WR_SITE || {}).version;
        document.querySelectorAll('[data-site-version]').forEach(el => { el.textContent = 'WRPedia' + (siteVersion ? ' V' + siteVersion : ''); });
        document.querySelectorAll(".tabs a").forEach(function (a) {
            if (a.getAttribute("data-page") === page) a.classList.add("active");
        });
    }

    let dialogTrigger = null;
    function showDialog(html, title) {
        dialogTrigger = document.activeElement;
        let overlay = document.getElementById("dialog-overlay");
        if (!overlay) {
            overlay = document.createElement("div");
            overlay.id = "dialog-overlay";
            overlay.className = "dialog-overlay";
            overlay.addEventListener("click", function (e) {
                if (e.target === overlay) hideDialog();
            });
            overlay.addEventListener('keydown', function (e) {
                if (e.key === 'Escape') { e.preventDefault(); hideDialog(); }
                if (e.key === 'Tab') {
                    const items = Array.from(overlay.querySelectorAll('button, a[href], select, input, summary, [tabindex="0"]')).filter(el => el.getClientRects().length);
                    const first = items[0], last = items[items.length - 1];
                    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
                }
            });
            document.body.appendChild(overlay);
        }
        overlay.innerHTML =
            '<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div class="dialog-header"><span id="dialog-title">' + escapeHtml(title || "详情") +
            '</span><button type="button" class="dialog-close" aria-label="关闭详情">×</button></div>' +
            '<div class="dialog-body">' + html + "</div></div>";
        overlay.querySelector(".dialog-close").addEventListener("click", hideDialog);
        overlay.classList.add("show");
        overlay.querySelector('.dialog-close').focus();
    }

    function hideDialog() {
        const overlay = document.getElementById("dialog-overlay");
        if (overlay) overlay.classList.remove("show");
        if (dialogTrigger && dialogTrigger.isConnected) dialogTrigger.focus();
    }

    window.WR = {
        league: LEAGUE,
        players: PLAYERS,
        getPlayer: getPlayer,
        resolvePlayer: resolvePlayer,
        roleNames: ROLE_NAMES,
        roleShares: roleShares,
        pickRoleShares: pickRoleShares,
        banRoleShares: banRoleShares,
        roleLabel: roleLabel,
        draftSideHtml: draftSideHtml,
        gameMvpLabel: gameMvpLabel,
        gameNotesHtml: gameNotesHtml,
        matchPatch: matchPatch,
        majorPatch: majorPatch,
        championAvailable: championAvailable,
        championRules: window.WR_CHAMPION_RULES || {},
        patchLink: patchLink,
        matchStarted: matchStarted,
        champions: CHAMPIONS,
        getChampion: getChampion,
        championName: championName,
        championMatches: championMatches,
        localizeChampionNames: localizeChampionNames,
        champImg: champImg,
        teamById: teamById,
        teamBadge: teamBadge,
        teamName: teamName,
        escapeHtml: escapeHtml,
        pct: pct,
        fmtPercent: fmtPercent,
        parseDuration: parseDuration,
        makeSortable: makeSortable,
        initTabs: initTabs,
        showDialog: showDialog,
        hideDialog: hideDialog
    };

    document.addEventListener("DOMContentLoaded", initTabs);
})();
