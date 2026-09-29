(function () {
    'use strict';
    const WR = window.WR;
    function standings() {
        const rows = Object.fromEntries((WR.league.teams || []).map(team => [team.id, { team, seriesW: 0, seriesL: 0, gameW: 0, gameL: 0 }]));
        WR.league.rounds.forEach(round => round.matches.forEach(match => {
            const games = (match.games || []).filter(g => [1, 2].includes(g.winner));
            const wins = games.filter(g => g.winner === 1).length, losses = games.length - wins;
            [1, 2].forEach(index => {
                const row = rows[match['opponent' + index]]; if (!row) return;
                const w = index === 1 ? wins : losses, l = index === 1 ? losses : wins;
                row.gameW += w; row.gameL += l;
                if (Math.max(w, l) >= Math.ceil((match.bestOf || 3) / 2)) row[w > l ? 'seriesW' : 'seriesL']++;
            });
        }));
        // Use the same league tiebreak order on the overview and full standings.
        return Object.values(rows).sort((a, b) => b.seriesW - a.seriesW || (b.seriesW - b.seriesL) - (a.seriesW - a.seriesL) ||
            (b.gameW - b.gameL) - (a.gameW - a.gameL) || b.gameW - a.gameW || a.team.name.localeCompare(b.team.name, 'zh'));
    }
    function upcoming(limit = 6) {
        return WR.league.rounds.flatMap(round => round.matches.map(match => ({ round, match })))
            .filter(({ match }) => !(match.games || []).some(g => [1, 2].includes(g.winner)))
            .sort((a, b) => a.match.date.localeCompare(b.match.date)).slice(0, limit);
    }
    function topMvps(limit = 5) {
        if (limit <= 0) return [];
        const players = WR.league.teams.flatMap(team => Object.values(WR.TeamStats.compute(team.id).players))
            .filter(p => p.mvp > 0).sort((a, b) => b.mvp - a.mvp || a.player.teamId.localeCompare(b.player.teamId) || a.player.name.localeCompare(b.player.name));
        const cutoff = players[Math.min(limit, players.length) - 1];
        return cutoff ? players.filter(p => p.mvp >= cutoff.mvp).map(p => ({ ...p, rank: players.findIndex(v => v.mvp === p.mvp) + 1 })) : [];
    }
    WR.LeagueSummary = Object.freeze({ standings, upcoming, topMvps });
})();
