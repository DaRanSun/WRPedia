(function () {
    "use strict";

    const WR = window.WR;
    const league = WR.league;

    const ROLE_KEYS = ["top", "jungle", "mid", "bot", "support"];
    const ROLE_NAMES = { top: "上单", jungle: "打野", mid: "中路", bot: "下路", support: "辅助" };
    let searchQuery = "";
    let tableView = "summary";

    function emptyChamp(slug) {
        const roles = {};
        ROLE_KEYS.forEach(function (r) { roles[r] = { picks: 0, wins: 0, losses: 0 }; });
        return {
            slug: slug,
            picks: 0, wins: 0, losses: 0,
            bluePicks: 0, blueWins: 0, blueLosses: 0,
            redPicks: 0, redWins: 0, redLosses: 0,
            bans: 0,
            bansByRole: Object.fromEntries(ROLE_KEYS.map(r => [r, 0])),
            unassignedBans: 0,
            banEarly: 0,   // 前 3 ban（1-3 顺位）
            banLate: 0,    // 后 2 ban（4-5 顺位）
            available: 0,
            roles: roles,
            byPatch: {},
            teams: {},
            withMap: {},
            againstMap: {}
        };
    }

    function compute(version) {
        version = version || "all";
        const stats = {};
        WR.champions.forEach(function (c) { stats[c.slug] = emptyChamp(c.slug); });

        let totalGames = 0;
        let blueWins = 0;
        let redWins = 0;
        const lengths = { lt10: 0, m10_15: 0, m15_20: 0, m20_25: 0, m25_30: 0, gt30: 0 };
        const patchSamples = {};
        function patchCounts(st, patch) {
            return st.byPatch[patch] || (st.byPatch[patch] = { picks: 0, bans: 0, wins: 0, losses: 0, available: 0 });
        }

        function isPlayedGame(g) {
            const t1 = g && g.team1, t2 = g && g.team2;
            return !!(t1 && t2 && t1.picks && t1.picks.length && t2.picks && t2.picks.length &&
                (g.winner === 1 || g.winner === 2));
        }

        (league.rounds || []).forEach(function (round) {
            (round.matches || []).forEach(function (match) {
                if (version !== "all" && WR.majorPatch(WR.matchPatch(round, match)) !== version) return;
                const patch = WR.matchPatch(round, match) || "未标注";
                if (!patchSamples[patch]) patchSamples[patch] = { id: patch, games: 0 };
                const games = (match.games || []).filter(isPlayedGame);
                if (!games.length) return;
                const seriesLen = games.length;
                totalGames += seriesLen;
                patchSamples[patch].games += seriesLen;

                // 双边无畏征召：记录每个英雄在该大场首次被任一方选用的局号
                const firstPick = {};

                games.forEach(function (game, gi) {
                    const gNo = gi + 1;
                    const t1 = game.team1, t2 = game.team2;
                    const t1Blue = t1.side === "blue";
                    const winnerBlue = game.winner === 1 ? t1Blue : !t1Blue;
                    if (winnerBlue) blueWins++; else redWins++;

                    const mins = WR.parseDuration(game.length);
                    if (mins != null) {
                        if (mins < 10) lengths.lt10++;
                        else if (mins < 15) lengths.m10_15++;
                        else if (mins < 20) lengths.m15_20++;
                        else if (mins < 25) lengths.m20_25++;
                        else if (mins < 30) lengths.m25_30++;
                        else lengths.gt30++;
                    }

                    const sides = [
                        { idx: 1, data: t1, teamId: match.opponent1, isBlue: t1Blue },
                        { idx: 2, data: t2, teamId: match.opponent2, isBlue: !t1Blue }
                    ];
                    const sideOf = {};
                    sides.forEach(function (s) { sideOf[s.idx] = s; });

                    sides.forEach(function (side) {
                        const won = game.winner === side.idx;
                        const picks = side.data.picks || [];
                        const bans = side.data.bans || [];
                        const other = sideOf[side.idx === 1 ? 2 : 1];

                        picks.forEach(function (slug, idx) {
                            const st = stats[slug];
                            if (!st || !WR.championAvailable(slug, patch)) return;
                            const lockedAt = firstPick[slug];
                            // 该英雄此前已被选用：本局起（含本局之后的数据）不计入统计
                            if (lockedAt !== undefined && lockedAt < gNo) return;
                            if (firstPick[slug] === undefined) firstPick[slug] = gNo;

                            st.picks++;
                            if (won) st.wins++; else st.losses++;
                            const patchStat = patchCounts(st, patch);
                            patchStat.picks++;
                            if (won) patchStat.wins++; else patchStat.losses++;
                            if (side.isBlue) {
                                st.bluePicks++;
                                if (won) st.blueWins++; else st.blueLosses++;
                            } else {
                                st.redPicks++;
                                if (won) st.redWins++; else st.redLosses++;
                            }

                            Object.entries(WR.pickRoleShares(side.data, idx)).forEach(function (entry) {
                                const role = st.roles[entry[0]], weight = entry[1];
                                role.picks += weight;
                                if (won) role.wins += weight; else role.losses += weight;
                            });

                            const t = st.teams[side.teamId] || (st.teams[side.teamId] = { picks: 0, wins: 0, losses: 0 });
                            t.picks++;
                            if (won) t.wins++; else t.losses++;

                            picks.forEach(function (otherSlug, oi) {
                                if (oi === idx || otherSlug === slug) return;
                                const o = st.withMap[otherSlug] || (st.withMap[otherSlug] = { picks: 0, wins: 0, losses: 0 });
                                o.picks++;
                                if (won) o.wins++; else o.losses++;
                            });
                            (other.data.picks || []).forEach(function (enemySlug) {
                                const o = st.againstMap[enemySlug] || (st.againstMap[enemySlug] = { picks: 0, wins: 0, losses: 0 });
                                o.picks++;
                                if (won) o.wins++; else o.losses++;
                            });
                        });

                        bans.forEach(function (slug, bi) {
                            const st = stats[slug];
                            if (!st || !WR.championAvailable(slug, patch)) return;
                            const lockedAt = firstPick[slug];
                            if (lockedAt !== undefined && lockedAt < gNo) return;
                            st.bans++;
                            const shares = WR.banRoleShares(side.data, bi);
                            if (!Object.keys(shares).length) st.unassignedBans++;
                            else Object.entries(shares).forEach(function (entry) { st.bansByRole[entry[0]] += entry[1]; });
                            patchCounts(st, patch).bans++;
                            if (bi < 3) st.banEarly++; else st.banLate++;
                        });
                    });
                });

                // BP 率分母（有效局数）：只要英雄未被无畏征召锁定（未在该大场此前小局被任一方选用），
                // 无论本局是否被禁用/选用，该小局都计入其分母；被锁定后该大场后续小局不再计入。
                Object.keys(stats).forEach(function (slug) {
                    if (!WR.championAvailable(slug, patch)) return;
                    const count = firstPick[slug] !== undefined ? firstPick[slug] : seriesLen;
                    stats[slug].available += count;
                    patchCounts(stats[slug], patch).available += count;
                });
            });
        });

        const tierModel = WR.BPTiers.evaluate(stats, league.meta && league.meta.bpTierExclusions);
        Object.keys(stats).forEach(function (slug) { stats[slug].tier = tierModel.ratings[slug]; });
        const roleTierModel = WR.RoleTiers ? WR.RoleTiers.evaluate(stats, league.meta && league.meta.bpTierExclusions) : null;
        return { version: version, stats: stats, totalGames: totalGames, blueWins: blueWins, redWins: redWins, lengths: lengths, tierModel: tierModel, roleTierModel: roleTierModel, patches: Object.values(patchSamples) };
    }

    function championName(slug) {
        return WR.championName(slug);
    }

    function detailTable(title, pairs, slugKey) {
        let html = "<h4>" + WR.escapeHtml(title) + "</h4>";
        if (!pairs.length) {
            html += '<div class="empty-note">暂无数据</div>';
            return html;
        }
        html += '<div class="table-responsive"><table class="wikitable striped"><thead><tr><th>#</th><th>' +
            (slugKey === "champ" ? "英雄" : "队伍") + '</th><th>∑</th><th>W</th><th>L</th><th>WR</th></tr></thead><tbody>';
        pairs.forEach(function (p, i) {
            const label = slugKey === "champ"
                ? '<span class="champ-cell">' + WR.champImg(p.slug, "sm") + " " + WR.escapeHtml(championName(p.slug)) + "</span>"
                : '<span class="champ-cell">' + WR.teamBadge(p.slug) + " " + WR.escapeHtml(WR.teamName(p.slug)) + "</span>";
            html += "<tr><td class='num'>" + (i + 1) + "</td><td class='left'>" + label + "</td>" +
                "<td class='num'>" + p.picks + "</td><td class='num'>" + p.wins + "</td><td class='num'>" + p.losses + "</td>" +
                "<td class='num'>" + WR.pct(p.wins, p.losses) + "</td></tr>";
        });
        return html + "</tbody></table></div>";
    }

    function tierBadge(rating) {
        const cls = rating.status === "rated" ? rating.label.toLowerCase() : rating.status;
        return '<span class="tier-badge tier-' + cls + '">' + WR.escapeHtml(rating.label) + '</span>';
    }

    function tierDetails(st) {
        const rating = st.tier;
        let html = '<section class="tier-explanation"><div class="tier-explanation-heading">' + tierBadge(rating) +
            '<b>BP 梯度' + (rating.score == null ? '' : ' · ' + rating.score.toFixed(1) + ' / 100') + '</b>' +
            (rating.provisional ? '<span class="tier-provisional">初步</span>' : '') + '</div>';
        if (rating.score != null) {
            html += '<div class="tier-metrics"><span>原始 BP 率 <b>' + WR.fmtPercent((st.picks + st.bans) / st.available * 100) + '</b></span>' +
                '<span>平滑 BP 率 <b>' + WR.fmtPercent(rating.smoothedBP * 100) + '</b></span>' +
                '<span>平滑禁用率 <b>' + WR.fmtPercent(rating.smoothedBan * 100) + '</b></span>' +
                '<span>出场胜率 <b>' + (st.picks ? WR.pct(st.wins, st.losses) + ' · ' + st.wins + ' 胜 ' + st.losses + ' 负' : '— · 未出场') + '</b></span>' +
                '<span>修正胜率 <b>' + (st.picks ? WR.fmtPercent(rating.smoothedWinRate * 100) : '50%（中性先验）') + '</b></span></div>' +
                '<div class="tier-score-breakdown"><span>BP 基础分 <b>' + rating.baseScore.toFixed(1) + '</b></span><span>胜率修正 <b class="' +
                (rating.winAdjustment > 0 ? 'tier-adjust-up' : rating.winAdjustment < 0 ? 'tier-adjust-down' : '') + '">' +
                (rating.winAdjustment > 0 ? '+' : '') + rating.winAdjustment.toFixed(1) + '</b></span><span>综合得分 <b>' + rating.score.toFixed(1) + '</b></span></div>' +
                '<p>BP 基础分 = 90 × ' + rating.smoothedBP.toFixed(4) + ' + 10 × ' + rating.smoothedBan.toFixed(4) +
                ' ≈ ' + rating.baseScore.toFixed(1) + '；胜率系数 = 2 × 修正胜率 ≈ ' + rating.winMultiplier.toFixed(3) +
                '。综合得分 = BP 基础分 × 胜率系数' + (rating.capped ? '（上限 100 分）' : '') + '。</p>' +
                (st.picks ? '<p>修正胜率 = (' + st.wins + ' + ' + WR.BPTiers.config.winPriorGames / 2 + ') / (' + st.picks + ' + ' + WR.BPTiers.config.winPriorGames +
                    ')。加入一半胜、一半负的虚拟样本，出场越少，修正后越接近 50%。</p>' : '<p>没有出场记录时，胜率系数为 1，保留 BP 基础分；真实战术 Ban 正常计算。</p>');
        }
        if (rating.reason) html += '<p>' + WR.escapeHtml(rating.reason) + '</p>';
        return html + '<p class="scope-note">按当前范围的选禁与胜率综合评级，胜率也受队伍、对手与阵容影响，不等于英雄的独立强度。分数使用未舍入的中间值计算，最终保留一位小数后分档。</p></section>';
    }

    function bindDetails(root, res) {
        root.querySelectorAll("button[data-detail]").forEach(function (btn) {
            btn.addEventListener("click", function () {
                const st = res.stats[btn.getAttribute("data-detail")];
                const title = championName(st.slug) + " · " + (res.version === "all" ? "总榜" : res.version) + " · 详细统计";
                WR.showDialog(detailsHtml(st, res), title);
            });
        });
    }

    function patchChange(slug, patch) {
        const note = (window.WR_PATCHES || []).find(function (p) { return p.id === patch; });
        const change = note && note.champions.find(function (c) { return c.slug === slug; });
        if (!change) return "";
        const labels = { buff: "↑ 增强", nerf: "↓ 削弱", adjust: "↕ 调整" };
        return '<a class="patch-change ' + change.type + '" href="patches.html#patch-' + WR.escapeHtml(patch) + '" title="' +
            WR.escapeHtml(WR.localizeChampionNames(change.summary)) + '">' + labels[change.type] + '</a>';
    }

    function patchHistory(st, res) {
        let html = '<h4>小版本选用变化</h4><p class="scope-note">各版本比赛数量不同，结合选用率比较；增强／削弱不重置有效局数，变化不一定由补丁单独造成。</p>' +
            '<div class="table-responsive"><table class="wikitable striped patch-history"><thead><tr><th>版本</th><th>选用次数</th><th>选用率</th><th>禁用次数</th><th>选用胜率</th><th>有效局数</th><th>英雄改动</th></tr></thead><tbody>';
        res.patches.forEach(function (p) {
            const d = st.byPatch[p.id] || { picks: 0, bans: 0, wins: 0, losses: 0, available: 0 };
            if (!WR.championAvailable(st.slug, p.id)) {
                html += '<tr><td>' + WR.patchLink(p.id) + '</td><td colspan="6" class="text-muted">该版本尚未启用，不计入有效局数</td></tr>';
                return;
            }
            html += '<tr><td>' + WR.patchLink(p.id) + '</td>' + (p.games ?
                '<td class="num bold">' + d.picks + '</td><td class="num">' + WR.fmtPercent(d.available ? d.picks / d.available * 100 : 0) +
                '</td><td class="num">' + d.bans + '</td><td class="num">' + WR.pct(d.wins, d.losses) + '</td><td class="num">' + d.available + '</td>' :
                '<td colspan="5" class="text-muted">暂无已录入比赛</td>') + '<td>' + (patchChange(st.slug, p.id) || '—') + '</td></tr>';
        });
        return html + '</tbody></table></div>';
    }

    function detailsHtml(st, res) {
        const teams = Object.keys(st.teams).map(function (k) {
            return { slug: k, picks: st.teams[k].picks, wins: st.teams[k].wins, losses: st.teams[k].losses };
        }).sort(function (a, b) { return b.picks - a.picks; });
        const withArr = Object.keys(st.withMap).map(function (k) {
            return { slug: k, picks: st.withMap[k].picks, wins: st.withMap[k].wins, losses: st.withMap[k].losses };
        }).sort(function (a, b) { return b.picks - a.picks; }).slice(0, 5);
        const againstArr = Object.keys(st.againstMap).map(function (k) {
            return { slug: k, picks: st.againstMap[k].picks, wins: st.againstMap[k].wins, losses: st.againstMap[k].losses };
        }).sort(function (a, b) { return b.picks - a.picks; }).slice(0, 5);

        // 分路统计：仅列出有选用的分路
        const roleRows = ROLE_KEYS.filter(function (r) { return st.roles[r].picks > 0; }).map(function (r) {
            const d = st.roles[r];
            return "<tr><td class='left'>" + ROLE_NAMES[r] + "</td><td class='num'>" + d.picks +
                "</td><td class='num'>" + d.wins + "</td><td class='num'>" + d.losses + "</td><td class='num'>" +
                WR.pct(d.wins, d.losses) + "</td></tr>";
        });
        let roleHtml = "<h4>By Role（分路统计）</h4>";
        if (roleRows.length) {
            roleHtml += '<div class="table-responsive"><table class="wikitable striped"><thead><tr>' +
                "<th>分路</th><th>∑</th><th>W</th><th>L</th><th>WR</th></tr></thead><tbody>" +
                roleRows.join("") + "</tbody></table></div>";
        } else {
            roleHtml += '<div class="empty-note">无选用记录</div>';
        }

        // 禁用顺位：前三 ban vs 后两 ban
        const banTotal = st.banEarly + st.banLate;
        let banHtml = "<h4>Ban Position（禁用顺位）</h4>";
        if (banTotal) {
            const ePct = ((st.banEarly / banTotal) * 100).toFixed(1) + "%";
            const lPct = ((st.banLate / banTotal) * 100).toFixed(1) + "%";
            banHtml += '<div class="table-responsive"><table class="wikitable striped"><thead><tr>' +
                "<th>顺位</th><th>次数</th><th>占比</th></tr></thead><tbody>" +
                "<tr><td class='left'>前三 Ban（1-3 顺位）</td><td class='num'>" + st.banEarly + "</td><td class='num'>" + ePct + "</td></tr>" +
                "<tr><td class='left'>后两 Ban（4-5 顺位）</td><td class='num'>" + st.banLate + "</td><td class='num'>" + lPct + "</td></tr>" +
                "</tbody></table></div>";
        } else {
            banHtml += '<div class="empty-note">无禁用记录</div>';
        }

        const from = (WR.championRules[st.slug] || {}).availableFrom;
        return (from ? '<p class="scope-note">赛事启用版本：' + WR.escapeHtml(from) + ' 起；此前版本不计算有效局数。</p>' : '') +
            '<div class="notice info">有效局数（BP 率分母）：<b>' + (st.available || 0) + "</b>　选用 <b>" + st.picks +
            "</b>　禁用 <b>" + st.bans + "</b></div>" +
            tierDetails(st) + patchHistory(st, res) + roleHtml + banHtml +
            detailTable("Played By Teams（使用队伍）", teams, "team") +
            detailTable("Played With（常用搭档）", withArr, "champ") +
            detailTable("Played Against（常见对手）", againstArr, "champ");
    }

    function renderTiers(res) {
        const root = document.getElementById("bp-tier-list");
        const method = document.getElementById("bp-tier-method");
        if (!root || !method) return;
        const model = res.tierModel, config = model.config;
        const all = Object.keys(res.stats).filter(function (slug) { return WR.championMatches(slug, searchQuery); }).map(function (slug) { return res.stats[slug]; });
        const rated = all.filter(function (st) { return st.tier.status === "rated"; });
        const pending = all.filter(function (st) { return st.available > 0 && st.tier.status === "pending"; });
        const excluded = all.filter(function (st) { return st.available > 0 && ["excluded", "invalid"].includes(st.tier.status); });

        function tiles(rows) {
            return '<div class="tier-champions">' + rows.map(function (st) {
                const c = WR.getChampion(st.slug), rating = st.tier;
                const label = championName(st.slug);
                const value = rating.score == null ? rating.label : rating.score.toFixed(1) + ' 分';
                const wins = st.picks ? '胜率 ' + WR.fmtPercent(st.wins / st.picks * 100) : '未出场';
                const title = label + (c ? ' · ' + c.name : '') + ' · ' + rating.label +
                    ' · ' + value + ' · ' + wins + '（' + st.wins + ' 胜 ' + st.losses + ' 负） · 有效 ' + st.available + ' 局' + (rating.provisional ? ' · 初步结果' : '');
                return '<button type="button" class="tier-champion" data-detail="' + st.slug + '" title="' + WR.escapeHtml(title) +
                    '" aria-label="' + WR.escapeHtml(title + '，查看详情') + '">' + WR.champImg(st.slug) +
                    '<span class="tier-champion-info"><b>' + WR.escapeHtml(label) + '</b><span>' + value +
                    (rating.provisional ? ' <em>初步</em>' : '') + '</span><span>' + wins + '</span></span></button>';
            }).join('') + '</div>';
        }

        let html = '';
        if (!all.length) {
            html = '<p class="empty-note">未找到匹配的英雄，请尝试其他名称或昵称。</p>';
        } else if (!res.totalGames) {
            html = '<p class="empty-note">当前版本暂无比赛样本，尚不生成英雄梯度。</p>';
        } else if (!rated.length) {
            html = '<p class="empty-note">' + (all.every(st => !st.available) ? '匹配英雄在当前范围内暂无可用比赛样本，梯度暂待评级。' :
                '暂无英雄达到 ' + config.minGames + ' 个有效小局，梯度暂待评级。') + '</p>';
        } else {
            html = '<div class="tier-sample-summary">已评级 <b>' + rated.length + '</b> 位' +
                (pending.length ? ' · 待评级 ' + pending.length + ' 位' : '') +
                (rated.some(function (st) { return st.tier.provisional; }) ? ' · 标注「初步」的英雄有效样本不足 ' + config.provisionalGames + ' 局' : '') + '</div>';
            model.levels.forEach(function (level, index) {
                const rows = rated.filter(function (st) { return st.tier.label === level.label; }).sort(function (a, b) {
                    return b.tier.score - a.tier.score || championName(a.slug).localeCompare(championName(b.slug));
                });
                const range = index === 0 ? '≥ ' + level.min : level.min + '–<' + model.levels[index - 1].min;
                html += '<section class="tier-band" data-tier="' + level.label + '"><div class="tier-band-label">' +
                    tierBadge({ status: "rated", label: level.label }) + '<small>' + range + ' 分</small></div><div class="tier-band-content">';
                const heading = '<span>' + level.description + '</span><span>' + rows.length + ' 位</span>';
                if (level.label === "T4" && rows.length) {
                    const unseen = rows.filter(function (st) { return !st.picks && !st.bans; }).length;
                    html += '<details class="tier-low-list"' + (searchQuery ? ' open' : '') + '><summary>' + heading + ' <small>含 ' + unseen + ' 位未涉及 BP · 展开</small></summary>' + tiles(rows) + '</details>';
                } else {
                    html += '<div class="tier-band-heading">' + heading + '</div>' +
                        (rows.length ? tiles(rows) : '<p class="empty-note">暂无英雄达到此档</p>');
                }
                html += '</div></section>';
            });
        }
        if (pending.length) html += '<details class="tier-pending-list"><summary>待评级 · ' + pending.length + ' 位 · 有效局数不足 ' + config.minGames + '</summary>' + tiles(pending) + '</details>';
        if (excluded.length) html += '<details class="tier-pending-list"><summary>不参与或待核对 · ' + excluded.length + ' 位</summary>' + tiles(excluded) + '</details>';
        root.innerHTML = html;
        bindDetails(root, res);

        method.innerHTML = '<p><b>这是本站定义的 BP 与胜率综合模型（' + config.id + '）</b>，反映所选统计范围内的选禁热度与实战结果，不代表英雄的绝对强度。总榜汇总全部版本；7.2、7.3 各自重新计算。</p>' +
            '<p>设 P = 选用次数，B = 禁用次数，W = 选用胜场，N = 双边无畏下的有效局数。BP 加入 ' + config.priorGames + ' 个当前平均水平的虚拟样本；胜率加入 ' + config.winPriorGames + ' 个胜负各半的虚拟样本：</p>' +
            '<div class="tier-formula">平滑 BP 率 = (P + B + ' + config.priorGames + ' × q) / (N + ' + config.priorGames + ')<br>' +
            '平滑禁用率 = (B + ' + config.priorGames + ' × b) / (N + ' + config.priorGames + ')<br>' +
            'BP 基础分 = 90 × 平滑 BP 率 + 10 × 平滑禁用率<br>' +
            '修正胜率 = (W + ' + config.winPriorGames / 2 + ') / (P + ' + config.winPriorGames + ')<br>' +
            '<b>综合得分 = BP 基础分 × (2 × 修正胜率)，限制在 0–100 分</b></div>' +
            '<p>平均值按英雄有效机会加权：q = Σ(P+B) / ΣN，b = ΣB / ΣN，包含可用但未涉及 BP 的英雄。' +
            (res.totalGames ? '当前 q = <b>' + WR.fmtPercent(model.baselineBP * 100) + '</b>，b = <b>' + WR.fmtPercent(model.baselineBan * 100) + '</b>。' : '当前暂无可计算的平均值。') + '</p>' +
            '<ul><li>至少 ' + config.minGames + ' 个有效小局才评级；' + config.minGames + '–' + (config.provisionalGames - 1) + ' 局标为「初步」。没有样本时不分配 T4。</li>' +
            '<li>选用和禁用都计入 BP；禁用额外占 10% 权重。零出场时胜率系数为 1，保留 BP 基础分，长期被战术禁用的英雄无需出场也可获得高梯度。所有英雄使用同一公式。</li>' +
            '<li>出场胜率低于 50% 会降分，高于 50% 会加分，恰好 50% 不变。虚拟样本会减弱少量出场的影响；只胜一局不会直接按 100% 胜率评级。</li>' +
            '<li>胜率受到队伍、对手和阵容影响，目前未剥离这些因素。出装、补丁增强／削弱不直接加减分；历史选人列表保留原记录顺序，已补充的换线按实际分路标注；新记录保留队内选取顺序。</li>' +
            '<li>得分四舍五入到一位小数后，按上方固定门槛分档；不会按人数比例强行分出 OP。</li>' +
            '<li>权重、平滑样本数和分档门槛是本站设定，尚未做预测效果验证；「初步」是样本提示，不是统计置信度。</li></ul>';
    }

    function renderSummary(res) {
        const el = document.getElementById("stats-summary");
        if (!el) return;
        const bluePct = res.totalGames ? ((res.blueWins / res.totalGames) * 100).toFixed(2) + "%" : "-";
        const redPct = res.totalGames ? ((res.redWins / res.totalGames) * 100).toFixed(2) + "%" : "-";
        el.innerHTML =
            '<span class="stat-chip">总局数 <b>' + res.totalGames + "</b></span>" +
            '<span class="stat-chip">蓝方 <b>' + res.blueWins + "W - " + (res.totalGames - res.blueWins) + "L</b> (" + bluePct + ")</span>" +
            '<span class="stat-chip">红方 <b>' + res.redWins + "W - " + (res.totalGames - res.redWins) + "L</b> (" + redPct + ")</span>";
    }

    function renderLegend() {
        const el = document.getElementById("stats-legend");
        if (!el) return;
        el.innerHTML = '<div class="notice info"><b>BP 率口径 · 双边无畏征召</b>：BP 率 =（选用次数 + 禁用次数）/ 有效局数。某英雄在一个大场中被任一方选用后，该大场后续小局被无畏征召锁定，不再计入其有效局数；此前的小局无论是否被选用或禁用，都计入分母。例：第一局被选用，则该大场有效局数为 1；整场未被选用，则全部小局都计入。选用率 = 选用次数 / 有效局数；选用胜率 = 胜场 / 选用次数。</div>';
        el.innerHTML += '<p class="scope-note">所有统计均采用当前所选版本的已录入有效小局。增强／削弱不会重置英雄的 BP 分母；首次登场也不等于首次可用。<a href="patches.html">查看版本时间线与改动</a></p>';
    }

    function renderLengths(res) {
        const el = document.getElementById("stats-lengths");
        if (!el) return;
        const buckets = [
            ["<10", res.lengths.lt10],
            ["10-15", res.lengths.m10_15],
            ["15-20", res.lengths.m15_20],
            ["20-25", res.lengths.m20_25],
            ["25-30", res.lengths.m25_30],
            ["30+", res.lengths.gt30]
        ];
        let html = '<table class="wikitable"><thead><tr>';
        buckets.forEach(function (b) { html += "<th>" + b[0] + " 分钟</th>"; });
        html += "</tr></thead><tbody><tr>";
        buckets.forEach(function (b) { html += '<td class="num">' + b[1] + "</td>"; });
        html += "</tr></tbody></table>";
        el.innerHTML = html;
    }

    function renderChampionTable(res) {
        const table = document.getElementById("champion-stats-table");
        if (!table) return;
        const previous = table.querySelector('th[data-dir]');
        const previousKey = previous && previous.getAttribute('data-key');
        const previousDir = previous && previous.getAttribute('data-dir');
        const rows = Object.values(res.stats).filter(function (st) {
            return WR.championMatches(st.slug, searchQuery) && (searchQuery ? res.totalGames > 0 : st.picks > 0 || st.bans > 0);
        }).sort(function (a, b) { return b.picks - a.picks || b.bans - a.bans; });
        const count = document.getElementById('champion-filter-count');
        if (count) count.textContent = searchQuery ? '找到 ' + rows.length + ' 位英雄 · 英雄筛选不改变统计样本或梯度基准' : '显示 ' + rows.length + ' 位有 BP 记录的英雄 · 输入名称可查找全部英雄';
        function numeric(key, label, value, display) { return { key: key, label: label, value: value, display: display || value }; }
        function pctValue(wins, picks) { return picks ? wins / picks * 100 : -1; }
        const champion = {
            key: 'hero', label: '英雄', value: function (st) { return championName(st.slug); },
            display: function (st) {
                return '<button class="champion-name-button" data-detail="' + st.slug + '" title="查看详细统计与小版本选用">' + WR.champImg(st.slug, 'sm') +
                    '<span>' + WR.escapeHtml(championName(st.slug)) + '<small>' + tierBadge(st.tier) + '</small></span></button>';
            }
        };
        let columns = [champion,
            numeric('bp', 'BP 率', function (s) { return s.available ? (s.picks + s.bans) / s.available * 100 : -1; }, function (s) { return s.available ? WR.fmtPercent((s.picks + s.bans) / s.available * 100) : '—'; }),
            numeric('picks', '选用次数', function (s) { return s.picks; }),
            numeric('bans', '禁用次数', function (s) { return s.bans; }),
            numeric('wr', '选用胜率', function (s) { return pctValue(s.wins, s.picks); }, function (s) { return WR.pct(s.wins, s.losses); }),
            numeric('available', '有效局数', function (s) { return s.available; })
        ];
        if (tableView === 'detailed') {
            columns.push(numeric('tier', '梯度得分', function (s) { return s.tier.score == null ? -1 : s.tier.score; }, function (s) { return s.tier.score == null ? '待评级' : s.tier.score.toFixed(1); }),
                numeric('wins', '胜场', function (s) { return s.wins; }), numeric('losses', '负场', function (s) { return s.losses; }),
                numeric('pickRate', '选用率', function (s) { return s.available ? s.picks / s.available * 100 : 0; }, function (s) { return WR.fmtPercent(s.available ? s.picks / s.available * 100 : 0); }));
            [['blue', '蓝方'], ['red', '红方']].forEach(function (side) {
                ['Picks', 'Wins', 'Losses'].forEach(function (field, i) {
                    columns.push(numeric(side[0] + field, side[1] + ['选用', '胜场', '负场'][i], function (s) { return s[side[0] + field]; }));
                });
                columns.push(numeric(side[0] + 'Wr', side[1] + '胜率', function (s) { return pctValue(s[side[0] + 'Wins'], s[side[0] + 'Picks']); }, function (s) { return WR.pct(s[side[0] + 'Wins'], s[side[0] + 'Losses']); }),
                    numeric(side[0] + 'Rate', side[1] + '选用率', function (s) { return s.available ? s[side[0] + 'Picks'] / s.available * 100 : 0; }, function (s) { return WR.fmtPercent(s.available ? s[side[0] + 'Picks'] / s.available * 100 : 0); }));
            });
            columns.push(numeric('banRate', '禁用率', function (s) { return s.available ? s.bans / s.available * 100 : 0; }, function (s) { return WR.fmtPercent(s.available ? s.bans / s.available * 100 : 0); }));
        } else if (tableView === 'patches') {
            columns = [champion].concat(res.patches.map(function (patch) {
                return numeric('patch-' + patch.id, patch.id + '<small>' + patch.games + ' 局已录入</small>', function (st) {
                    return patch.games ? (st.byPatch[patch.id] || {}).picks || 0 : -1;
                }, function (st) {
                    if (!WR.championAvailable(st.slug, patch.id)) return '<span class="text-muted">—<small>尚未启用</small></span>';
                    if (!patch.games) return '<span class="text-muted">—<small>待录入</small></span>';
                    const p = st.byPatch[patch.id] || { picks: 0, available: 0 };
                    return '<b>' + p.picks + ' 次</b><small>选用率 ' + WR.fmtPercent(p.available ? p.picks / p.available * 100 : 0) + '</small>' + patchChange(st.slug, patch.id);
                });
            })).concat([numeric('picks', '总选用', function (s) { return s.picks; })]);
        }
        table.className = 'wikitable striped champion-table view-' + tableView;
        let html = '<caption class="sr-only">' + (tableView === 'patches' ? '各小版本英雄选用次数与选用率' : tableView === 'detailed' ? '英雄详细统计，含蓝红方拆分' : '英雄核心统计') + '</caption><thead><tr>';
        columns.forEach(function (col, i) {
            html += '<th data-sort data-col="' + i + '" data-key="' + col.key + '"><button type="button" class="sort-label">' + col.label + '</button></th>';
        });
        html += '</tr></thead><tbody>';
        rows.forEach(function (st) {
            html += '<tr data-champion="' + st.slug + '">' + columns.map(function (col, i) {
                return '<td class="' + (i ? 'num' : 'left') + '" data-value="' + WR.escapeHtml(col.value(st)) + '">' + col.display(st) + '</td>';
            }).join('') + '</tr>';
        });
        if (!rows.length) html += '<tr><td colspan="' + columns.length + '" class="empty-note">' + (res.totalGames ? '没有匹配的英雄，试试中文名、英文名或昵称。' : '当前版本暂无已录入赛果。') + '</td></tr>';
        table.innerHTML = html + '</tbody>';
        bindDetails(table, res);
        WR.makeSortable(table);
        if (previousKey) {
            const header = table.querySelector('th[data-key="' + previousKey + '"]');
            if (header) { header.click(); if (previousDir === 'desc') header.click(); }
        }
        const note = document.getElementById('stats-view-note');
        if (note) note.textContent = tableView === 'patches' ? '次数按实际小版本汇总；选用率使用该英雄在该小版本的无畏有效局数。点击增强／削弱标签查看改动，点击英雄查看完整变化。' :
            tableView === 'detailed' ? '详细视图包含蓝红方数据；窄屏可横向滚动。点击英雄查看分路、使用队伍及小版本选用。' : '点击表头排序，点击英雄查看梯度得分与小版本变化。蓝红方拆分位于详细视图。';
    }

    function renderGrids(res) {
        const unpickedEl = document.getElementById("unpicked-grid");
        const unpickedUnbannedEl = document.getElementById("unpicked-unbanned-grid");
        const count1 = document.getElementById("unpicked-count");
        const count2 = document.getElementById("unpicked-unbanned-count");
        if (!unpickedEl || !unpickedUnbannedEl) return;

        const unpicked = [];
        const unpickedUnbanned = [];
        Object.keys(res.stats).forEach(function (k) {
            const st = res.stats[k];
            if (!WR.championMatches(k, searchQuery)) return;
            if (st.available > 0 && st.picks === 0) {
                unpicked.push(st.slug);
                if (st.bans === 0) unpickedUnbanned.push(st.slug);
            }
        });
        unpicked.sort();
        unpickedUnbanned.sort();

        if (count1) count1.textContent = unpicked.length;
        if (count2) count2.textContent = unpickedUnbanned.length;
        unpickedEl.innerHTML = unpicked.length
            ? '<div class="icon-grid">' + unpicked.map(function (s) { return WR.champImg(s); }).join("") + "</div>"
            : '<div class="empty-note">' + (searchQuery ? '筛选范围内没有未选英雄' : res.totalGames ? '所有英雄均已被选用' : '暂无比赛样本，尚不统计未选英雄') + '</div>';
        unpickedUnbannedEl.innerHTML = unpickedUnbanned.length
            ? '<div class="icon-grid">' + unpickedUnbanned.map(function (s) { return WR.champImg(s); }).join("") + "</div>"
            : '<div class="empty-note">' + (res.totalGames ? '无' : '暂无比赛样本') + '</div>';
    }

    function renderDemoNotice() {
        const el = document.getElementById("demo-notice");
        if (!el) return;
        if (league && league.meta && league.meta.demo) {
            el.innerHTML = '<div class="notice warn">⚠ 当前数据包含示例比赛（demo = true）。正式录入数据后，请删除示例比赛并将 <b>meta.demo</b> 改为 <b>false</b>。</div>';
        } else {
            el.remove();
        }
    }

    function renderVersion(version) {
        const res = compute(version);
        WR.hideDialog();
        document.querySelectorAll("[data-version]").forEach(function (a) {
            const active = a.getAttribute("data-version") === version;
            a.classList.toggle("active", active);
            if (active) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
        });
        const scope = document.getElementById("stats-scope");
        const label = version === "all" ? "总榜 · 全部版本" : version + " 版本";
        if (scope) scope.textContent = label + " · 已录入 " + res.totalGames + " 个有效小局 · 英雄详情、胜率和时长均随版本切换";
        const meta = document.getElementById("meta-patch");
        if (meta) meta.textContent = version === "all" ? "7.2 / 7.3（总榜）" : version;
        const heroCount = document.getElementById('hero-count');
        if (heroCount) heroCount.textContent = version === 'all' ? WR.champions.length : WR.champions.filter(c => WR.championAvailable(c.slug, version)).length;
        const empty = document.getElementById("stats-empty");
        if (empty) empty.innerHTML = res.totalGames ? "" : '<div class="empty-state"><strong>' +
            WR.escapeHtml(label) + ' 暂无已录入赛果</strong><p>' +
            (version === "7.3" ? '第 6 周起采用 7.3。录入该版本比赛后，此处会自动生成统计。' : '录入有效赛果后，此处会自动生成统计。') +
            '</p><a href="schedule.html">查看赛程 →</a></div>';
        renderSummary(res);
        renderTiers(res);
        if (WR.renderRoleTiers) WR.renderRoleTiers(res, searchQuery);
        renderLegend();
        renderLengths(res);
        renderChampionTable(res);
        renderGrids(res);
        window.WR_STATS = res;
    }

    function selectedVersion() {
        const params = new URLSearchParams(window.location ? window.location.search : "");
        const value = params.get("version");
        return value === "7.2" || value === "7.3" ? value : "all";
    }

    WR.computeStats = compute;

    document.addEventListener("DOMContentLoaded", function () {
        if (!league) {
            const box = document.getElementById("champion-stats-table");
            if (box) box.innerHTML = '<div class="notice warn">未找到赛程数据，请检查 data/schedule.js 是否存在且格式正确。</div>';
            return;
        }
        renderDemoNotice();
        renderVersion(selectedVersion());
        const search = document.getElementById('champion-search');
        function refreshFilter() {
            searchQuery = search.value.trim();
            const res = window.WR_STATS;
            renderChampionTable(res);
            renderTiers(res);
            if (WR.renderRoleTiers) WR.renderRoleTiers(res, searchQuery);
            renderGrids(res);
        }
        if (search) search.addEventListener('input', refreshFilter);
        const clear = document.getElementById('clear-champion-search');
        if (clear) clear.addEventListener('click', function () { search.value = ''; refreshFilter(); search.focus(); });
        document.querySelectorAll('[data-stats-view]').forEach(function (button) {
            button.addEventListener('click', function () {
                tableView = button.getAttribute('data-stats-view');
                document.querySelectorAll('[data-stats-view]').forEach(function (b) { b.setAttribute('aria-pressed', String(b === button)); });
                renderChampionTable(window.WR_STATS);
            });
        });
        document.querySelectorAll("[data-version]").forEach(function (a) {
            a.addEventListener("click", function (event) {
                if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
                event.preventDefault();
                window.history.pushState(null, "", a.getAttribute("href"));
                renderVersion(a.getAttribute("data-version"));
            });
        });
        if (window.addEventListener) window.addEventListener("popstate", function () { renderVersion(selectedVersion()); });
    });
})();
