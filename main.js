(function () {
  "use strict";

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* --- WebGL: defer load until after first paint (dynamic bootstrap) --- */
  function injectGlField() {
    if (window.__voidSignalGlInjected) return;
    window.__voidSignalGlInjected = true;
    const s = document.createElement("script");
    s.src = "gl-field.js";
    s.async = false;
    document.head.appendChild(s);
  }

  function scheduleGlField() {
    if (prefersReducedMotion.matches) {
      injectGlField();
      return;
    }
    const ric = window.requestIdleCallback;
    if (typeof ric === "function") {
      ric(() => injectGlField(), { timeout: 2000 });
    } else {
      requestAnimationFrame(() => requestAnimationFrame(injectGlField));
    }
  }
  scheduleGlField();

  /* --- Geo-ish meta (Tokyo default, optional API failure silent) --- */
  const latEl = document.getElementById("lat");
  const lngEl = document.getElementById("lng");
  if (latEl && lngEl && navigator.geolocation && !prefersReducedMotion.matches) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        latEl.textContent = pos.coords.latitude.toFixed(2);
        lngEl.textContent = pos.coords.longitude.toFixed(2);
      },
      () => {},
      { timeout: 4000, maximumAge: 600000 }
    );
  }

  const utcEl = document.getElementById("utc");
  if (utcEl) {
    const offset = -new Date().getTimezoneOffset() / 60;
    utcEl.textContent = (offset >= 0 ? "+" : "") + offset;
  }

  /* --- Scroll reveal --- */
  const revealEls = document.querySelectorAll("[data-reveal]");
  if (revealEls.length && !prefersReducedMotion.matches) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    revealEls.forEach((el, i) => {
      el.style.transitionDelay = Math.min(i * 40, 400) + "ms";
      io.observe(el);
    });
  } else {
    revealEls.forEach((el) => el.classList.add("is-visible"));
  }

  /* --- Tile spotlight --- */
  document.querySelectorAll(".tile").forEach((tile) => {
    tile.addEventListener("mousemove", (e) => {
      const r = tile.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 100;
      const y = ((e.clientY - r.top) / r.height) * 100;
      tile.style.setProperty("--mx", x + "%");
      tile.style.setProperty("--my", y + "%");
    });
  });

  /* --- Scroll progress --- */
  const scrollBar = document.getElementById("scroll-progress");
  function scrollPercent() {
    const root = document.documentElement;
    const max = root.scrollHeight - root.clientHeight;
    if (max <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round((root.scrollTop / max) * 100)));
  }
  function updateScrollProgress() {
    if (!scrollBar) return;
    const p = scrollPercent();
    scrollBar.style.setProperty("--read", p + "%");
    scrollBar.setAttribute("aria-valuenow", String(p));
  }
  window.addEventListener("scroll", updateScrollProgress, { passive: true });
  window.addEventListener("resize", updateScrollProgress, { passive: true });
  updateScrollProgress();

  /* --- Lab deck metrics --- */
  const metricScroll = document.getElementById("metric-scroll");
  const metricViewport = document.getElementById("metric-viewport");
  const metricDpr = document.getElementById("metric-dpr");
  const metricGlMs = document.getElementById("metric-gl-ms");
  const metricGlScale = document.getElementById("metric-gl-scale");
  const metricNet = document.getElementById("metric-net");
  const metricVis = document.getElementById("metric-vis");
  const metricMotion = document.getElementById("metric-motion");
  const metricSw = document.getElementById("metric-sw");

  let lastGlFrameMs = null;
  let lastGlScale = null;
  let swStateLabel = "—";

  window.addEventListener("voidsignal:perf", (e) => {
    const d = e && e.detail;
    if (!d || typeof d.frameMs !== "number") return;
    lastGlFrameMs = d.frameMs;
    if (typeof d.renderScale === "number") lastGlScale = d.renderScale;
    if (metricGlMs) metricGlMs.textContent = d.frameMs.toFixed(1);
    if (metricGlScale && typeof d.renderScale === "number") {
      metricGlScale.textContent = d.renderScale.toFixed(2);
    }
  });

  function netLabel() {
    if (typeof navigator.onLine === "boolean" && !navigator.onLine) return "オフライン";
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!c) return "不明";
    const parts = [];
    if (c.effectiveType) parts.push(c.effectiveType);
    if (c.downlink != null) parts.push(String(c.downlink) + "Mbps");
    return parts.join(" · ") || "不明";
  }

  function refreshDeck() {
    if (metricScroll) metricScroll.textContent = String(scrollPercent());
    if (metricViewport) {
      metricViewport.textContent =
        String(Math.max(1, Math.round(window.innerWidth))) + "×" + String(Math.max(1, Math.round(window.innerHeight)));
    }
    if (metricDpr) metricDpr.textContent = String((window.devicePixelRatio || 1).toFixed(2));
    if (metricGlMs && lastGlFrameMs == null) metricGlMs.textContent = "—";
    if (metricGlScale && lastGlScale == null) metricGlScale.textContent = "—";
    if (metricNet) metricNet.textContent = netLabel();
    if (metricVis) metricVis.textContent = document.hidden ? "非表示" : "表示";
    if (metricMotion) metricMotion.textContent = prefersReducedMotion.matches ? "注意" : "通常";
    if (metricSw) {
      if (!("serviceWorker" in navigator)) metricSw.textContent = "未対応";
      else if (navigator.serviceWorker.controller) metricSw.textContent = "制御下";
      else metricSw.textContent = swStateLabel;
    }
  }

  window.addEventListener("scroll", refreshDeck, { passive: true });
  window.addEventListener("resize", refreshDeck, { passive: true });
  document.addEventListener("visibilitychange", refreshDeck, { passive: true });
  window.addEventListener("online", refreshDeck, { passive: true });
  window.addEventListener("offline", refreshDeck, { passive: true });
  if (navigator.connection && typeof navigator.connection.addEventListener === "function") {
    navigator.connection.addEventListener("change", refreshDeck);
  }
  prefersReducedMotion.addEventListener("change", refreshDeck);
  refreshDeck();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => {
        swStateLabel = reg ? "登録済" : "—";
        refreshDeck();
        reg.addEventListener("updatefound", () => {
          swStateLabel = "更新検知";
          refreshDeck();
        });
      })
      .catch(() => {
        swStateLabel = "登録失敗";
        refreshDeck();
      });
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      swStateLabel = "制御下";
      refreshDeck();
    });
  }

  /* --- Nav scroll spy (aria-current) --- */
  const navBySection = new Map(
    Array.from(document.querySelectorAll("[data-nav-section]")).map((a) => [a.getAttribute("data-nav-section") || "", a])
  );
  const spyIds = ["axis", "protocol", "signal", "deck", "contact"];
  const spyEls = spyIds.map((id) => document.getElementById(id)).filter(Boolean);
  let spyCurrent = "";
  if (spyEls.length && navBySection.size) {
    const spyIo = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (!visible.length) return;
        visible.sort((a, b) => (b.intersectionRatio || 0) - (a.intersectionRatio || 0));
        const id = visible[0].target.id;
        if (!id || spyCurrent === id) return;
        spyCurrent = id;
        navBySection.forEach((link, key) => {
          if (key === id) link.setAttribute("aria-current", "page");
          else link.removeAttribute("aria-current");
        });
      },
      { root: null, rootMargin: "-42% 0px -42% 0px", threshold: [0.02, 0.08, 0.2, 0.35] }
    );
    spyEls.forEach((el) => spyIo.observe(el));
  }

  /* --- Protocol timeline (accordion) --- */
  document.querySelectorAll(".protocol__head").forEach((btn) => {
    btn.addEventListener("click", () => {
      const expanded = btn.getAttribute("aria-expanded") === "true";
      const panelId = btn.getAttribute("aria-controls") || "";
      const panel = panelId ? document.getElementById(panelId) : null;
      if (!panel) return;
      const root = btn.closest(".protocol__timeline");
      if (root) {
        root.querySelectorAll(".protocol__head").forEach((other) => {
          if (other === btn) return;
          other.setAttribute("aria-expanded", "false");
          const oid = other.getAttribute("aria-controls");
          const op = oid ? document.getElementById(oid) : null;
          if (op) op.hidden = true;
        });
      }
      const next = !expanded;
      btn.setAttribute("aria-expanded", next ? "true" : "false");
      panel.hidden = !next;
    });
  });

  /* --- Log dialog --- */
  const LOGS = {
    a: {
      title: "LOG / AMBIENT",
      body:
        "[ambient] field_gain=0.94\n" +
        "[ambient] grain_mix=0.03\n" +
        "[note] reduce-motion では粒子レイヤーを抑制し、CSS フォールバックへ遷移します。",
    },
    b: {
      title: "LOG / ROUTING",
      body:
        "[route] cmdk.open -> filterCommands()\n" +
        "[route] hash -> scrollIntoView(smooth)\n" +
        "[route] log tile -> dialog.showModal() + pre.textContent",
    },
    c: {
      title: "LOG / FAILSAFE",
      body:
        "[failsafe] webglcontextlost -> cancelAnimationFrame\n" +
        "[failsafe] perfSmooth>24.5ms -> renderScale -= 0.038\n" +
        "[failsafe] fetch miss -> index.html from cache (SW)",
    },
  };

  const logDialog = document.getElementById("log-dialog");
  const logTitle = document.getElementById("log-dialog-title");
  const logBody = document.getElementById("log-dialog-body");
  const logClose = document.getElementById("log-dialog-close");
  const logCopy = document.getElementById("log-dialog-copy");
  let logClipboard = "";

  function openLog(key) {
    const spec = LOGS[key];
    if (!spec || !logDialog || !logTitle || !logBody) return;
    logTitle.textContent = spec.title;
    logBody.textContent = spec.body;
    logClipboard = spec.body;
    if (typeof logDialog.showModal === "function") {
      logDialog.showModal();
    }
  }

  document.querySelectorAll(".tile[data-log]").forEach((btn) => {
    btn.addEventListener("click", () => openLog(btn.getAttribute("data-log") || ""));
  });
  if (logClose && logDialog) {
    logClose.addEventListener("click", () => logDialog.close());
  }
  if (logCopy) {
    logCopy.addEventListener("click", async () => {
      if (!logClipboard) return;
      try {
        await navigator.clipboard.writeText(logClipboard);
        logCopy.textContent = "複製済";
        window.setTimeout(() => {
          logCopy.textContent = "クリップボードへ複製";
        }, 1600);
      } catch (_) {
        logCopy.textContent = "失敗";
        window.setTimeout(() => {
          logCopy.textContent = "クリップボードへ複製";
        }, 2000);
      }
    });
  }

  /* --- Command palette --- */
  const cmdk = document.getElementById("cmdk");
  const cmdkInput = document.getElementById("cmdk-input");
  const cmdkList = document.getElementById("cmdk-list");

  const COMMANDS = [
    { id: "top", label: "ヒーローへ", keys: "0 top hero", href: "#top" },
    { id: "axis", label: "軸セクションへ", keys: "1 axis 軸", href: "#axis" },
    { id: "protocol", label: "記録（タイムライン）へ", keys: "protocol 記録 trace", href: "#protocol" },
    { id: "signal", label: "信号セクションへ", keys: "2 signal", href: "#signal" },
    { id: "deck", label: "ラボ計測へ", keys: "3 deck lab", href: "#deck" },
    { id: "contact", label: "接点（フッター）へ", keys: "4 contact footer", href: "#contact" },
    {
      id: "log-a",
      label: "観測ログ AMBIENT",
      keys: "a ambient log",
      action: () => openLog("a"),
    },
    {
      id: "log-b",
      label: "観測ログ ROUTING",
      keys: "b routing log",
      action: () => openLog("b"),
    },
    {
      id: "log-c",
      label: "観測ログ FAILSAFE",
      keys: "c failsafe log",
      action: () => openLog("c"),
    },
    {
      id: "help",
      label: "ショートカットヘルプ",
      keys: "help ?",
      action: () => openHelp(),
    },
  ];

  let cmdkFiltered = COMMANDS.slice();
  let cmdkActive = 0;

  function openHelp() {
    const help = document.getElementById("help-dialog");
    if (help && typeof help.showModal === "function") help.showModal();
  }

  function closeCmdk() {
    if (cmdk && cmdk.open) cmdk.close();
  }

  function normalizeCmd(s) {
    return (s || "").trim().toLowerCase();
  }

  function filterCommands(q) {
    const n = normalizeCmd(q);
    if (!n) return COMMANDS.slice();
    return COMMANDS.filter((c) => {
      const hay = (c.label + " " + (c.keys || "")).toLowerCase();
      return hay.includes(n);
    });
  }

  function renderCmdkList() {
    if (!cmdkList) return;
    cmdkList.innerHTML = "";
    cmdkFiltered.forEach((c, i) => {
      const li = document.createElement("li");
      li.className = "cmdk__item" + (i === cmdkActive ? " is-active" : "");
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", i === cmdkActive ? "true" : "false");
      li.dataset.index = String(i);
      li.textContent = c.label;
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        runCommand(c);
      });
      cmdkList.appendChild(li);
    });
  }

  function runCommand(c) {
    if (!c) return;
    closeCmdk();
    if (c.href) {
      const el = document.querySelector(c.href);
      if (el) el.scrollIntoView({ behavior: prefersReducedMotion.matches ? "auto" : "smooth", block: "start" });
      else window.location.hash = c.href.slice(1);
      return;
    }
    if (typeof c.action === "function") c.action();
  }

  function openCmdk() {
    if (!cmdk || typeof cmdk.showModal !== "function" || !cmdkInput) return;
    cmdkInput.value = "";
    cmdkFiltered = filterCommands("");
    cmdkActive = 0;
    cmdk.showModal();
    window.requestAnimationFrame(() => {
      cmdkInput.focus();
      cmdkInput.select();
    });
    renderCmdkList();
  }

  if (cmdkInput) {
    cmdkInput.addEventListener("input", () => {
      cmdkFiltered = filterCommands(cmdkInput.value);
      cmdkActive = 0;
      renderCmdkList();
    });
  }

  if (cmdk) {
    cmdk.addEventListener("click", (e) => {
      if (e.target === cmdk) cmdk.close();
    });
    cmdk.addEventListener("close", () => {
      if (cmdkInput) cmdkInput.value = "";
    });
  }

  if (cmdkList) {
    cmdkList.addEventListener("mousemove", (e) => {
      const t = e.target.closest(".cmdk__item");
      if (!t) return;
      const idx = parseInt(t.dataset.index || "-1", 10);
      if (idx >= 0 && idx < cmdkFiltered.length) {
        cmdkActive = idx;
        renderCmdkList();
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    const target = e.target;
    const tag = target && target.tagName;
    const typing =
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      (target && target.isContentEditable);

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (cmdk && cmdk.open) closeCmdk();
      else openCmdk();
      return;
    }

    if (e.key === "?" && !typing) {
      if (cmdk && cmdk.open) return;
      e.preventDefault();
      openHelp();
      return;
    }

    if (!cmdk || !cmdk.open) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (cmdkFiltered.length) cmdkActive = (cmdkActive + 1) % cmdkFiltered.length;
      renderCmdkList();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (cmdkFiltered.length) cmdkActive = (cmdkActive - 1 + cmdkFiltered.length) % cmdkFiltered.length;
      renderCmdkList();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (cmdkFiltered.length) runCommand(cmdkFiltered[cmdkActive]);
    }
  });

  const helpDialog = document.getElementById("help-dialog");
  const helpClose = document.getElementById("help-close");
  if (helpClose && helpDialog) {
    helpClose.addEventListener("click", () => helpDialog.close());
  }
  if (helpDialog) {
    helpDialog.addEventListener("click", (e) => {
      if (e.target === helpDialog) helpDialog.close();
    });
  }
})();
