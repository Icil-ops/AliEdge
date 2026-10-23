// temu-content.js — AliEdge support Temu
// Extrait titre, prix, image depuis les pages produit Temu
// Compatible avec les URLs : temu.com/goods.html, temu.com/*/*goods-detail*
// v1.0

(function () {
  'use strict';

  var LICENSE_STORAGE_KEY = "ae_license_key";

  function isExtensionContextValid() {
    try { return !!(chrome && chrome.runtime && chrome.runtime.id); }
    catch (e) { return false; }
  }

  function hasValidLicense(callback) {
    try {
      chrome.storage.local.get(LICENSE_STORAGE_KEY, function (res) {
        var key = res && res[LICENSE_STORAGE_KEY];
        var ok = key && /^AE-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(String(key).trim());
        callback(!!ok);
      });
    } catch (e) {
      callback(false);
    }
  }

  // ── DÉTECTION PAGE PRODUIT ─────────────────────────────────────────────────
  function isProductPage() {
    var url = location.href;
    // Temu product URLs contain goods_id or goods-detail
    return url.includes('goods_id') || url.includes('goods-detail') ||
           url.includes('/goods.html') || url.match(/\/[a-z-]+-g\d{10,}/);
  }

  // ── EXTRACTION TITRE ───────────────────────────────────────────────────────
  function getTemuTitle() {
    // 1. Next.js / React state (most reliable on Temu)
    try {
      var scripts = document.querySelectorAll('script[type="application/json"]');
      for (var i = 0; i < scripts.length; i++) {
        try {
          var data = JSON.parse(scripts[i].textContent || '');
          var name = data && (
            data.goodsName || data.goods_name || data.title ||
            (data.goods && (data.goods.goodsName || data.goods.title)) ||
            (data.data && (data.data.goodsName || data.data.title))
          );
          if (name && typeof name === 'string' && name.length > 3) return name.trim();
        } catch(e) {}
      }
    } catch(e) {}

    // 2. CSS selectors
    var selectors = [
      '[class*="goods-title"]',
      '[class*="product-title"]',
      '[data-type="goods-name"]',
      '[class*="DetailTitle"]',
      '[class*="detail-title"]',
      'h1[class*="title"]',
      'h1[class*="name"]',
      'h1',
    ];
    for (var j = 0; j < selectors.length; j++) {
      try {
        var el = document.querySelector(selectors[j]);
        if (el && el.textContent && el.textContent.trim().length > 3) {
          return el.textContent.trim().slice(0, 120);
        }
      } catch(e) {}
    }

    // 3. Page title
    return (document.title || '').replace(/[\|\-–].*$/, '').replace(/Temu/gi, '').trim().slice(0, 120) || document.title;
  }

  // ── EXTRACTION PRIX ────────────────────────────────────────────────────────
  function getTemuPrice() {
    // Temu often shows prices as "€X.XX" or "$X.XX"
    var selectors = [
      '[class*="current-price"]',
      '[class*="sale-price"]',
      '[class*="discount-price"]',
      '[class*="price-val"]',
      '[data-type="current-price"]',
      '[class*="Price"] [class*="value"]',
      '[class*="goods-price"]',
      '[class*="detail-price"]',
      '[class*="price-content"]',
    ];
    for (var i = 0; i < selectors.length; i++) {
      try {
        var el = document.querySelector(selectors[i]);
        if (el) {
          var txt = (el.textContent || '').replace(/\s/g, '');
          var m = txt.match(/[€$£]?(\d+[.,]\d{2})/);
          if (m) {
            var val = parseFloat(m[1].replace(',', '.'));
            if (val > 0 && val < 10000) return val;
          }
        }
      } catch(e) {}
    }

    // Fallback: scan body for first price pattern near "€"
    try {
      var bodyText = document.body.innerText || '';
      var matches = bodyText.match(/[€$£](\d+[.,]\d{2})/g);
      if (matches && matches.length) {
        // Take the first reasonable price
        for (var k = 0; k < matches.length; k++) {
          var v = parseFloat(matches[k].replace(/[€$£]/, '').replace(',', '.'));
          if (v > 0.5 && v < 500) return v;
        }
      }
    } catch(e) {}

    return 0;
  }

  // ── EXTRACTION IMAGE ───────────────────────────────────────────────────────
  function getTemuImage() {
    // 1. JSON data embedded in scripts
    try {
      var scripts = document.querySelectorAll('script[type="application/json"]');
      for (var i = 0; i < scripts.length; i++) {
        try {
          var data = JSON.parse(scripts[i].textContent || '');
          // Look for image URL in various data shapes
          var img = data && (
            (data.goods && (data.goods.mainImage || (Array.isArray(data.goods.images) && data.goods.images[0]))) ||
            data.mainImage || data.mainPicUrl || data.main_image ||
            (data.data && (data.data.mainPicUrl || data.data.mainImage || (Array.isArray(data.data.imageList) && data.data.imageList[0])))
          );
          if (img && typeof img === 'string' && img.startsWith('http')) return img;
          if (img && typeof img === 'object' && img.url) return img.url;
        } catch(e) {}
      }
    } catch(e) {}

    // 2. CSS selectors — main product image
    var selectors = [
      '[class*="goods-img"] img',
      '[class*="product-img"] img',
      '[class*="main-img"] img',
      '[class*="detail-image"] img',
      '[class*="GoodsImage"] img',
      '[class*="image-view"] img',
      '[class*="thumb-list"] img',
      '.goods-thumbnail img',
    ];
    for (var j = 0; j < selectors.length; j++) {
      try {
        var el = document.querySelector(selectors[j]);
        if (el) {
          var src = el.currentSrc || el.src || el.getAttribute('data-src') || '';
          if (src && src.startsWith('http') && !src.includes('placeholder')) return src;
        }
      } catch(e) {}
    }

    // 3. Largest image on page
    try {
      var allImgs = Array.from(document.images);
      var candidates = allImgs.filter(function(img) {
        var src = img.currentSrc || img.src || '';
        return src.startsWith('http') && !src.includes('placeholder') &&
               !src.includes('icon') && !src.includes('logo') &&
               (img.naturalWidth > 200 || img.width > 200);
      });
      candidates.sort(function(a, b) {
        return (b.naturalWidth * b.naturalHeight) - (a.naturalWidth * a.naturalHeight);
      });
      if (candidates.length) return candidates[0].currentSrc || candidates[0].src;
    } catch(e) {}

    return null;
  }

  // ── MESSAGE LISTENER ───────────────────────────────────────────────────────
  if (isExtensionContextValid()) {
    chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
      if (msg.type === "GET_ALI") {
        var title   = getTemuTitle();
        var price   = getTemuPrice();
        var image   = getTemuImage();
        console.log("[TEMU] GET_ALI →", { title: title && title.slice(0, 40), price, hasImage: !!image });
        sendResponse({ ok: true, title: title, price: price, shipping: 0, image: image, source: 'temu' });
      }
      return true;
    });
  }

  // ── BOUTON FLOTTANT ANALYSE ─────────────────────────────────────────────────
  function injectAnalyzeButton() {
    if (document.getElementById('ae-temu-analyze-btn')) return;
    if (!isProductPage()) return;

    // Injecter la keyframe CSS spinner
    if (!document.getElementById('ae-temu-spin-style')) {
      var style = document.createElement('style');
      style.id = 'ae-temu-spin-style';
      style.textContent = '@keyframes ae-temu-spin { to { transform: rotate(360deg); } }';
      document.head.appendChild(style);
    }

    var btn = document.createElement('button');
    btn.id = 'ae-temu-analyze-btn';
    btn.title = 'Analyser ce produit Temu sur Vinted avec AliEdge';
    btn.innerHTML = '📊  Analyser sur Vinted';

    // Position sauvegardée
    var savedPos = null;
    try { var raw = localStorage.getItem('ae_temu_btn_pos'); if (raw) savedPos = JSON.parse(raw); } catch(e) {}
    var btnRight  = (savedPos && savedPos.right  != null) ? savedPos.right  : 24;
    var btnBottom = (savedPos && savedPos.bottom != null) ? savedPos.bottom : 24;

    Object.assign(btn.style, {
      position: 'fixed',
      bottom: btnBottom + 'px',
      right:  btnRight  + 'px',
      zIndex: '2147483647',
      padding: '12px 18px',
      background: 'linear-gradient(135deg, #A78BFA 0%, #7C3AED 55%, #6B21E8 100%)',
      color: '#fff',
      border: 'none',
      borderRadius: '8px',
      fontFamily: "'Space Mono', monospace, sans-serif",
      fontSize: '12px',
      letterSpacing: '1.5px',
      cursor: 'pointer',
      boxShadow: '0 4px 20px rgba(107,33,232,0.45), inset 0 1px 0 rgba(255,255,255,0.18)',
      transition: 'opacity 0.2s, transform 0.15s, box-shadow 0.2s',
      userSelect: 'none',
      whiteSpace: 'nowrap',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
    });

    btn.addEventListener('mouseenter', function() {
      if (!btn.disabled) {
        btn.style.opacity = '0.9';
        btn.style.transform = 'scale(1.03)';
        btn.style.boxShadow = '0 6px 28px rgba(107,33,232,0.65)';
      }
    });
    btn.addEventListener('mouseleave', function() {
      if (!btn.disabled && !isDragging) {
        btn.style.opacity = '1';
        btn.style.transform = 'scale(1)';
        btn.style.boxShadow = '0 4px 20px rgba(107,33,232,0.45), inset 0 1px 0 rgba(255,255,255,0.18)';
      }
    });

    // ── DRAG ─────────────────────────────────────────────────────────────────
    var isDragging = false;
    var dragStartX, dragStartY, dragStartRight, dragStartBottom;

    btn.addEventListener('mousedown', function(e) {
      if (btn.disabled) return;
      dragStartX = e.clientX; dragStartY = e.clientY;
      var rect = btn.getBoundingClientRect();
      dragStartRight  = window.innerWidth  - rect.right;
      dragStartBottom = window.innerHeight - rect.bottom;
      isDragging = false;

      function onMove(ev) {
        var dx = Math.abs(ev.clientX - dragStartX), dy = Math.abs(ev.clientY - dragStartY);
        if (dx > 5 || dy > 5) isDragging = true;
        if (!isDragging) return;
        var nr = Math.max(4, Math.min(window.innerWidth - 80,  dragStartRight  - (ev.clientX - dragStartX)));
        var nb = Math.max(4, Math.min(window.innerHeight - 40, dragStartBottom + (ev.clientY - dragStartY)));
        btn.style.right = nr + 'px'; btn.style.bottom = nb + 'px';
        btn.style.transition = 'none';
        ev.preventDefault();
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        btn.style.transition = 'opacity 0.2s, transform 0.15s, box-shadow 0.2s';
        if (isDragging) {
          try { localStorage.setItem('ae_temu_btn_pos', JSON.stringify({ right: parseFloat(btn.style.right), bottom: parseFloat(btn.style.bottom) })); } catch(e) {}
        }
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    // ── TOAST ─────────────────────────────────────────────────────────────────
    function showToast(msg, duration) {
      var existing = document.getElementById('ae-temu-toast');
      if (existing) existing.remove();
      var t = document.createElement('div');
      t.id = 'ae-temu-toast';
      Object.assign(t.style, {
        position: 'fixed', bottom: '80px', right: '24px', zIndex: '2147483646',
        padding: '10px 16px',
        background: 'rgba(6,3,15,0.92)',
        border: '1px solid rgba(139,92,246,0.6)',
        borderRadius: '8px',
        color: '#C4B5FD',
        fontFamily: "'Space Mono', monospace, sans-serif",
        fontSize: '12px',
        boxShadow: '0 4px 20px rgba(107,33,232,0.3)',
        backdropFilter: 'blur(4px)',
        opacity: '0',
        transform: 'translateY(8px)',
        transition: 'opacity 0.25s, transform 0.25s',
        pointerEvents: 'none',
      });
      t.textContent = msg;
      document.body.appendChild(t);
      requestAnimationFrame(function() { t.style.opacity = '1'; t.style.transform = 'translateY(0)'; });
      setTimeout(function() {
        t.style.opacity = '0'; t.style.transform = 'translateY(8px)';
        setTimeout(function() { if (t.parentNode) t.remove(); }, 300);
      }, duration || 2800);
    }

    // ── CLICK ─────────────────────────────────────────────────────────────────
    btn.addEventListener('click', function() {
      if (isDragging) { isDragging = false; return; }
      if (btn.disabled) return;
      if (!isExtensionContextValid()) return;

      var title = getTemuTitle();
      var price = getTemuPrice();
      var image = getTemuImage();

      if (!image) {
        showToast('❌ Image introuvable — essaie depuis le popup', 3000);
        return;
      }

      btn.disabled = true;
      btn.style.opacity = '0.7';
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" style="animation:ae-temu-spin 0.7s linear infinite;vertical-align:middle;"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>  Analyse en cours…';
      showToast('⏳ Analyse en cours…', 5000);

      // Fetch image via background (avoids CORS)
      chrome.runtime.sendMessage({ type: 'FETCH_IMAGE', url: image }, function(res) {
        void chrome.runtime.lastError;
        if (!res || res.error || !res.dataUrl) {
          showToast('❌ Impossible de charger l\'image', 3000);
          btn.disabled = false; btn.style.opacity = '1';
          btn.innerHTML = '📊  Analyser sur Vinted';
          return;
        }

        // Récupérer les settings sauvegardés
        chrome.storage.local.get(['ae_market', 'ae_condition', 'ae_multimarket'], function(settings) {
          void chrome.runtime.lastError;
          var market    = (settings && settings.ae_market)     || 'fr';
          var condition = (settings && settings.ae_condition)  || 'all';
          var multi     = !!(settings && settings.ae_multimarket);

          chrome.runtime.sendMessage({
            type: 'UPLOAD_IMAGE_FOR_VINTED',
            dataUrl: res.dataUrl,
            imageUrl: image
          }, function() { void chrome.runtime.lastError; });

          chrome.runtime.sendMessage({
            type: 'SEARCH_VINTED_BY_IMAGE',
            aliPrice: price || 0,
            aliTitle: title || '',
            market: market,
            condition: condition,
            multiMarket: multi,
            vintedShipping: 3
          }, function() { void chrome.runtime.lastError; });

          chrome.runtime.sendMessage({ type: 'OPEN_RESULTS_PAGE' }, function() { void chrome.runtime.lastError; });

          setTimeout(function() {
            btn.disabled = false; btn.style.opacity = '1';
            btn.innerHTML = '📊  Analyser sur Vinted';
          }, 3500);
        });
      });
    });

    document.body.appendChild(btn);
    console.log('[AliEdge/Temu] Bouton injecté');
  }

  // ── QUICK SEARCH ⚡ ─────────────────────────────────────────────────────────
  function injectQuickSearchBtn() {
    if (document.getElementById('ae-temu-qs-btn')) return;
    if (!isProductPage()) return;

    var btn = document.createElement('button');
    btn.id = 'ae-temu-qs-btn';
    btn.title = 'Quick Search — Analyser directement (Alt+Shift+V)';
    btn.innerHTML = '⚡';
    Object.assign(btn.style, {
      position: 'fixed', top: '20px', right: '22px', zIndex: '10049',
      width: '44px', height: '44px', fontSize: '20px',
      borderRadius: '50%',
      background: 'linear-gradient(135deg, #A78BFA 0%, #7C3AED 100%)',
      color: '#fff',
      border: '2px solid rgba(255,255,255,0.2)',
      boxShadow: '0 4px 16px rgba(107,33,232,0.45)',
      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'box-shadow 0.2s, transform 0.12s',
    });
    btn.onmouseenter = function() {
      if (!btn.disabled) { btn.style.boxShadow = '0 6px 24px rgba(107,33,232,0.65)'; btn.style.transform = 'scale(1.06)'; }
    };
    btn.onmouseleave = function() {
      btn.style.boxShadow = '0 4px 16px rgba(107,33,232,0.45)'; btn.style.transform = 'scale(1)';
    };
    btn.onclick = function() {
      if (!isExtensionContextValid()) return;
      btn.disabled = true; btn.style.opacity = '0.7';
      var title = getTemuTitle(), price = getTemuPrice(), image = getTemuImage();
      if (!title || !image) {
        showMinToast('❌ Page produit non détectée'); btn.disabled = false; btn.style.opacity = '1'; return;
      }
      showMinToast('⚡ Analyse Temu lancée…');
      chrome.runtime.sendMessage({ type: 'FETCH_IMAGE', url: image }, function(r) {
        void chrome.runtime.lastError;
        if (!r || !r.dataUrl) { showMinToast('❌ Image non chargée'); btn.disabled = false; btn.style.opacity = '1'; return; }
        chrome.storage.local.get(['ae_market', 'ae_condition'], function(s) {
          void chrome.runtime.lastError;
          chrome.runtime.sendMessage({ type: 'UPLOAD_IMAGE_FOR_VINTED', dataUrl: r.dataUrl, imageUrl: image }, function() { void chrome.runtime.lastError; });
          chrome.runtime.sendMessage({ type: 'SEARCH_VINTED_BY_IMAGE', aliPrice: price || 0, aliTitle: title, market: (s && s.ae_market) || 'fr', condition: (s && s.ae_condition) || 'all' }, function() { void chrome.runtime.lastError; });
          btn.innerHTML = '✅'; btn.style.opacity = '1';
          setTimeout(function() { btn.innerHTML = '⚡'; btn.disabled = false; }, 2200);
        });
      });
    };
    document.body.appendChild(btn);
  }

  function showMinToast(msg) {
    var t = document.getElementById('ae-temu-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'ae-temu-toast';
      Object.assign(t.style, {
        position: 'fixed', bottom: '80px', right: '24px', zIndex: '2147483646',
        padding: '10px 16px', background: 'rgba(6,3,15,0.92)',
        border: '1px solid rgba(139,92,246,0.6)', borderRadius: '8px',
        color: '#C4B5FD', fontFamily: 'monospace', fontSize: '12px',
        boxShadow: '0 4px 20px rgba(107,33,232,0.3)', pointerEvents: 'none',
      });
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t._timer);
    t._timer = setTimeout(function() { t.style.opacity = '0'; }, 2800);
  }

  // ── KEYBOARD SHORTCUT ─────────────────────────────────────────────────────
  document.addEventListener('keydown', function(e) {
    if (e.altKey && e.shiftKey && (e.key === 'V' || e.key === 'v')) {
      e.preventDefault();
      var btn = document.getElementById('ae-temu-qs-btn');
      if (btn && !btn.disabled) btn.click();
    }
  });

  // ── INIT ───────────────────────────────────────────────────────────────────
  hasValidLicense(function(ok) {
    if (!ok) return;
    console.log('[AliEdge/Temu] Licence OK → injection des boutons');
    if (isProductPage()) {
      injectAnalyzeButton();
      injectQuickSearchBtn();
    }

    // SPA navigation watcher
    var _lastUrl = location.href;
    new MutationObserver(function() {
      if (location.href === _lastUrl) return;
      _lastUrl = location.href;
      if (isProductPage()) {
        setTimeout(function() {
          injectAnalyzeButton();
          injectQuickSearchBtn();
        }, 1200);
      }
    }).observe(document.head || document.documentElement, { childList: true, subtree: true });
  });

})();
