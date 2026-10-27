// Bouton AliEdge sur les fiches produit AliExpress, Temu et Shein.
(() => {
  if (window.__aliedgePill) return;
  window.__aliedgePill = true;

  const isProductPage = () => {
    const { hostname: h, pathname: p, search } = location;
    if (/aliexpress\./.test(h)) return /\/item\/\d+\.html/.test(p);
    if (/temu\.com$/.test(h)) return /-g-\d+\.html/.test(p) || /[?&]goods_id=/.test(search);
    if (/shein\.(com|fr)$/.test(h)) return /-p-\d+(-cat-\d+)?\.html/.test(p);
    return false;
  };

  let host = null;
  let label = null;
  let enabled = true;

  function send(msg) {
    try { return chrome.runtime.sendMessage(msg); } catch { return Promise.resolve(null); }
  }

  function mount() {
    if (host || !enabled) return;
    host = document.createElement("div");
    host.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:2147483646;display:flex;flex-direction:column;align-items:flex-end;gap:8px;";
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `
      <style>
        button{all:unset;cursor:pointer;display:flex;align-items:center;gap:10px;padding:10px 16px 10px 10px;border-radius:999px;
          background:#1b1530;color:#fff;font:600 14px/1.1 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
          box-shadow:0 10px 30px -8px rgba(27,21,48,.55),0 0 0 1px rgba(255,255,255,.08) inset;transition:transform .18s cubic-bezier(.2,.8,.2,1)}
        button:hover{transform:translateY(-2px)}
        button:focus-visible{outline:3px solid #8f6bff;outline-offset:3px}
        .mark{width:28px;height:28px;border-radius:50%;background:#6d3bff;display:grid;place-items:center}
        .mark svg{width:16px;height:16px}
        .val{font-variant-numeric:tabular-nums}
        .pos{color:#5ee0a0}.neg{color:#ff8f8f}
        .x{all:unset;cursor:pointer;margin-left:4px;opacity:.5;font-size:16px;padding:0 2px}
        .wrap{display:flex;flex-direction:column;align-items:flex-end;gap:8px}
        .bp{background:#ff3d57;box-shadow:0 10px 30px -8px rgba(255,61,87,.6)}
        .bp .mark{background:rgba(255,255,255,.2)}
        .x:hover{opacity:1}
        @media (prefers-reduced-motion:reduce){button{transition:none}}
      </style>
      <div class="wrap">
      <button type="button" class="bp" data-act="barapics" aria-label="Créer les photos et l'annonce de ce produit avec Barapics">
        <span class="mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg></span>
        <span>Photos et annonce avec Barapics</span>
      </button>
      <button type="button" data-act="analyse" aria-label="Analyser ce produit avec AliEdge">
        <span class="mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17l6-6 4 4 6-8"/><path d="M14 7h6v6"/></svg></span>
        <span class="label">Analyser sur Vinted</span>
        <span class="x" role="button" aria-label="Masquer" title="Masquer">×</span>
      </button>
      </div>`;
    label = root.querySelector(".label");
    root.querySelector(".x").addEventListener("click", (e) => { e.stopPropagation(); unmount(); });
    root.querySelector('[data-act="analyse"]').addEventListener("click", () => send({ type: "open:panel" }));
    // Barapics ouvre la fiche directement (lien sans paramètres de suivi ; Temu garde son goods_id).
    root.querySelector('[data-act="barapics"]').addEventListener("click", () => {
      const u = new URL(location.href);
      const keep = new URLSearchParams();
      if (u.searchParams.get("goods_id")) keep.set("goods_id", u.searchParams.get("goods_id"));
      const clean = `${u.origin}${u.pathname}${keep.toString() ? `?${keep}` : ""}`;
      send({ type: "open:barapics", url: clean });
    });
    document.documentElement.appendChild(host);
  }

  function unmount() {
    host?.remove();
    host = null;
    label = null;
  }

  function sync() {
    if (isProductPage()) mount(); else unmount();
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== "pill:result" || !label) return;
    if (msg.margin == null) { label.textContent = "Pas assez de données"; return; }
    const m = Number(msg.margin);
    const sign = m > 0 ? "+" : "";
    label.innerHTML = `<span class="val ${m > 0 ? "pos" : "neg"}">${sign}${m.toFixed(2).replace(".", ",")} €</span> · ${msg.score}/100`;
  });

  send({ type: "settings:pill" }).then((r) => {
    enabled = r?.ok ? r.data.showPill !== false : true;
    sync();
  });

  // Temu et Shein changent de page sans recharger.
  let last = location.href;
  setInterval(() => {
    if (location.href !== last) {
      last = location.href;
      unmount();
      sync();
    }
  }, 800);
})();
