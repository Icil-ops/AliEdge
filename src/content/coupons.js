// Page de paiement AliExpress, Temu ou Shein : les codes promo partagés par la communauté AliEdge.
// Rien n'est fait tout seul : le membre choisit un code, AliEdge le remplit et clique sur « Appliquer »,
// puis le membre dit si le code a marché (ça classe les codes pour tout le monde).
(() => {
  if (window.__aliedgeCoupons) return;
  window.__aliedgeCoupons = true;
  const platform = /aliexpress/.test(location.hostname) ? "aliexpress" : /temu/.test(location.hostname) ? "temu" : /shein/.test(location.hostname) ? "shein" : null;
  if (!platform) return;
  const isCheckout = () => /\/p\/trade\/|checkout|order[_-]?confirm|\/cart|bgt_order|\/pay/i.test(location.pathname + location.search);

  const send = (msg) => { try { return chrome.runtime.sendMessage(msg); } catch { return Promise.resolve(null); } };
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const CODE_RE = /code|coupon|promo|bon de r[ée]duction|voucher/i;

  /** Champ du code promo : un champ texte dont l'étiquette parle de code, coupon ou promo. */
  function findInput() {
    for (const el of document.querySelectorAll('input[type="text"], input:not([type])')) {
      const label = [el.placeholder, el.getAttribute("aria-label"), el.name, el.id, el.closest("label")?.textContent, el.parentElement?.textContent].join(" ");
      if (CODE_RE.test(label) && el.offsetParent !== null) return el;
    }
    return null;
  }
  function findApply(input) {
    let scope = input.parentElement;
    for (let i = 0; i < 4 && scope; i++, scope = scope.parentElement) {
      const b = [...scope.querySelectorAll('button, [role="button"]')].find((x) => /appliquer|apply|utiliser|valider|use|ok/i.test(x.textContent || x.getAttribute("aria-label") || ""));
      if (b) return b;
    }
    return null;
  }
  function fill(input, code) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    input.focus();
    setter.call(input, code);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  let root = null, host = null, codes = [], open = false, tried = null, msg = "";
  function render() {
    if (!host) {
      host = document.createElement("div");
      host.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:2147483646;";
      root = host.attachShadow({ mode: "closed" });
      document.documentElement.appendChild(host);
    }
    root.innerHTML = `
      <style>
        *{box-sizing:border-box}
        .pill{all:unset;cursor:pointer;display:flex;align-items:center;gap:8px;padding:10px 16px 10px 10px;border-radius:999px;background:#1b1530;color:#fff;font:600 14px/1.1 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 10px 30px -8px rgba(27,21,48,.55)}
        .pill i{width:28px;height:28px;border-radius:50%;background:#6d3bff;display:grid;place-items:center;font-style:normal}
        .box{width:320px;background:#fff;color:#17132e;border-radius:18px;box-shadow:0 24px 60px -20px rgba(27,21,48,.6),0 0 0 1px rgba(23,19,46,.08);font:14px/1.35 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;overflow:hidden}
        .hd{display:flex;align-items:center;padding:12px 14px;background:#1b1530;color:#fff;font-weight:800}
        .hd button{all:unset;cursor:pointer;margin-left:auto;opacity:.7;font-size:18px}
        .list{max-height:300px;overflow:auto;padding:6px}
        .c{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;padding:8px;border-radius:12px}
        .c:hover{background:#f5f3ff}
        .code{font:800 14px/1.2 ui-monospace,Menlo,monospace;letter-spacing:.5px}
        .n{font-size:12px;color:#6b6585;margin-top:2px}
        .b{all:unset;cursor:pointer;padding:7px 12px;border-radius:9px;background:#6d3bff;color:#fff;font-weight:700;font-size:12.5px;text-align:center}
        .b.alt{background:#f1eefc;color:#17132e}
        .ask{margin:6px;padding:10px;border-radius:12px;background:#f5f3ff;font-size:13px}
        .ask .row{display:flex;gap:6px;margin-top:8px}
        .ask .row .b{flex:1}
        .add{display:flex;gap:6px;padding:10px;border-top:1px solid #eee9fb}
        .add input{flex:1;min-width:0;padding:8px 10px;border:1px solid #e2ddf7;border-radius:9px;font:600 13px ui-monospace,Menlo,monospace;text-transform:uppercase}
        .msg{padding:8px 12px;font-size:12.5px;color:#4a4566}
        .empty{padding:14px;font-size:13px;color:#4a4566}
      </style>
      ${!open ? `<button class="pill" type="button" data-act="open"><i aria-hidden="true">%</i>Codes promo AliEdge${codes.length ? ` (${codes.length})` : ""}</button>` : `
      <div class="box" role="dialog" aria-label="Codes promo partagés par la communauté AliEdge">
        <div class="hd">Codes promo de la communauté<button type="button" data-act="close" aria-label="Fermer">×</button></div>
        ${tried ? `<div class="ask">Le code <b>${esc(tried.code)}</b> a-t-il fait baisser le total ?<div class="row"><button class="b" type="button" data-vote="1">Oui, il marche</button><button class="b alt" type="button" data-vote="0">Non</button></div></div>` : ""}
        <div class="list">${codes.length ? codes.map((c) => `
          <div class="c"><div><div class="code">${esc(c.code)}</div><div class="n">${[c.note, c.min_order ? `dès ${String(c.min_order).replace(".", ",")} €` : "", c.ok_count ? `a marché ${c.ok_count} fois` : "pas encore confirmé"].filter(Boolean).map(esc).join(" · ")}</div></div>
          <button class="b" type="button" data-try="${esc(c.id)}">Essayer</button></div>`).join("") : `<div class="empty">Aucun code partagé pour ${platform === "aliexpress" ? "AliExpress" : platform === "temu" ? "Temu" : "Shein"} pour l'instant. Si tu en connais un qui marche, ajoute-le : il servira à toute la communauté.</div>`}</div>
        ${msg ? `<div class="msg">${esc(msg)}</div>` : ""}
        <form class="add"><input name="code" maxlength="40" placeholder="Ajouter un code" aria-label="Ajouter un code promo" autocomplete="off"><button class="b" type="submit">Ajouter</button></form>
      </div>`}`;
    root.querySelector('[data-act="open"]')?.addEventListener("click", () => { open = true; render(); });
    root.querySelector('[data-act="close"]')?.addEventListener("click", () => { open = false; tried = null; msg = ""; render(); });
    root.querySelectorAll("[data-try]").forEach((b) => b.addEventListener("click", () => {
      const c = codes.find((x) => x.id === b.dataset.try);
      const input = findInput();
      if (!input) { navigator.clipboard?.writeText(c.code).catch(() => {}); msg = `Code ${c.code} copié : colle-le dans le champ « code promo » de la page.`; tried = c; render(); return; }
      fill(input, c.code);
      const apply = findApply(input);
      if (apply) apply.click();
      msg = apply ? "Code saisi et appliqué. Regarde le total de la commande." : "Code saisi : clique sur « Appliquer » sur la page.";
      tried = c;
      render();
    }));
    root.querySelectorAll("[data-vote]").forEach((b) => b.addEventListener("click", async () => {
      const ok = b.dataset.vote === "1";
      await send({ type: "coupons:vote", id: tried.id, ok });
      msg = ok ? "Merci, le code remonte pour tout le monde." : "Merci, c'est noté.";
      tried = null;
      await load();
    }));
    root.querySelector("form.add")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const code = String(new FormData(e.target).get("code") || "").trim().toUpperCase();
      if (!/^[A-Z0-9_-]{3,40}$/.test(code)) { msg = "Un code, c'est 3 à 40 lettres ou chiffres."; render(); return; }
      const r = await send({ type: "coupons:add", platform, code });
      msg = r?.ok ? "Code ajouté. Essaie-le, puis dis s'il marche." : (r?.error || "Ajout impossible.");
      await load();
    });
  }

  async function load() {
    const r = await send({ type: "coupons:list", platform });
    if (!r?.ok) { if (host) { host.remove(); host = null; } return; } // pas connecté à AliEdge : rien à afficher
    codes = r.data || [];
    render();
  }

  // Les pages de paiement se chargent souvent par étapes, sans recharger.
  let shown = false;
  const check = () => {
    if (isCheckout() && !shown) { shown = true; load(); }
    else if (!isCheckout() && shown) { shown = false; host?.remove(); host = null; }
  };
  check();
  setInterval(check, 1500);
})();
