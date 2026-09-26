(function () {
    'use strict';
    const WR = window.WR;
    function record() { return { games: 0, wins: 0, losses: 0 }; }
    function add(result, won) { result.games++; result[won ? 'wins' : 'losses']++; }
    function compute(teamId, version) {
        version = version || 'all';
        const team = WR.teamById(teamId);
        if (!team) return null;
        const players = Object.fromEntries(WR.players.filter(p => p.teamId === teamId).map(p => [p.id,
            { player: p, ...record(), mvp: 0, champions: {}, roles: {} }]));
        const res = { team, version, ...record(), seriesWins: 0, seriesLosses: 0, rosterGames: 0, mvpRecorded: 0,
            players, schedule: [], sides: { blue: { ...record(), bans: {}, emptyBans: 0 }, red: { ...record(), bans: {}, emptyBans: 0 } } };
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
        return res;
    }
    WR.TeamStats = Object.freeze({ compute });
})();
