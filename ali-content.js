// ali-content.js — Feature 4 : bouton flottant "Analyser sur Vinted" sur les pages produit AliExpress
// Injecté sur *.aliexpress.com/item/*.html
// v1.2 — draggable, toast, spinner, meilleurs sélecteurs

(function() {
  'use strict';

  function dbg(level, ...args) {
    const msg = args.join(' ');
    if (level === 'error' || level === 'warn') console.warn('[AliContent]', msg);
    else console.log('[AliContent]', msg);
  }

  // Vérifier qu'on est bien sur une page produit AliExpress (/item/...)
  if (!location.pathname.match(/\/item\/[\d]+/)) {
    dbg('info', 'Pas une page produit, bouton non affiché.');
    return;
  }

  // Éviter de créer le bouton deux fois
  if (document.getElementById('ae-vinted-analyze-btn')) return;

  // ── TOAST ──────────────────────────────────────────────────────────────────
  function showToast(message, duration) {
    var existing = document.getElementById('ae-toast');
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.id = 'ae-toast';
    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '80px',
      right: '24px',
      zIndex: '2147483646',
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
      backdropFilter: 'blur(4px)',
    });
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(function() {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    setTimeout(function() {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      setTimeout(function() { if (toast.parentNode) toast.remove(); }, 300);
    }, duration || 2800);
  }

  // ── BOUTON ─────────────────────────────────────────────────────────────────
  var btn = document.createElement('button');
  btn.id = 'ae-vinted-analyze-btn';
  btn.title = 'Analyser ce produit sur Vinted avec AliEdge';

  var ICON_DEFAULT = '📊';
  var ICON_LOADING = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" style="animation:ae-spin 0.7s linear infinite;vertical-align:middle;"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>';

  // Injecter keyframes CSS pour le spinner
  if (!document.getElementById('ae-spin-style')) {
    var style = document.createElement('style');
    style.id = 'ae-spin-style';
    style.textContent = '@keyframes ae-spin { to { transform: rotate(360deg); } }';
    document.head.appendChild(style);
  }

  // Position initiale (bas-droite), récupérée depuis localStorage si l'utilisateur a déplacé
  var savedPos = null;
  try {
    var raw = localStorage.getItem('ae_btn_pos');
    if (raw) savedPos = JSON.parse(raw);
  } catch(e) {}

  var btnRight  = (savedPos && savedPos.right  != null) ? savedPos.right  : 24;
  var btnBottom = (savedPos && savedPos.bottom != null) ? savedPos.bottom : 24;

  function setBtnLabel(loading) {
    if (loading) {
      btn.innerHTML = ICON_LOADING + '  Analyse…';
    } else {
      btn.innerHTML = ICON_DEFAULT + '  Analyser sur Vinted';
    }
  }

  setBtnLabel(false);

  Object.assign(btn.style, {
    position: 'fixed',
    bottom: btnBottom + 'px',
    right: btnRight + 'px',
    zIndex: '2147483647',
    padding: '12px 18px',
    background: 'linear-gradient(135deg, #A78BFA 0%, #7C3AED 55%, #6B21E8 100%)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontFamily: "'Space Mono', monospace, sans-serif",
    fontSize: '11px',
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
    if (!btn.disabled) { btn.style.opacity = '0.9'; btn.style.transform = 'scale(1.03)'; btn.style.boxShadow = '0 6px 28px rgba(107,33,232,0.65)'; }
  });
  btn.addEventListener('mouseleave', function() {
    if (!btn.disabled && !isDragging) { btn.style.opacity = '1'; btn.style.transform = 'scale(1)'; btn.style.boxShadow = '0 4px 20px rgba(107,33,232,0.45), inset 0 1px 0 rgba(255,255,255,0.18)'; }
  });
  btn.addEventListener('mousedown', function(e) {
    if (!btn.disabled && !e.ctrlKey) { btn.style.transform = 'scale(0.97)'; }
  });
  btn.addEventListener('mouseup', function() {
    if (!btn.disabled) { btn.style.transform = 'scale(1)'; }
  });

  // ── DRAG ───────────────────────────────────────────────────────────────────
  var isDragging = false;
  var dragStartX, dragStartY, dragStartRight, dragStartBottom;

  btn.addEventListener('mousedown', function(e) {
    if (btn.disabled) return;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    var rect = btn.getBoundingClientRect();
    dragStartRight  = window.innerWidth  - rect.right;
    dragStartBottom = window.innerHeight - rect.bottom;
    isDragging = false;

    function onMouseMove(ev) {
      var dx = Math.abs(ev.clientX - dragStartX);
      var dy = Math.abs(ev.clientY - dragStartY);
      if (dx > 5 || dy > 5) isDragging = true;
      if (!isDragging) return;

      var newRight  = dragStartRight  - (ev.clientX - dragStartX);
      var newBottom = dragStartBottom + (ev.clientY - dragStartY);
      newRight  = Math.max(4, Math.min(window.innerWidth  - 80,  newRight));
      newBottom = Math.max(4, Math.min(window.innerHeight - 40, newBottom));
      btn.style.right  = newRight  + 'px';
      btn.style.bottom = newBottom + 'px';
      btn.style.transition = 'none';
      ev.preventDefault();
    }

    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      btn.style.transition = 'opacity 0.2s, transform 0.15s, box-shadow 0.2s';
      if (isDragging) {
        try {
          localStorage.setItem('ae_btn_pos', JSON.stringify({
            right:  parseFloat(btn.style.right),
            bottom: parseFloat(btn.style.bottom)
          }));
        } catch(e) {}
      }
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  // ── SÉLECTEUR D'IMAGES ─────────────────────────────────────────────────────
  function collectAllProductImages() {
    var seen = new Set();
    var imgs = [];

    var selectorSets = [
      '[class*="image-viewer"] img',
      '.images-view-item img',
      '.product-image-thumb img',
      '[class*="slider"] img[src*="alicdn"]',
    ];

    selectorSets.forEach(function(sel) {
      document.querySelectorAll(sel).forEach(function(el) {
        var src = el.src || el.getAttribute('src') || el.getAttribute('data-src') || '';
        if (!src || !src.includes('alicdn')) return;
        src = src.replace(/_\d+x\d+\.(jpg|webp)/, '.$1').replace(/\?.*$/, '');
        if (!src.startsWith('http')) return;
        src = src.replace(/^http:\/\//, 'https://');
        var base = src.split('_').slice(0,2).join('_');
        if (seen.has(base)) return;
        seen.add(base);
        imgs.push({ src: src, el: el });
      });
    });

    if (imgs.length === 0) {
      var allAli = Array.from(document.querySelectorAll('img[src*="alicdn.com"]'));
      allAli.sort(function(a, b) {
        return ((b.naturalWidth || b.width || 0) - (a.naturalWidth || a.width || 0));
      });
      allAli.forEach(function(el) {
        var src = el.src || '';
        src = src.replace(/_\d+x\d+\.(jpg|webp)/, '.$1').replace(/\?.*$/, '');
        if (!src.startsWith('http')) return;
        src = src.replace(/^http:\/\//, 'https://');
        var base = src.split('_').slice(0,2).join('_');
        if (seen.has(base)) return;
        seen.add(base);
        imgs.push({ src: src, el: el });
      });
    }

    return imgs.slice(0, 12);
  }

  function showImagePickerModal(images, onSelect) {
    var overlay = document.createElement('div');
    overlay.id = 'ae-img-picker-overlay';
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', zIndex: '2147483647',
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(4px)',
    });

    var panel = document.createElement('div');
    Object.assign(panel.style, {
      background: '#0C0618',
      border: '1px solid rgba(139,92,246,0.4)',
      borderRadius: '12px',
      padding: '20px',
      maxWidth: '480px',
      width: '90vw',
      maxHeight: '80vh',
      overflowY: 'auto',
      boxShadow: '0 8px 40px rgba(107,33,232,0.4)',
    });

    var header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: '14px',
    });
    var title = document.createElement('div');
    Object.assign(title.style, {
      fontFamily: "'Space Mono', monospace, sans-serif",
      fontSize: '13px', letterSpacing: '2px', color: '#8B5CF6',
      textTransform: 'uppercase',
    });
    title.textContent = 'Choisir l\'image à analyser';
    var closeBtn = document.createElement('button');
    Object.assign(closeBtn.style, {
      background: 'none', border: 'none', color: '#aaa', cursor: 'pointer',
      fontSize: '14px', fontFamily: 'monospace',
    });
    closeBtn.textContent = '✕ Fermer';
    closeBtn.onclick = function() { overlay.remove(); };
    header.appendChild(title);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    var grid = document.createElement('div');
    Object.assign(grid.style, {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: '8px',
      marginBottom: '12px',
    });

    images.forEach(function(imgData, idx) {
      var thumb = document.createElement('div');
      Object.assign(thumb.style, {
        width: '100%', paddingTop: '100%', position: 'relative',
        border: '2px solid transparent', borderRadius: '6px',
        cursor: 'pointer', overflow: 'hidden', transition: 'border-color 0.15s',
        background: '#1a1a1a',
      });
      var imgEl = document.createElement('img');
      Object.assign(imgEl.style, {
        position: 'absolute', inset: '0', width: '100%', height: '100%',
        objectFit: 'cover',
      });
      imgEl.src = imgData.src;
      imgEl.crossOrigin = 'anonymous';
      thumb.appendChild(imgEl);

      thumb.addEventListener('mouseenter', function() {
        thumb.style.borderColor = '#8B5CF6';
      });
      thumb.addEventListener('mouseleave', function() {
        thumb.style.borderColor = 'transparent';
      });
      thumb.addEventListener('click', function() {
        overlay.remove();
        onSelect(imgData.src);
      });

      grid.appendChild(thumb);
    });

    panel.appendChild(grid);

    var fallbackBtn = document.createElement('button');
    Object.assign(fallbackBtn.style, {
      width: '100%', padding: '10px', marginTop: '4px',
      background: 'rgba(139,92,246,0.08)',
      border: '1px solid rgba(139,92,246,0.35)',
      borderRadius: '6px', color: '#C4B5FD',
      fontFamily: "'Space Mono', monospace, sans-serif",
      fontSize: '11px', letterSpacing: '1px', cursor: 'pointer',
    });
    fallbackBtn.textContent = 'Analyser l\'image principale';
    fallbackBtn.addEventListener('click', function() {
      overlay.remove();
      var info = extractAliProductInfo();
      if (info.imageUrl) onSelect(info.imageUrl);
    });
    panel.appendChild(fallbackBtn);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
  }

  function triggerAnalysisWithImage(imageUrl, info) {
    setBtnLabel(true);
    btn.disabled = true;
    btn.style.opacity = '0.7';
    showToast('⏳ Analyse en cours…', 4000);

    fetchImageAsDataUrl(imageUrl).then(function(dataUrl) {
      if (!dataUrl) throw new Error('Conversion image échouée');

      dbg('info', 'Image convertie OK, envoi au background...');

      chrome.runtime.sendMessage({
        type: 'UPLOAD_IMAGE_FOR_VINTED',
        dataUrl: dataUrl,
        imageUrl: imageUrl
      }, function() { void chrome.runtime.lastError; });

      chrome.runtime.sendMessage({
        type: 'SEARCH_VINTED_BY_IMAGE',
        aliPrice: info.price || 0,
        aliTitle: info.title || '',
        market: 'fr',
        condition: 'all',
        vintedShipping: 3
      }, function() { void chrome.runtime.lastError; });

      chrome.runtime.sendMessage({ type: 'OPEN_RESULTS_PAGE' }, function() {
        void chrome.runtime.lastError;
      });

      setTimeout(function() {
        setBtnLabel(false);
        btn.disabled = false;
        btn.style.opacity = '1';
      }, 3500);

    }).catch(function(err) {
      dbg('warn', 'fetchImageAsDataUrl error:', err && err.message);
      showToast('❌ Erreur image — réessaie depuis le popup', 3000);
      setBtnLabel(false);
      btn.disabled = false;
      btn.style.opacity = '1';
    });
  }

  // ── CLICK ──────────────────────────────────────────────────────────────────
  btn.addEventListener('click', function(e) {
    if (isDragging) { isDragging = false; return; }
    if (btn.disabled) return;

    var info = extractAliProductInfo();
    if (!info.imageUrl) {
      showToast('❌ Image introuvable — essaie depuis le popup', 3000);
      return;
    }

    // Show coupon badge if detected
    if (info.couponDiscount > 0) {
      var existingBadge = document.getElementById('ae-coupon-badge');
      if (!existingBadge) {
        var badge = document.createElement('div');
        badge.id = 'ae-coupon-badge';
        Object.assign(badge.style, {
          position: 'fixed',
          bottom: (parseFloat(btn.style.bottom) + 50) + 'px',
          right: btn.style.right,
          zIndex: '2147483646',
          padding: '5px 10px',
          background: 'rgba(76,175,125,0.15)',
          border: '1px solid rgba(76,175,125,0.4)',
          borderRadius: '5px',
          color: '#4caf7d',
          fontFamily: "'Space Mono', monospace, sans-serif",
          fontSize: '11px',
        });
        badge.textContent = '🏷️ Coupon -' + info.couponDiscount + '% appliqué';
        document.body.appendChild(badge);
        setTimeout(function() { if (badge.parentNode) badge.remove(); }, 5000);
      }
    }

    var allImages = collectAllProductImages();

    if (allImages.length <= 1) {
      // Skip modal — analyze directly
      triggerAnalysisWithImage(info.imageUrl, info);
      return;
    }

    // Show image picker modal
    showImagePickerModal(allImages, function(selectedUrl) {
      triggerAnalysisWithImage(selectedUrl, info);
    });
  });

  document.body.appendChild(btn);
  dbg('info', 'Bouton AliEdge injecté sur', location.pathname);

  // ── EXTRACTION PRODUIT ─────────────────────────────────────────────────────
  function extractAliProductInfo() {
    // Titre — essai multiple
    var titleEl = (
      document.querySelector('h1[data-pl="product-title"]') ||
      document.querySelector('h1.product-title-text') ||
      document.querySelector('.product-title h1') ||
      document.querySelector('[class*="title--wrap"] h1') ||
      document.querySelector('[class*="product--title"] h1') ||
      document.querySelector('[class*="ProductTitle"] h1') ||
      document.querySelector('h1[class*="title"]') ||
      document.querySelector('h1')
    );
    var title = titleEl
      ? (titleEl.textContent || titleEl.innerText || '').trim().slice(0, 120)
      : document.title.replace(/[\|\-–—].*$/, '').trim().slice(0, 120);

    // Prix — Feature 5: essai coupon/discount en priorité, puis prix standard
    var price = 0;

    // Stratégie 1 : prix après coupon/promo (plus spécifique)
    var couponSelectors = [
      '[class*="coupon-price"]',
      '[class*="promotion-price"]',
      '[class*="final-price"]',
      '.uniform-banner-box-price',
      '[class*="sale-price"]',
      '[class*="price--current"]',
    ];
    for (var ci = 0; ci < couponSelectors.length; ci++) {
      var cpEl = document.querySelector(couponSelectors[ci]);
      if (cpEl) {
        var cpTxt = cpEl.textContent || '';
        var cpMatch = cpTxt.match(/[\d]+[.,][\d]{2}|[\d]+/);
        if (cpMatch) {
          var cpVal = parseFloat(cpMatch[0].replace(',', '.'));
          if (cpVal > 0 && cpVal < 10000) { price = cpVal; break; }
        }
      }
    }

    // Stratégie 2 : prix original standard
    if (!price) {
      var priceEl = (
        document.querySelector('[class*="product-price-current"]') ||
        document.querySelector('[class*="uniform-banner-box-price"]') ||
        document.querySelector('.product-price-value') ||
        document.querySelector('[data-pl="product-price"] span') ||
        document.querySelector('[class*="Price--originPrice"]') ||
        document.querySelector('[class*="price--current"]') ||
        document.querySelector('[class*="sale-price"]') ||
        document.querySelector('[class*="Price"] [class*="primary"]')
      );
      var priceText = priceEl ? (priceEl.textContent || '') : '';
      var priceMatch = priceText.replace(/\s/g, '').match(/[\d]+[.,]?[\d]*/);
      price = priceMatch ? parseFloat(priceMatch[0].replace(',', '.')) : 0;
    }

    // Détection coupon extra (badge "Extra X% off")
    var couponDiscount = 0;
    var couponBadge = document.querySelector('[class*="coupon-text"], [class*="extra-discount"], [class*="coupon-wrap"]');
    if (couponBadge) {
      var couponTxt = couponBadge.textContent || '';
      var pctMatch = couponTxt.match(/(\d+)\s*%/);
      if (pctMatch) couponDiscount = parseInt(pctMatch[1]);
    }

    // Appliquer la remise coupon si trouvée
    if (couponDiscount > 0 && price > 0) {
      var discounted = price * (1 - couponDiscount / 100);
      if (discounted > 0) price = parseFloat(discounted.toFixed(2));
    }

    // Image principale — essai multiple, préfère les grandes images alicdn.com
    var imgEl = (
      document.querySelector('.product-image img[src*="alicdn"]') ||
      document.querySelector('[class*="image-viewer"] img[src*="alicdn"]') ||
      document.querySelector('.images-view-item img[src*="alicdn"]') ||
      document.querySelector('[class*="slider"] img[src*="alicdn"]') ||
      document.querySelector('.magnifier-image[src*="alicdn"]') ||
      document.querySelector('[class*="product-img"] img[src*="alicdn"]') ||
      document.querySelector('img[src*="alicdn"][width]') ||
      document.querySelector('.product-image img') ||
      document.querySelector('[class*="image-viewer"] img')
    );

    // Fallback : plus grande image alicdn de la page
    if (!imgEl) {
      var allImgs = Array.from(document.querySelectorAll('img[src*="alicdn.com"]'));
      imgEl = allImgs.sort(function(a, b) {
        return ((b.naturalWidth || b.width || 0) - (a.naturalWidth || a.width || 0));
      })[0] || null;
    }

    var imageUrl = null;
    if (imgEl) {
      imageUrl = imgEl.src || imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || null;
      if (imageUrl) {
        // Nettoyer les paramètres de resize et obtenir la version originale
        imageUrl = imageUrl
          .replace(/_\d+x\d+\.jpg/, '.jpg')
          .replace(/_\d+x\d+\.webp/, '.jpg')
          .replace(/\?.*$/, '');
        if (!imageUrl.startsWith('http')) imageUrl = null;
        // Forcer HTTPS
        if (imageUrl) imageUrl = imageUrl.replace(/^http:\/\//, 'https://');
      }
    }

    dbg('info', 'Extraction produit —', { title: title && title.slice(0, 40), price, hasImage: !!imageUrl, couponDiscount: couponDiscount });
    return { title: title, price: price, imageUrl: imageUrl, couponDiscount: couponDiscount };
  }

  // ── FETCH IMAGE → DATA URL ─────────────────────────────────────────────────
  function fetchImageAsDataUrl(url) {
    return new Promise(function(resolve, reject) {
      var img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = function() {
        try {
          var W = Math.min(img.naturalWidth  || 800, 800);
          var H = Math.min(img.naturalHeight || 800, 800);
          var canvas = document.createElement('canvas');
          canvas.width  = W;
          canvas.height = H;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, W, H);
          canvas.toBlob(function(blob) {
            if (!blob) { resolve(null); return; }
            var reader = new FileReader();
            reader.onload  = function() { resolve(reader.result); };
            reader.onerror = function() { resolve(null); };
            reader.readAsDataURL(blob);
          }, 'image/png');
        } catch(e) {
          resolve(null);
        }
      };

      img.onerror = function() {
        // Fallback : fetch direct
        fetch(url, { mode: 'cors' })
          .then(function(r) { return r.blob(); })
          .then(function(blob) {
            var reader = new FileReader();
            reader.onload  = function() { resolve(reader.result); };
            reader.onerror = function() { resolve(null); };
            reader.readAsDataURL(blob);
          })
          .catch(function(e) { reject(e); });
      };

      img.src = url;
    });
  }

})();
