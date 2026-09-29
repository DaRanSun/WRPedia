(function () {
    'use strict';
    const WR = window.WR;
    function record() { return { games: 0, wins: 0, losses: 0 }; }
    function add(result, won) { result.games++; result[won ? 'wins' : 'losses']++; }
    const roleOrder = Object.keys(WR.roleNames);
    function rankedRoles(stat) {
        return Object.entries(stat.roles).filter(([, n]) => n > 0)
            .sort((a, b) => b[1] - a[1] || roleOrder.indexOf(a[0]) - roleOrder.indexOf(b[0]));
    }
    function roleText(stat) { return rankedRoles(stat).map(([role]) => WR.roleNames[role]).join('／') || '暂无出场'; }
    function playerOrder(a, b) {
        const ar = rankedRoles(a), br = rankedRoles(b);
        return (ar.length ? roleOrder.indexOf(ar[0][0]) : 5) - (br.length ? roleOrder.indexOf(br[0][0]) : 5) ||
            b.games - a.games || a.player.name.localeCompare(b.player.name);
    }
    function durationSeconds(length) {
        const match = /^(\d+):([0-5]\d)$/.exec(length || '');
        return match ? Number(match[1]) * 60 + Number(match[2]) : null;
    }
    function formatDuration(seconds) {
        if (seconds == null || !Number.isFinite(seconds)) return '—';
        const rounded = Math.round(seconds);
        return Math.floor(rounded / 60) + ':' + String(rounded % 60).padStart(2, '0');
    }
    function compute(teamId, version) {
        version = version || 'all';
        const team = WR.teamById(teamId);
        if (!team) return null;
        const players = Object.fromEntries(WR.players.filter(p => p.teamId === teamId).map(p => [p.id,
            { player: p, ...record(), mvp: 0, champions: {}, roles: {} }]));
        const res = { team, version, ...record(), seriesWins: 0, seriesLosses: 0, rosterGames: 0, mvpRecorded: 0,
            players, schedule: [], durations: { all: [], wins: [], losses: [] },
            sides: { blue: { ...record(), bans: {}, emptyBans: 0 }, red: { ...record(), bans: {}, emptyBans: 0 } } };
        (WR.league.rounds || []).forEach(function (round) {
            (round.matches || []).forEach(function (match) {
                const teamIndex = match.opponent1 === teamId ? 1 : match.opponent2 === teamId ? 2 : 0;
                if (!teamIndex) return;
                const patch = WR.matchPatch(round, match);
                if (version !== 'all' && WR.majorPatch(patch) !== version) return;
                const games = (match.games || []).filter(g => [1, 2].includes(g.winner) && g.team1 && g.team2);
                const wins = games.filter(g => g.winner === teamIndex).length, losses = games.length - wins;
                const finished = wins >= Math.ceil((match.bestOf || 3) / 2) || losses >= Math.ceil((match.bestOf || 3) / 2);
                if (finished) res[wins > losses ? 'seriesWins' : 'seriesLosses']++;
                res.schedule.push({ round, match, patch, wins, losses, finished, played: games.length > 0,
                    opponent: match['opponent' + (teamIndex === 1 ? 2 : 1)] });
                games.forEach(function (game) {
                    const won = game.winner === teamIndex, side = game['team' + teamIndex], sideStats = res.sides[side.side];
                    add(res, won); add(sideStats, won);
                    const seconds = durationSeconds(game.length);
                    if (seconds != null) { res.durations.all.push(seconds); res.durations[won ? 'wins' : 'losses'].push(seconds); }
                    // Team tendencies use actual recorded bans / games on this side, not ban slot share.
                    (side.bans || []).forEach(function (slug) {
                        if (slug === null) sideStats.emptyBans++;
                        else if (WR.getChampion(slug)) sideStats.bans[slug] = (sideStats.bans[slug] || 0) + 1;
                    });
                    const ids = (side.pickPlayers || []).map(id => WR.getPlayer(id));
                    const complete = ids.length === 5 && ids.every(p => p && p.teamId === teamId) && new Set(ids.map(p => p.id)).size === 5;
                    if (complete) res.rosterGames++;
                    (side.picks || []).forEach(function (slug, i) {
                        const player = ids[i], stat = player && players[player.id];
                        if (!stat || !WR.getChampion(slug)) return;
                        add(stat, won);
                        const champion = stat.champions[slug] || (stat.champions[slug] = { slug, ...record(), roles: {} });
                        add(champion, won);
                        Object.entries(WR.pickRoleShares(side, i)).forEach(function ([role, weight]) {
                            champion.roles[role] = (champion.roles[role] || 0) + weight;
                            stat.roles[role] = (stat.roles[role] || 0) + weight;
                        });
                    });
                    const mvp = game.mvp, player = mvp && WR.getPlayer(mvp.playerId);
                    if (won && mvp && mvp.teamId === teamId && player && player.teamId === teamId && players[player.id] && ids.some(p => p && p.id === player.id)) {
                        players[player.id].mvp++; res.mvpRecorded++;
                    }
                });
            });
        });
        res.averageDuration = Object.fromEntries(Object.entries(res.durations).map(([key, values]) =>
            [key, values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null]));
        return res;
    }
    WR.TeamStats = Object.freeze({ compute, rankedRoles, roleText, playerOrder, durationSeconds, formatDuration });
})();
