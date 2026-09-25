(function () {
    "use strict";
    const key = "wrpedia-theme";
    let theme = "dark";
    try { if (localStorage.getItem(key) === "light") theme = "light"; } catch (_) { /* Private/offline storage may be unavailable. */ }
    function apply(value) {
        theme = value === "light" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", theme);
        document.querySelectorAll("[data-theme-toggle]").forEach(function (button) {
            const label = theme === "dark" ? "亮色模式" : "暗色模式";
            button.textContent = label;
            button.setAttribute("aria-label", "切换为" + label);
            button.setAttribute("aria-pressed", String(theme === "light"));
        });
    }
    apply(theme); // In <head>, before styles render: avoid a flash of the wrong theme.
    document.addEventListener("DOMContentLoaded", function () {
        apply(theme);
        document.querySelectorAll("[data-theme-toggle]").forEach(function (button) {
            button.addEventListener("click", function () {
                apply(theme === "dark" ? "light" : "dark");
                try { localStorage.setItem(key, theme); } catch (_) { /* Current-page toggle still works. */ }
            });
        });
    });
    window.addEventListener("storage", function (event) { if (event.key === key) apply(event.newValue); });
})();
