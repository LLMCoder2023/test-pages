/* Global keyboard shortcuts. Pages can add their own via the "shortcut" event. */
(function () {
  "use strict";
  const map = {
    "?": () => Flyout.toggle("help-panel"),
    "m": () => Flyout.toggle("nav-panel"),
    ",": () => Flyout.toggle("settings-panel"),
  };

  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target.tagName || "").toLowerCase();
    if (["input", "textarea", "select"].includes(tag) || e.target.isContentEditable) return;

    const fn = map[e.key];
    if (fn) { e.preventDefault(); fn(); return; }
    document.dispatchEvent(new CustomEvent("shortcut", { detail: { key: e.key, original: e } }));
  });
})();
