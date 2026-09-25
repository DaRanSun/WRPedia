// Tournament rules confirmed by the site owner. Lane shares must add up to 1.
// banOnlyRoles applies ONLY when the selected version has no picks for that hero.
window.WR_CHAMPION_RULES = {
    hwei: { availableFrom: "7.3" },
    zilean: { banOnlyRoles: { support: 1 } },
    alistar: { banOnlyRoles: { support: 1 } },
    aurora: { banOnlyRoles: { mid: 1 } },
    taliyah: { banOnlyRoles: { jungle: 1 } },
    warwick: { banOnlyRoles: { top: 1 } }
};
