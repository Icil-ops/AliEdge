// ali-listing-content.js — Feature 7 : Analyse en lot depuis les pages listing AliExpress
// Injecté sur les pages wholesale, category, store, premium
// v1.0

(function() {
  'use strict';

  function dbg(level, ...args) {
    const msg = args.join(' ');
    if (level === 'error' || level === 'warn') console.warn('[AliListing]', msg);
    else console.log('[AliListing]', msg);
  }

  // Vérifier qu'on n'est pas sur une page produit
  if (location.pathname.match(/\/item\/[\d]+/)) return;

  // Éviter de créer le panneau deux fois
  if (document.getElementById('ae-listing-panel')) return;

  const MAX_SELECTED = 6;
  let selectedProducts = new Set();

  // ── INJECTION CSS ──────────────────────────────────────────────────────────
  if (!document.getElementById('ae-listing-style')) {
    const style = document.createElement('style');
    style.id = 'ae-listing-style';
    style.textContent = `
      @keyframes ae-listing-fadein { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:translateX(0); } }
      #ae-listing-panel {
        position: fixed;
        top: 80px;
        right: 0;
        width: 280px;
        max-height: calc(100vh - 100px);
        background: #0C0618;
        border: 1px solid rgba(139,92,246,0.35);
        border-right: none;
        border-radius: 10px 0 0 10px;
        z-index: 2147483647;
        box-shadow: -4px 0 24px rgba(107,33,232,0.3);
        font-family: 'Space Mono', monospace, sans-serif;
        font-size: 11px;
        color: #F4EFE6;
        animation: ae-listing-fadein 0.3s ease both;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      #ae-listing-panel.collapsed { width: 44px; }
      #ae-listing-header {
        padding: 10px 12px;
        border-bottom: 1px solid rgba(139,92,246,0.15);
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
        cursor: pointer;
        background: rgba(139,92,246,0.05);
      }
      #ae-listing-title {
        font-family: 'Space Mono', monospace, sans-serif;
        font-size: 13px;
        letter-spacing: 1.5px;
        color: #8B5CF6;
        white-space: nowrap;
      }
      #ae-listing-collapse-btn {
        background: none;
        border: none;
        color: #777;
        cursor: pointer;
        font-size: 12px;
        padding: 2px 4px;
        flex-shrink: 0;
      }
      #ae-listing-body {
        overflow-y: auto;
        flex: 1;
        padding: 8px;
      }
      .ae-product-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px;
        border: 1px solid rgba(139,92,246,0.15);
        border-radius: 5px;
        margin-bottom: 5px;
        cursor: pointer;
        transition: border-color 0.15s, background 0.15s;
        background: #130D22;
      }
      .ae-product-row:hover { border-color: rgba(139,92,246,0.4); }
      .ae-product-row.selected { border-color: #8B5CF6; background: rgba(139,92,246,0.07); }
      .ae-product-thumb {
        width: 42px;
        height: 42px;
        object-fit: cover;
        border-radius: 4px;
        background: #1A1230;
        flex-shrink: 0;
      }
      .ae-product-info { flex: 1; min-width: 0; }
      .ae-product-name {
        font-size: 10px;
        color: #F4EFE6;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        margin-bottom: 2px;
      }
      .ae-product-price {
        font-family: 'Space Mono', monospace, sans-serif;
        font-size: 12px;
        color: #8B5CF6;
      }
      .ae-product-check {
        width: 16px;
        height: 16px;
        border: 1px solid #8B5CF6;
        border-radius: 3px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        color: #8B5CF6;
      }
      #ae-listing-footer {
        padding: 8px;
        border-top: 1px solid rgba(139,92,246,0.15);
        flex-shrink: 0;
      }
      .ae-listing-btn {
        width: 100%;
        padding: 8px;
        border: 1px solid rgba(139,92,246,0.35);
        border-radius: 5px;
        background: transparent;
        color: #8B5CF6;
        font-family: 'Space Mono', monospace, sans-serif;
        font-size: 12px;
        letter-spacing: 1px;
        cursor: pointer;
        transition: background 0.15s;
        margin-bottom: 5px;
      }
      .ae-listing-btn:hover { background: rgba(139,92,246,0.1); }
      .ae-listing-btn:disabled { opacity: 0.4; cursor: default; }
      .ae-listing-btn.primary {
        background: linear-gradient(135deg, #A78BFA 0%, #7C3AED 55%, #6B21E8 100%);
        color: #fff;
        border: none;
        box-shadow: 0 4px 16px rgba(107,33,232,0.4), inset 0 1px 0 rgba(255,255,255,0.15);
      }
      .ae-listing-btn.primary:hover { opacity: 0.92; }
      #ae-listing-select-row {
        display: flex;
        gap: 5px;
        margin-bottom: 6px;
      }
      #ae-listing-select-row button {
        flex: 1;
        padding: 4px;
        font-size: 9px;
        background: transparent;
        border: 1px solid rgba(139,92,246,0.15);
        border-radius: 4px;
        color: #777;
        cursor: pointer;
        font-family: 'Space Mono', monospace, sans-serif;
      }
      #ae-listing-select-row button:hover { border-color: rgba(139,92,246,0.4); color: #8B5CF6; }
      #ae-listing-status {
        font-size: 9px;
        color: #777;
        text-align: center;
        margin-top: 4px;
        min-height: 12px;
      }
    `;
    document.head.appendChild(style);
  }

  // ── DÉTECTION DES PRODUITS ──────────────────────────────────────────────────
  function detectProducts() {
    const cards = [];
    const seen = new Set();

    const cardSelectors = [
      '[class*="product-item"]',
      '[class*="list-item"]',
      '.search-item-card',
      '[data-product-id]',
    ];

    let containers = [];
    for (const sel of cardSelectors) {
      const found = Array.from(document.querySelectorAll(sel));
      if (found.length > 0) {
        containers = found;
        break;
      }
    }

    // Fallback : trouver les conteneurs parents des images alicdn
    if (containers.length === 0) {
      const imgs = document.querySelectorAll('a[href*="/item/"] img');
      imgs.forEach(img => {
        let parent = img.parentElement;
        for (let i = 0; i < 5 && parent; i++) {
          if (parent.querySelector('a[href*="/item/"]') && (parent.offsetWidth > 100)) {
            containers.push(parent);
            break;
          }
          parent = parent.parentElement;
        }
      });
    }

    containers.slice(0, 20).forEach(card => {
      // Titre
      const titleEl = card.querySelector('h1, h3, [class*="title"]');
      const title = titleEl ? (titleEl.textContent || '').trim().slice(0, 80) : '';

      // Prix
      const priceEl = card.querySelector('[class*="price"]');
      const priceText = priceEl ? (priceEl.textContent || '') : '';
      const priceMatch = priceText.replace(/\s/g, '').match(/[\d]+[.,]?[\d]*/);
      const price = priceMatch ? parseFloat(priceMatch[0].replace(',', '.')) : 0;

      // Image
      const imgEl = card.querySelector('img[src*="alicdn"]') || card.querySelector('img');
      let imageUrl = imgEl ? (imgEl.src || imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || '') : '';
      if (imageUrl && imageUrl.includes('alicdn')) {
        imageUrl = imageUrl.replace(/_\d+x\d+\.(jpg|webp)/g, '.$1').replace(/\?.*$/, '');
        if (!imageUrl.startsWith('http')) imageUrl = '';
        if (imageUrl) imageUrl = imageUrl.replace(/^http:\/\//, 'https://');
      } else {
        imageUrl = '';
      }

      // URL produit
      const linkEl = card.querySelector('a[href*="/item/"]');
      const productUrl = linkEl ? (linkEl.href || '') : '';

      if (!imageUrl && !productUrl) return;

      // Déduplication par URL ou image
      const dedupKey = productUrl || imageUrl;
      if (seen.has(dedupKey)) return;
      seen.add(dedupKey);

      if (!title && !price) return;

      cards.push({ title: title || 'Produit AliExpress', price, imageUrl, productUrl });
    });

    return cards.slice(0, 20);
  }

  // ── CRÉATION DU PANNEAU ──────────────────────────────────────────────────────
  const products = detectProducts();
  if (products.length === 0) {
    dbg('info', 'Aucun produit détecté sur cette page listing.');
    return;
  }

  dbg('info', products.length, 'produits détectés sur la page listing.');

  const panel = document.createElement('div');
  panel.id = 'ae-listing-panel';

  // Header
  const header = document.createElement('div');
  header.id = 'ae-listing-header';
  const titleEl = document.createElement('div');
  titleEl.id = 'ae-listing-title';
  titleEl.textContent = 'AliEdge — Lot';
  const collapseBtn = document.createElement('button');
  collapseBtn.id = 'ae-listing-collapse-btn';
  collapseBtn.textContent = '◀';
  collapseBtn.title = 'Réduire';
  header.appendChild(titleEl);
  header.appendChild(collapseBtn);

  let collapsed = false;
  header.addEventListener('click', function(e) {
    if (e.target === collapseBtn || e.currentTarget === header) {
      collapsed = !collapsed;
      panel.classList.toggle('collapsed', collapsed);
      const body = document.getElementById('ae-listing-body');
      const footer = document.getElementById('ae-listing-footer');
      if (body) body.style.display = collapsed ? 'none' : '';
      if (footer) footer.style.display = collapsed ? 'none' : '';
      titleEl.style.display = collapsed ? 'none' : '';
      collapseBtn.textContent = collapsed ? '▶' : '◀';
    }
  });
  panel.appendChild(header);

  // Body
  const body = document.createElement('div');
  body.id = 'ae-listing-body';

  const selectRow = document.createElement('div');
  selectRow.id = 'ae-listing-select-row';
  const selectAllBtn = document.createElement('button');
  selectAllBtn.textContent = 'Tout sélectionner';
  const deselectAllBtn = document.createElement('button');
  deselectAllBtn.textContent = 'Désélectionner';
  selectRow.appendChild(selectAllBtn);
  selectRow.appendChild(deselectAllBtn);
  body.appendChild(selectRow);

  const productRows = [];

  products.forEach(function(prod, idx) {
    const row = document.createElement('div');
    row.className = 'ae-product-row';
    row.dataset.idx = String(idx);

    const thumb = document.createElement('img');
    thumb.className = 'ae-product-thumb';
    thumb.src = prod.imageUrl || '';
    thumb.alt = prod.title;
    thumb.onerror = function() { thumb.style.display = 'none'; };

    const info = document.createElement('div');
    info.className = 'ae-product-info';
    const nameEl = document.createElement('div');
    nameEl.className = 'ae-product-name';
    nameEl.textContent = prod.title.slice(0, 36);
    nameEl.title = prod.title;
    const priceEl2 = document.createElement('div');
    priceEl2.className = 'ae-product-price';
    priceEl2.textContent = prod.price > 0 ? prod.price.toFixed(2) + ' €' : '—';
    info.appendChild(nameEl);
    info.appendChild(priceEl2);

    const checkEl = document.createElement('div');
    checkEl.className = 'ae-product-check';
    checkEl.textContent = '';

    row.appendChild(thumb);
    row.appendChild(info);
    row.appendChild(checkEl);

    row.addEventListener('click', function() {
      if (selectedProducts.has(idx)) {
        selectedProducts.delete(idx);
        row.classList.remove('selected');
        checkEl.textContent = '';
      } else {
        if (selectedProducts.size >= MAX_SELECTED) {
          checkEl.textContent = '';
          updateStatus('Max ' + MAX_SELECTED + ' produits sélectionnables');
          return;
        }
        selectedProducts.add(idx);
        row.classList.add('selected');
        checkEl.textContent = '✓';
      }
      updateAnalyseBtn();
    });

    productRows.push(row);
    body.appendChild(row);
  });

  panel.appendChild(body);

  // Footer
  const footer = document.createElement('div');
  footer.id = 'ae-listing-footer';

  const analyseBtn = document.createElement('button');
  analyseBtn.className = 'ae-listing-btn primary';
  analyseBtn.id = 'ae-analyse-lot-btn';
  analyseBtn.textContent = '📊 Analyser la sélection (0)';
  analyseBtn.disabled = true;

  const statusEl2 = document.createElement('div');
  statusEl2.id = 'ae-listing-status';
  statusEl2.textContent = products.length + ' produits détectés';

  footer.appendChild(selectRow.cloneNode ? null : null);

  selectAllBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    selectedProducts.clear();
    productRows.forEach(function(row, idx) {
      if (selectedProducts.size < MAX_SELECTED) {
        selectedProducts.add(idx);
        row.classList.add('selected');
        row.querySelector('.ae-product-check').textContent = '✓';
      }
    });
    updateAnalyseBtn();
  });

  deselectAllBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    selectedProducts.clear();
    productRows.forEach(function(row) {
      row.classList.remove('selected');
      row.querySelector('.ae-product-check').textContent = '';
    });
    updateAnalyseBtn();
  });

  footer.appendChild(analyseBtn);
  footer.appendChild(statusEl2);
  panel.appendChild(footer);

  document.body.appendChild(panel);

  function updateAnalyseBtn() {
    const count = selectedProducts.size;
    analyseBtn.textContent = '📊 Analyser la sélection (' + count + ')';
    analyseBtn.disabled = count === 0;
    statusEl2.textContent = count + '/' + MAX_SELECTED + ' produits sélectionnés';
  }

  function updateStatus(msg) {
    statusEl2.textContent = msg;
  }

  // ── ANALYSE EN LOT ──────────────────────────────────────────────────────────
  analyseBtn.addEventListener('click', async function() {
    if (selectedProducts.size === 0) return;
    analyseBtn.disabled = true;
    analyseBtn.textContent = '⏳ Récupération des images...';

    const selectedList = Array.from(selectedProducts).map(idx => products[idx]);
    updateStatus('Chargement des images...');

    // Fetch images as dataUrls
    const productData = await Promise.all(selectedList.map(async function(prod, i) {
      updateStatus('Image ' + (i+1) + '/' + selectedList.length + '...');
      if (!prod.imageUrl) return { ...prod, imageDataUrl: null };
      try {
        // We request background to fetch the image
        return await new Promise(function(resolve) {
          chrome.runtime.sendMessage({ type: 'FETCH_IMAGE', url: prod.imageUrl }, function(res) {
            void chrome.runtime.lastError;
            resolve({ ...prod, imageDataUrl: (res && res.dataUrl) ? res.dataUrl : null });
          });
        });
      } catch(e) {
        return { ...prod, imageDataUrl: null };
      }
    }));

    updateStatus('Envoi au comparateur...');
    chrome.runtime.sendMessage({
      type: 'BULK_ANALYZE_PRODUCTS',
      products: productData
    }, function(res) {
      void chrome.runtime.lastError;
      if (res && res.ok) {
        updateStatus('✅ ' + (res.count || 0) + ' produits envoyés au comparateur');
      } else {
        updateStatus('❌ Erreur lors de l\'envoi');
        analyseBtn.disabled = false;
        analyseBtn.textContent = '📊 Analyser la sélection (' + selectedProducts.size + ')';
      }
    });
  });

  dbg('info', 'Panneau AliEdge Lot injecté,', products.length, 'produits.');

})();
