// AliEdge — Balade SHEIN
// Injecté par src/tour.js (service worker) sur *.shein.com, à chaque page tant que la balade est active.
// Parcourt le catalogue comme une vraie personne, lentement : défilements « molette » ou
// « trackpad », pauses aléatoires, retours en arrière, arrêts sur des produits (survol = 2e photo).
// De temps en temps, ouvre un article, regarde les photos et la fiche, puis revient au catalogue.
// Note chaque article vu ou ouvert (titre, prix, photo, catégorie) pour le rapport « pistes de niches ».
//
// Contrôles : Échap = arrêter · Espace = pause / reprise · bouton du badge.
// Si SHEIN affiche une vérification (« je ne suis pas un robot »), la balade s'arrête net et attend :
// c'est la personne qui la fait, puis clique « Reprendre ». La balade ne touche jamais à la vérification.
// Garde-fous : 45 min maximum par balade, 20 articles ouverts maximum par heure.
// Si tu fais défiler toi-même, la balade te laisse la main quelques secondes puis reprend.
(() => {
  if (window.__aeSheinTour) return;

  // ---------- outils ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  // Gaussienne (Box-Muller) bornée : les durées « humaines » se regroupent autour d'une moyenne.
  const gauss = (mean, sd, min, max) => {
    const u = 1 - Math.random(), v = Math.random();
    const n = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return Math.min(max, Math.max(min, mean + n * sd));
  };
  const pick = (weights) => {
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (const [k, w] of Object.entries(weights)) { if ((r -= w) <= 0) return k; }
    return Object.keys(weights)[0];
  };

  // ---------- rythmes ----------
  // pause : multiplicateur des temps d'arrêt · speed : vitesse de glisse (px/s)
  // step : part de l'écran parcourue par défilement · weights : fréquence de chaque geste
  const PACES = {
    calme: {
      pause: 1.7, speed: [180, 380], step: [0.25, 0.6],
      weights: { scroll: 44, product: 24, back: 8, read: 16, flick: 0, open: 8 },
      openGap: 80000, product: [26000, 55000],
    },
    normal: {
      pause: 1.0, speed: [360, 760], step: [0.35, 0.85],
      weights: { scroll: 50, product: 18, back: 10, read: 10, flick: 5, open: 7 },
      openGap: 50000, product: [18000, 38000],
    },
    dynamique: {
      pause: 0.6, speed: [650, 1250], step: [0.5, 1.1],
      weights: { scroll: 52, product: 14, back: 8, read: 5, flick: 14, open: 7 },
      openGap: 30000, product: [12000, 24000],
    },
  };

  const MAX_MINUTES = 45;
  const MAX_OPENS_PER_HOUR = 20;

  let S = null; // état de la balade en cours

  // ---------- vérification SHEIN ----------
  // Repère une page ou une fenêtre de vérification anti-robot. On ne cherche jamais à la résoudre :
  // on s'arrête et on rend la main.
  const VERIFY_SEL = [
    'iframe[src*="captcha" i]', 'iframe[src*="geetest" i]', 'iframe[src*="recaptcha" i]',
    'iframe[src*="hcaptcha" i]', 'iframe[src*="arkoselabs" i]', 'iframe[src*="challenge" i]',
    '[id*="captcha" i]', '[class*="captcha" i]', '[class*="geetest" i]', '[id*="geetest" i]',
    '[class*="risk-verify" i]', '[class*="slide-verify" i]', '[class*="slider-verify" i]',
  ].join(',');
  function verificationShown() {
    if (/captcha|\/risk\/|verify|challenge/i.test(location.pathname + location.search)) return true;
    for (const el of document.querySelectorAll(VERIFY_SEL)) {
      if (el.closest('#ae-shein-tour-badge')) continue;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width > 40 && r.height > 30 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05) return true;
    }
    return false;
  }

  function onVerification() {
    if (!S || S.stopped || S.verifying) return;
    S.verifying = true;
    S.paused = true;
    S.navigating = false;
    leave();
    if (S.cursor) S.cursor.style.opacity = '0';
    if (!S.badge) S.badge = makeBadge(); // même si le compteur était masqué, on prévient
    S.badge.style.display = 'flex';
    S.badge.style.opacity = '1';
    // Le reste de la balade sera encore plus calme.
    S.cautious = true;
    if (S.tour) save({ cautious: true, verifyCount: (S.tour.verifyCount || 0) + 1, activeMs: S.activeMs });
    send({ type: 'tour:verify' });
    renderBadge();
  }

  // ---------- élément qui défile ----------
  function getScroller() {
    const doc = document.scrollingElement || document.documentElement;
    if (doc.scrollHeight - window.innerHeight > 200) return doc;
    // Certaines pages font défiler un conteneur plutôt que la fenêtre : on prend le plus grand.
    let best = doc, bestH = 0;
    for (const el of document.querySelectorAll('div,main,section')) {
      const cs = getComputedStyle(el);
      if (!/(auto|scroll)/.test(cs.overflowY)) continue;
      const h = el.scrollHeight - el.clientHeight;
      if (h > bestH && el.clientHeight > window.innerHeight * 0.5) { best = el; bestH = h; }
    }
    return best;
  }
  const curY = () => S.scroller.scrollTop;
  const maxY = () => Math.max(0, S.scroller.scrollHeight - S.scroller.clientHeight);
  const viewH = () => (S.scroller === (document.scrollingElement || document.documentElement) ? window.innerHeight : S.scroller.clientHeight);
  function setY(y) {
    S.selfScrollAt = performance.now();
    S.scroller.scrollTop = y;
  }

  // ---------- attente « intelligente » (gère pause, prise en main, onglet caché) ----------
  async function hold() {
    while (S && !S.stopped && (S.paused || document.hidden || performance.now() < S.yieldUntil)) {
      await sleep(150);
    }
  }
  async function wait(minMs, maxMs) {
    const mean = (minMs + maxMs) / 2;
    let left = gauss(mean, (maxMs - minMs) / 4, minMs, maxMs) * S.pace.pause;
    while (S && !S.stopped && left > 0) {
      await hold();
      const dt = Math.min(100, left);
      await sleep(dt);
      left -= dt;
    }
  }
  const alive = () => S && !S.stopped && (S.endAt === Infinity || S.activeMs < S.endAt);

  // ---------- gestes de défilement ----------
  // Glisse continue (trackpad) avec accélération / décélération.
  async function glide(delta) {
    const start = curY();
    const target = Math.min(maxY(), Math.max(0, start + delta));
    const dist = target - start;
    if (Math.abs(dist) < 2) return 0;
    const [s1, s2] = S.pace.speed;
    const dur = Math.max(350, (Math.abs(dist) / rand(s1, s2)) * 1000);
    let t = 0, last = performance.now();
    while (S && !S.stopped && t < 1) {
      await hold();
      const now = performance.now();
      t = Math.min(1, t + (now - last) / dur);
      last = now;
      setY(start + dist * easeInOut(t));
      await frame();
    }
    return curY() - start;
  }

  // Crans de molette : petits sauts adoucis, avec de légères irrégularités.
  async function wheel(delta) {
    const start = curY();
    const notch = rand(90, 125) * Math.sign(delta);
    const n = Math.max(1, Math.round(Math.abs(delta) / Math.abs(notch)));
    for (let i = 0; i < n && S && !S.stopped; i++) {
      await hold();
      const from = curY();
      const to = Math.min(maxY(), Math.max(0, from + notch));
      const dur = rand(140, 220);
      const t0 = performance.now();
      for (let t = 0; t < 1 && !S.stopped;) {
        t = Math.min(1, (performance.now() - t0) / dur);
        setY(from + (to - from) * easeOut(t));
        await frame();
      }
      await sleep(rand(40, 160) * S.pace.pause);
    }
    return curY() - start;
  }

  // Défilement rapide qui ralentit tout seul (inertie).
  async function flick(delta) {
    const start = curY();
    const target = Math.min(maxY(), Math.max(0, start + delta));
    const dur = rand(700, 1100);
    const t0 = performance.now();
    for (let t = 0; t < 1 && S && !S.stopped;) {
      await hold();
      t = Math.min(1, (performance.now() - t0) / dur);
      setY(start + (target - start) * (1 - Math.pow(1 - t, 4)));
      await frame();
    }
    return curY() - start;
  }

  const scrollBy = (delta) => (Math.random() < 0.45 ? wheel(delta) : glide(delta));

  // ---------- produits ----------
  const CARD_SEL = [
    '.product-card', '.S-product-item', '.product-list__item', '.j-expose__product-item',
    '[class*="product-card"]', '[class*="productCard"]', 'section[role="listitem"]',
  ].join(',');

  function visibleCards() {
    let cards = [...document.querySelectorAll(CARD_SEL)];
    if (!cards.length) cards = [...document.querySelectorAll('a[href*="-p-"] img')].map((i) => i.closest('a'));
    const vh = window.innerHeight;
    return cards.filter((c) => {
      if (!c || c.closest('#ae-shein-tour-badge')) return false;
      const r = c.getBoundingClientRect();
      return r.width > 60 && r.height > 80 && r.top > vh * 0.08 && r.bottom < vh * 0.97;
    });
  }

  // Choisit de préférence un produit proche du centre de l'écran, et pas déjà vu.
  function chooseCard() {
    const cards = visibleCards().filter((c) => !S.seen.has(c));
    if (!cards.length) return null;
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    const scored = cards.map((c) => {
      const r = c.getBoundingClientRect();
      const d = Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy);
      return { c, w: 1 / (1 + d / 250) + Math.random() * 0.3 };
    }).sort((a, b) => b.w - a.w);
    return scored[randInt(0, Math.min(2, scored.length - 1))].c;
  }

  function fire(el, type, x, y) {
    el.dispatchEvent(new MouseEvent(type, {
      bubbles: type !== 'mouseenter' && type !== 'mouseleave',
      cancelable: true, view: window, clientX: x, clientY: y,
    }));
  }

  async function lookAt(card, keep) {
    S.seen.add(card);
    const img = card.querySelector('img') || card;
    const r = img.getBoundingClientRect();
    const x = r.left + r.width * rand(0.35, 0.65);
    const y = r.top + r.height * rand(0.3, 0.6);
    await moveCursor(x, y);
    if (S.stopped) return;
    ['mouseover', 'mouseenter'].forEach((t) => { fire(card, t, x, y); fire(img, t, x, y); });
    card.style.transition = 'box-shadow .4s';
    const prevShadow = card.style.boxShadow;
    if (S.opts.highlight) card.style.boxShadow = '0 0 0 2px rgba(139,92,246,.55), 0 10px 30px rgba(15,23,42,.12)';
    S.hovered = { card, img, x, y, prevShadow };
    // Petits mouvements du curseur sur la photo pendant qu'on regarde.
    const steps = randInt(1, 3);
    for (let i = 0; i < steps && !S.stopped; i++) {
      await wait(900, 1900);
      const rr = img.getBoundingClientRect();
      const nx = rr.left + rr.width * rand(0.25, 0.75), ny = rr.top + rr.height * rand(0.25, 0.75);
      await moveCursor(nx, ny, 0.5);
      fire(img, 'mousemove', nx, ny);
    }
    if (keep) return;
    await wait(600, 1400);
    leave();
  }

  function leave() {
    if (!S || !S.hovered) return;
    const { card, img, x, y, prevShadow } = S.hovered;
    ['mouseout', 'mouseleave'].forEach((t) => { fire(img, t, x, y); fire(card, t, x, y); });
    card.style.boxShadow = prevShadow || '';
    S.hovered = null;
  }

  // ---------- curseur visible (option, pratique pour filmer) ----------
  function makeCursor() {
    const el = document.createElement('div');
    el.id = 'ae-shein-tour-cursor';
    el.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483646;pointer-events:none;transition:opacity .3s;will-change:transform;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))';
    el.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 2l15 9.5-6.6 1.5 3.9 7.4-2.8 1.5-3.9-7.4L4 19z" fill="#fff" stroke="#0f172a" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(el);
    return el;
  }
  function placeCursor(x, y) {
    S.cx = x; S.cy = y;
    if (S.cursor) S.cursor.style.transform = `translate(${x}px,${y}px)`;
  }
  // Trajectoire courbe (Bézier) avec accélération puis freinage, comme une vraie main.
  async function moveCursor(x, y, speedFactor = 1) {
    const x0 = S.cx, y0 = S.cy;
    const dist = Math.hypot(x - x0, y - y0);
    if (!S.cursor || dist < 3) { placeCursor(x, y); return; }
    const bend = rand(-0.25, 0.25) * dist;
    const mx = (x0 + x) / 2 + bend * ((y - y0) / dist), my = (y0 + y) / 2 - bend * ((x - x0) / dist);
    const dur = (250 + dist * rand(0.7, 1.1)) * speedFactor * Math.sqrt(S.pace.pause);
    const t0 = performance.now();
    for (let t = 0; t < 1 && S && !S.stopped;) {
      await hold();
      t = Math.min(1, (performance.now() - t0) / dur);
      const e = easeInOut(t), u = 1 - e;
      placeCursor(u * u * x0 + 2 * u * e * mx + e * e * x, u * u * y0 + 2 * u * e * my + e * e * y);
      await frame();
    }
  }

  // ---------- badge ----------
  function makeBadge() {
    const el = document.createElement('div');
    el.id = 'ae-shein-tour-badge';
    el.style.cssText = [
      'position:fixed', 'right:16px', 'bottom:16px', 'z-index:2147483647', 'display:flex',
      'align-items:center', 'gap:8px', 'padding:6px 6px 6px 12px', 'border-radius:999px',
      'background:rgba(13,8,32,.86)', 'color:#fff', 'backdrop-filter:blur(6px)',
      'font:600 12px/1 system-ui,-apple-system,Segoe UI,sans-serif', 'user-select:none',
      'box-shadow:0 6px 24px rgba(0,0,0,.22)', 'border:1px solid rgba(139,92,246,.45)',
      'transition:opacity .4s', 'opacity:1',
    ].join(';');
    const btn = 'all:unset;cursor:pointer;padding:5px 10px;border-radius:999px;font-weight:700;';
    el.innerHTML =
      '<span data-dot style="width:8px;height:8px;border-radius:50%;background:#a78bfa;animation:aeTourPulse 1.8s infinite"></span>' +
      '<span data-label>Balade</span><span data-t style="opacity:.7;font-variant-numeric:tabular-nums;min-width:30px">0:00</span>' +
      `<button type="button" data-pause style="${btn}background:rgba(255,255,255,.12)" title="Pause (Espace)">Pause</button>` +
      `<button type="button" data-stop style="${btn}background:#7c3aed" title="Arrêter (Échap)">Stop</button>`;
    const style = document.createElement('style');
    style.textContent = '@keyframes aeTourPulse{0%{box-shadow:0 0 0 0 rgba(167,139,250,.7)}70%{box-shadow:0 0 0 7px rgba(167,139,250,0)}100%{box-shadow:0 0 0 0 rgba(167,139,250,0)}}';
    el.appendChild(style);
    el.querySelector('[data-stop]').addEventListener('click', (e) => { e.stopPropagation(); stop(); });
    el.querySelector('[data-pause]').addEventListener('click', (e) => { e.stopPropagation(); togglePause(); });
    // Discret pendant la balade : s'estompe, redevient net au survol.
    el.addEventListener('mouseenter', () => { el.style.opacity = '1'; });
    el.addEventListener('mouseleave', () => { el.style.opacity = S && !S.paused ? '.35' : '1'; });
    setTimeout(() => { if (S && !S.paused && !el.matches(':hover')) el.style.opacity = '.35'; }, 3500);
    document.documentElement.appendChild(el);
    return el;
  }

  function renderBadge() {
    if (!S || !S.badge) return;
    const b = S.badge;
    const t = b.querySelector('[data-t]');
    if (S.endAt === Infinity) {
      const s = Math.round(S.activeMs / 1000);
      t.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    } else {
      const s = Math.max(0, Math.round((S.endAt - S.activeMs) / 1000));
      t.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    }
    const yielding = performance.now() < S.yieldUntil;
    b.querySelector('[data-label]').textContent = S.verifying
      ? 'SHEIN demande une vérification : fais-la, puis clique Reprendre'
      : S.paused ? 'En pause' : yielding ? 'À toi' : 'Balade';
    b.style.borderColor = S.verifying ? '#f59e0b' : 'rgba(139,92,246,.45)';
    b.querySelector('[data-pause]').textContent = S.paused ? 'Reprendre' : 'Pause';
    b.querySelector('[data-dot]').style.animationPlayState = S.paused || yielding ? 'paused' : 'running';
  }

  function flashBadge() {
    if (!S || !S.badge) return;
    S.badge.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 300 });
  }

  // ---------- horloge (ne compte que le temps de balade effectif) ----------
  function tick() {
    const now = performance.now();
    const dt = now - S.lastTick;
    if (!S.verifying && (S.checkN = (S.checkN || 0) + 1) % 4 === 0 && verificationShown()) onVerification();
    S.lastTick = now;
    if (!S.paused && !document.hidden && now >= S.yieldUntil) S.activeMs += dt;
    renderBadge();
    if (S.endAt !== Infinity && S.activeMs >= S.endAt && !S.navigating) finish(); // durée écoulée
  }

  // ---------- contrôles ----------
  function togglePause() {
    if (!S || S.stopped) return;
    if (S.verifying) {
      if (verificationShown()) { flashBadge(); return; } // pas encore faite : on reste en pause
      S.verifying = false;
      S.paused = false;
      S.yieldUntil = performance.now() + rand(4000, 9000); // on repart doucement
      if (S.cursor) S.cursor.style.opacity = '1';
      if (!S.opts.badge && S.badge) { S.badge.remove(); S.badge = null; }
      renderBadge();
      return;
    }
    S.paused = !S.paused;
    if (S.paused) leave();
    if (S.badge) S.badge.style.opacity = '1';
    if (S.cursor) S.cursor.style.opacity = S.paused ? '0' : '1';
    renderBadge();
  }

  // ---------- liaison avec l'extension ----------
  const hasRuntime = () => { try { return !!(chrome && chrome.runtime && chrome.runtime.id); } catch (e) { return false; } };
  function send(msg) {
    return new Promise((resolve) => {
      if (!hasRuntime()) { resolve(null); return; }
      try { chrome.runtime.sendMessage(msg, (r) => { void chrome.runtime.lastError; resolve(r || null); }); }
      catch (e) { resolve(null); }
    });
  }
  const save = (patch) => send({ type: 'tour:save', patch });

  // ---------- lecture des articles ----------
  const isProductPage = () => /-p-\d+/.test(location.pathname) && /\.html$/.test(location.pathname);
  const clean = (t) => (t || '').replace(/\s+/g, ' ').trim();
  const PRICE_RE = /(\d{1,4}(?:[.,]\d{2})?)\s?€|€\s?(\d{1,4}(?:[.,]\d{2})?)/;
  const listingName = () => clean((document.querySelector('h1') || {}).innerText || document.title.replace(/\s*[|\-–]\s*SHEIN.*$/i, '')).slice(0, 80);

  function cardInfo(card) {
    const a = card.matches('a[href]') ? card : card.querySelector('a[href*="-p-"]') || card.querySelector('a[href]');
    if (!a || !/-p-\d+/.test(a.href)) return null;
    const img = card.querySelector('img');
    const titleEl = card.querySelector('[class*="goods-title"],[class*="product-title"],[class*="title"]');
    const title = clean(a.getAttribute('aria-label') || (titleEl && titleEl.textContent) || (img && img.alt) || a.title);
    const m = (card.innerText || '').match(PRICE_RE);
    const src = img && (img.currentSrc || img.src || img.getAttribute('data-src') || '');
    return {
      url: a.href.split('?')[0], title: title.slice(0, 160),
      price: m ? (m[1] || m[2]).replace(',', '.') + ' €' : '',
      img: src && !src.startsWith('data:') ? src : '', from: listingName(),
    };
  }

  function recordVisible() {
    const items = [];
    for (const c of visibleCards()) {
      if (S.recorded.has(c)) continue;
      const info = cardInfo(c);
      if (info && info.title) { items.push(info); S.recorded.add(c); }
    }
    if (items.length) send({ type: 'tour:record', items });
  }

  function productInfo() {
    const info = { url: location.href.split('?')[0], opened: true };
    for (const sc of document.querySelectorAll('script[type="application/ld+json"]')) {
      let data; try { data = JSON.parse(sc.textContent); } catch (e) { continue; }
      (Array.isArray(data) ? data : [data]).forEach((d) => {
        if (!d) return;
        if (d['@type'] === 'Product') {
          info.title = info.title || clean(d.name);
          const img = Array.isArray(d.image) ? d.image[0] : d.image;
          info.img = info.img || (typeof img === 'string' ? img : '');
          const off = Array.isArray(d.offers) ? d.offers[0] : d.offers;
          if (off && off.price) info.price = String(off.price).replace(',', '.') + ' €';
          if (d.aggregateRating) { info.rating = d.aggregateRating.ratingValue; info.reviews = d.aggregateRating.reviewCount; }
        }
        if (d['@type'] === 'BreadcrumbList' && Array.isArray(d.itemListElement)) {
          info.cats = d.itemListElement.map((x) => clean(x.name || (x.item && x.item.name))).filter(Boolean).filter((n) => !/^(shein|accueil|home)$/i.test(n));
        }
      });
    }
    const meta = (p) => (document.querySelector(`meta[property="${p}"]`) || {}).content;
    info.title = info.title || clean((document.querySelector('h1') || {}).innerText || meta('og:title'));
    info.img = info.img || meta('og:image') || '';
    if (!info.price) { const m = (document.body.innerText || '').slice(0, 4000).match(PRICE_RE); if (m) info.price = (m[1] || m[2]).replace(',', '.') + ' €'; }
    if (!info.cats || !info.cats.length) {
      info.cats = [...document.querySelectorAll('[class*="bread-crumb"] a, [class*="breadcrumb"] a')].map((a) => clean(a.textContent)).filter((n) => n && !/^(shein|accueil|home)$/i.test(n));
    }
    if (info.cats && info.cats.length > 1 && info.title && info.cats[info.cats.length - 1] === info.title) info.cats.pop();
    info.title = (info.title || '').slice(0, 160);
    return info;
  }

  // ---------- ouvrir un article ----------
  function opensLastHour() {
    const since = Date.now() - 3600000;
    return ((S.tour && S.tour.opensLog) || []).filter((t) => t > since).length;
  }
  function canOpen() {
    if (S.opts.open === false || !S.tour || S.verifying) return false;
    if (opensLastHour() >= MAX_OPENS_PER_HOUR) return false;
    const gap = S.pace.openGap * (S.cautious ? 2.5 : 1) * rand(0.8, 1.3);
    return (S.activeMs - (S.tour.lastOpenAt || -1e9)) > gap;
  }

  async function openCard() {
    const card = chooseCard();
    if (!card) return false;
    const a = card.matches('a[href]') ? card : card.querySelector('a[href*="-p-"]');
    if (!a || !/-p-\d+/.test(a.href)) return false;
    await lookAt(card, true); // on regarde d'abord, le curseur reste sur la photo
    if (!alive()) return true;
    await wait(500, 1300);
    const from = location.href;
    const opensLog = ((S.tour.opensLog || []).filter((t) => t > Date.now() - 3600000)).concat(Date.now());
    S.tour.opensLog = opensLog;
    await save({ mode: 'product', returnUrl: from, returnY: curY(), activeMs: S.activeMs, lastOpenAt: S.activeMs, opensLog });
    S.navigating = true;
    a.removeAttribute('target'); // reste dans le même onglet
    const r = a.getBoundingClientRect();
    const x = S.cx, y = S.cy || r.top + r.height / 2;
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup'].forEach((t) => fire(a, t, x, y));
    leave();
    a.click();
    // Si rien ne se passe (lien géré autrement), on y va directement.
    const until = performance.now() + 4000;
    while (performance.now() < until && location.href === from) await sleep(200);
    if (location.href === from) location.href = a.href;
    // Navigation interne sans rechargement : on continue ici même.
    await sleep(2500);
    if (S && S.navigating && isProductPage()) { S.navigating = false; S.tour.mode = 'product'; await productVisit(); }
    return true;
  }

  async function productVisit() {
    const t0 = S.activeMs;
    const budget = rand(S.pace.product[0], S.pace.product[1]);
    await wait(1800, 3500);
    if (!alive()) return;
    send({ type: 'tour:record', items: [productInfo()] });

    // Photos : on passe sur 2 ou 3 miniatures.
    const thumbs = [...document.querySelectorAll('[class*="thumbs"] img, [class*="thumb"] li, .product-intro__thumbs-item')]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 20 && r.top > 0 && r.bottom < window.innerHeight; });
    const n = Math.min(thumbs.length, randInt(2, 3));
    for (let i = 0; i < n && alive(); i++) {
      const th = thumbs[randInt(0, thumbs.length - 1)];
      const r = th.getBoundingClientRect();
      await moveCursor(r.left + r.width / 2, r.top + r.height / 2);
      ['mouseover', 'mouseenter'].forEach((t) => fire(th, t, S.cx, S.cy));
      if (Math.random() < 0.6) th.click(); // simple changement de photo, reste sur la page
      await wait(1600, 3200);
    }
    // On descend tranquillement vers la description et les avis.
    while (alive() && S.activeMs - t0 < budget) {
      const roll = Math.random();
      if (roll < 0.65) await scrollBy(rand(0.3, 0.7) * viewH());
      else if (roll < 0.8) await scrollBy(-rand(0.2, 0.4) * viewH());
      await wait(1800, 4200);
      if (curY() >= maxY() - 60) break;
    }
    if (!alive()) return;
    await wait(800, 1800);
    await goBack();
  }

  async function goBack() {
    const ret = S.tour && S.tour.returnUrl;
    await save({ mode: 'listing', activeMs: S.activeMs, opened: ((S.tour && S.tour.opened) || 0) + 1 });
    S.navigating = true;
    const from = location.href;
    history.back();
    const until = performance.now() + 5000;
    while (performance.now() < until && location.href === from) await sleep(200);
    if (location.href === from && ret) location.href = ret;
    await sleep(2500);
    // Retour sans rechargement : on reprend ici.
    if (S && S.navigating && !isProductPage()) { S.navigating = false; S.tour.mode = 'listing'; await restoreListing(); }
  }

  async function restoreListing() {
    const t = S.tour;
    if (t && t.returnY > 0 && t.returnUrl && location.href.split('#')[0] === t.returnUrl.split('#')[0]) {
      await sleep(600);
      if (Math.abs(curY() - t.returnY) > 120) {
        if (t.returnY > maxY()) setY(maxY()); else await glide(t.returnY - curY());
      }
      t.returnY = 0;
      save({ returnY: 0 });
    }
  }

  // ---------- la balade ----------
  async function waitForMore() {
    const h0 = S.scroller.scrollHeight;
    const until = performance.now() + 6000;
    while (S && !S.stopped && performance.now() < until) {
      await sleep(250);
      if (S.scroller.scrollHeight > h0 + 50) return true;
    }
    return false;
  }

  async function listingLoop() {
    let atBottom = 0;
    let url = location.href;
    await restoreListing();
    await wait(900, 1800);
    while (alive() && !S.navigating) {
      await hold();
      if (!alive()) break;
      if (location.href !== url) {
        url = location.href; atBottom = 0; S.seen = new WeakSet(); S.recorded = new WeakSet(); S.scroller = getScroller();
        if (isProductPage()) { await productVisit(); return; }
      }

      const vh = viewH();
      const [a, b] = S.pace.step;
      const weights = Object.assign({}, S.pace.weights);
      if (!canOpen()) weights.open = 0;
      switch (pick(weights)) {
        case 'scroll':
          await scrollBy(rand(a, b) * vh);
          recordVisible();
          await wait(900, 2800);
          break;
        case 'product': {
          const card = chooseCard();
          if (card) await lookAt(card); else await wait(1200, 2600);
          break;
        }
        case 'open':
          if (await openCard()) return; // la suite se fait sur la fiche produit
          break;
        case 'back':
          await scrollBy(-rand(0.15, 0.4) * vh);
          await wait(1000, 2600);
          break;
        case 'flick':
          await flick(rand(1.2, 2.2) * vh);
          recordVisible();
          await wait(600, 1500);
          break;
        default: // lecture : on reste sur place
          recordVisible();
          await wait(3000, 7000);
      }

      if (curY() >= maxY() - 60) {
        const more = await waitForMore();
        atBottom = more ? 0 : atBottom + 1;
        if (atBottom >= 2) {
          atBottom = 0;
          await wait(1200, 2400);
          await glide(-curY());
          await wait(1500, 3000);
        }
      }
    }
  }

  async function run() {
    if (isProductPage() && (!S.tour || S.tour.mode === 'product')) await productVisit();
    else await listingLoop();
    if (S && !S.stopped && !S.navigating && !alive()) finish();
  }

  // ---------- contrôles ----------
  function onKey(e) {
    if (!S || S.stopped) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '') || (e.target && e.target.isContentEditable);
    if (e.key === 'Escape') { stop(); }
    else if ((e.code === 'Space' || e.key === ' ') && !typing) { e.preventDefault(); e.stopPropagation(); togglePause(); }
  }

  function onUserScroll(e) {
    if (!S || S.stopped || !e.isTrusted) return;
    S.yieldUntil = performance.now() + 5000;
    leave();
  }

  // Retour arrière servi depuis le cache du navigateur : la page revient « figée », on relance proprement.
  function onPageShow(e) {
    if (!e.persisted) return;
    teardown();
    send({ type: 'tour:resume' });
  }

  // start(tour) : tour = état gardé par le service worker (ou simples options pour un test).
  function start(tour = {}) {
    if (S && !S.stopped) return { running: true };
    const opts = tour.opts || tour;
    const endMs = Math.min(MAX_MINUTES * 60000, (tour.opts ? tour.endAt : Number(opts.minutes) * 60000) || 10 * 60000);
    S = {
      tour: tour.opts ? tour : null,
      opts: { badge: opts.badge !== false, cursor: !!opts.cursor, highlight: opts.highlight !== false, open: opts.open !== false },
      pace: PACES[opts.pace] || PACES.calme,
      endAt: endMs,
      cautious: !!tour.cautious, verifying: false,
      activeMs: tour.activeMs || 0,
      lastTick: performance.now(),
      paused: false, stopped: false, navigating: false,
      yieldUntil: 0, selfScrollAt: 0, hovered: null,
      seen: new WeakSet(), recorded: new WeakSet(),
      cx: window.innerWidth * 0.62, cy: window.innerHeight * 0.55,
    };
    if (!S.tour) S.opts.open = false; // sans service worker, on ne quitte pas la page
    S.scroller = getScroller();
    S.badge = S.opts.badge ? makeBadge() : null;
    S.cursor = S.opts.cursor ? makeCursor() : null;
    if (S.cursor) placeCursor(S.cx, S.cy);
    S.timer = setInterval(tick, 250);
    S.saver = setInterval(() => { if (S && !S.stopped && !S.navigating && S.tour) save({ activeMs: S.activeMs }); }, 3000);
    renderBadge();
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('wheel', onUserScroll, { capture: true, passive: true });
    window.addEventListener('touchmove', onUserScroll, { capture: true, passive: true });
    window.addEventListener('pageshow', onPageShow);
    if (verificationShown()) onVerification(); // on arrive directement sur une vérification
    run().catch((err) => { console.warn('[AliEdge] balade SHEIN', err); stop(); });
    return { running: true };
  }

  // Arrêt local (sans prévenir le service worker) : changement de page, cache, etc.
  function teardown() {
    if (!S || S.stopped) return;
    S.stopped = true;
    leave();
    clearInterval(S.timer);
    clearInterval(S.saver);
    if (S.badge) S.badge.remove();
    if (S.cursor) S.cursor.remove();
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('wheel', onUserScroll, true);
    window.removeEventListener('touchmove', onUserScroll, true);
  }

  // Fin normale (durée écoulée).
  function finish() {
    if (S && S.tour) send({ type: 'tour:stop' });
    teardown();
  }

  // Arrêt demandé (Échap, bouton Stop, popup). fromBg = déjà retiré côté service worker.
  function stop(fromBg) {
    if (!S || S.stopped) return { running: false };
    if (!fromBg && S.tour) send({ type: 'tour:stop' });
    teardown();
    return { running: false };
  }

  window.__aeSheinTour = {
    start,
    stop,
    togglePause,
    status: () => ({
      running: !!(S && !S.stopped),
      paused: !!(S && S.paused),
      infinite: !!(S && S.endAt === Infinity),
      left: S && S.endAt !== Infinity ? Math.max(0, S.endAt - S.activeMs) : 0,
    }),
  };
})();
