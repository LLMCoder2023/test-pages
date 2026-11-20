/* ==========================================================================
   Flyout panel system
   --------------------------------------------------------------------------
   Markup:
     <aside class="flyout" id="nav" data-side="left|right|bottom"
            data-modal="true|false" aria-hidden="true" aria-labelledby="...">
     <button data-flyout-target="nav">Open</button>
     <button data-flyout-close>Close</button>   (inside a flyout)
   API: Flyout.open(id), Flyout.close(id), Flyout.toggle(id), Flyout.closeAll()
   Events: "flyout:open" / "flyout:close" dispatched on the panel element.
   ========================================================================== */
(function () {
  "use strict";

  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const stack = [];          // open flyouts, top-most last
  const lastFocus = new Map(); // id -> element focused before opening
  let backdrop;

  function ensureBackdrop() {
    if (backdrop) return backdrop;
    backdrop = document.createElement("div");
    backdrop.className = "flyout-backdrop";
    backdrop.addEventListener("click", () => {
      const top = topModal();
      if (top) close(top.id);
    });
    document.body.appendChild(backdrop);
    return backdrop;
  }

  const isModal = (el) => el.dataset.modal !== "false";
  const topModal = () => [...stack].reverse().find(isModal);

  function syncChrome() {
    const anyModal = stack.some(isModal);
    ensureBackdrop().classList.toggle("is-visible", anyModal);
    document.body.classList.toggle("no-scroll", anyModal);
    document.querySelectorAll("[data-flyout-target]").forEach((btn) => {
      btn.setAttribute("aria-expanded", String(stack.some((f) => f.id === btn.dataset.flyoutTarget)));
    });
  }

  function open(id) {
    const el = document.getElementById(id);
    if (!el || el.classList.contains("is-open")) return el;

    // Only one flyout per side at a time
    stack.filter((f) => f.dataset.side === el.dataset.side).forEach((f) => close(f.id, { restoreFocus: false }));

    lastFocus.set(id, document.activeElement);
    el.classList.add("is-open");
    el.setAttribute("aria-hidden", "false");
    if (isModal(el)) {
      el.setAttribute("role", el.getAttribute("role") || "dialog");
      el.setAttribute("aria-modal", "true");
    }
    stack.push(el);
    syncChrome();

    // Focus after the slide transition has started
    requestAnimationFrame(() => {
      const target = el.querySelector("[autofocus]") || el.querySelector(FOCUSABLE);
      if (target) target.focus({ preventScroll: true });
    });

    el.dispatchEvent(new CustomEvent("flyout:open", { bubbles: true }));
    return el;
  }

  function close(id, { restoreFocus = true } = {}) {
    const el = document.getElementById(id);
    if (!el || !el.classList.contains("is-open")) return;
    el.classList.remove("is-open");
    el.setAttribute("aria-hidden", "true");
    const i = stack.indexOf(el);
    if (i > -1) stack.splice(i, 1);
    syncChrome();

    const prev = lastFocus.get(id);
    if (restoreFocus && prev && document.contains(prev)) prev.focus({ preventScroll: true });
    lastFocus.delete(id);

    el.dispatchEvent(new CustomEvent("flyout:close", { bubbles: true }));
  }

  const toggle = (id) => {
    const el = document.getElementById(id);
    if (el) el.classList.contains("is-open") ? close(id) : open(id);
  };
  const closeAll = () => [...stack].reverse().forEach((f) => close(f.id));

  // Delegated click handling
  document.addEventListener("click", (e) => {
    const opener = e.target.closest("[data-flyout-target]");
    if (opener) {
      e.preventDefault();
      toggle(opener.dataset.flyoutTarget);
      return;
    }
    const closer = e.target.closest("[data-flyout-close]");
    if (closer) {
      const panel = closer.closest(".flyout");
      if (panel) close(panel.id);
    }
  });

  // ESC closes the top-most panel; Tab is trapped inside modal panels
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && stack.length) {
      close(stack[stack.length - 1].id);
      return;
    }
    if (e.key !== "Tab") return;
    const top = topModal();
    if (!top || stack[stack.length - 1] !== top) return;
    const items = [...top.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (!top.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  });

  // Initial ARIA state
  document.querySelectorAll(".flyout").forEach((f) => f.setAttribute("aria-hidden", "true"));

  window.Flyout = { open, close, toggle, closeAll };
})();

/* ==========================================================================
   Toasts
   ========================================================================== */
window.toast = function (message, ms = 2600) {
  let stack = document.querySelector(".toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "toast-stack";
    stack.setAttribute("role", "status");
    stack.setAttribute("aria-live", "polite");
    document.body.appendChild(stack);
  }
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = message;
  stack.appendChild(t);
  setTimeout(() => {
    t.classList.add("out");
    t.addEventListener("animationend", () => t.remove(), { once: true });
  }, ms);
};

/* ==========================================================================
   Settings (accent color + reduced motion), persisted per browser
   ========================================================================== */
(function () {
  "use strict";
  const KEY = "gh-pages-demo:settings";

  const store = {
    get() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } },
    set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  };

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
  }

  function apply(s) {
    if (s.accent) {
      document.documentElement.style.setProperty("--accent", s.accent);
      document.documentElement.style.setProperty("--accent-rgb", hexToRgb(s.accent));
    }
    document.body.classList.toggle("reduce-motion", !!s.reduceMotion);
    document.querySelectorAll(".swatch").forEach((sw) =>
      sw.setAttribute("aria-pressed", String(sw.dataset.color === (s.accent || "#6ea8fe")))
    );
    const rm = document.getElementById("reduceMotion");
    if (rm) rm.checked = !!s.reduceMotion;
  }

  const settings = store.get();
  apply(settings);

  document.addEventListener("click", (e) => {
    const sw = e.target.closest(".swatch");
    if (!sw) return;
    settings.accent = sw.dataset.color;
    store.set(settings);
    apply(settings);
  });

  document.addEventListener("change", (e) => {
    if (e.target.id === "reduceMotion") {
      settings.reduceMotion = e.target.checked;
      store.set(settings);
      apply(settings);
    }
  });

  const reset = document.getElementById("resetSettings");
  if (reset) reset.addEventListener("click", () => {
    Object.keys(settings).forEach((k) => delete settings[k]);
    store.set(settings);
    document.documentElement.style.removeProperty("--accent");
    document.documentElement.style.removeProperty("--accent-rgb");
    apply(settings);
    window.toast("Settings reset");
  });
})();
