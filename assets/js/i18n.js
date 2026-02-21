/* CTK i18n — lightweight dictionary-based translations (no Google Translate) */
(function () {
  const STORAGE_KEY = "ctk_lang";
  const SUPPORTED = ["es", "en"];
  let __ctkLang = "es";
  let __ctkDict = {};

  function getUrlLang() {
    try {
      const u = new URL(window.location.href);
      const l = (u.searchParams.get("lang") || "").toLowerCase();
      return SUPPORTED.includes(l) ? l : null;
    } catch (_) {
      return null;
    }
  }

  function getStoredLang() {
    try {
      const l = (localStorage.getItem(STORAGE_KEY) || "").toLowerCase();
      return SUPPORTED.includes(l) ? l : null;
    } catch (_) {
      return null;
    }
  }

  function detectLang() {
    const nav = (navigator.language || "es").toLowerCase();
    return nav.startsWith("en") ? "en" : "es";
  }

  async function loadDict(lang) {
    const url = `assets/i18n/${lang}.json`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
    return await res.json();
  }

  function deepGet(obj, path) {
    if (!obj) return null;
    const parts = String(path).split(".");
    let cur = obj;
    for (const p of parts) {
      if (cur && Object.prototype.hasOwnProperty.call(cur, p)) cur = cur[p];
      else return null;
    }
    return cur;
  }

  function applyTranslations(dict) {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (!key) return;
      const val = deepGet(dict, key);
      if (typeof val === "string") {
        el.textContent = val;
      }
    });

    // Optional: translate aria-label / title if provided
    document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
      const key = el.getAttribute("data-i18n-aria");
      const val = deepGet(dict, key);
      if (typeof val === "string") el.setAttribute("aria-label", val);
    });

    
    // Optional: translate placeholder if provided
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      const val = deepGet(dict, key);
      if (typeof val === "string") el.setAttribute("placeholder", val);
    });

    
    // Optional: translate innerHTML if provided (use for rich text with links/line breaks)
    document.querySelectorAll("[data-i18n-html]").forEach((el) => {
      const key = el.getAttribute("data-i18n-html");
      const val = deepGet(dict, key);
      if (typeof val === "string") el.innerHTML = val;
    });

    // Optional: translate alt if provided
    document.querySelectorAll("[data-i18n-alt]").forEach((el) => {
      const key = el.getAttribute("data-i18n-alt");
      const val = deepGet(dict, key);
      if (typeof val === "string") el.setAttribute("alt", val);
    });
document.querySelectorAll("[data-i18n-title]").forEach((el) => {
      const key = el.getAttribute("data-i18n-title");
      const val = deepGet(dict, key);
      if (typeof val === "string") el.setAttribute("title", val);
    });
  }

  function updateLangUI(activeLang) {
    // Show a checkmark next to the active language in the dropdown
    document.querySelectorAll(".lang-check[data-lang-check]").forEach((icon) => {
      const lang = icon.getAttribute("data-lang-check");
      if (!lang) return;
      icon.classList.toggle("d-none", lang !== activeLang);
    });
  }

  async function setLang(lang, opts = { pushState: false }) {
    const finalLang = SUPPORTED.includes(lang) ? lang : "es";
    document.documentElement.setAttribute("lang", finalLang);
    document.documentElement.setAttribute("data-lang", finalLang);
    try { localStorage.setItem(STORAGE_KEY, finalLang); } catch (_) {}

    let dict = {};
    try {
      dict = await loadDict(finalLang);
    } catch (e) {
      console.warn("[i18n] Dictionary load failed:", e);
      dict = {}; // fallback: keep existing Spanish strings
    }

    __ctkLang = finalLang;
    __ctkDict = dict || {};

    applyTranslations(__ctkDict);

    updateLangUI(finalLang);

    
    // Notify listeners (e.g., dynamic JS strings) that language changed
    try {
      window.dispatchEvent(new CustomEvent("ctk:langchange", { detail: { lang: finalLang } }));
    } catch (_) {}

    // Mark ready to avoid "flash"
    document.documentElement.classList.add("i18n-ready");

    // Optionally update URL ?lang=...
    if (opts.pushState) {
      try {
        const u = new URL(window.location.href);
        u.searchParams.set("lang", finalLang);
        window.history.replaceState({}, "", u.toString());
      } catch (_) {}
    }
  }

  function bindLangButtons() {
    document.querySelectorAll("[data-set-lang]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const lang = btn.getAttribute("data-set-lang");
        await setLang(lang, { pushState: true });
      });
    });
  }

  async function init() {
    const urlLang = getUrlLang();
    const stored = getStoredLang();
    const initial = urlLang || stored || document.documentElement.getAttribute("lang") || detectLang();
    bindLangButtons();
    await setLang(initial, { pushState: Boolean(urlLang) });
  }

  
  function tKey(key, fallback = "") {
    const val = deepGet(__ctkDict, key);
    return typeof val === "string" ? val : (fallback || "");
  }

  function applyNow() {
    applyTranslations(__ctkDict || {});
    updateLangUI(__ctkLang);
  }

  function getLang() {
    return __ctkLang;
  }

  window.CTK_I18N = { setLang, t: tKey, apply: applyNow, getLang };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
