// Sur Leboncoin (si activé) : bouton « + Concurrent » à côté du vendeur, sur une annonce et sur sa page.
(() => {
  if (window.__aliedgeLbcComp) return;
  window.__aliedgeLbcComp = true;
  const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const send = async (msg) => { try { return await chrome.runtime.sendMessage(msg); } catch { return null; } };
  let tracked = new Set();
  const CSS = `:host{all:initial;display:inline-flex;vertical-align:middle;margin-left:8px}
    button{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:999px;background:#6d3bff;color:#fff;
      font:600 12px/1.2 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;white-space:nowrap}
    button:hover{background:#5a2be6} button:focus-visible{outline:2px solid #8f6bff;outline-offset:2px}
    button.ok{background:#0fa968} button.ok.off{background:#5b5670} button.err{background:#b4233a}`;

  function makeButton(seller, label) {
    const host = document.createElement("span");
    host.className = "aliedge-lbc-competitor";
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `<style>${CSS}</style><button type="button"></button>`;
    const btn = root.querySelector("button");
    const paint = () => { const on = tracked.has(seller); btn.className = on ? "ok" : ""; btn.textContent = on ? "✓ Concurrent suivi" : "+ Concurrent"; };
    paint();
    btn.addEventListener("mouseenter", () => { if (tracked.has(seller)) { btn.classList.add("off"); btn.textContent = "Ne plus suivre"; } });
    btn.addEventListener("mouseleave", paint);
    btn.addEventListener("click", async (e) => {
      e.preventDefault(); e.stopPropagation();
      const on = tracked.has(seller);
      btn.textContent = on ? "Retrait…" : "Ajout…";
      const r = await send({ type: on ? "lbc:untrack" : "lbc:track", seller, label });
      if (r?.ok) { if (on) tracked.delete(seller); else tracked.add(seller); paint(); }
      else { btn.className = "err"; btn.textContent = String(r?.error || "Ouvre AliEdge et connecte-toi").slice(0, 40); setTimeout(paint, 3500); }
    }, true);
    host.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); });
    return host;
  }

  function decorate() {
    // Annonce : à côté du pseudo du vendeur.
    const part = document.querySelector('[data-qa-id="adview_profile_part"]');
    if (part && !part.querySelector(".aliedge-lbc-competitor")) {
      const links = [...part.querySelectorAll('a[href*="/profile/"]')];
      const named = links.find((a) => (a.textContent || "").trim()) || links[0];
      const seller = named?.getAttribute("href")?.match(UUID)?.[0]?.toLowerCase();
      if (seller) named.insertAdjacentElement("afterend", makeButton(seller, (named.textContent || "").trim().slice(0, 80) || null));
    }
    // Page du vendeur : à côté de son nom.
    const own = location.pathname.match(UUID)?.[0]?.toLowerCase();
    const h1 = /^\/profile\//.test(location.pathname) && document.querySelector("h1");
    if (own && h1 && !h1.querySelector(".aliedge-lbc-competitor")) h1.appendChild(makeButton(own, (h1.textContent || "").trim().slice(0, 80) || null));
  }
  let queued = false;
  const schedule = () => { if (queued) return; queued = true; setTimeout(() => { queued = false; decorate(); }, 800); };
  send({ type: "lbc:trackedIds" }).then((r) => { if (r?.ok) tracked = new Set(r.data || []); decorate(); new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true }); });
})();
