// WRPedia local admin. Needs admin/server.py: it reads and writes data/schedule.js and data/players.js.
// Saved records follow the formats documented at the top of data/schedule.js; unchanged records stay byte-identical.
(function () {
    'use strict';

    const WR = window.WR;
    const ROLES = ['top', 'jungle', 'mid', 'bot', 'support'];
    const ROLE_NAMES = WR.roleNames;
    const ROLE_SHORT = { top: '上', jungle: '野', mid: '中', bot: '下', support: '辅' };
    const STAT_FIELDS = [
        { key: 'kills', label: '击杀' }, { key: 'deaths', label: '死亡' }, { key: 'assists', label: '助攻' },
        { key: 'gold', label: '经济', hint: '可写 52.3k' }, { key: 'towers', label: '推塔' },
        { key: 'heralds', label: '峡谷先锋', max: 1 }, { key: 'dragons', label: '元素亚龙', max: 3 },
        { key: 'barons', label: '纳什男爵' }, { key: 'elders', label: '远古巨龙' }
    ];
    const LENGTH_RE = /^\d{1,2}:[0-5]\d$/;
    const DRAFT_PREFIX = 'wrpedia-admin-draft:';
    const EMPTY_BAN_TERMS = ['空ban', '空', 'kong', 'kongban', 'none', 'null', '无'];
    const esc = WR.escapeHtml;
    const clone = value => JSON.parse(JSON.stringify(value));
    const range5 = () => [0, 1, 2, 3, 4];

    const app = document.getElementById('app');
    const S = {
        league: null, players: [], hashes: {}, view: 'new', filter: 'all',
        form: null, baseline: '', game: 0, from: 'new', draftOffer: null, issues: [], saving: false
    };

    // ---------- data access ----------
    async function api(path, body) {
        const init = body ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-WRPedia-Admin': '1' }, body: JSON.stringify(body) }
            : { cache: 'no-store', headers: { 'X-WRPedia-Admin': '1' } };
        const res = await fetch(path, init);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw Object.assign(new Error(data.error || ('HTTP ' + res.status)), { status: res.status });
        return data;
    }

    async function loadData() {
        const data = await api('api/data');
        S.league = data.schedule.value; S.hashes.schedule = data.schedule.hash;
        S.players = data.players.value; S.hashes.players = data.players.hash;
        reindex();
    }

    function reindex() {
        S.playerIndex = new Map(S.players.map(p => [p.id.toLowerCase(), p]));
        S.teamIndex = new Map(S.league.teams.map(t => [t.id, t]));
        S.usage = { all: {} };
        S.roleFreq = {};
        S.opHistory = {};
        S.refs = {};
        const bump = (map, key, n) => { map[key] = (map[key] || 0) + (n || 1); };
        S.league.rounds.forEach(round => round.matches.forEach(match => {
            const major = WR.majorPatch(match.patch || round.patch);
            const usage = S.usage[major] || (S.usage[major] = {});
            (match.games || []).forEach(game => {
                [1, 2].forEach(k => {
                    const side = game['team' + k]; if (!side) return;
                    const teamId = match['opponent' + k];
                    (side.picks || []).concat(side.bans || []).forEach(slug => { if (slug) { bump(S.usage.all, slug); bump(usage, slug); } });
                    (side.picks || []).forEach((slug, i) => {
                        const role = (side.pickRoles || [])[i];
                        if (typeof role === 'string') bump(S.roleFreq[slug] || (S.roleFreq[slug] = {}), role);
                        const op = (side.pickPlayers || [])[i], key = teamId + '|' + slug + '|' + role;
                        if (op && typeof role === 'string') bump(S.opHistory[key] || (S.opHistory[key] = {}), op);
                    });
                    Object.values(side.lineup || {}).concat(side.pickPlayers || []).forEach(id => { if (id) S.refs[id] = true; });
                });
                if (game.mvp && game.mvp.playerId) S.refs[game.mvp.playerId] = true;
                (game.substitutions || []).forEach(sub => { S.refs[sub.in] = true; S.refs[sub.out] = true; });
            });
        }));
        S.appearances = {};
        S.league.rounds.forEach(r => r.matches.forEach(m => (m.games || []).forEach(g => [g.team1, g.team2].forEach(side => {
            new Set((side && side.pickPlayers) || []).forEach(id => bump(S.appearances, id));
        }))));
    }

    const player = id => (id ? S.playerIndex.get(String(id).toLowerCase()) || null : null);
    const playerName = id => (player(id) ? player(id).name : id || '—');
    const team = id => S.teamIndex.get(id) || { id, short: id, name: id };
    const champ = slug => WR.getChampion(slug);
    const champName = slug => WR.championName(slug);

    function teamLogo(id, cls) {
        const t = team(id);
        return t.logo ? '<img class="team-logo ' + (cls || 'sm') + '" src="' + esc(t.logo) + '" alt="">' : '';
    }

    function findMatch(id) {
        for (let ri = 0; ri < S.league.rounds.length; ri++) {
            const mi = S.league.rounds[ri].matches.findIndex(m => m.id === id);
            if (mi >= 0) return { ri, mi, round: S.league.rounds[ri], match: S.league.rounds[ri].matches[mi] };
        }
        return null;
    }

    // Team id, or the bracket source ("半决赛 1 胜者") while a playoff opponent is undecided.
    function opponentName(match, k) {
        if (match['opponent' + k]) return match['opponent' + k];
        const source = (match.sources || [])[k - 1], from = source && findMatch(source.match);
        return from ? (from.match.label || from.match.id) + (source.take === 'loser' ? ' 负者' : ' 胜者') : '待定';
    }
    const teamsKnown = match => !!(match.opponent1 && match.opponent2);

    // Fill opponents that come from another match's result. Returns matches that already have games but whose teams would change.
    function propagateResults(league) {
        const byId = new Map(), conflicts = [];
        league.rounds.forEach(r => r.matches.forEach(m => byId.set(m.id, m)));
        league.rounds.forEach(r => r.matches.forEach(m => (m.sources || []).forEach((source, i) => {
            const from = byId.get(source.match);
            if (!from) return;
            const series = dataSeries(from), winner = series.decided ? (series.w1 > series.w2 ? 1 : 2) : 0;
            const next = winner ? from['opponent' + (source.take === 'loser' ? 3 - winner : winner)] : null;
            if (m['opponent' + (i + 1)] === next) return;
            if ((m.games || []).length) conflicts.push(m);
            else m['opponent' + (i + 1)] = next;
        })));
        return conflicts;
    }

    function dataSeries(match) {
        const games = (match.games || []).filter(g => g.winner === 1 || g.winner === 2);
        const w1 = games.filter(g => g.winner === 1).length, w2 = games.length - w1;
        const need = Math.ceil((match.bestOf || 3) / 2);
        return { w1, w2, played: (match.games || []).length, decided: Math.max(w1, w2) >= need };
    }

    // ---------- champion search (same fields and normalization as the public site) ----------
    const norm = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[\s\-'’‘·.]/g, '');
    const SEARCH = new Map();
    WR.champions.forEach(c => {
        SEARCH.set(c.slug, [c.nameZh, c.name, c.nameTw, c.titleZh, c.slug].concat(c.aliases || []).map(norm).filter(Boolean));
    });

    function championOrder(major) {
        const recent = S.usage[major] || {}, all = S.usage.all;
        return WR.champions.map(c => c.slug).sort((a, b) => (recent[b] || 0) - (recent[a] || 0) || (all[b] || 0) - (all[a] || 0) ||
            champName(a).localeCompare(champName(b), 'zh-Hans-CN'));
    }

    function searchChampions(query) {
        const term = norm(query);
        const order = S.champOrder;
        if (!term) return order.slice();
        const scored = [];
        order.forEach((slug, rank) => {
            const fields = SEARCH.get(slug) || [];
            let score = fields.includes(term) ? 0 : fields.some(f => f.startsWith(term)) ? 1 : fields.some(f => f.includes(term)) ? 2 : -1;
            if (score >= 0) scored.push([score, rank, slug]);
        });
        return scored.sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(x => x[2]);
    }

    // ---------- form model ----------
    // Form state is plain JSON (it is also the local draft). slug: undefined = not filled, null = 空 Ban.
    const lineupOf = value => Object.fromEntries(ROLES.map(r => [r, (value && value[r]) || null]));
    const roleList = value => (Array.isArray(value) ? value.slice() : value ? [value] : []);

    function statsForm(stats) {
        return Object.fromEntries(STAT_FIELDS.map(f => [f.key, stats && stats[f.key] != null ? String(stats[f.key]) : '']));
    }

    function emptySide() {
        return {
            bans: range5().map(() => ({ roles: [] })),
            picks: range5().map(() => ({ role: null, player: null })),
            stats: statsForm(null), hadBanRoles: false
        };
    }

    function newGameForm(teams, blue) {
        return {
            src: null, legacy: false, blue, length: '', winner: null, mvp: null, ordered: true, notes: '',
            lineup: Object.fromEntries(teams.map(t => [t, null])), sides: Object.fromEntries(teams.map(t => [t, emptySide()]))
        };
    }

    function sideFormFrom(side, lineup) {
        const picks = side.picks || [], bans = side.bans || [], pickRoles = Array.isArray(side.pickRoles) ? side.pickRoles : ROLES;
        return {
            bans: range5().map(i => ({ slug: i < bans.length ? bans[i] : undefined, roles: roleList(Array.isArray(side.banRoles) ? side.banRoles[i] : null) })),
            picks: range5().map(i => {
                const role = typeof pickRoles[i] === 'string' ? pickRoles[i] : null, op = (side.pickPlayers || [])[i] || null;
                return { slug: picks[i] || undefined, role, player: op && op !== lineup[role] ? op : null };
            }),
            stats: statsForm(side.stats), hadBanRoles: Array.isArray(side.banRoles)
        };
    }

    function defaultLineup(teamId, current) {
        let best = null;
        S.league.rounds.forEach(r => r.matches.forEach(m => {
            if (m === current || !(m.games || []).length) return;
            const k = m.opponent1 === teamId ? 1 : m.opponent2 === teamId ? 2 : 0;
            if (k && (!best || m.date > best.date)) best = { date: m.date, lineup: m.games[0]['team' + k].lineup };
        }));
        if (best) return lineupOf(best.lineup);
        const used = new Set();
        return Object.fromEntries(ROLES.map(r => {
            const p = S.players.find(x => x.teamId === teamId && x.role === r && !used.has(x.id));
            if (p) used.add(p.id);
            return [r, p ? p.id : null];
        }));
    }

    function formFromMatch(ri, mi) {
        const match = S.league.rounds[ri].matches[mi], teams = [match.opponent1, match.opponent2], games = match.games || [];
        const form = { matchId: match.id, ri, mi, teams, patch: match.patch || S.league.rounds[ri].patch || '', start: {}, games: [] };
        teams.forEach((t, k) => { form.start[t] = games.length ? lineupOf((games[0]['team' + (k + 1)] || {}).lineup) : defaultLineup(t, match); });
        let prev = form.start;
        games.forEach((g, gi) => {
            const legacy = [g.team1, g.team2].some(s => s && s.pickOrder === 'legacy-role');
            const gf = {
                src: gi, legacy, blue: g.team1 && g.team1.side === 'red' ? teams[1] : teams[0], length: g.length || '',
                winner: g.winner === 1 || g.winner === 2 ? teams[g.winner - 1] : null, mvp: (g.mvp && g.mvp.playerId) || null,
                ordered: !legacy, notes: (g.notes || []).join('\n'), lineup: {}, sides: {}
            };
            const cur = {};
            teams.forEach((t, k) => {
                const side = g['team' + (k + 1)] || {}, lineup = gi === 0 ? form.start[t] : lineupOf(side.lineup);
                gf.lineup[t] = gi === 0 || JSON.stringify(lineup) === JSON.stringify(prev[t]) ? null : lineup;
                gf.sides[t] = sideFormFrom(side, lineup);
                cur[t] = lineup;
            });
            prev = cur;
            form.games.push(gf);
        });
        if (!games.length) form.games.push(newGameForm(teams, teams[0]));
        return form;
    }

    function lineups(form) {
        const out = [];
        let prev = form.start;
        form.games.forEach((g, gi) => {
            const cur = {};
            form.teams.forEach(t => { cur[t] = gi === 0 ? form.start[t] : g.lineup[t] || prev[t]; });
            out.push(cur);
            prev = cur;
        });
        return out;
    }

    const operators = (sf, lineup) => sf.picks.map(p => p.player || (p.role ? lineup[p.role] : null));

    function substitutions(prev, cur, teamId) {
        const before = Object.values(prev);
        return ROLES.filter(r => cur[r] && cur[r] !== prev[r] && !before.includes(cur[r]))
            .map(r => ({ teamId, role: r, out: prev[r], in: cur[r] }));
    }

    function formSeries(form) {
        const need = Math.ceil((currentMatch().bestOf || 3) / 2), wins = Object.fromEntries(form.teams.map(t => [t, 0]));
        let decidedAt = -1;
        form.games.forEach((g, gi) => {
            if (!g.winner) return;
            wins[g.winner]++;
            if (decidedAt < 0 && wins[g.winner] >= need) decidedAt = gi;
        });
        return { wins, decidedAt, need };
    }

    function parseStat(field, raw) {
        let text = String(raw).trim().toLowerCase().replace(/,/g, ''), scale = 1;
        if (field.key === 'gold' && /[k万]$/.test(text)) { scale = text.endsWith('k') ? 1000 : 10000; text = text.slice(0, -1).trim(); }
        if (!/^\d+(\.\d+)?$/.test(text)) return null;
        const value = Number(text) * scale;
        if (!Number.isFinite(value) || (scale === 1 && !Number.isInteger(value))) return null;
        return Math.round(value);
    }

    function buildStats(stats) {
        const out = {};
        STAT_FIELDS.forEach(f => { if (String(stats[f.key] || '').trim() !== '') out[f.key] = parseStat(f, stats[f.key]); });
        return Object.keys(out).length ? out : null;
    }

    // ---------- form -> stored records (keeps existing key order; new records use the 7.3 layout) ----------
    function buildSide(existing, g, teamId, lineup) {
        const sf = g.sides[teamId];
        const side = existing || { side: '', picks: [], bans: [], pickRoles: [], banRoles: [], lineup: {}, pickPlayers: [], stats: null };
        side.side = g.blue === teamId ? 'blue' : 'red';
        side.picks = sf.picks.map(p => p.slug || null);
        side.bans = sf.bans.map(b => (b.slug == null ? null : b.slug));
        side.pickRoles = sf.picks.map(p => p.role);
        if (g.ordered || sf.hadBanRoles || sf.bans.some(b => b.slug && b.roles.length)) {
            side.banRoles = sf.bans.map(b => (!b.slug || !b.roles.length ? null : b.roles.length === 1 ? b.roles[0] : b.roles.slice()));
        } else delete side.banRoles;
        side.lineup = lineupOf(lineup);
        side.pickPlayers = operators(sf, lineup);
        if (g.ordered) delete side.pickOrder; else side.pickOrder = 'legacy-role';
        const stats = buildStats(sf.stats);
        if (stats) side.stats = stats; else delete side.stats;
        return side;
    }

    function buildGame(form, g, gi, ls, original) {
        const base = g.src != null && original.games[g.src] ? clone(original.games[g.src])
            : { length: '', winner: null, draftOrder: 'recorded', team1: null, team2: null, mvp: null, substitutions: null, notes: null };
        base.length = g.length.trim();
        base.winner = form.teams.indexOf(g.winner) + 1 || null;
        if (g.ordered) base.draftOrder = 'recorded'; else delete base.draftOrder;
        form.teams.forEach((t, k) => { base['team' + (k + 1)] = buildSide(base['team' + (k + 1)], g, t, ls[gi][t]); });
        const winSide = base['team' + base.winner];
        if (g.mvp && winSide) {
            const i = winSide.pickPlayers.indexOf(g.mvp);
            base.mvp = { teamId: g.winner, role: i >= 0 ? winSide.pickRoles[i] : null, playerId: g.mvp };
        } else delete base.mvp;
        const subs = gi === 0 ? [] : form.teams.flatMap(t => substitutions(ls[gi - 1][t], ls[gi][t], t));
        if (subs.length) base.substitutions = subs; else delete base.substitutions;
        const notes = g.notes.split('\n').map(s => s.trim()).filter(Boolean);
        if (notes.length) base.notes = notes; else delete base.notes;
        return base;
    }

    function buildMatch(form) {
        const round = S.league.rounds[form.ri], original = round.matches[form.mi], match = clone(original), ls = lineups(form);
        match.games = form.games.map((g, gi) => buildGame(form, g, gi, ls, original));
        if (match.games.length) {
            const next = match.startingLineups || {};
            form.teams.forEach(t => {
                const names = ROLES.map(r => playerName(ls[0][t][r])), old = next[t];
                // Keep the owner's original spelling when the starters are unchanged (e.g. "xhao").
                const same = Array.isArray(old) && old.length === 5 && old.every((n, i) => String(n).toLowerCase() === String(names[i]).toLowerCase());
                next[t] = same ? old : names;
            });
            match.startingLineups = next;
        } else delete match.startingLineups;
        if (dataSeries(match).decided && !round.completed) match.completed = true;
        // A patch that differs from the round's is a per-match override; otherwise the match inherits it.
        const patch = (form.patch || '').trim();
        if (patch && round.patch && patch !== round.patch) match.patch = patch; else delete match.patch;
        return match;
    }

    function buildLeague(form) {
        const league = clone(S.league), round = league.rounds[form.ri], patch = (form.patch || '').trim();
        round.matches[form.mi] = buildMatch(form);
        // The first patch entered for a round without one (playoffs) becomes the round's patch.
        if (!round.patch && patch) {
            round.patch = patch;
            // Keep the public version line in step: "…；季后赛待定" -> "… / 7.3a（季后赛）".
            if (round.stage === 'playoffs' && league.meta && typeof league.meta.patch === 'string') {
                league.meta.patch = league.meta.patch.replace(/\s*[；;/]\s*季后赛(版本)?待定/, ' / ' + patch + '（季后赛）');
            }
        }
        propagateResults(league);
        if (!round.completed && round.matches.every(m => dataSeries(m).decided)) round.completed = true;
        return league;
    }

    // ---------- validation ----------
    function currentMatch() { return S.league.rounds[S.form.ri].matches[S.form.mi]; }
    function currentPatch() { const r = S.league.rounds[S.form.ri], m = r.matches[S.form.mi]; return (S.form.patch || '').trim() || m.patch || r.patch || ''; }
    const PATCH_RE = /^\d+\.\d+[a-z]?$/;
    function knownPatches() {
        const seen = new Set();
        S.league.rounds.forEach(r => { if (r.patch) seen.add(r.patch); r.matches.forEach(m => { if (m.patch) seen.add(m.patch); }); });
        return [...seen];
    }
    const patchEditable = (round, match) => !round.patch || round.stage === 'playoffs' || !!match.patch;

    function validate(form) {
        const out = [], ls = lineups(form), match = currentMatch(), patch = currentPatch();
        const add = (level, gi, key, text, missing) => out.push({ level, gi, key, text, missing: !!missing });
        const lineupIssues = (lineup, teamId, prefix, gi, label) => {
            const seen = {};
            ROLES.forEach(r => {
                const id = lineup[r], key = prefix + '.' + teamId + '.' + r;
                if (!id) return add('error', gi, key, label + '：' + ROLE_NAMES[r] + '未选择', true);
                if (!player(id) || player(id).teamId !== teamId) add('error', gi, key, label + '：' + id + ' 不是 ' + teamId + ' 的选手');
                if (seen[id]) add('error', gi, key, label + '：' + playerName(id) + ' 同时出现在' + ROLE_NAMES[seen[id]] + '和' + ROLE_NAMES[r]);
                else seen[id] = r;
            });
        };
        form.teams.forEach(t => lineupIssues(form.start[t], t, 'start', null, t + ' 首发'));
        const typedPatch = (form.patch || '').trim();
        if (!typedPatch) { if (form.games.length) add('error', null, 'patch', '未填写比赛版本（如 7.3a）：统计按该版本归入大版本与小版本', true); }
        else if (!PATCH_RE.test(typedPatch)) add('error', null, 'patch', '比赛版本格式应为 7.3 或 7.3a');
        else if (!knownPatches().includes(typedPatch)) add('warn', null, 'patch', typedPatch + ' 是新的小版本：统计会单独列出，记得在 data/patches.js 补充该版本说明');
        const series = formSeries(form), lockedBy = new Map();
        // Matches fed by this one (final, third place) must not silently change teams once they have games.
        const seriesWinner = series.decidedAt >= 0 ? form.teams.find(t => series.wins[t] >= series.need) : null;
        const blockedBy = new Set();
        S.league.rounds.forEach(r => r.matches.forEach(m => (m.sources || []).forEach((source, i) => {
            if (source.match !== form.matchId || !(m.games || []).length) return;
            const next = seriesWinner ? (source.take === 'loser' ? form.teams.find(t => t !== seriesWinner) : seriesWinner) : null;
            if (m['opponent' + (i + 1)] !== next) blockedBy.add(m);
        })));
        blockedBy.forEach(m => add('error', null, 'tabs', (m.label || m.id) + ' 已录入小局，本场胜负的变化会改变它的对阵；请先清空 ' + m.id + ' 的小局'));
        form.games.forEach((g, gi) => {
            const label = '第 ' + (gi + 1) + ' 局', gk = 'g' + gi;
            if (series.decidedAt >= 0 && gi > series.decidedAt) add('error', gi, gk + '.remove', label + '：系列赛已在第 ' + (series.decidedAt + 1) + ' 局决出胜负，请删除多余小局');
            const length = g.length.trim();
            if (!length) add('warn', gi, gk + '.length', label + '：未填写比赛时长');
            else if (!LENGTH_RE.test(length)) add('error', gi, gk + '.length', label + '：时长格式应为 分:秒，如 16:32');
            if (!g.winner) add('error', gi, gk + '.winner', label + '：未选择获胜战队', true);
            if (gi > 0) form.teams.forEach(t => { if (g.lineup[t]) lineupIssues(g.lineup[t], t, gk + '.lineup', gi, label + ' ' + t + ' 阵容'); });
            const used = new Map();
            form.teams.forEach(t => g.sides[t].bans.forEach((b, i) => {
                const key = gk + '.' + t + '.ban.' + i, name = label + ' ' + t + ' 禁用 ' + (i + 1);
                if (b.slug === undefined) return add('error', gi, key, name + '：未填写（该顺位没有禁用请选「空 Ban」）', true);
                if (b.slug === null) return;
                if (!champ(b.slug)) return add('error', gi, key, name + '：未知英雄 ' + b.slug);
                if (used.has(b.slug)) add('error', gi, key, name + '：' + champName(b.slug) + '与' + used.get(b.slug) + '重复');
                else used.set(b.slug, t + ' 禁用 ' + (i + 1));
                if (lockedBy.has(b.slug)) add('warn', gi, key, name + '：' + champName(b.slug) + '已在第 ' + (lockedBy.get(b.slug) + 1) + ' 局被选用，无畏征召下通常无法再禁用');
                if (!WR.championAvailable(b.slug, patch)) add('warn', gi, key, name + '：' + champName(b.slug) + '在 ' + patch + ' 尚未开放');
                if (!b.roles.length && (g.ordered || g.sides[t].hadBanRoles)) add('warn', gi, key, name + '：' + champName(b.slug) + '未标注禁用分路');
            }));
            form.teams.forEach(t => {
                const sf = g.sides[t], lineup = ls[gi][t], roleAt = {}, opAt = {};
                const members = Object.values(lineup);
                sf.picks.forEach((p, i) => {
                    const key = gk + '.' + t + '.pick.' + i, name = label + ' ' + t + ' 选用 ' + (i + 1);
                    if (!p.slug) add('error', gi, key, name + '：未填写英雄', true);
                    else if (!champ(p.slug)) add('error', gi, key, name + '：未知英雄 ' + p.slug);
                    else {
                        if (used.has(p.slug)) add('error', gi, key, name + '：' + champName(p.slug) + '与' + used.get(p.slug) + '冲突');
                        else used.set(p.slug, t + ' 选用 ' + (i + 1));
                        if (lockedBy.has(p.slug)) add('error', gi, key, name + '：' + champName(p.slug) + '已在第 ' + (lockedBy.get(p.slug) + 1) + ' 局选用（双边无畏征召）');
                        if (!WR.championAvailable(p.slug, patch)) add('warn', gi, key, name + '：' + champName(p.slug) + '在 ' + patch + ' 尚未开放');
                    }
                    if (!p.role) add('error', gi, key, name + '：未选择分路', true);
                    else if (roleAt[p.role] != null) add('error', gi, key, name + '：' + ROLE_NAMES[p.role] + '与选用 ' + (roleAt[p.role] + 1) + ' 重复，每个分路只能一次');
                    else roleAt[p.role] = i;
                    const op = p.player || (p.role ? lineup[p.role] : null);
                    if (p.player && !members.includes(p.player)) add('error', gi, 'op.' + key, name + '：操作者 ' + playerName(p.player) + ' 不在本局阵容');
                    else if (op && opAt[op] != null) add('error', gi, 'op.' + key, name + '：' + playerName(op) + '已操作选用 ' + (opAt[op] + 1) + '，换线时请改操作者');
                    else if (op) opAt[op] = i;
                });
                STAT_FIELDS.forEach(f => {
                    const raw = String(sf.stats[f.key] || '').trim();
                    if (!raw) return;
                    const value = parseStat(f, raw), key = gk + '.' + t + '.stat.' + f.key;
                    if (value == null) add('error', gi, key, label + ' ' + t + ' ' + f.label + '：应为非负整数');
                    else if (f.max != null && value > f.max) add('error', gi, key, label + ' ' + t + ' ' + f.label + '：最多 ' + f.max);
                });
            });
            form.teams.forEach(t => g.sides[t].picks.forEach(p => { if (p.slug && !lockedBy.has(p.slug)) lockedBy.set(p.slug, gi); }));
            if (!g.mvp) add('warn', gi, gk + '.mvp', label + '：未选择 MVP');
            else if (g.winner && !operators(g.sides[g.winner], ls[gi][g.winner]).includes(g.mvp)) add('error', gi, gk + '.mvp', label + '：MVP 不是胜方本局出场选手');
        });
        const bestOf = match.bestOf || 3;
        if (form.games.length > bestOf) add('error', null, 'tabs', '小局数超过 BO' + bestOf);
        if (!form.games.length) add('warn', null, 'tabs', '没有小局：保存后该场将恢复为未录入');
        else if (series.decidedAt < 0 && form.games.every(g => g.winner)) {
            add('warn', null, 'tabs', '系列赛尚未决出胜者（' + form.teams.map(t => series.wins[t]).join('–') + '），保存后显示为进行中');
        }
        return out;
    }

    // ---------- rendering helpers ----------
    function toast(text, kind) {
        const el = document.getElementById('toast');
        el.textContent = text;
        el.className = 'toast ' + (kind || '');
        el.hidden = false;
        clearTimeout(toast.timer);
        toast.timer = setTimeout(() => { el.hidden = true; }, kind === 'error' ? 7000 : 4000);
    }

    function setConnection(ok, text) {
        const el = document.getElementById('connection');
        el.textContent = text;
        el.className = 'connection ' + (ok ? 'ok' : 'bad');
    }

    function connectionText() {
        const games = S.league.rounds.reduce((n, r) => n + r.matches.reduce((k, m) => k + (m.games || []).length, 0), 0);
        return '已连接本地数据 · ' + games + ' 小局 · ' + S.players.length + ' 名选手';
    }

    function setTabs(view) {
        document.querySelectorAll('#admin-tabs a').forEach(a => a.classList.toggle('active', a.dataset.view === view));
    }

    function champIcon(slug, cls) {
        const c = champ(slug);
        return c ? '<img class="champ-icon ' + (cls || '') + '" src="' + esc(c.icon) + '" alt="">' : '<span class="champ-icon placeholder ' + (cls || '') + '"></span>';
    }

    function draftOf(id) {
        try { return JSON.parse(localStorage.getItem(DRAFT_PREFIX + id) || 'null'); } catch (_) { return null; }
    }

    function dropDraft(id) {
        try { localStorage.removeItem(DRAFT_PREFIX + id); } catch (_) { /* storage unavailable */ }
    }

    const isDirty = () => !!S.form && JSON.stringify(S.form) !== S.baseline;

    function storeDraft() {
        clearTimeout(storeDraft.timer);
        if (!S.form) return;
        try {
            if (isDirty()) localStorage.setItem(DRAFT_PREFIX + S.form.matchId, JSON.stringify({ at: Date.now(), form: S.form }));
            else localStorage.removeItem(DRAFT_PREFIX + S.form.matchId);
        } catch (_) { /* storage unavailable: drafts are a convenience only */ }
    }
    function scheduleDraft() { clearTimeout(storeDraft.timer); storeDraft.timer = setTimeout(storeDraft, 400); }

    // ---------- list views ----------
    const reloadButton = () => '<button type="button" class="btn reload-btn" data-action="reload" title="外部修改过 data 文件后使用">重新读取文件</button>';

    function matchBadges(match) {
        const games = match.games || [];
        let legacy = 0, banTotal = 0, banTagged = 0, statGames = 0;
        games.forEach(g => {
            if ([g.team1, g.team2].some(s => s && s.pickOrder === 'legacy-role')) legacy++;
            [g.team1, g.team2].forEach(s => (s.bans || []).forEach((b, i) => {
                if (!b) return;
                banTotal++;
                if (Array.isArray(s.banRoles) && s.banRoles[i] && (!Array.isArray(s.banRoles[i]) || s.banRoles[i].length)) banTagged++;
            }));
            if (g.team1.stats || g.team2.stats) statGames++;
        });
        return { legacy, banTotal, banTagged, statGames, games: games.length };
    }

    function matchItem(round, match, mode) {
        const s = dataSeries(match), b = matchBadges(match), draft = draftOf(match.id);
        let badges = '';
        if (mode === 'new') badges += s.played ? '<span class="badge warn">进行中 ' + s.w1 + '–' + s.w2 + '</span>' : '<span class="badge">待录入</span>';
        else {
            if (b.legacy) badges += '<span class="badge warn">BP 顺序待确认 ' + b.legacy + ' 局</span>';
            if (b.banTagged < b.banTotal) badges += '<span class="badge">禁用分路 ' + b.banTagged + '/' + b.banTotal + '</span>';
            badges += '<span class="badge' + (b.statGames === b.games ? ' ok' : '') + '">可选数据 ' + b.statGames + '/' + b.games + ' 局</span>';
        }
        if (draft) badges += '<span class="badge draft">有未保存草稿</span>';
        const score = s.played ? '<b>' + s.w1 + ' : ' + s.w2 + '</b>' : '<span class="muted">vs</span>';
        const ready = teamsKnown(match);
        if (!ready) badges = '<span class="badge">对阵待定 · 录入半决赛后自动确定</span>';
        const side = (k, cls) => '<span class="mi-team' + cls + (match['opponent' + k] ? '' : ' tbd') + '">' + (k === 1 ? esc(opponentName(match, 1)) + teamLogo(match.opponent1) : teamLogo(match.opponent2) + esc(opponentName(match, 2))) + '</span>';
        return (ready ? '<a class="match-item" href="admin/#edit/' + esc(match.id) + '">' : '<div class="match-item disabled">') +
            '<span class="mi-id">' + esc(match.id) + (match.label ? '<small>' + esc(match.label) + '</small>' : '') + '</span><span class="mi-date">' + esc((match.date || '').slice(5)) +
            (match.bestOf && match.bestOf !== 3 ? '<small>BO' + match.bestOf + '</small>' : '') + '</span>' +
            '<span class="mi-teams">' + side(1, ' right' + (s.decided && s.w1 > s.w2 ? ' win' : '')) +
            '<span class="mi-score">' + score + '</span>' + side(2, s.decided && s.w2 > s.w1 ? ' win' : '') + '</span>' +
            '<span class="mi-badges">' + badges + '</span>' + (ready ? '</a>' : '</div>');
    }

    function renderList(mode) {
        const filters = { all: '全部', legacy: 'BP 顺序待确认', bans: '禁用分路未补全', stats: '缺可选数据' };
        const keep = (match) => {
            const s = dataSeries(match);
            if (mode === 'new') return !s.decided;
            if (!s.played) return false;
            const b = matchBadges(match);
            return S.filter === 'legacy' ? b.legacy > 0 : S.filter === 'bans' ? b.banTagged < b.banTotal : S.filter === 'stats' ? b.statGames < b.games : true;
        };
        let html = reloadButton() + '<div class="page-title"><h1>' + (mode === 'new' ? '录入赛果' : '修改过往比赛') + '</h1><div class="sub">' +
            (mode === 'new' ? '列出尚未决出胜负的比赛。选择一场后依次填写首发、BP 与赛果。'
                : '已录入的比赛均可修改：调整 BP 实际顺位、补充禁用分路及可选数据。第 5 周及以前的选用为按位置排列的旧记录。') +
            '</div></div>';
        if (mode === 'past') {
            html += '<div class="filter-row">' + Object.entries(filters).map(([k, label]) =>
                '<button type="button" class="btn' + (S.filter === k ? ' accent' : '') + '" data-action="filter" data-filter="' + k + '" aria-pressed="' + (S.filter === k) + '">' + label + '</button>').join('') + '</div>';
        }
        let count = 0;
        S.league.rounds.forEach(round => {
            const matches = round.matches.filter(keep);
            if (!matches.length) return;
            count += matches.length;
            html += '<section class="panel"><div class="panel-title"><span>' + esc(round.title || round.id) + '</span><span class="muted">版本 ' + esc(round.patch || '待定（录入比赛时填写）') +
                (round.completed ? ' · 已完赛' : '') + '</span></div><div class="match-list">' + matches.map(m => matchItem(round, m, mode)).join('') + '</div></section>';
        });
        if (!count) html += '<div class="notice">' + (mode === 'new' ? '所有已排赛程均已录入。' : '没有符合条件的比赛。') + '</div>';
        app.innerHTML = html;
    }

    // ---------- editor ----------
    function lineupSelect(teamId, role, value, key, attr) {
        const roster = S.players.filter(p => p.teamId === teamId);
        const sorted = roster.filter(p => p.role === role).concat(roster.filter(p => p.role !== role));
        return '<select ' + attr + ' data-k="' + key + '" data-focus-key="' + key + '" data-team="' + teamId + '" data-role="' + role + '">' +
            '<option value="">— 选择 —</option>' + sorted.map(p => '<option value="' + esc(p.id) + '"' + (p.id === value ? ' selected' : '') + '>' +
                esc(p.name) + (p.role !== role ? '（' + ROLE_NAMES[p.role] + '）' : '') + '</option>').join('') +
            '<option value="__new__">＋ 新增选手…</option></select>';
    }

    function lineupGrid(teamId, lineup, prefix, attr) {
        return '<div class="lineup-rows">' + ROLES.map(r => '<label class="lineup-row"><span>' + ROLE_NAMES[r] + '</span>' +
            lineupSelect(teamId, r, lineup[r], prefix + '.' + teamId + '.' + r, attr) + '</label>').join('') + '</div>';
    }

    function startersHtml(f) {
        return '<section class="panel"><div class="panel-title"><span>首发阵容 · 第 1 局</span><span class="muted">按上、野、中、下、辅选择；后续小局默认沿用，换人在对应小局调整</span></div>' +
            '<div class="panel-body lineup-grid">' + f.teams.map(t => '<div class="lineup-card"><div class="lineup-team">' + teamLogo(t) + '<b>' + esc(team(t).name) + '</b></div>' +
                lineupGrid(t, f.start[t], 'start', 'data-lineup="start"') + '</div>').join('') + '</div></section>';
    }

    function gameTabsHtml(f) {
        const series = formSeries(f), bestOf = currentMatch().bestOf || 3;
        let html = '<div class="game-tabs" data-k="tabs">';
        f.games.forEach((g, gi) => {
            const errors = S.issues.some(x => x.gi === gi && loud(x));
            html += '<button type="button" class="game-tab' + (gi === S.game ? ' active' : '') + '" data-action="tab" data-gi="' + gi + '" data-tab-gi="' + gi + '">' +
                '第 ' + (gi + 1) + ' 局<small>' + (g.winner ? esc(g.winner) + ' 胜' : '未完成') + '</small><i class="tab-dot' + (errors ? ' on' : '') + '"></i></button>';
        });
        if (f.games.length < bestOf && series.decidedAt < 0) html += '<button type="button" class="game-tab add" data-action="add-game">＋ 第 ' + (f.games.length + 1) + ' 局</button>';
        return html + '<span class="series-score">' + f.teams.map(t => esc(t) + ' ' + series.wins[t]).join(' : ') + '</span></div>';
    }

    function roleChips(slot, active, mode, disabled) {
        return '<span class="role-chips' + (mode === 'multi' ? ' multi' : '') + '" role="group" aria-label="' + (mode === 'multi' ? '禁用分路（可多选）' : '分路') + '">' +
            ROLES.map(r => '<button type="button" class="chip' + (active.includes(r) ? ' on' : '') + '" data-action="' + (mode === 'multi' ? 'ban-role' : 'pick-role') +
                '" data-slot="' + slot + '" data-role="' + r + '" data-focus-key="' + slot + '.' + r + '" aria-pressed="' + active.includes(r) + '" title="' + ROLE_NAMES[r] + '"' +
                (disabled ? ' disabled' : '') + '>' + ROLE_SHORT[r] + '</button>').join('') + '</span>';
    }

    function champField(slot, slug, placeholder) {
        const text = slug === null ? '空 Ban' : slug ? champName(slug) : '';
        return '<div class="champ-field">' + (slug === null ? '<span class="champ-icon placeholder empty-ban">—</span>' : champIcon(slug)) +
            '<input class="champ-input" data-slot="' + slot + '" data-focus-key="' + slot + '" value="' + esc(text) + '" placeholder="' + placeholder +
            '" autocomplete="off" spellcheck="false" aria-label="' + placeholder + '">' +
            (slug !== undefined ? '<button type="button" class="slot-clear" data-action="clear-slot" data-slot="' + slot + '" tabindex="-1" aria-label="清空">×</button>' : '') + '</div>';
    }

    function moveButtons(slot, idx) {
        return '<span class="row-move"><button type="button" data-action="move" data-slot="' + slot + '" data-dir="-1" tabindex="-1"' + (idx === 0 ? ' disabled' : '') + ' aria-label="上移">↑</button>' +
            '<button type="button" data-action="move" data-slot="' + slot + '" data-dir="1" tabindex="-1"' + (idx === 4 ? ' disabled' : '') + ' aria-label="下移">↓</button></span>';
    }

    // Suggest a lane-swap operator only when this team repeatedly played this hero in this lane with someone else.
    function operatorHint(teamId, slug, role, auto, lineup) {
        const history = S.opHistory[teamId + '|' + slug + '|' + role];
        if (!history || !auto) return null;
        const members = Object.values(lineup);
        const best = Object.entries(history).filter(([id]) => members.includes(id)).sort((a, b) => b[1] - a[1])[0];
        return best && best[0] !== auto && best[1] >= 2 && best[1] > (history[auto] || 0) ? { id: best[0], count: best[1] } : null;
    }

    function sideHtml(f, g, gi, teamId, ls) {
        const sf = g.sides[teamId], lineup = ls[gi][teamId], blue = g.blue === teamId, prefix = 'g' + gi + '.' + teamId;
        const members = ROLES.map(r => lineup[r]).filter(Boolean);
        let html = '<div class="bp-side ' + (blue ? 'blue' : 'red') + '"><div class="bp-side-head">' + teamLogo(teamId) + '<b>' + esc(team(teamId).name) + '</b><span>' +
            (blue ? '蓝方' : '红方') + '</span>' + (g.winner ? '<em class="' + (g.winner === teamId ? 'win' : 'lose') + '">' + (g.winner === teamId ? '胜' : '负') + '</em>' : '') + '</div>';
        html += '<div class="bp-label">禁用 · 按队内顺位 <small>分路可多选，最多 3 个</small></div>';
        sf.bans.forEach((b, i) => {
            const slot = prefix + '.ban.' + i;
            html += '<div class="bp-row ban" data-k="' + slot + '"><span class="slot-no">' + (i + 1) + '</span>' + champField(slot, b.slug, '禁用 ' + (i + 1)) +
                roleChips(slot, b.roles, 'multi', !b.slug) + moveButtons(slot, i) + '</div>';
        });
        html += '<div class="bp-label">选用 · ' + (g.ordered ? '按队内选取顺序' : '旧记录按位置排列') + ' <small>操作者默认取本局阵容中该分路的选手</small></div>';
        sf.picks.forEach((p, i) => {
            const slot = prefix + '.pick.' + i, auto = p.role ? lineup[p.role] : null, hint = !p.player && p.slug ? operatorHint(teamId, p.slug, p.role, auto, lineup) : null;
            html += '<div class="bp-row pick" data-k="' + slot + '"><span class="slot-no">' + (i + 1) + '</span>' + champField(slot, p.slug, '选用 ' + (i + 1)) +
                roleChips(slot, p.role ? [p.role] : [], 'single') +
                '<select class="op-select' + (p.player ? ' manual' : '') + '" data-op="' + slot + '" data-k="op.' + slot + '" data-focus-key="op.' + slot + '" aria-label="操作者">' +
                '<option value="">' + (auto ? '自动 · ' + esc(playerName(auto)) : '先选分路') + '</option>' +
                members.map(id => '<option value="' + esc(id) + '"' + (p.player === id ? ' selected' : '') + '>' + esc(playerName(id)) + '</option>').join('') + '</select>' +
                moveButtons(slot, i) +
                (hint ? '<button type="button" class="op-hint" data-action="op-hint" data-slot="' + slot + '" data-player="' + esc(hint.id) + '">历史由 ' + esc(playerName(hint.id)) + ' 使用 ' + hint.count + ' 次 · 改为 ' + esc(playerName(hint.id)) + '</button>' : '') +
                '</div>';
        });
        return html + '</div>';
    }

    function statsHtml(f, g, gi) {
        const filled = f.teams.some(t => STAT_FIELDS.some(x => String(g.sides[t].stats[x.key] || '').trim()));
        let html = '<details class="extra-stats"' + (filled || S.statsOpen ? ' open' : '') + '><summary data-action="stats-toggle">可选数据 · 战队总 K/D/A、经济、推塔与资源 <small>留空表示暂无数据</small></summary>' +
            '<div class="table-responsive"><table class="stats-table"><thead><tr><th></th>' + STAT_FIELDS.map(x => '<th>' + x.label + (x.max != null ? '<small>≤' + x.max + '</small>' : '') + '</th>').join('') + '</tr></thead><tbody>';
        f.teams.forEach(t => {
            html += '<tr><th>' + teamLogo(t) + esc(t) + '</th>' + STAT_FIELDS.map(x => {
                const key = 'g' + gi + '.' + t + '.stat.' + x.key;
                return '<td><input data-input="stat" data-slot="' + key + '" data-k="' + key + '" data-focus-key="' + key + '" value="' + esc(g.sides[t].stats[x.key]) +
                    '" inputmode="' + (x.key === 'gold' ? 'decimal' : 'numeric') + '" placeholder="' + (x.hint || '') + '" aria-label="' + esc(t + ' ' + x.label) + '"></td>';
            }).join('') + '</tr>';
        });
        return html + '</tbody></table></div></details>';
    }

    function gameHtml(f, gi, ls) {
        const g = f.games[gi], gk = 'g' + gi, red = f.teams.find(t => t !== g.blue);
        let html = '<section class="panel game-panel"><div class="game-meta">';
        const meta = currentMatch(), ranks = S.league.rounds[f.ri].seeds || {};
        const chooser = gi === 0 && meta.stage === 'semifinal' && ranks[f.teams[0]] && ranks[f.teams[1]] ? f.teams.slice().sort((a, b) => ranks[a] - ranks[b])[0] : null;
        html += '<div class="field"><span class="label">红蓝方</span><span class="side-pill blue">蓝 ' + esc(g.blue) + '</span>' +
            '<button type="button" class="btn" data-action="swap-sides" data-focus-key="' + gk + '.swap">⇄ 交换</button><span class="side-pill red">红 ' + esc(red) + '</span>' +
            (chooser ? '<span class="muted side-note">第一局由排名上位的 ' + esc(chooser) + ' 选边</span>' : '') + '</div>';
        html += '<label class="field"><span class="label">时长</span><input class="length-input" data-input="length" data-k="' + gk + '.length" data-focus-key="' + gk + '.length" value="' + esc(g.length) +
            '" placeholder="16:32" inputmode="numeric" autocomplete="off"></label>';
        html += '<div class="field" data-k="' + gk + '.winner"><span class="label">胜者</span>' + f.teams.map(t => '<button type="button" class="winner-btn' + (g.winner === t ? ' on' : '') +
            '" data-action="winner" data-team="' + t + '" data-focus-key="' + gk + '.winner.' + t + '" aria-pressed="' + (g.winner === t) + '">' + teamLogo(t) + esc(t) + '</button>').join('') + '</div>';
        const winOps = g.winner ? operators(g.sides[g.winner], ls[gi][g.winner]) : [];
        html += '<label class="field"><span class="label">MVP</span><select data-mvp data-k="' + gk + '.mvp" data-focus-key="' + gk + '.mvp"' + (g.winner ? '' : ' disabled') + '>' +
            '<option value="">' + (g.winner ? '— 选择胜方选手 —' : '先选择胜者') + '</option>' +
            winOps.map((id, i) => id ? '<option value="' + esc(id) + '"' + (g.mvp === id ? ' selected' : '') + '>' + esc(playerName(id)) +
                (g.sides[g.winner].picks[i].slug ? ' · ' + esc(champName(g.sides[g.winner].picks[i].slug)) : '') + '</option>' : '').join('') +
            (g.mvp && !winOps.includes(g.mvp) ? '<option value="' + esc(g.mvp) + '" selected>' + esc(playerName(g.mvp)) + '（不在胜方阵容）</option>' : '') + '</select></label>';
        html += '<div class="field push"><button type="button" class="btn danger" data-action="remove-game" data-k="' + gk + '.remove">删除第 ' + (gi + 1) + ' 局</button></div></div>';
        if (g.legacy) {
            html += '<div class="notice warn legacy-note">这是第 5 周及以前的旧记录：选用按上、野、中、下、辅排列，不是实际顺位，禁用分路也未记录。可用 ↑↓ 调整为实际顺序并补全禁用分路，确认后勾选：' +
                '<label class="inline-check"><input type="checkbox" data-action="ordered" data-focus-key="' + gk + '.ordered"' + (g.ordered ? ' checked' : '') + '> 本局双方均已按实际 BP 顺序录入</label></div>';
        }
        if (gi > 0) {
            html += '<div class="game-lineups">' + f.teams.map(t => {
                const subs = substitutions(ls[gi - 1][t], ls[gi][t], t);
                const subText = subs.length ? '<span class="subs">换人：' + subs.map(s => ROLE_NAMES[s.role] + ' ' + esc(playerName(s.out)) + ' → ' + esc(playerName(s.in))).join('，') + '</span>' : '';
                if (!g.lineup[t]) return '<div class="game-lineup"><b>' + esc(t) + '</b> 阵容沿用第 ' + gi + ' 局：' + ROLES.map(r => esc(playerName(ls[gi][t][r]))).join(' / ') +
                    ' <button type="button" class="btn" data-action="lineup-edit" data-team="' + t + '" data-focus-key="' + gk + '.lineup-edit.' + t + '">换人 / 调整</button></div>';
                return '<div class="game-lineup open"><div><b>' + esc(t) + '</b> 第 ' + (gi + 1) + ' 局阵容 ' + subText +
                    ' <button type="button" class="btn" data-action="lineup-reset" data-team="' + t + '">恢复沿用</button></div>' + lineupGrid(t, g.lineup[t], gk + '.lineup', 'data-lineup="' + gi + '"') + '</div>';
            }).join('') + '</div>';
        }
        html += '<div class="bp-grid">' + sideHtml(f, g, gi, g.blue, ls) + sideHtml(f, g, gi, red, ls) + '</div>';
        html += statsHtml(f, g, gi);
        html += '<label class="notes-field"><span class="label">备注（可选，每行一条，会显示在赛程页该局下方）</span><textarea data-input="notes" data-focus-key="' + gk + '.notes" rows="2">' + esc(g.notes) + '</textarea></label>';
        return html + '</section>';
    }

    // Unfilled fields stay quiet (one summary line) until the first save attempt; conflicts always show.
    const loud = x => x.level === 'error' && (!x.missing || S.showMissing);

    function issuesHtml(issues) {
        const errors = issues.filter(loud), missing = issues.filter(x => x.level === 'error' && !loud(x)), warns = issues.filter(x => x.level === 'warn');
        if (!issues.length) return '<div class="issues ok">校验通过，可以保存。</div>';
        const item = (x, text) => '<li class="' + (loud(x) ? 'error' : 'warn') + '"><button type="button" data-action="goto" data-gi="' + (x.gi == null ? '' : x.gi) + '" data-key="' + esc(x.key) + '">' + esc(text || x.text) + '</button></li>';
        return '<div class="issues' + (errors.length ? '' : ' quiet') + '"><div class="issues-head">' +
            (errors.length ? '<b class="err">' + errors.length + ' 个错误</b>（修正后才能保存）' : missing.length ? '<b>还有 ' + missing.length + ' 项待填写</b>' : '<b>没有错误</b>') +
            (errors.length && missing.length ? ' · 另有 ' + missing.length + ' 项待填写' : '') +
            (warns.length ? ' · <b class="warn">' + warns.length + ' 个提醒</b>（不影响保存）' : '') + '</div><ul>' +
            errors.map(x => item(x)).join('') + (missing.length ? item(missing[0], '待填写 ' + missing.length + ' 项，首项：' + missing[0].text) : '') +
            warns.map(x => item(x)).join('') + '</ul></div>';
    }

    function markIssues() {
        app.querySelectorAll('.has-error, .has-warn').forEach(el => el.classList.remove('has-error', 'has-warn'));
        S.issues.forEach(x => {
            if (x.level === 'error' && !loud(x)) return;
            const el = app.querySelector('[data-k="' + CSS.escape(x.key) + '"]');
            if (el && !el.classList.contains('has-error')) { el.classList.remove('has-warn'); el.classList.add(x.level === 'error' ? 'has-error' : 'has-warn'); }
        });
        app.querySelectorAll('[data-tab-gi]').forEach(tab => {
            const dot = tab.querySelector('.tab-dot');
            if (dot) dot.classList.toggle('on', S.issues.some(x => loud(x) && String(x.gi) === tab.dataset.tabGi));
        });
        const dirty = app.querySelector('.dirty-flag');
        if (dirty) dirty.hidden = !isDirty();
    }

    function renderEditor() {
        const f = S.form, round = S.league.rounds[f.ri], match = round.matches[f.mi];
        S.game = Math.max(0, Math.min(S.game, f.games.length - 1));
        S.issues = validate(f);
        S.champOrder = championOrder(WR.majorPatch(currentPatch()));
        const ls = lineups(f);
        const seeds = round.seeds || {};
        let html = '<div class="editor"><div class="editor-head"><a class="btn" href="admin/#' + S.from + '">← 返回列表</a><div class="editor-title"><h1>' + esc(match.id) + ' · ' +
            esc(match.opponent1) + ' vs ' + esc(match.opponent2) + (match.label ? ' <small>' + esc(match.label) + '</small>' : '') + '</h1><div class="sub">' + esc(match.date || '') + ' · BO' + (match.bestOf || 3) +
            ' · 版本 ' + esc(currentPatch() || '待定') + ' · ' + esc(round.title || '') +
            (seeds[match.opponent1] && seeds[match.opponent2] ? ' · 小组赛排名 ' + esc(match.opponent1) + ' #' + seeds[match.opponent1] + ' / ' + esc(match.opponent2) + ' #' + seeds[match.opponent2] : '') + '</div></div>' +
            '<div class="editor-actions"><span class="dirty-flag" hidden>未保存</span><button type="button" class="btn accent big" data-action="save"' + (S.saving ? ' disabled' : '') + '>' + (S.saving ? '保存中…' : '保存本场') + '</button></div></div>';
        if (S.draftOffer) {
            html += '<div class="notice info draft-offer">发现 ' + new Date(S.draftOffer.at).toLocaleString('zh-CN') + ' 的未保存草稿。' +
                '<button type="button" class="btn accent" data-action="draft-restore">恢复草稿</button><button type="button" class="btn" data-action="draft-drop">丢弃</button></div>';
        }
        if (S.conflict) {
            html += '<div class="notice warn draft-offer">data/schedule.js 在本页打开后被修改过（例如另一个标签页或手动编辑）。' +
                '<button type="button" class="btn accent" data-action="rebase">重新读取文件并保留本场修改</button></div>';
        }
        html += '<div id="issues">' + issuesHtml(S.issues) + '</div>';
        if (patchEditable(round, match)) {
            html += '<section class="panel patch-panel"><div class="panel-body"><label class="field"><span class="label">比赛版本</span>' +
                '<input class="patch-input" data-input="patch" data-k="patch" data-focus-key="patch" list="patch-options" value="' + esc(f.patch || '') + '" placeholder="如 7.3a" autocomplete="off" spellcheck="false"></label>' +
                '<datalist id="patch-options">' + knownPatches().reverse().map(id => '<option value="' + esc(id) + '">').join('') + '</datalist>' +
                '<span class="muted">' + (round.patch ? '本轮版本为 ' + esc(round.patch) + '；填写不同的值只改这一场。' : '本轮版本尚未确定：这里填写后会作为整轮（季后赛）的版本，之后的比赛自动沿用，个别场次不同可再单独改。') +
                ' 统计按该值归入大版本（如 7.3）与小版本。</span></div></section>';
        }
        html += startersHtml(f) + gameTabsHtml(f);
        html += f.games.length ? gameHtml(f, S.game, ls) : '<div class="notice">没有小局。点击“＋ 第 1 局”开始录入，或直接保存以清空该场赛果。</div>';
        app.innerHTML = html + '<p class="kbd-help">快捷键：英雄框内输入中文 / 英文 / 拼音 / 昵称，↑↓ 选择，Enter 或 Tab 确认并跳到下一格；⌘S / Ctrl+S 保存。</p></div>';
        markIssues();
    }

    function rerender(opts) {
        opts = opts || {};
        const active = document.activeElement;
        const key = opts.focus !== undefined ? opts.focus : active && active.dataset ? active.dataset.focusKey : null;
        let selection = null;
        if (opts.focus === undefined && active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') && active.type !== 'checkbox') {
            selection = [active.selectionStart, active.selectionEnd];
        }
        const y = window.scrollY;
        closePicker(true);
        renderEditor();
        window.scrollTo(0, y);
        if (key) {
            const el = app.querySelector('[data-focus-key="' + CSS.escape(key) + '"]');
            if (el) {
                el.focus({ preventScroll: opts.focus === undefined });
                if (selection && el.setSelectionRange) { try { el.setSelectionRange(selection[0], selection[1]); } catch (_) { /* not a text field */ } }
            }
        }
        scheduleDraft();
    }

    function refreshStatus() {
        S.issues = validate(S.form);
        const box = document.getElementById('issues');
        if (box) box.innerHTML = issuesHtml(S.issues);
        markIssues();
        scheduleDraft();
    }

    // ---------- editor actions ----------
    function parseSlot(slot) {
        const [g, teamId, kind, idx] = slot.split('.');
        return { gi: Number(g.slice(1)), teamId, kind, idx: Number(idx) };
    }

    function slotState(slot) {
        const s = parseSlot(slot), side = S.form.games[s.gi].sides[s.teamId];
        return Object.assign(s, { side, item: s.kind === 'ban' ? side.bans[s.idx] : s.kind === 'pick' ? side.picks[s.idx] : null });
    }

    function suggestRole(slug, side, idx) {
        const taken = new Set(side.picks.filter((p, i) => i !== idx && p.role).map(p => p.role)), freq = S.roleFreq[slug] || {};
        return ROLES.filter(r => !taken.has(r) && freq[r] > 0).sort((a, b) => freq[b] - freq[a])[0] || null;
    }

    function setSlot(slot, slug) {
        const s = slotState(slot);
        s.item.slug = slug;
        if (s.kind === 'ban' && !slug) s.item.roles = [];
        if (s.kind === 'pick' && slug && !s.item.role) s.item.role = suggestRole(slug, s.side, s.idx);
    }

    function slotOrder(gi) {
        const g = S.form.games[gi], red = S.form.teams.find(t => t !== g.blue);
        return [g.blue, red].flatMap(t => ['ban', 'pick'].flatMap(kind => range5().map(i => 'g' + gi + '.' + t + '.' + kind + '.' + i)));
    }

    function nextSlot(slot) {
        const order = slotOrder(parseSlot(slot).gi), i = order.indexOf(slot);
        return i >= 0 && i < order.length - 1 ? order[i + 1] : null;
    }

    function addGame() {
        const f = S.form, prev = f.games[f.games.length - 1];
        // Default side: game 1 opponent1 on blue; afterwards the previous loser takes blue (most common in recorded games).
        const blue = !prev ? f.teams[0] : prev.winner ? f.teams.find(t => t !== prev.winner) : f.teams.find(t => t !== prev.blue);
        f.games.push(newGameForm(f.teams, blue));
        S.game = f.games.length - 1;
    }

    function removeGame(gi) {
        // The following game keeps the lineup it actually had, even if it inherited it from the removed game.
        const f = S.form, ls = lineups(f), next = f.games[gi + 1];
        if (next && gi === 0) f.start = clone(ls[1]);
        else if (next) f.teams.forEach(t => { next.lineup[t] = clone(ls[gi + 1][t]); });
        f.games.splice(gi, 1);
    }

    function setLineup(scope, teamId, role, id) {
        const f = S.form, target = scope === 'start' ? f.start[teamId] : f.games[Number(scope)].lineup[teamId];
        target[role] = id || null;
        pruneOperators(teamId);
    }

    function pruneOperators(teamId) {
        // Explicit operators who left the lineup fall back to the automatic lane owner.
        const ls = lineups(S.form);
        S.form.games.forEach((g, gi) => g.sides[teamId].picks.forEach(p => { if (p.player && !Object.values(ls[gi][teamId]).includes(p.player)) p.player = null; }));
    }

    async function saveForm() {
        if (S.saving) return;
        S.issues = validate(S.form);
        const errors = S.issues.filter(x => x.level === 'error');
        if (errors.length) {
            S.showMissing = true;
            rerender();
            toast('还有 ' + errors.length + ' 个错误，修正后才能保存。', 'error');
            document.getElementById('issues').scrollIntoView({ block: 'center' });
            return;
        }
        const league = buildLeague(S.form), id = S.form.matchId;
        S.saving = true; rerender();
        try {
            const result = await api('api/save', { schedule: { value: league, hash: S.hashes.schedule } });
            S.league = league; S.hashes.schedule = result.schedule.hash; reindex();
            dropDraft(id);
            const keepGame = S.game;
            S.form = formFromMatch(S.form.ri, S.form.mi); S.baseline = JSON.stringify(S.form); S.game = keepGame; S.draftOffer = null;
            setConnection(true, connectionText());
            toast(result.schedule.changed ? '已保存 ' + id + ' 到 data/schedule.js（旧文件备份：' + result.schedule.backup + '）' : id + ' 没有变化。');
        } catch (error) {
            if (error.status === 409) S.conflict = true;
            toast('保存失败：' + error.message, 'error');
            storeDraft();
        } finally {
            S.saving = false;
            if (S.form && S.form.matchId === id) rerender();
        }
    }

    function openEditor(id) {
        const found = findMatch(id);
        if (!found) { toast('找不到比赛 ' + id, 'error'); location.hash = '#new'; return; }
        if (!teamsKnown(found.match)) { toast((found.match.label || id) + ' 的对阵尚未确定，录入半决赛后会自动填入。', 'error'); location.hash = '#new'; return; }
        if (!S.form || S.form.matchId !== id) {
            S.form = formFromMatch(found.ri, found.mi);
            S.baseline = JSON.stringify(S.form);
            S.game = 0;
            S.showMissing = false;
            S.conflict = false;
            S.from = dataSeries(found.match).decided ? 'past' : 'new';
            const draft = draftOf(id);
            S.draftOffer = draft && draft.form && draft.form.matchId === id && JSON.stringify(draft.form) !== S.baseline ? draft : null;
        }
        renderEditor();
        window.scrollTo(0, 0);
    }

    // ---------- champion picker ----------
    const menu = document.createElement('div');
    menu.className = 'champ-menu';
    menu.setAttribute('role', 'listbox');
    menu.hidden = true;
    document.body.appendChild(menu);
    let P = null;

    function blockedChampions(slot) {
        const s = parseSlot(slot), f = S.form, g = f.games[s.gi], map = new Map();
        f.teams.forEach(t => {
            const own = t === s.teamId ? '本方' : '对方';
            g.sides[t].bans.forEach((b, i) => { if (b.slug && !(t === s.teamId && s.kind === 'ban' && i === s.idx)) map.set(b.slug, own + '已禁用'); });
            g.sides[t].picks.forEach((p, i) => { if (p.slug && !(t === s.teamId && s.kind === 'pick' && i === s.idx)) map.set(p.slug, own + '已选用'); });
        });
        f.games.forEach((og, oi) => {
            if (oi === s.gi) return;
            f.teams.forEach(t => og.sides[t].picks.forEach(p => { if (p.slug && !map.has(p.slug)) map.set(p.slug, '第 ' + (oi + 1) + ' 局已选用'); }));
        });
        return map;
    }

    function pickerItems(slot, query) {
        const kind = parseSlot(slot).kind, blocked = blockedChampions(slot), patch = currentPatch(), term = norm(query);
        const items = searchChampions(query).map(slug => ({ slug, reason: blocked.get(slug) || (WR.championAvailable(slug, patch) ? '' : patch + ' 未开放') }));
        const sorted = items.filter(x => !x.reason).concat(items.filter(x => x.reason));
        if (kind === 'ban' && (!term || EMPTY_BAN_TERMS.some(x => x.startsWith(term)))) sorted.unshift({ slug: null, reason: '' });
        return sorted;
    }

    function drawPicker() {
        if (!P) return;
        menu.innerHTML = P.items.length ? P.items.map((it, i) => {
            const c = it.slug ? champ(it.slug) : null;
            return '<div class="champ-opt' + (i === P.active ? ' active' : '') + (it.reason ? ' blocked' : '') + '" data-i="' + i + '" role="option" aria-selected="' + (i === P.active) + '">' +
                (c ? champIcon(it.slug, 'sm') + '<b>' + esc(c.nameZh || c.name) + '</b><small>' + esc(c.name) + (c.titleZh ? ' · ' + esc(c.titleZh) : '') + '</small>'
                    : '<span class="champ-icon sm placeholder empty-ban">—</span><b>空 Ban</b><small>该顺位未禁用</small>') +
                (it.reason ? '<em>' + esc(it.reason) + '</em>' : '') + '</div>';
        }).join('') : '<div class="champ-none">没有匹配的英雄</div>';
        positionPicker();
        const active = menu.querySelector('.champ-opt.active');
        if (active && active.offsetTop < menu.scrollTop) menu.scrollTop = active.offsetTop;
        else if (active && active.offsetTop + active.offsetHeight > menu.scrollTop + menu.clientHeight) menu.scrollTop = active.offsetTop + active.offsetHeight - menu.clientHeight;
    }

    function positionPicker() {
        if (!P) return;
        const rect = P.input.getBoundingClientRect(), height = Math.min(360, window.innerHeight * 0.6);
        menu.hidden = false;
        menu.style.left = Math.max(4, Math.min(rect.left, window.innerWidth - 320)) + 'px';
        menu.style.minWidth = Math.max(rect.width, 280) + 'px';
        menu.style.maxHeight = height + 'px';
        const below = window.innerHeight - rect.bottom;
        menu.style.top = (below < height && rect.top > below ? Math.max(4, rect.top - Math.min(height, menu.scrollHeight) - 2) : rect.bottom + 2) + 'px';
    }

    function filterPicker(query) {
        P.items = pickerItems(P.slot, query);
        const firstChampion = P.items.findIndex(it => it.slug && !it.reason);
        P.active = EMPTY_BAN_TERMS.includes(norm(query)) && P.items[0] && P.items[0].slug === null ? 0 : Math.max(0, firstChampion);
        menu.scrollTop = 0;
        drawPicker();
    }

    function slotText(slot) {
        const slug = slotState(slot).item.slug;
        return slug === null ? '空 Ban' : slug ? champName(slug) : '';
    }

    function openPicker(input) {
        P = { input, slot: input.dataset.slot, items: [], active: 0, original: slotText(input.dataset.slot), fresh: true };
        filterPicker(input.value === P.original ? '' : input.value);
        if (input.value === P.original) input.select();
        setTimeout(() => { if (P && P.input === input && input.value === P.original) input.select(); }, 0);
    }

    function closePicker(silent) {
        if (P && !silent && P.input.isConnected) P.input.value = P.original;
        P = null;
        menu.hidden = true;
        menu.innerHTML = '';
    }

    function choose(index) {
        const it = P && P.items[index];
        if (!it) return;
        const slot = P.slot;
        closePicker(true);
        setSlot(slot, it.slug);
        rerender({ focus: nextSlot(slot) });
    }

    menu.addEventListener('mousedown', e => e.preventDefault());
    menu.addEventListener('click', e => { const opt = e.target.closest('.champ-opt'); if (opt) choose(Number(opt.dataset.i)); });
    window.addEventListener('resize', () => positionPicker());
    window.addEventListener('scroll', () => positionPicker(), true);

    app.addEventListener('focusin', e => { if (e.target.classList.contains('champ-input')) openPicker(e.target); });
    // Menu mousedown is cancelled, so focus only leaves the input when the user really moves on.
    app.addEventListener('focusout', e => {
        if (!e.target.classList.contains('champ-input') || !P || P.input !== e.target) return;
        const slot = P.slot, cleared = !e.target.value.trim() && !!P.original;
        closePicker(cleared);
        if (cleared) setTimeout(() => { setSlot(slot, undefined); rerender(); }, 0);
    });
    app.addEventListener('mouseup', e => {
        // Safari clears the select-all from focus on the first mouseup.
        if (P && P.input === e.target && P.fresh) { P.fresh = false; e.preventDefault(); }
    });
    app.addEventListener('keydown', e => {
        if (!e.target.classList.contains('champ-input') || !P) return;
        const typed = e.target.value !== P.original;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const n = P.items.length;
            if (n) { P.active = (P.active + (e.key === 'ArrowDown' ? 1 : n - 1)) % n; drawPicker(); }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (P.items.length) choose(P.active);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            closePicker(false);
            e.target.select();
        } else if (e.key === 'Tab' && !e.shiftKey && typed && e.target.value.trim() && P.items.length) {
            e.preventDefault();
            choose(P.active);
        }
    });
    app.addEventListener('input', e => {
        const el = e.target;
        if (el.classList.contains('champ-input')) {
            if (!P || P.input !== el) openPicker(el);
            else filterPicker(el.value);
            return;
        }
        if (!S.form || !el.dataset.input) return;
        const g = S.form.games[S.game];
        if (el.dataset.input === 'patch') { S.form.patch = el.value; refreshStatus(); return; }
        if (el.dataset.input === 'length') g.length = el.value;
        else if (el.dataset.input === 'notes') g.notes = el.value;
        else if (el.dataset.input === 'stat') {
            const parts = el.dataset.slot.split('.');
            S.form.games[Number(parts[0].slice(1))].sides[parts[1]].stats[parts[3]] = el.value;
        }
        refreshStatus();
    });
    app.addEventListener('blur', e => {
        // Accept "1632" / "16.32" for 16:32.
        const el = e.target;
        if (!S.form || el.dataset.input !== 'length') return;
        const raw = el.value.trim(), digits = raw.replace(/[^\d]/g, '');
        if (raw && !LENGTH_RE.test(raw) && /^\d{3,4}$/.test(digits) && /^[\d\s.:：,，]+$/.test(raw)) {
            el.value = digits.slice(0, -2) + ':' + digits.slice(-2);
            S.form.games[S.game].length = el.value;
            refreshStatus();
        }
    }, true);

    // ---------- clicks and selects ----------
    app.addEventListener('change', e => {
        const el = e.target;
        if (!S.form) return;
        if (el.dataset.lineup !== undefined) {
            if (el.value === '__new__') {
                el.value = (el.dataset.lineup === 'start' ? S.form.start : S.form.games[Number(el.dataset.lineup)].lineup)[el.dataset.team][el.dataset.role] || '';
                openPlayerDialog(el.dataset.team, el.dataset.role, id => { setLineup(el.dataset.lineup, el.dataset.team, el.dataset.role, id); rerender(); });
                return;
            }
            setLineup(el.dataset.lineup, el.dataset.team, el.dataset.role, el.value);
            rerender();
        } else if (el.dataset.mvp !== undefined) {
            S.form.games[S.game].mvp = el.value || null; rerender();
        } else if (el.dataset.op) {
            const s = slotState(el.dataset.op), lineup = lineups(S.form)[s.gi][s.teamId], auto = s.item.role ? lineup[s.item.role] : null;
            s.item.player = el.value && el.value !== auto ? el.value : null;
            rerender();
        } else if (el.dataset.action === 'ordered') {
            S.form.games[S.game].ordered = el.checked; rerender();
        }
    });

    app.addEventListener('click', e => {
        const el = e.target.closest('[data-action]');
        if (!el || el.disabled) return;
        const action = el.dataset.action, f = S.form;
        if (action === 'filter') { S.filter = el.dataset.filter; renderList('past'); return; }
        if (action === 'add-player') { addPlayerFromForm(); return; }
        if (action === 'delete-player') { deletePlayer(el.dataset.id); return; }
        if (action === 'reload') { reload(); return; }
        if (action === 'publish') { publishNow(); return; }
        if (action === 'publish-refresh') { renderPublish(); return; }
        if (!f) return;
        const g = f.games[S.game];
        switch (action) {
            case 'save': saveForm(); return;
            case 'tab': S.game = Number(el.dataset.gi); rerender({ focus: null }); return;
            case 'add-game': addGame(); rerender({ focus: null }); return;
            case 'remove-game':
                if (!confirm('删除第 ' + (S.game + 1) + ' 局的全部录入内容？（保存后才会写入文件）')) return;
                removeGame(S.game); S.game = Math.max(0, S.game - 1); rerender({ focus: null }); return;
            case 'swap-sides': g.blue = f.teams.find(t => t !== g.blue); rerender(); return;
            case 'winner': {
                g.winner = el.dataset.team;
                const ops = operators(g.sides[g.winner], lineups(f)[S.game][g.winner]);
                if (g.mvp && !ops.includes(g.mvp)) g.mvp = null;
                rerender(); return;
            }
            case 'clear-slot': { const slot = el.dataset.slot; setSlot(slot, undefined); rerender({ focus: slot }); return; }
            case 'ban-role': {
                const s = slotState(el.dataset.slot), roles = s.item.roles, role = el.dataset.role, at = roles.indexOf(role);
                if (at >= 0) roles.splice(at, 1);
                else if (roles.length >= 3) { toast('一个禁用最多标注 3 个分路（各计 1/3）。', 'error'); return; }
                else roles.push(role);
                rerender(); return;
            }
            case 'pick-role': { const s = slotState(el.dataset.slot); s.item.role = s.item.role === el.dataset.role ? null : el.dataset.role; rerender(); return; }
            case 'op-hint': { const s = slotState(el.dataset.slot); s.item.player = el.dataset.player; rerender({ focus: 'op.' + el.dataset.slot }); return; }
            case 'move': {
                const s = slotState(el.dataset.slot), list = s.kind === 'ban' ? s.side.bans : s.side.picks, j = s.idx + Number(el.dataset.dir);
                if (j < 0 || j > 4) return;
                [list[s.idx], list[j]] = [list[j], list[s.idx]];
                rerender({ focus: null }); return;
            }
            case 'lineup-edit': g.lineup[el.dataset.team] = clone(lineups(f)[S.game][el.dataset.team]); rerender(); return;
            case 'lineup-reset': g.lineup[el.dataset.team] = null; pruneOperators(el.dataset.team); rerender(); return;
            case 'stats-toggle': S.statsOpen = !el.parentElement.open; return;
            case 'goto': {
                if (el.dataset.gi !== '') S.game = Number(el.dataset.gi);
                rerender({ focus: null });
                const target = app.querySelector('[data-k="' + CSS.escape(el.dataset.key) + '"]');
                if (target) {
                    const details = target.closest('details'); if (details) details.open = true;
                    target.scrollIntoView({ block: 'center' });
                    const focusable = target.matches('input, select, textarea, button') ? target : target.querySelector('input, select, button');
                    if (focusable && !focusable.classList.contains('champ-input')) focusable.focus({ preventScroll: true });
                    target.classList.add('flash'); setTimeout(() => target.classList.remove('flash'), 1200);
                }
                return;
            }
            case 'draft-restore':
                S.form = S.draftOffer.form; S.draftOffer = null; S.game = 0;
                if (S.form.patch == null) S.form.patch = JSON.parse(S.baseline).patch;  // drafts saved before the patch field existed
                rerender({ focus: null }); toast('已恢复草稿，确认后请保存。'); return;
            case 'draft-drop': dropDraft(f.matchId); S.draftOffer = null; rerender({ focus: null }); return;
            case 'rebase':
                // Other matches come from the fresh file; this match keeps the form and overwrites the on-disk version when saved.
                loadData().then(() => {
                    S.baseline = JSON.stringify(formFromMatch(f.ri, f.mi)); S.conflict = false;
                    setConnection(true, connectionText()); rerender({ focus: null });
                    toast('已读取最新文件，本场修改仍保留，确认后再次保存。');
                }, error => toast('读取失败：' + error.message, 'error'));
                return;
        }
    });

    document.addEventListener('keydown', e => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && S.form && location.hash.startsWith('#edit/')) { e.preventDefault(); saveForm(); }
    });
    window.addEventListener('beforeunload', e => { storeDraft(); if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });

    // ---------- players ----------
    function makeId(teamId, name) { return teamId.toLowerCase() + '-' + name.trim().toLowerCase().replace(/\s+/g, '-'); }

    function playerProblem(teamId, name) {
        const clean = name.trim();
        if (!clean) return '请填写选手名字';
        if (!/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u.test(clean)) return '名字只能包含文字、数字、空格、点、下划线和连字符';
        if (player(makeId(teamId, clean))) return teamId + ' 已有选手 ' + player(makeId(teamId, clean)).name + '（大小写不同视为同一人）';
        return '';
    }

    async function savePlayers(next, message) {
        const result = await api('api/save', { players: { value: next, hash: S.hashes.players } });
        S.players = next; S.hashes.players = result.players.hash; reindex();
        setConnection(true, connectionText());
        toast(message);
    }

    async function addPlayer(teamId, name, role) {
        const problem = playerProblem(teamId, name);
        if (problem) { toast(problem, 'error'); return null; }
        const record = { id: makeId(teamId, name), teamId, name: name.trim(), role };
        try { await savePlayers(S.players.concat([record]), '已新增 ' + teamId + ' · ' + record.name + '（' + record.id + '）'); return record.id; }
        catch (error) { toast('保存选手失败：' + error.message, 'error'); return null; }
    }

    function openPlayerDialog(teamId, role, done) {
        const overlay = document.createElement('div');
        overlay.className = 'admin-dialog';
        overlay.innerHTML = '<form class="admin-dialog-box"><h2>新增 ' + esc(teamId) + ' 选手</h2>' +
            '<label>名字<input name="name" autocomplete="off" required></label>' +
            '<label>常规位置<select name="role">' + ROLES.map(r => '<option value="' + r + '"' + (r === role ? ' selected' : '') + '>' + ROLE_NAMES[r] + '</option>').join('') + '</select></label>' +
            '<p class="muted" data-id-preview>ID：' + esc(teamId.toLowerCase()) + '-…</p><div class="dialog-actions"><button type="button" class="btn" data-close>取消</button><button class="btn accent">添加并保存</button></div></form>';
        document.body.appendChild(overlay);
        const form = overlay.querySelector('form'), input = form.elements.name;
        const close = () => overlay.remove();
        input.addEventListener('input', () => { overlay.querySelector('[data-id-preview]').textContent = 'ID：' + makeId(teamId, input.value || '…') + (playerProblem(teamId, input.value) && input.value.trim() ? ' · ' + playerProblem(teamId, input.value) : ''); });
        overlay.querySelector('[data-close]').addEventListener('click', close);
        overlay.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
        form.addEventListener('submit', async e => {
            e.preventDefault();
            const id = await addPlayer(teamId, input.value, form.elements.role.value);
            if (id) { close(); done(id); }
        });
        input.focus();
    }

    function addPlayerFromForm() {
        const teamId = document.getElementById('np-team').value, name = document.getElementById('np-name').value, role = document.getElementById('np-role').value;
        addPlayer(teamId, name, role).then(id => { if (id) renderPlayers(); });
    }

    async function deletePlayer(id) {
        const p = player(id);
        if (!p || S.refs[p.id]) return;
        if (!confirm('删除 ' + p.teamId + ' · ' + p.name + '？')) return;
        try { await savePlayers(S.players.filter(x => x !== p), '已删除 ' + p.name); renderPlayers(); }
        catch (error) { toast('删除失败：' + error.message, 'error'); }
    }

    async function updatePlayer(id, field, value) {
        const p = player(id);
        if (!p) return;
        const next = S.players.map(x => (x === p ? Object.assign({}, x, { [field]: value }) : x));
        const league = field === 'name' && value.toLowerCase() !== p.name.toLowerCase() ? renameInLineups(p, value) : null;
        try {
            if (league) {
                const result = await api('api/save', { players: { value: next, hash: S.hashes.players }, schedule: { value: league, hash: S.hashes.schedule } });
                S.players = next; S.league = league; S.hashes.players = result.players.hash; S.hashes.schedule = result.schedule.hash; reindex();
                toast('已改名为 ' + value + '，ID 保持 ' + p.id + '；首发名单同步更新。');
            } else await savePlayers(next, '已更新 ' + (field === 'name' ? '名字：' + value : p.name + ' 的常规位置：' + ROLE_NAMES[value]));
        } catch (error) { toast('保存失败：' + error.message, 'error'); }
        renderPlayers();
    }

    function renameInLineups(p, name) {
        const league = clone(S.league);
        league.rounds.forEach(r => r.matches.forEach(m => {
            const list = m.startingLineups && m.startingLineups[p.teamId];
            if (Array.isArray(list)) list.forEach((n, i) => { if (String(n).toLowerCase() === p.name.toLowerCase()) list[i] = name; });
        }));
        return league;
    }

    function renderPlayers() {
        const teams = S.league.teams;
        let html = reloadButton() + '<div class="page-title"><h1>选手管理</h1><div class="sub">新选手先在这里添加（录入首发时也可直接“＋ 新增选手”）。ID 为队伍缩写 + 小写名字，创建后不再改变；已有出场记录的选手不能删除。</div></div>';
        html += '<section class="panel"><div class="panel-title">新增选手</div><div class="panel-body add-player">' +
            '<label>战队<select id="np-team">' + teams.map(t => '<option value="' + esc(t.id) + '">' + esc(t.id) + '</option>').join('') + '</select></label>' +
            '<label>名字<input id="np-name" autocomplete="off" placeholder="如 Xhao"></label>' +
            '<label>常规位置<select id="np-role">' + ROLES.map(r => '<option value="' + r + '">' + ROLE_NAMES[r] + '</option>').join('') + '</select></label>' +
            '<span class="np-id" id="np-id"></span><button type="button" class="btn accent" data-action="add-player">添加并保存</button></div></section>';
        html += '<div class="roster-grid">' + teams.map(t => {
            const roster = S.players.filter(p => p.teamId === t.id).sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || a.name.localeCompare(b.name));
            return '<section class="panel roster"><div class="panel-title"><span>' + teamLogo(t.id) + ' ' + esc(t.name) + '</span><span class="muted">' + roster.length + ' 人</span></div>' +
                '<table class="roster-table"><thead><tr><th>选手</th><th>常规位置</th><th>出场</th><th></th></tr></thead><tbody>' + roster.map(p =>
                    '<tr><td><input class="name-input" data-player-name="' + esc(p.id) + '" value="' + esc(p.name) + '" aria-label="名字"><small>' + esc(p.id) + '</small></td>' +
                    '<td><select data-player-role="' + esc(p.id) + '">' + ROLES.map(r => '<option value="' + r + '"' + (r === p.role ? ' selected' : '') + '>' + ROLE_NAMES[r] + '</option>').join('') + '</select></td>' +
                    '<td class="num">' + (S.appearances[p.id] || 0) + '</td><td><button type="button" class="btn danger" data-action="delete-player" data-id="' + esc(p.id) + '"' +
                    (S.refs[p.id] ? ' disabled title="已有比赛记录，不能删除"' : '') + '>删除</button></td></tr>').join('') + '</tbody></table></section>';
        }).join('') + '</div>';
        app.innerHTML = html;
        const preview = () => {
            const teamId = document.getElementById('np-team').value, name = document.getElementById('np-name').value;
            document.getElementById('np-id').textContent = name.trim() ? 'ID：' + makeId(teamId, name) + (playerProblem(teamId, name) ? ' · ' + playerProblem(teamId, name) : '') : '';
        };
        document.getElementById('np-name').addEventListener('input', preview);
        document.getElementById('np-team').addEventListener('change', preview);
        document.getElementById('np-name').addEventListener('keydown', e => { if (e.key === 'Enter') addPlayerFromForm(); });
    }

    app.addEventListener('change', e => {
        const el = e.target;
        if (el.dataset.playerRole) updatePlayer(el.dataset.playerRole, 'role', el.value);
        else if (el.dataset.playerName) {
            const p = player(el.dataset.playerName), value = el.value.trim();
            if (!p || value === p.name) return;
            if (!/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u.test(value)) { toast('名字格式不正确', 'error'); el.value = p.name; return; }
            const clash = S.players.find(x => x !== p && x.teamId === p.teamId && x.name.toLowerCase() === value.toLowerCase());
            if (clash) { toast(p.teamId + ' 已有 ' + clash.name, 'error'); el.value = p.name; return; }
            if (value.toLowerCase() !== p.name.toLowerCase() && !confirm('改名后 ID 仍为 ' + p.id + '（不影响历史记录）。确认将 ' + p.name + ' 改为 ' + value + '？')) { el.value = p.name; return; }
            updatePlayer(p.id, 'name', value);
        }
    });

    // ---------- publishing ----------
    const TAG_LABELS = { result: '修正赛果或 BP', confirm: '确认实际 BP 顺序', order: '调整 BP 顺位', banRoles: '补充禁用分路', stats: '补充可选数据', meta: '比赛信息' };
    const shortDate = date => { const m = /^\d{4}-(\d{2})-(\d{2})/.exec(date || ''); return m ? Number(m[1]) + ' 月 ' + Number(m[2]) + ' 日' : ''; };

    // Draft order is compared separately, so the core ignores the order of picks and bans.
    function sideCore(side) {
        const picks = (side.picks || []).map((slug, i) => JSON.stringify([slug, (side.pickRoles || [])[i], (side.pickPlayers || [])[i]])).sort();
        return [side.side, picks, (side.bans || []).map(String).sort(), side.lineup];
    }

    function gameTags(a, b) {
        if (!a || !b) return ['result'];
        const tags = [], sides = g => [g.team1 || {}, g.team2 || {}];
        const core = g => JSON.stringify([g.length, g.winner, g.mvp, g.substitutions || [], g.notes || [], sides(g).map(sideCore)]);
        const order = g => JSON.stringify([g.draftOrder || null, sides(g).map(s => [s.picks, s.bans, s.pickOrder || null])]);
        const banRoles = g => JSON.stringify(sides(g).map(s => (s.bans || []).map((slug, i) => JSON.stringify([slug, (s.banRoles || [])[i] || null])).sort()));
        const stats = g => JSON.stringify(sides(g).map(s => s.stats || null));
        if (core(a) !== core(b)) tags.push('result');
        if (b.draftOrder === 'recorded' && a.draftOrder !== 'recorded') tags.push('confirm');
        else if (!tags.length && order(a) !== order(b)) tags.push('order');
        if (banRoles(a) !== banRoles(b)) tags.push('banRoles');
        if (stats(a) !== stats(b)) tags.push('stats');
        return tags;
    }

    function totalsLine() {
        let total = 0, latest = '';
        const byMajor = {};
        S.league.rounds.forEach(r => r.matches.forEach(m => {
            const n = (m.games || []).length, major = WR.majorPatch(m.patch || r.patch);
            total += n;
            if (n) { byMajor[major] = (byMajor[major] || 0) + n; latest = major; }
        }));
        return '总计 ' + total + ' 小局' + (latest ? '，' + latest + ' 共 ' + byMajor[latest] + ' 小局' : '') + '。';
    }

    function describeChanges(live) {
        const out = { matches: [], players: [], notes: [], errors: [] };
        const liveMatches = new Map();
        live.schedule.rounds.forEach(r => r.matches.forEach(m => liveMatches.set(m.id, m)));
        const newByDate = new Map(), updates = new Map(), addedByRound = new Map();
        let gameCountChanged = false;
        S.league.rounds.forEach((round, ri) => round.matches.forEach((m, mi) => {
            const old = liveMatches.get(m.id), games = m.games || [], oldGames = (old && old.games) || [];
            if (old && JSON.stringify(old) === JSON.stringify(m)) return;
            if (games.length !== oldGames.length) gameCountChanged = true;
            const s = dataSeries(m), versus = opponentName(m, 1) + ' vs ' + opponentName(m, 2);
            const score = opponentName(m, 1) + ' ' + s.w1 + '–' + s.w2 + ' ' + opponentName(m, 2);
            if (games.length) out.errors.push(...storedErrors(ri, mi).map(x => m.id + ' ' + x.text));
            if (!old && !games.length) {
                addedByRound.set(round, (addedByRound.get(round) || []).concat(m));
                out.matches.push({ id: m.id, kind: 'added', text: (m.label ? m.label + ' · ' : '') + versus + ' · ' + (m.date || '') + ' · BO' + (m.bestOf || 3) });
            } else if (!oldGames.length && games.length) {
                const key = shortDate(m.date), entry = newByDate.get(key) || { scores: [], games: 0 };
                entry.scores.push((m.label ? m.label + ' ' : '') + score); entry.games += games.length; newByDate.set(key, entry);
                out.matches.push({ id: m.id, kind: 'new', text: score + ' · ' + games.length + ' 小局' });
            } else if (oldGames.length && !games.length) {
                out.matches.push({ id: m.id, kind: 'cleared', text: versus + ' · 清空赛果' });
                out.notes.push('清空 ' + m.id + ' ' + versus + ' 的赛果。');
            } else if (!games.length) {
                out.matches.push({ id: m.id, kind: 'update', text: versus + ' · ' + TAG_LABELS.meta });
            } else {
                const tags = new Set();
                for (let i = 0; i < Math.max(games.length, oldGames.length); i++) gameTags(oldGames[i], games[i]).forEach(t => tags.add(t));
                if (!tags.size) tags.add('meta');
                const labels = [...tags].map(t => TAG_LABELS[t]).join('、');
                out.matches.push({ id: m.id, kind: 'update', text: score + ' · ' + labels });
                if (!(tags.size === 1 && tags.has('meta'))) updates.set(labels, (updates.get(labels) || []).concat(m.id + ' ' + versus));
            }
        }));
        addedByRound.forEach((list, round) => out.notes.push('新增' + (round.title || round.id).split('（')[0] + '赛程 ' + list.length + ' 场：' + list.map(m => (m.label ? m.label + ' ' : '') + opponentName(m, 1) + ' vs ' + opponentName(m, 2)).join('、') + '。'));
        newByDate.forEach((entry, date) => out.notes.push('录入 ' + date + ' ' + entry.scores.join('、') + ' 的 ' + entry.games + ' 小局。'));
        updates.forEach((ids, labels) => out.notes.push('更新 ' + ids.join('、') + '：' + labels + '。'));
        const livePlayers = new Map(live.players.map(p => [p.id.toLowerCase(), p])), localIds = new Set(S.players.map(p => p.id.toLowerCase()));
        const added = [];
        S.players.forEach(p => {
            const old = livePlayers.get(p.id.toLowerCase()), label = p.teamId + ' · ' + p.name;
            if (!old) { added.push(label); out.players.push('新增 ' + label); return; }
            if (old.name !== p.name) { out.players.push('改名 ' + p.teamId + ' · ' + old.name + ' → ' + p.name); out.notes.push('选手改名：' + p.teamId + ' ' + old.name + ' → ' + p.name + '。'); }
            if (old.role !== p.role) { out.players.push('常规位置 ' + label + '：' + ROLE_NAMES[old.role] + ' → ' + ROLE_NAMES[p.role]); out.notes.push('调整 ' + label + ' 的常规位置为' + ROLE_NAMES[p.role] + '。'); }
        });
        if (added.length) out.notes.unshift('新增选手 ' + added.join('、') + '。');
        live.players.filter(p => !localIds.has(p.id.toLowerCase())).forEach(p => { out.players.push('移除 ' + p.teamId + ' · ' + p.name); out.notes.push('移除选手 ' + p.teamId + ' ' + p.name + '。'); });
        if (JSON.stringify(live.schedule.teams) !== JSON.stringify(S.league.teams) || JSON.stringify(live.schedule.meta) !== JSON.stringify(S.league.meta)) out.notes.push('更新赛事与战队信息。');
        if (gameCountChanged) out.notes.push(totalsLine());
        return out;
    }

    function storedErrors(ri, mi) {
        const saved = S.form;
        S.form = formFromMatch(ri, mi);
        const errors = validate(S.form).filter(x => x.level === 'error');
        S.form = saved;
        return errors;
    }

    async function renderPublish() {
        const head = reloadButton() + '<div class="page-title"><h1>发布公网</h1><div class="sub">将本地网站发布到公网并递增版本号：数据更新末位 +1，功能更新中位 +1。可选数据会随文件上传，公网页面不展示。</div></div>';
        app.innerHTML = head + '<div class="notice">正在读取公网版本与文件…</div>';
        let status;
        try { status = await api('api/publish/status'); } catch (error) {
            if (S.view !== 'publish') return;
            app.innerHTML = head + '<div class="notice warn"><b>无法读取发布状态：</b>' + esc(error.message) + '</div><button type="button" class="btn" data-action="publish-refresh">重试</button>';
            return;
        }
        if (S.view !== 'publish') return;
        const changes = status.live.error ? null : describeChanges(status.live);
        // Changed pages, scripts or styles mean a feature release by the site's version rule.
        const feature = status.changed.concat(status.removed).some(p => !p.startsWith('/data/'));
        S.pub = { head, status, changes, busy: false, confirmCode: false, kind: feature ? 'feature' : 'data', notes: changes ? changes.notes.join('\n') : '' };
        drawPublish();
    }

    function drawPublish() {
        const P = S.pub, st = P.status, c = P.changes;
        const stale = st.hashes.schedule !== S.hashes.schedule || st.hashes.players !== S.hashes.players;
        const codeFiles = st.changed.filter(p => !p.startsWith('/data/'));
        const nothing = !st.changed.length && !st.removed.length;
        const next = P.kind === 'feature' ? st.nextFeature : st.next;
        let html = P.head;
        if (S.pubResult) {
            const r = S.pubResult;
            html += '<div class="notice ' + (r.state === 'ready' ? 'ok-note' : 'warn') + '"><b>' + (r.state === 'ready' ? '已发布 V' + esc(r.version) : 'V' + esc(r.version) + ' 已提交，Netlify 仍在处理（' + esc(r.state) + '）') + '</b>' +
                ' · 用时 ' + r.seconds + ' 秒 · 上传 ' + r.uploaded.length + ' 个文件' + (r.verified ? ' · 已在公网确认版本号' : ' · 公网版本号尚未确认，可稍后刷新') +
                ' · <a href="' + esc(r.url) + '" target="_blank" rel="noopener">打开公网</a></div>';
        }
        html += '<section class="panel"><div class="panel-body publish-versions"><div><span class="label">公网当前</span><b>' + (st.live.version ? 'V' + esc(st.live.version) : '未知') + '</b><small>' + esc(st.live.releasedAt || '') + '</small></div>' +
            '<span class="arrow">→</span><div><span class="label">发布后</span><b>V' + esc(next) + '</b><small>今天</small></div>' +
            '<div class="version-kind" role="radiogroup" aria-label="版本类型">' + [['data', '数据更新', 'V' + st.next + ' · 末位 +1'], ['feature', '功能更新', 'V' + st.nextFeature + ' · 中位 +1']].map(([kind, label, sub]) =>
                '<label class="' + (P.kind === kind ? 'on' : '') + '"><input type="radio" name="pub-kind" value="' + kind + '"' + (P.kind === kind ? ' checked' : '') + '> ' + label + '<small>' + esc(sub) + '</small></label>').join('') + '</div>' +
            '<div class="publish-site"><a href="' + esc(st.site.url) + '" target="_blank" rel="noopener">' + esc(st.site.url) + '</a><br><span class="muted">Netlify 站点 ' + esc(st.site.name || '') +
            (st.site.account ? '（' + esc(st.site.account) + '）' : '') + ' · ' + esc(st.auth) + '</span></div></div></section>';
        if (st.local.version !== st.live.version && st.live.version) html += '<div class="notice warn">本地版本 V' + esc(st.local.version) + ' 与公网 V' + esc(st.live.version) + ' 不一致，将从本地版本递增为 V' + esc(next) + '。</div>';
        if (stale) html += '<div class="notice warn">数据文件在本页读取后被修改过，请先点右上角「重新读取文件」。</div>';
        if (st.live.error) html += '<div class="notice warn">读取公网数据失败（' + esc(st.live.error) + '），无法列出数据变化；仍可手动填写更新说明后发布。</div>';
        if (c) {
            html += '<section class="panel"><div class="panel-title"><span>与公网相比的数据变化</span><span class="muted">' + c.matches.length + ' 场比赛 · ' + c.players.length + ' 项选手变化</span></div><div class="panel-body">' +
                (c.matches.length || c.players.length ? '<ul class="change-list">' + c.matches.map(m => '<li><b>' + esc(m.id) + '</b> <span class="badge' +
                    (m.kind === 'new' || m.kind === 'added' ? ' ok' : m.kind === 'cleared' ? ' warn' : '') + '">' + ({ new: '新录入', cleared: '清空', update: '修改', added: '新赛程' }[m.kind]) + '</span> ' + esc(m.text) + '</li>').join('') +
                    c.players.map(text => '<li><span class="badge">选手</span> ' + esc(text) + '</li>').join('') + '</ul>' : '<p class="muted">比赛与选手数据和公网一致。</p>') + '</div></section>';
            if (c.errors.length) html += '<div class="notice warn"><b>以下比赛存在错误，修正后才能发布：</b><br>' + c.errors.map(esc).join('<br>') + '</div>';
        }
        html += '<section class="panel"><div class="panel-title"><span>将更新的公网文件</span><span class="muted">另会更新本地 CHANGELOG.md 与 README 版本号（不上传）</span></div><div class="panel-body">' +
            '<ul class="file-list' + (st.changed.length + st.removed.length > 8 ? ' wide' : '') + '">' + st.changed.map(p => '<li>' + esc(p.slice(1)) + '</li>').join('') + (st.changed.includes('/data/site.js') ? '' : '<li>data/site.js <span class="muted">（版本号）</span></li>') +
            st.removed.map(p => '<li class="removed">' + esc(p.slice(1)) + ' <span class="muted">（公网将删除）</span></li>').join('') + '</ul>';
        if (codeFiles.length && P.kind === 'data') {
            html += '<div class="notice warn">以下不是数据文件，也与公网不同，会一并发布：' + codeFiles.map(p => esc(p.slice(1))).join('、') + '。网站功能改动按规则应选择「功能更新」。' +
                '<label class="inline-check"><input type="checkbox" data-pub-code' + (P.confirmCode ? ' checked' : '') + '> 仍按数据更新发布这些文件</label></div>';
        }
        html += '</div></section>';
        html += '<section class="panel"><div class="panel-title"><span>更新说明</span><span class="muted">每行一条，写入 CHANGELOG.md；第一行同时作为 Netlify 部署标题</span></div><div class="panel-body">' +
            '<textarea id="pub-notes" class="pub-notes" rows="' + Math.max(3, P.notes.split('\n').length + 1) + '">' + esc(P.notes) + '</textarea></div></section>';
        const needConfirm = codeFiles.length && P.kind === 'data' && !P.confirmCode;
        const blocked = P.busy || stale || nothing || (c && c.errors.length) || needConfirm;
        const reason = P.busy ? '正在发布：构建 dist、上传变化的文件并等待 Netlify 生效…' : nothing ? '公网已是最新，没有需要发布的内容。' : stale ? '请先重新读取文件。' :
            c && c.errors.length ? '请先修正上面的比赛错误。' : needConfirm ? '请确认是否按数据更新发布非数据文件，或改选功能更新。' : '';
        html += '<div class="publish-actions"><button type="button" class="btn accent big" data-action="publish"' + (blocked ? ' disabled' : '') + '>' +
            (P.busy ? '发布中…' : '发布 V' + esc(next) + ' 到公网') + '</button><span class="muted">' + esc(reason) + '</span></div>';
        app.innerHTML = html;
        const notes = document.getElementById('pub-notes');
        notes.addEventListener('input', () => { P.notes = notes.value; });
        const code = app.querySelector('[data-pub-code]');
        if (code) code.addEventListener('change', () => { P.confirmCode = code.checked; drawPublish(); });
        app.querySelectorAll('input[name="pub-kind"]').forEach(radio => radio.addEventListener('change', () => { P.kind = radio.value; drawPublish(); }));
    }

    async function publishNow() {
        const P = S.pub;
        if (!P || P.busy) return;
        const notes = P.notes.split('\n').map(s => s.trim().replace(/^[-•·]\s*/, '')).filter(Boolean);
        if (!notes.length) { toast('请填写更新说明（至少一行）。', 'error'); return; }
        const version = P.kind === 'feature' ? P.status.nextFeature : P.status.next;
        if (!confirm('将 V' + version + '（' + (P.kind === 'feature' ? '功能更新' : '数据更新') + '）发布到 ' + P.status.site.url + '？\n\n' + notes.map(n => '· ' + n).join('\n'))) return;
        P.busy = true; drawPublish();
        try {
            S.pubResult = await api('api/publish', { hashes: { schedule: S.hashes.schedule, players: S.hashes.players }, kind: P.kind, version, notes });
            toast(S.pubResult.state === 'ready' ? '已发布 V' + S.pubResult.version + ' 到公网。' : 'V' + S.pubResult.version + ' 已提交，Netlify 仍在处理。');
            if (S.view === 'publish') await renderPublish();
        } catch (error) {
            P.busy = false;
            toast('发布失败：' + error.message, 'error');
            if (S.view === 'publish') drawPublish();
        }
    }

    // ---------- routing ----------
    async function reload() {
        if (isDirty() && !confirm('当前比赛有未保存的修改（草稿已保存在本机），仍要重新读取文件？')) return;
        try {
            await loadData();
            if (S.form) { const id = S.form.matchId; S.form = null; setConnection(true, connectionText()); openEditor(id); }
            else { setConnection(true, connectionText()); route(); }
            toast('已重新读取 data/schedule.js 与 data/players.js');
        } catch (error) { toast('读取失败：' + error.message, 'error'); }
    }

    function route() {
        const hash = location.hash.replace(/^#/, '') || 'new';
        if (hash.startsWith('edit/')) {
            openEditor(decodeURIComponent(hash.slice(5)));
            setTabs(S.from);
            return;
        }
        if (S.form && isDirty() && !confirm('离开前是否放弃未保存的修改？（草稿会保留在本机，下次打开可恢复）')) {
            location.hash = '#edit/' + S.form.matchId;
            return;
        }
        storeDraft();
        S.form = null; S.draftOffer = null;
        closePicker(true);
        const view = ['new', 'past', 'players', 'publish'].includes(hash) ? hash : 'new';
        S.view = view;
        if (view === 'new' || view === 'past') S.from = view;
        setTabs(view);
        if (view === 'players') renderPlayers(); else if (view === 'publish') renderPublish(); else renderList(view);
        window.scrollTo(0, 0);
    }

    async function boot() {
        try {
            await loadData();
        } catch (error) {
            setConnection(false, '未连接');
            app.innerHTML = '<div class="notice warn"><b>无法读取数据：' + esc(error.message) + '</b><br>请在项目根目录运行 <code>python3 admin/server.py</code>，然后通过它打开的地址访问本页面（直接双击 HTML 无法写入文件）。</div>';
            return;
        }
        setConnection(true, connectionText());
        window.addEventListener('hashchange', route);
        route();
    }

    // Console checks: WRAdmin.roundTrip() must return [] (every stored match rebuilds byte-identically).
    window.WRAdmin = {
        state: S,
        formFromMatch, buildMatch, buildLeague, validate, lineups,
        // Every stored match must survive load -> form -> save unchanged (key order included).
        roundTrip() {
            const saved = S.form, problems = [];
            S.league.rounds.forEach((r, ri) => r.matches.forEach((m, mi) => {
                S.form = formFromMatch(ri, mi);
                if (!(m.games || []).length) S.form.games = [];
                const rebuilt = buildMatch(S.form);
                if (JSON.stringify(rebuilt) !== JSON.stringify(m)) problems.push(m.id);
            }));
            S.form = saved;
            return problems;
        }
    };

    boot();
})();
