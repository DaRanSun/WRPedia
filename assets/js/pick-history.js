(function () {
    "use strict";
    const WR = window.WR;

    function query(filters) {
        filters = filters || {};
        if (filters.champion && !WR.getChampion(filters.champion)) return [];
        if (!filters.champion && !WR.getPlayer(filters.playerId)) return [];
        const result = [];
        (WR.league.rounds || []).forEach(function (round) {
            (round.matches || []).forEach(function (match) {
                const patch = WR.matchPatch(round, match);
                if (filters.version && filters.version !== "all" && WR.majorPatch(patch) !== filters.version) return;
                (match.games || []).forEach(function (game, gi) {
                    if ((game.winner !== 1 && game.winner !== 2) || !game.team1 || !game.team2) return;
                    [1, 2].forEach(function (index) {
                        const team = match["opponent" + index], side = game["team" + index];
                        if (filters.team && filters.team !== "all" && filters.team !== team) return;
                        const pickIndex = filters.playerId ? (side.pickPlayers || []).indexOf(filters.playerId) : (side.picks || []).indexOf(filters.champion);
                        if (pickIndex < 0) return;
                        const champion = side.picks[pickIndex];
                        if (filters.champion && filters.champion !== champion) return;
                        const player = WR.getPlayer((side.pickPlayers || [])[pickIndex]);
                        if (filters.playerId && (!player || player.id !== filters.playerId)) return;
                        const roleShares = WR.pickRoleShares(side, pickIndex);
                        result.push({ round: round, match: match, game: game, gameIndex: gi, team: team,
                            teamIndex: index, pickIndex: pickIndex, roleIndex: pickIndex, roleShares: roleShares, role: WR.roleLabel(roleShares), patch: patch,
                            won: game.winner === index, champion: champion, player: player });
                    });
                });
            });
        });
        return result.sort((a, b) => (b.match.date || b.round.date || "").localeCompare(a.match.date || a.round.date || "") ||
            b.match.id.localeCompare(a.match.id) || a.gameIndex - b.gameIndex);
    }

    function gameDetails(record) {
        const match = record.match, game = record.game, esc = WR.escapeHtml;
        const score = [1, 2].map(index => (match.games || []).filter(g => g.winner === index).length).join("–");
        let html = '<article class="pick-game" data-match="' + esc(match.id) + '" data-game="' + (record.gameIndex + 1) + '">' +
            '<header class="pick-game-heading"><div><span class="eyebrow">' + esc(record.round.title) + '</span>' +
            '<h2>' + esc(WR.teamName(match.opponent1)) + ' <span>' + score + '</span> ' + esc(WR.teamName(match.opponent2)) + '</h2>' +
            '<span class="text-muted">' + esc(match.date || record.round.date || '') + (match.timezone ? ' · ' + esc(match.timezone) : '') + '</span></div>' +
            '<div class="pick-game-context">' + WR.patchLink(record.patch) + '<span class="pick-outcome ' + (record.won ? 'won' : 'lost') + '">' +
            esc(record.team) + ' ' + (record.won ? '胜利' : '失利') + ' · ' + record.role + '</span></div></header>' +
            '<div class="game-header"><b>第 ' + (record.gameIndex + 1) + ' 局</b><span>时长 ' + esc(game.length || '未记录') +
            '</span><span>胜者：' + esc(WR.teamName(match['opponent' + game.winner])) + '</span>' +
            (WR.gameMvpLabel(game) ? '<span>MVP：' + esc(WR.gameMvpLabel(game)) + '</span>' : '') + '</div><div class="game-sides">';
        // Render BLUE first regardless of opponent1/opponent2 or winner numbering.
        [1, 2].sort((a, b) => Number(game['team' + b].side === 'blue') - Number(game['team' + a].side === 'blue')).forEach(function (index) {
            const side = game['team' + index], team = match['opponent' + index], blue = side.side === 'blue';
            html += '<section class="side-box ' + (blue ? 'blue' : 'red') + '"><div class="side-label"><b>' + esc(WR.teamName(team)) +
                ' · ' + (blue ? '蓝方' : '红方') + '</b><span>' + (game.winner === index ? '胜' : '负') + '</span></div>';
            html += WR.draftSideHtml(side, index === record.teamIndex ? record.champion : null) + '</section>';
        });
        html += '</div>';
        html += WR.gameNotesHtml(game);
        const urls = [['vod', 'VOD'], ['youtube', 'YouTube'], ['twitch', 'Twitch']].filter(link => /^https?:\/\//i.test(match[link[0]] || ''));
        if (urls.length || (match.mvp || []).length) html += '<footer class="pick-game-footer">' +
            ((match.mvp || []).length ? '<span>大场 MVP：' + esc(match.mvp.join('、')) + '</span>' : '') +
            urls.map(link => '<a target="_blank" rel="noopener noreferrer" href="' + esc(match[link[0]]) + '">' + link[1] + ' ↗</a>').join('') + '</footer>';
        return html + '</article>';
    }
    WR.PickHistory = Object.freeze({ query: query, gameDetails: gameDetails });
})();
