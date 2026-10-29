// Capture d'une zone de l'écran (clic droit « Capturer une zone » ou Alt+Maj+S) :
// la page est figée, le membre trace un rectangle, AliEdge cherche le produit dans cette zone.
(() => {
  if (window.__aliedgeCapture) return;
  window.__aliedgeCapture = true;
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0;z-index:2147483647;";
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `
    <style>
      .ov{position:fixed;inset:0;cursor:crosshair;background:rgba(15,10,35,.38);user-select:none;-webkit-user-select:none;touch-action:none}
      .sel{position:fixed;border:2px solid #8f6bff;border-radius:6px;box-shadow:0 0 0 9999px rgba(15,10,35,.38);background:transparent;display:none}
      .ov.drawing{background:transparent}
      .tip{position:fixed;left:50%;top:18px;transform:translateX(-50%);background:#1b1530;color:#fff;font:600 14px/1.3 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;padding:10px 16px;border-radius:999px;box-shadow:0 10px 30px -8px rgba(0,0,0,.5);display:flex;gap:12px;align-items:center;pointer-events:auto}
      .tip b{color:#b9a6ff}
      .tip button{all:unset;cursor:pointer;opacity:.7;padding:2px 6px;border-radius:6px}
      .tip button:hover{opacity:1;background:rgba(255,255,255,.1)}
    </style>
    <div class="ov" part="ov"></div>
    <div class="sel"></div>
    <div class="tip"><span>Trace un rectangle autour du produit · <b>Échap</b> pour annuler</span><button type="button" aria-label="Annuler">×</button></div>`;
  const ov = root.querySelector(".ov");
  const sel = root.querySelector(".sel");
  let start = null;
  const end = () => { window.__aliedgeCapture = false; host.remove(); document.removeEventListener("keydown", onKey, true); };
  const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); end(); } };
  document.addEventListener("keydown", onKey, true);
  root.querySelector(".tip button").addEventListener("click", end);
  const box = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });
  // La capture a été prise à l'ouverture : la page ne doit pas défiler pendant le tracé.
  ov.addEventListener("wheel", (e) => e.preventDefault(), { passive: false });
  ov.addEventListener("pointerdown", (e) => {
    start = { x: e.clientX, y: e.clientY };
    ov.setPointerCapture(e.pointerId);
    ov.classList.add("drawing");
    sel.style.display = "block";
    Object.assign(sel.style, { left: `${start.x}px`, top: `${start.y}px`, width: "0px", height: "0px" });
  });
  ov.addEventListener("pointermove", (e) => {
    if (!start) return;
    const b = box(start, { x: e.clientX, y: e.clientY });
    Object.assign(sel.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
  });
  ov.addEventListener("pointerup", (e) => {
    if (!start) return;
    const b = box(start, { x: e.clientX, y: e.clientY });
    start = null;
    if (b.w < 16 || b.h < 16) { sel.style.display = "none"; ov.classList.remove("drawing"); return; }
    const W = window.innerWidth, H = window.innerHeight;
    const rect = { x: b.x / W, y: b.y / H, w: b.w / W, h: b.h / H };
    end();
    try { chrome.runtime.sendMessage({ type: "capture:done", rect }); } catch { /* extension rechargée */ }
  });
  document.documentElement.appendChild(host);
})();
