// Tournament patch timeline. Announcement dates are NOT tournament adoption dates.
// Only standard Summoner's Rift changes are included; no ARAM / augment balance.
window.WR_PATCHES = [
    {
        id: "7.2c", sourceCN: "https://lolm.qq.com/v2/news-page.html?docid=4343988264828447290", major: "7.2", published: "2026-08-12", weeks: "第 1 周", status: "已采用",
        title: "龙区收益提高，兰博出装转向法强",
        summary: "科加斯成长加强；瑞兹与沃里克节奏受限。元素龙、龙魂与上路线机制同步调整。",
        source: "https://wildrift.leagueoflegends.com/zh-tw/news/game-updates/wild-rift-patch-notes-7-2c/",
        champions: [
            { slug: "chogath", type: "buff", core: true, summary: "尖刺与盛宴加强，叠层和后期团战收益提高。", changes: ["E 基础伤害 15/35/55/75 → 20/45/70/95；目标最大生命系数 2.15/2.5/2.85/3.2% → 2.3/2.7/3.1/3.5%，每层盛宴系数 0.5% → 0.6%。", "R 冷却 80/70/60 → 70/60/50 秒；额外生命伤害系数 8% → 10%。"] },
            { slug: "jinx", type: "buff", summary: "提高对线攻击力和被动攻速。", changes: ["基础攻击力 54 → 58；被动攻速 12% → 25%。"] },
            { slug: "nilah", type: "nerf", summary: "暴击转穿甲收益和大招伤害降低。", changes: ["Q 暴击率转护甲穿透系数 35% → 28%。", "R 伤害 60/120/180 + 140% 额外攻击力 → 60/110/160 + 50% 额外攻击力。"] },
            { slug: "leona", type: "adjust", summary: "前期坦度下调，生命成长和 W 冷却补偿。", changes: ["基础生命 750 → 690；基础护甲 55 → 50；每级生命 120 → 128。", "W 冷却 14/13/12/11 → 13/12/11/10 秒；额外双抗均由 40/60/80/100 → 30/50/70/90。"] },
            { slug: "rumble", type: "adjust", core: true, summary: "↓ 肉装：生命护盾收益降低；↑ 法装：Q、E 法强加成提高。", changes: ["基础生命 690 → 660；每级生命 120 → 128。", "Q 伤害 120/160/200/240 + 110% 法强 + 6/8/10/12% 目标最大生命 → 100/140/180/220 + 125% 法强 + 7/8/9/10% 目标最大生命。", "危险温度 Q：180/240/300/360 + 165% 法强 + 9/12/15/18% 目标最大生命 → 150/210/270/330 + 187.5% 法强 + 10.5/12/13.5/15% 目标最大生命。", "W 护盾 40/70/100/130 + 6% 最大生命 → 40/80/120/160 + 4%；危险温度护盾 60/105/150/195 + 9% 最大生命 → 60/120/180/240 + 6%。", "E 法强系数 40% → 50%；危险温度系数 60% → 75%。"] },
            { slug: "nasus", type: "nerf", summary: "前期更易被压制，大招空窗延长。", changes: ["基础护甲 46 → 40；R 冷却 75/70/65 → 90/80/70 秒。"] },
            { slug: "ryze", type: "nerf", core: true, summary: "基础坦度与 W 伤害降低，前期换血和发育承压。", changes: ["基础生命 660 → 630；基础护甲 40 → 37。", "W 伤害 70/110/150/190 + 65% 法强 + 4% 额外法力 → 50/90/130/170 + 55% 法强 + 3% 额外法力。"] },
            { slug: "warwick", type: "nerf", core: true, summary: "大招各级增加 20 秒冷却，抓人与击杀窗口收紧。", changes: ["R 冷却 80/70/60 → 100/90/80 秒；基础伤害 125/300/475 → 100/275/450。"] },
            { slug: "kogmaw", type: "nerf", summary: "AP 远程消耗的射程、伤害和蓝耗同时受限。", changes: ["R 法力消耗 40–400 → 50–500；射程 12/14/16 → 11/13/15；基础伤害 100/140/180 → 80/120/160。"] }
        ],
        sections: [
            { title: "装备", entries: [
                { name: "二级鞋", changes: ["狂战士胫甲：攻速 30% → 35%。", "水银之靴：韧性 15% → 30%。", "铁板靴：减伤 6% → 10%。"] },
                { name: "三级鞋", changes: ["炮铜胫甲：近战／远程移速加成 15/12% → 10/7%。", "带链碾碎者：魔抗 35 → 30；装甲战靴：护甲 35 → 30。", "灵能使之靴：法强 40 → 35，真实伤害 22 → 18。"] },
                { name: "日炎圣盾", changes: ["生命 425 → 350；护甲 20 → 40。", "合成：斑比的熔渣（1300）+ 红水晶（500）+ 布甲（500）+ 600 → 斑比的熔渣（1300）+ 锁子甲（900）+ 700。"] },
                { name: "挺进破坏者", changes: ["攻速 15% → 25%。"] },
                { name: "米凯尔的祝福", changes: ["治疗与护盾强度 6% → 9%；净除冷却 90 → 75 秒。"] },
                { name: "败魔", changes: ["魔抗 75 → 80；护盾 70–180 + 10% 最大生命 → 50–150 + 14% 最大生命（基础值随等级成长）。"] }
            ] },
            { title: "战场", entries: [
                { name: "元素龙与龙魂", changes: ["火龙攻击力／法强加成 3% → 4%；火龙魂伤害 135 + 25% 额外攻击力 + 12.5% 法强 → 180 + 35% 额外攻击力 + 15% 法强。", "山龙魂护盾 260 → 350。", "水龙每 5 秒已损失生命回复 2% → 2.8%；水龙魂治疗 190 + 36% 额外攻击力 + 18% 法强 + 7.5% 额外生命 → 250 + 48% 额外攻击力 + 25% 法强 + 10% 额外生命。"] },
                { name: "上路线", changes: ["移除 6:00 前上路小兵之间的伤害减免。"] }
            ] }
        ]
    },
    {
        id: "7.2d", sourceCN: "https://lolm.qq.com/v2/news-page.html?docid=6909026084858112167", major: "7.2", published: "2026-08-26", weeks: "第 2–3 周", status: "已采用",
        title: "法师与战士补强，热门选角降温",
        summary: "莫德凯撒、辛德拉与凯特琳加强；锤石、永恩、格温及崔斯特受到削弱。",
        source: "https://wildrift.leagueoflegends.com/zh-tw/news/game-updates/wild-rift-patch-notes-7-2d/",
        champions: [
            { slug: "mordekaiser", type: "buff", core: true, summary: "被动穿透提高，E 更频繁，改善后期作战能力。", changes: ["被动魔法穿透 1/3/5/7% → 3/6/9/12%；E 冷却 17.5/15/12.5/10 → 15/13/11/9 秒。"] },
            { slug: "yuumi", type: "buff", summary: "附身与护盾更频繁，治疗／护盾收益提高。", changes: ["W 冷却 10/5/0 → 8/4/0 秒；被动治疗与护盾强度 6/7/8/9% → 8/9/10/11%。", "E 冷却 10 → 9 秒；护盾 85/110/135/160 + 30% 法强 → 80/110/140/170 + 40% 法强（一级基础值略降）。"] },
            { slug: "syndra", type: "buff", core: true, summary: "Q 基础伤害、W/E 法强收益与 E 频率全面提高。", changes: ["Q 基础伤害 70/115/160/205 → 80/130/180/230；W 法强系数 45% → 60%。", "E 冷却 17 → 15 秒；法强系数 35% → 50%。"] },
            { slug: "caitlyn", type: "buff", core: true, summary: "爆头成长提高，夹子充能加快，强化阵地控制。", changes: ["被动伤害 50%–100% 攻击力 + 125 × 暴击率 → 60%–110% 攻击力 + 200 × 暴击率。", "W 充能时间 27/22/17/12 → 25/20/15/10 秒。"] },
            { slug: "renekton", type: "buff", core: true, summary: "Q 额外攻击力收益提高，W 升级收益更高；一级 W 基础伤害略降。", changes: ["普通 Q 额外攻击力系数 90% → 100%。", "W 基础伤害 24/48/72/96 → 20/60/100/140；红怒 W 36/72/108/144 → 30/90/150/210。"] },
            { slug: "fiora", type: "buff", core: true, summary: "破绽真实伤害提高，改善对坦克与重甲目标的威胁。", changes: ["被动目标最大生命伤害系数 3.5% + 0.05% 额外攻击力 → 4% + 0.055% 额外攻击力。"] },
            { slug: "vladimir", type: "buff", summary: "生命／法强互转和技能伤害提高。", changes: ["被动额外生命转法强 4.5% → 5%，法强转生命 140% → 150%。", "强化 Q 额外伤害系数 75% → 85%；E 最低伤害 20/40/60/80 + 35% 法强 + 2.5% 最大生命 → 30/50/70/90 + 35% 法强 + 3% 最大生命。"] },
            { slug: "veigar", type: "buff", summary: "Q 施法距离增加，更容易安全发育。", changes: ["Q 距离 7.75 → 9。"] },
            { slug: "thresh", type: "nerf", core: true, summary: "钩中后的冷却返还减少，连续开团频率降低。", changes: ["Q 命中冷却返还 3 → 2 秒。"] },
            { slug: "yone", type: "nerf", core: true, summary: "基础护甲降低，上路对线更容易受压。", changes: ["基础护甲 43 → 37。"] },
            { slug: "gwen", type: "nerf", core: true, summary: "Q 法强收益与对野伤害下降，影响对线和清野。", changes: ["Q 每段法强系数 7% → 6%，最后一段 35% → 30%；野怪伤害系数 105% → 100%。"] },
            { slug: "twisted-fate", type: "nerf", core: true, summary: "E 法强系数降低，限制 AP 爆发和持续输出。", changes: ["E 法强系数 45% → 35%。"] },
            { slug: "pantheon", type: "nerf", summary: "Q 的低血量暴击门槛收紧。", changes: ["Q 暴击触发目标生命门槛 35% → 25%。"] }
        ],
        sections: [
            { title: "装备", entries: [
                { name: "夜之锋刃", changes: ["固定护甲穿透 8 → 12。"] },
                { name: "风暴狂涌", changes: ["价格 2900 → 2800。"] }
            ] },
            { title: "推荐配置更新", entries: [
                { name: "阿卡丽、弗拉基米尔、李青", changes: ["调整客户端推荐出装：阿卡丽方案 2；弗拉基米尔方案 1–3；李青方案 1–2 及第 3 套符文。仅更新预设，不改变英雄数值。", "阿卡丽 2：风暴狂涌、无限法球、灭世者之帽、虚空之杖、中娅沙漏、灵能使之靴。", "弗拉基米尔 1：海克斯科技火箭腰带、峡谷制造者、灭世者之帽、蜕生、无限法球、猩红明朗；2：海克斯科技火箭腰带、风暴狂涌、灭世者之帽、虚空之杖、无限法球、灵能使之靴；3：星界驱驰、峡谷制造者、灭世者之帽、虚空之杖、中娅沙漏、灵能使之靴。", "李青 1：三相之力、星蚀、黑色切割者、守护天使、死亡之舞、装甲战靴；2：幽梦之魂、三相之力、巨蛇之牙、赛瑞尔达的怨恨、守护天使、不朽战靴；符文 3：热忱战斗、断切、传说：欢欣、过度生长。"] }
            ] },
            { title: "战场", entries: [{ name: "本次未调整", changes: ["公告未列出常规峡谷战场改动。"] }] }
        ]
    },
    {
        id: "7.2e", sourceCN: "https://lolm.qq.com/v2/news-page.html?docid=16213110214904670224", major: "7.2", published: "2026-09-09", weeks: "第 4–5 周", status: "已采用",
        title: "蔚的开团降频，坦克辅助获得补强",
        summary: "蔚的突进伤害和大招频率降低；诺提勒斯护盾、墨菲特坦度与留人能力提高。",
        source: "https://wildrift.leagueoflegends.com/zh-tw/news/game-updates/wild-rift-patch-notes-72e/",
        champions: [
            { slug: "nautilus", type: "buff", core: true, summary: "W 基础护盾与生命收益同时提高，增强进场承伤。", changes: ["W 护盾 65/75/85/95 + 9/10/11/12% 最大生命 → 70/80/90/100 + 11/12/13/14% 最大生命。"] },
            { slug: "malphite", type: "buff", core: true, summary: "护甲成长、Q 减速和 W 后续普攻都得到加强。", changes: ["每级护甲 4.3 → 5；Q 减速 15/20/25/30% → 20/25/30/35%。", "W 连续普攻基础伤害 10/20/30/40 → 20/30/40/50。"] },
            { slug: "janna", type: "buff", summary: "护盾基础值与法强加成提高。", changes: ["E 护盾 65/90/115/140 + 45% 法强 → 80/120/160/200 + 50% 法强。"] },
            { slug: "vi", type: "nerf", core: true, summary: "Q 额外攻击力系数下调，R 冷却增加，限制连续抓人与先手。", changes: ["Q 最低／最高伤害的额外攻击力系数 80/160% → 60/120%。", "R 冷却 60/55/50 → 80/70/60 秒。"] },
            { slug: "swain", type: "nerf", summary: "大招伤害与治疗的法强系数降低，纯 AP 收益下降。", changes: ["R 每秒伤害 10/25/40 + 15% 法强 → 15/25/35 + 6% 法强。", "R 每秒治疗 20/30/40 + 20% 法强 → 15/30/45 + 10% 法强。"] }
        ],
        sections: [
            { title: "装备", entries: [
                { name: "探索者的护臂／翠绿屏障", changes: ["护臂凝滞冷却 120 → 150 秒；屏障无效化冷却 50 → 65 秒。"] },
                { name: "星蚀", changes: ["价格 3000 → 2900；近战护盾 140 + 35% 额外攻击力 → 150 + 40% 额外攻击力。"] },
                { name: "无终恨意", changes: ["生命 200 → 300；护甲／魔抗 45 → 40；新增 10 技能急速。", "合成：锁子甲（900）+ 负极斗篷（900）+ 红水晶（500）+ 700 → 锁子甲（900）+ 负极斗篷（900）+ 燃烧宝石（1000）+ 200。"] }
            ] },
            { title: "战场", entries: [{ name: "本次未调整", changes: ["公告未列出常规峡谷战场改动。"] }] }
        ]
    },
    {
        id: "7.3", major: "7.3", published: "2026-09-21", weeks: "第 6 周", status: "已采用",
        title: "软辅装备全面加强，暴击射手核心崛起",
        summary: "刷野速度全面改动，打野选择更加多样。",
        source: "https://wildrift.leagueoflegends.com/zh-tw/news/game-updates/wild-rift-patch-notes-7-3/",
        champions: [], sections: []
    }
];
