(function () {
  const CONFIG_URL = "/static/theme/theme.conf";
  const DEFAULT_STORAGE_KEY = "sirius_theme";
  const DEFAULT_CONFIG = {
    storageKey: DEFAULT_STORAGE_KEY,
    icons: {
      light: "/static/theme/icons/luntosun.svg",
      dark: "/static/theme/icons/suntolun.svg",
      lightAlt: "/static/theme/icons/luntosun2.svg",
      darkAlt: "/static/theme/icons/suntolun2.svg"
    },
    light: {
      bg: "#f4f5fb",
      surface: "#ffffff",
      "surface-soft": "#f7f8fd",
      "surface-muted": "#eef1f8",
      "surface-strong": "#e4e8f2",
      border: "#dbe1ee",
      "border-soft": "#ebeff6",
      "border-strong": "#c9d1e3",
      text: "#1e2433",
      "text-soft": "#556074",
      "text-muted": "#7d8799",
      "text-faint": "#98a2b3",
      accent: "#6d5ef3",
      "accent-strong": "#5f4ee6",
      "accent-soft": "#f0edff",
      "accent-soft-strong": "#e4dfff",
      "success-soft": "#e9f8f1",
      "success-text": "#178760",
      "danger-soft": "#fff0f4",
      "danger-text": "#cf476c",
      "warning-soft": "#fff6df",
      "warning-text": "#b97d12",
      overlay: "rgba(17, 24, 39, 0.34)",
      shadow: "0 18px 48px rgba(15, 23, 42, 0.08)"
    },
    dark: {
      bg: "#16141d",
      surface: "#1f1b2b",
      "surface-soft": "#262233",
      "surface-muted": "#2d2840",
      "surface-strong": "#393150",
      border: "#3e3654",
      "border-soft": "#332d46",
      "border-strong": "#544673",
      text: "#f4f1ff",
      "text-soft": "#cac2df",
      "text-muted": "#a69dbf",
      "text-faint": "#887fa3",
      accent: "#9f83ff",
      "accent-strong": "#b69fff",
      "accent-soft": "#2f2843",
      "accent-soft-strong": "#3d3258",
      "success-soft": "#183427",
      "success-text": "#84dfaa",
      "danger-soft": "#3d1e31",
      "danger-text": "#ff8db4",
      "warning-soft": "#3c2f19",
      "warning-text": "#f1ca73",
      overlay: "rgba(8, 10, 16, 0.72)",
      shadow: "0 24px 64px rgba(6, 8, 14, 0.44)"
    }
  };

  const state = {
    theme: document.documentElement.dataset.theme === "dark" ? "dark" : "light",
    config: DEFAULT_CONFIG
  };

  function appendCacheBuster(url) {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}v=${Date.now()}`;
  }

  function getSystemTheme() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  function readTheme(storageKey) {
    try {
      const storedTheme = localStorage.getItem(storageKey);
      if (storedTheme === "dark" || storedTheme === "light") {
        return storedTheme;
      }
      return getSystemTheme();
    } catch (error) {
      return document.documentElement.dataset.theme === "dark"
        ? "dark"
        : getSystemTheme();
    }
  }

  function persistTheme(theme, storageKey) {
    try {
      localStorage.setItem(storageKey, theme);
    } catch (error) {
      return;
    }
  }

  function parseConfig(text) {
    const raw = {};
    const lines = text.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();
      raw[key] = value;
    }

    function extractPalette(prefix, fallback) {
      const palette = { ...fallback };
      Object.keys(raw).forEach((key) => {
        if (key.startsWith(prefix)) {
          palette[key.slice(prefix.length)] = raw[key];
        }
      });
      return palette;
    }

    return {
      storageKey: raw["storage.key"] || DEFAULT_STORAGE_KEY,
      icons: {
        light: raw["icon.light.primary"] || DEFAULT_CONFIG.icons.light,
        dark: raw["icon.dark.primary"] || DEFAULT_CONFIG.icons.dark,
        lightAlt: raw["icon.light.alt"] || DEFAULT_CONFIG.icons.lightAlt,
        darkAlt: raw["icon.dark.alt"] || DEFAULT_CONFIG.icons.darkAlt
      },
      light: extractPalette("light.", DEFAULT_CONFIG.light),
      dark: extractPalette("dark.", DEFAULT_CONFIG.dark)
    };
  }

  function applyPaletteVariables(config) {
    const root = document.documentElement;

    ["light", "dark"].forEach((mode) => {
      Object.entries(config[mode]).forEach(([token, value]) => {
        root.style.setProperty(`--${mode}-${token}`, value);
      });
    });
  }

  function updateToggleButtons(replayAnimation) {
    const nextTheme = state.theme === "dark" ? "light" : "dark";
    const currentIcon = state.theme === "dark" ? state.config.icons.dark : state.config.icons.light;
    const currentTitle = nextTheme === "dark" ? "\u0412\u043a\u043b\u044e\u0447\u0438\u0442\u044c \u0442\u0435\u043c\u043d\u0443\u044e \u0442\u0435\u043c\u0443" : "\u0412\u043a\u043b\u044e\u0447\u0438\u0442\u044c \u0441\u0432\u0435\u0442\u043b\u0443\u044e \u0442\u0435\u043c\u0443";

    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      button.setAttribute("aria-pressed", state.theme === "dark" ? "true" : "false");
      button.setAttribute("aria-label", currentTitle);
      button.setAttribute("title", currentTitle);
    });

    document.querySelectorAll("[data-theme-toggle-icon]").forEach((image) => {
      image.src = replayAnimation ? appendCacheBuster(currentIcon) : currentIcon;
      image.alt = state.theme === "dark" ? "\u0422\u0435\u043c\u043d\u0430\u044f \u0442\u0435\u043c\u0430" : "\u0421\u0432\u0435\u0442\u043b\u0430\u044f \u0442\u0435\u043c\u0430";
    });
  }

  function setTheme(theme, options) {
    const settings = Object.assign({ persist: true, replayAnimation: false }, options);
    state.theme = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = state.theme;

    if (settings.persist) {
      persistTheme(state.theme, state.config.storageKey);
    }

    updateToggleButtons(settings.replayAnimation);
    document.dispatchEvent(new CustomEvent("themechange", { detail: { theme: state.theme } }));
  }

  function bindToggles() {
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      if (button.dataset.themeBound === "true") {
        return;
      }

      button.dataset.themeBound = "true";
      button.addEventListener("click", function () {
        const nextTheme = state.theme === "dark" ? "light" : "dark";
        setTheme(nextTheme, { persist: true, replayAnimation: true });
      });
    });
  }

  async function loadConfig() {
    try {
      const response = await fetch(CONFIG_URL, { cache: "no-store" });
      if (!response.ok) {
        return DEFAULT_CONFIG;
      }
      return parseConfig(await response.text());
    } catch (error) {
      return DEFAULT_CONFIG;
    }
  }

  async function initTheme() {
    state.config = await loadConfig();
    applyPaletteVariables(state.config);
    bindToggles();
    setTheme(readTheme(state.config.storageKey), { persist: false, replayAnimation: false });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTheme, { once: true });
  } else {
    initTheme();
  }
})();
