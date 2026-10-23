// results.js â€” v1.3
// Features: score barre, export CSV, analyse marchÃ©, frais Vinted rÃ©els, deep data inspirations,
//           Google Sheets export, shareable URL, watchlist, historique graphe,
//           fourchette optimale, fee breakdown, refresh button, empty state amÃ©liorÃ©,
//           cache age indicator, dark/light mode toggle, marge en %/Ã—, Vinted search link

// â”€â”€ DBG â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function dbg(level, ...args) {
  const msg = args.map(a => {
    try { return (a !== null && typeof a === 'object') ? JSON.stringify(a) : String(a); } catch(e) { return '[obj]'; }
  }).join(' ');
  if (level === 'error' || level === 'warn') console.warn('[Results]', msg);
  else console.log('[Results]', msg);
}

// â”€â”€ DARK/LIGHT MODE TOGGLE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
(function() {
  const DARK_VARS = {
    '--bg': '#040404', '--bg2': '#0f0f0f', '--bg3': '#161616', '--bg4': '#1e1e1e',
    '--border': '#252525', '--border2': '#2e2e2e', '--text': '#F4EFE6',
    '--text-sec': '#AAAAAA', '--text-dim': '#777777'
  };
  const LIGHT_VARS = {
    '--bg': '#fafaf8', '--bg2': '#ffffff', '--bg3': '#f2f0ea', '--bg4': '#e8e4dc',
    '--border': '#e0ddd4', '--border2': '#d4d0c4', '--text': '#1a1800',
    '--text-sec': '#555544', '--text-dim': '#888878'
  };
  function applyTheme(isLight) {
    const root = document.documentElement;
    const vars = isLight ? LIGHT_VARS : DARK_VARS;
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = isLight ? 'â˜€ï¸' : 'ðŸŒ™';
  }
  function initTheme() {
    chrome.storage.local.get('ae_theme', function(res) {
      void chrome.runtime.lastError;
      const isLight = !!(res && res.ae_theme === 'light');
      applyTheme(isLight);
    });
    const btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.addEventListener('click', function() {
        chrome.storage.local.get('ae_theme', function(r) {
          void chrome.runtime.lastError;
          const nowLight = (r && r.ae_theme === 'light') ? false : true;
          chrome.storage.local.set({ ae_theme: nowLight ? 'light' : 'dark' }, function() { void chrome.runtime.lastError; });
          applyTheme(nowLight);
        });
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initTheme);
  else initTheme();
})();

function setStatus(txt, cls) {
  const s = document.getElementById('status');
  if (!s) return;
  s.textContent = txt;
  s.className = cls ? cls : '';
}

function fmtPrice(p) {
  return (p == null || Number.isNaN(Number(p))) ? 'â€”' : Number(p).toFixed(2);
}

function fmtMultiplier(m) {
  if (m == null || Number.isNaN(Number(m))) return 'â€”';
  let s = Number(m).toFixed(2);
  s = s.replace(/\.00$/, '');
  s = s.replace(/(\.\d)0$/, '$1');
  return s;
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, function(s) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[s];
  });
}

function sanitizeUrl(u) {
  try {
    if (!u) return '#';
    const url = new URL(String(u));
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString();
    return '#';
  } catch (e) {
    return '#';
  }
}

function sanitizeImgSrc(u) {
  if (!u || typeof u !== 'string') return '';
  try {
    const p = new URL(u);
    return (p.protocol === 'https:' || p.protocol === 'http:') ? u : '';
  } catch(e) { return ''; }
}

// Feature 3 : Score de rentabilitÃ©
function computeScore(stats, margin, aliPrice) {
  let score = 0;
  const marginPct = aliPrice > 0 ? (margin / aliPrice) * 100 : 0;
  if (marginPct > 200) score += 4;
  else if (marginPct > 100) score += 3;
  else if (marginPct > 30) score += 2;
  else if (marginPct > 0) score += 1;

  const count = stats.count || 0;
  if (count > 30) score += 3;
  else if (count > 15) score += 2;
  else if (count > 5) score += 1;

  if (stats.avgPrice > 0) {
    const spread = (stats.maxPrice - stats.minPrice) / stats.avgPrice;
    if (spread < 0.3) score += 3;
    else if (spread < 0.6) score += 2;
    else if (spread < 1.0) score += 1;
  }
  return Math.min(10, score);
}

// Feature 7 : indicateur couleur vues/jour
function speedSpan(viewsPerDay) {
  if (viewsPerDay == null) return '';
  const cls = viewsPerDay > 5 ? 'spd-green' : viewsPerDay >= 2 ? 'spd-orange' : 'spd-red';
  return `<span class="${cls}">${viewsPerDay.toFixed(1)} vues/j</span>`;
}

let currentData = null;
let initialAliBuyPriceFromBg = null;
let _userBuyPrice = null; // Prix saisi manuellement â€” persiste entre les mises Ã  jour

// Feature 6 : Export CSV
function exportCsv(data, aliBuyPrice) {
  if (!data || !data.stats) return;
  const stats = data.stats;
  const minPrice = stats.minPrice || 0;
  const advisedSell = minPrice > 0 ? parseFloat((minPrice * 0.95).toFixed(2)) : 0;
  const margin = advisedSell - (aliBuyPrice || 0);
  const score = aliBuyPrice ? computeScore(stats, margin, aliBuyPrice) : 0;
  const now = new Date().toLocaleDateString('fr-FR');

  const headers = ['Titre','Prix Ali (â‚¬)','Annonces','Moy. Vinted (â‚¬)','Min (â‚¬)','Max (â‚¬)','Prix conseillÃ© (â‚¬)','Marge (â‚¬)','Score','Date'];
  const rows = [
    headers.join(';'),
    [
      '"' + (currentData && currentData.aliTitle ? currentData.aliTitle : 'Produit') + '"',
      fmtPrice(aliBuyPrice),
      stats.count || 0,
      fmtPrice(stats.avgPrice),
      fmtPrice(stats.minPrice),
      fmtPrice(stats.maxPrice),
      fmtPrice(advisedSell),
      fmtPrice(margin),
      score,
      now
    ].join(';')
  ];

  // Ajouter lignes des inspirations
  if (Array.isArray(data.inspirations)) {
    rows.push('');
    rows.push(['#','Titre annonce','Prix (â‚¬)','URL','Vues','Favoris','Vues/jour','Age (j)'].join(';'));
    data.inspirations.forEach((it, i) => {
      const d = it.deepData || {};
      rows.push([
        i + 1,
        '"' + (it.title || '').replace(/"/g, '""') + '"',
        fmtPrice(it.price),
        it.url || '',
        d.viewCount || '',
        d.favCount || '',
        d.viewsPerDay != null ? d.viewsPerDay.toFixed(1) : '',
        d.ageDays || ''
      ].join(';'));
    });
  }

  const csv = '\uFEFF' + rows.join('\n'); // BOM pour Excel
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'aliedge-' + now.replace(/\//g, '-') + '.csv';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

// Feature 9 : Export Google Sheets en 1 clic
function exportToGoogleSheets(data, aliBuyPrice) {
  if (!data || !data.stats) return;
  const stats = data.stats;
  const minPrice = stats.minPrice || 0;
  const avgPrice = stats.avgPrice || 0;
  let ref = minPrice;
  if (avgPrice > 0 && minPrice < avgPrice * 0.5) ref = minPrice * 0.25 + avgPrice * 0.75;
  const advisedSell = ref > 0 ? parseFloat((ref * 0.92).toFixed(2)) : 0;
  const margin = advisedSell - (aliBuyPrice || 0);
  const now = new Date().toLocaleDateString('fr-FR');
  const title = (currentData && currentData.aliTitle) ? currentData.aliTitle : 'Produit';

  // CrÃ©er le CSV (format Google Sheets)
  const headers = ['Titre','Prix Ali (â‚¬)','Annonces','Moy. Vinted (â‚¬)','Min (â‚¬)','Max (â‚¬)','Prix conseillÃ© (â‚¬)','Marge (â‚¬)','Date'];
  const rows = [
    headers.join('\t'), // tabulation pour coller dans Sheets
    [
      title,
      fmtPrice(aliBuyPrice),
      stats.count || 0,
      fmtPrice(stats.avgPrice),
      fmtPrice(stats.minPrice),
      fmtPrice(stats.maxPrice),
      fmtPrice(advisedSell),
      fmtPrice(margin),
      now
    ].join('\t')
  ];

  if (Array.isArray(data.inspirations) && data.inspirations.length) {
    rows.push('');
    rows.push(['#','Titre annonce','Prix (â‚¬)','URL'].join('\t'));
    data.inspirations.slice(0,10).forEach((it, i) => {
      rows.push([i + 1, it.title || '', fmtPrice(it.price), it.url || ''].join('\t'));
    });
  }

  const tsvContent = rows.join('\n');

  // Copier dans le presse-papier (format TSV â†’ coller directement dans Google Sheets)
  navigator.clipboard.writeText(tsvContent).then(() => {
    // Ouvrir Google Sheets dans un nouvel onglet
    window.open('https://docs.google.com/spreadsheets/create', '_blank');
    // Notification
    const btn = document.getElementById('exportSheetsBtn');
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = 'âœ… CopiÃ© ! Colle dans Sheets (Ctrl+V)';
      btn.style.background = 'rgba(76,175,125,0.15)';
      btn.style.color = 'var(--green)';
      setTimeout(() => {
        btn.textContent = orig;
        btn.style.background = '';
        btn.style.color = '';
      }, 3500);
    }
  }).catch(() => {
    alert('Impossible de copier. Utilisez EXPORTER CSV Ã  la place.');
  });
}

// Feature 10 (new) : Export Notion webhook
function exportToNotion(data, aliBuyPrice) {
  chrome.storage.local.get('ae_notion_webhook', function(res) {
    void chrome.runtime.lastError;
    const savedUrl = (res && res.ae_notion_webhook) ? res.ae_notion_webhook : '';
    const webhookUrl = prompt('URL Webhook Notion (sera mÃ©morisÃ©e):', savedUrl);
    if (!webhookUrl || !webhookUrl.startsWith('http')) {
      if (webhookUrl !== null) alert('URL invalide.');
      return;
    }
    chrome.storage.local.set({ ae_notion_webhook: webhookUrl }, function() { void chrome.runtime.lastError; });

    const stats = (data && data.stats) ? data.stats : {};
    const minPrice = stats.minPrice || 0;
    const avgPrice2 = stats.avgPrice || 0;
    let _ref = minPrice;
    if (avgPrice2 > 0 && minPrice < avgPrice2 * 0.5) _ref = minPrice * 0.25 + avgPrice2 * 0.75;
    const advisedSell = _ref > 0 ? parseFloat((_ref * 0.92).toFixed(2)) : 0;
    const vintedShipping = (data && data.profitability && typeof data.profitability.vintedShipping === 'number') ? data.profitability.vintedShipping : 3;
    const margin = advisedSell > 0 && aliBuyPrice ? parseFloat((advisedSell - vintedShipping - aliBuyPrice).toFixed(2)) : null;
    const score = (margin != null && aliBuyPrice) ? computeScore(stats, margin, aliBuyPrice) : 0;

    const payload = {
      title: (currentData && currentData.aliTitle) ? currentData.aliTitle : 'Produit AliExpress',
      aliPrice: aliBuyPrice || 0,
      vintedAvg: fmtPrice(stats.avgPrice),
      vintedShipping: vintedShipping,
      advisedSell: advisedSell,
      margin: margin != null ? margin : null,
      score: score,
      date: new Date().toLocaleDateString('fr-FR'),
      url: (data && data.inspirations && data.inspirations[0]) ? (data.inspirations[0].url || '') : ''
    };

    const notionBtn = document.getElementById('notion-export-btn');
    if (notionBtn) { notionBtn.innerHTML = 'â³ Envoi...'; notionBtn.disabled = true; }

    fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(r => {
      if (notionBtn) {
        if (r.ok || r.status === 200 || r.status === 201 || r.status === 204) {
          notionBtn.innerHTML = 'âœ… EnvoyÃ© Ã  Notion';
          notionBtn.style.color = 'var(--green)';
          notionBtn.style.borderColor = 'rgba(76,175,125,0.3)';
        } else {
          notionBtn.innerHTML = 'âŒ Erreur HTTP ' + r.status;
          notionBtn.style.color = 'var(--red)';
        }
        notionBtn.disabled = false;
        setTimeout(() => { notionBtn.innerHTML = 'ðŸ“ Notion'; notionBtn.style.color = ''; notionBtn.style.borderColor = ''; }, 3000);
      }
    }).catch(e => {
      if (notionBtn) { notionBtn.innerHTML = 'âŒ ' + (e.message || 'Erreur rÃ©seau'); notionBtn.disabled = false; setTimeout(() => { notionBtn.innerHTML = 'ðŸ“ Notion'; }, 3000); }
    });
  });
}

// Feature 8 (new) : Historique des prix Vinted â€” stocker snapshots
function savePriceSnapshot(data, aliTitle) {
  try {
    if (!data || !data.stats || !data.stats.avgPrice) return;
    const key = 'ae_price_history';
    chrome.storage.local.get(key, function(res) {
      void chrome.runtime.lastError;
      const allHistory = (res && res[key] && typeof res[key] === 'object') ? res[key] : {};
      const productKey = (aliTitle || 'unknown').slice(0, 40).replace(/\s+/g, '_');
      const snapshots = Array.isArray(allHistory[productKey]) ? allHistory[productKey] : [];
      snapshots.push({ ts: Date.now(), date: new Date().toLocaleDateString('fr-FR'), avgPrice: parseFloat((data.stats.avgPrice || 0).toFixed(2)) });
      if (snapshots.length > 10) snapshots.splice(0, snapshots.length - 10);
      allHistory[productKey] = snapshots;
      chrome.storage.local.set({ [key]: allHistory }, function() { void chrome.runtime.lastError; });
    });
  } catch(e) {
    console.warn('[results] savePriceSnapshot error:', e);
  }
}

// Feature 8 (new) : Afficher historique des prix avec sparkline SVG
function renderPriceHistory(aliTitle, container) {
  try {
    const key = 'ae_price_history';
    const productKey = (aliTitle || 'unknown').slice(0, 40).replace(/\s+/g, '_');
    chrome.storage.local.get(key, function(res) {
      void chrome.runtime.lastError;
      const allHistory = (res && res[key]) ? res[key] : {};
      const snapshots = Array.isArray(allHistory[productKey]) ? allHistory[productKey] : [];

      const section = document.createElement('div');
      section.className = 'card';
      section.style.marginTop = '14px';
      section.innerHTML = '<div class="card-title">HISTORIQUE DES PRIX VINTED</div>';

      if (snapshots.length < 2) {
        const msg = document.createElement('div');
        msg.style.cssText = 'font-size:11px;color:var(--text-dim);padding:8px 0;';
        msg.textContent = snapshots.length === 0 ? 'Premier scan â€” revenez demain pour voir l\'Ã©volution.' : 'Premier scan â€” revenez demain pour voir l\'Ã©volution.';
        section.appendChild(msg);
      } else {
        const prices = snapshots.map(s => s.avgPrice);
        const minP = Math.min(...prices);
        const maxP = Math.max(...prices);
        const range = Math.max(0.01, maxP - minP);
        const W = 280, H = 60, padX = 12, padY = 8;
        const xs = prices.map((_, i) => padX + (i / (prices.length - 1)) * (W - 2 * padX));
        const ys = prices.map(p => padY + (1 - (p - minP) / range) * (H - 2 * padY));
        const path = xs.map((x, i) => (i === 0 ? `M${x.toFixed(1)},${ys[i].toFixed(1)}` : `L${x.toFixed(1)},${ys[i].toFixed(1)}`)).join(' ');
        const fillPath = path + ` L${xs[xs.length-1].toFixed(1)},${H} L${xs[0].toFixed(1)},${H} Z`;
        const svgWrap = document.createElement('div');
        svgWrap.innerHTML = `
          <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px;display:block;margin-bottom:4px;">
            <defs>
              <linearGradient id="ph-g" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#8B5CF6" stop-opacity="0.3"/>
                <stop offset="100%" stop-color="#8B5CF6" stop-opacity="0"/>
              </linearGradient>
            </defs>
            <path d="${fillPath}" fill="url(#ph-g)"/>
            <path d="${path}" fill="none" stroke="#8B5CF6" stroke-width="1.5" stroke-linejoin="round"/>
            ${prices.map((p, i) => `<circle cx="${xs[i].toFixed(1)}" cy="${ys[i].toFixed(1)}" r="3" fill="#8B5CF6" opacity="0.85"><title>${snapshots[i].date}: ${p.toFixed(2)}â‚¬</title></circle>`).join('')}
          </svg>
          <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--text-dim);">
            <span>${snapshots[0].date}</span>
            <span>${snapshots[snapshots.length-1].date}</span>
          </div>`;
        section.appendChild(svgWrap);
        const trend = prices[prices.length-1] > prices[0] ? 'â†‘' : prices[prices.length-1] < prices[0] ? 'â†“' : 'â†’';
        const trendColor = prices[prices.length-1] >= prices[0] ? 'var(--green)' : 'var(--red)';
        const summary = document.createElement('div');
        summary.style.cssText = 'font-size:10px;color:var(--text-sec);margin-top:6px;';
        summary.innerHTML = `${snapshots.length} scans Â· Moy. actuelle: <b style="color:var(--gold)">${prices[prices.length-1].toFixed(2)}â‚¬</b> <span style="color:${trendColor}">${trend}</span>`;
        section.appendChild(summary);
      }
      container.appendChild(section);
    });
  } catch(e) {
    console.warn('[results] renderPriceHistory error:', e);
  }
}

// Feature 11 : Page rÃ©sultats partageable
function generateShareUrl(data, aliBuyPrice) {
  if (!data) return null;
  try {
    const shareData = {
      t: (currentData && currentData.aliTitle) ? currentData.aliTitle.slice(0, 60) : 'Produit',
      p: aliBuyPrice || 0,
      s: {
        c: data.stats.count || 0,
        a: parseFloat((data.stats.avgPrice || 0).toFixed(2)),
        mn: parseFloat((data.stats.minPrice || 0).toFixed(2)),
        mx: parseFloat((data.stats.maxPrice || 0).toFixed(2))
      },
      pr: data.profitability || {},
      d: new Date().toLocaleDateString('fr-FR')
    };
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(shareData))));
    return window.location.href.split('#')[0] + '#share=' + encoded;
  } catch (e) {
    console.warn('[results] generateShareUrl error:', e);
    return null;
  }
}

function loadFromShareUrl() {
  const hash = window.location.hash;
  if (!hash.startsWith('#share=')) return false;
  try {
    const encoded = hash.slice('#share='.length);
    const shareData = JSON.parse(decodeURIComponent(escape(atob(encoded))));
    if (!shareData || !shareData.s) return false;

    // Reconstruire un faux objet data
    const fakeData = {
      stats: {
        count: shareData.s.c,
        avgPrice: shareData.s.a,
        minPrice: shareData.s.mn,
        maxPrice: shareData.s.mx
      },
      profitability: shareData.pr || {},
      inspirations: [],
      source: 'shared'
    };
    if (shareData.t) fakeData.aliTitle = shareData.t;

    document.title = 'AliEdge â€” ' + (shareData.t || 'RÃ©sultats partagÃ©s');

    // Afficher une banniÃ¨re "rÃ©sultats partagÃ©s"
    const banner = document.createElement('div');
    banner.style.cssText = 'padding:10px 14px;background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.3);border-radius:6px;margin-bottom:14px;font-size:11px;color:var(--gold);';
    banner.innerHTML = 'ðŸ”— RÃ©sultats partagÃ©s â€” ' + (shareData.t || '') + ' Â· ' + (shareData.d || '');
    const container = document.getElementById('resultsContainer');
    if (container) container.parentNode.insertBefore(banner, container);

    renderResults(fakeData, shareData.p || 0);
    return true;
  } catch (e) {
    console.warn('[results] loadFromShareUrl error:', e);
    return false;
  }
}

// Feature 12 : Historique avec graphe d'Ã©volution (sparkline SVG)
function renderHistoryGraph() {
  const section = document.getElementById('historyGraphSection');
  if (!section) return;

  chrome.runtime.sendMessage({ type: 'GET_LAST_VINTED_RESULTS' }, function() { void chrome.runtime.lastError; });

  chrome.storage.local.get('ae_history', function(res) {
    void chrome.runtime.lastError;
    const history = Array.isArray(res.ae_history) ? res.ae_history : [];
    if (history.length < 2) { section.style.display = 'none'; return; }

    section.style.display = 'block';
    const container = document.getElementById('historyGraphContainer');
    if (!container) return;

    // Prendre les 10 derniers items avec marge, dans l'ordre chronologique
    const points = history.slice(0, 10).reverse().filter(it => typeof it.margin === 'number');
    if (points.length < 2) return;

    const margins = points.map(p => p.margin);
    const minM = Math.min(...margins);
    const maxM = Math.max(...margins);
    const range = Math.max(1, maxM - minM);
    const W = 280, H = 60, padX = 10, padY = 8;
    const xs = points.map((_, i) => padX + (i / (points.length - 1)) * (W - 2 * padX));
    const ys = margins.map(m => padY + (1 - (m - minM) / range) * (H - 2 * padY));

    // Construire SVG
    const path = xs.map((x, i) => (i === 0 ? `M${x.toFixed(1)},${ys[i].toFixed(1)}` : `L${x.toFixed(1)},${ys[i].toFixed(1)}`)).join(' ');
    const fillPath = path + ` L${xs[xs.length-1].toFixed(1)},${H} L${xs[0].toFixed(1)},${H} Z`;

    container.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px;display:block;">
        <defs>
          <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#8B5CF6" stop-opacity="0.3"/>
            <stop offset="100%" stop-color="#8B5CF6" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <path d="${fillPath}" fill="url(#g1)"/>
        <path d="${path}" fill="none" stroke="#8B5CF6" stroke-width="1.5" stroke-linejoin="round"/>
        ${points.map((p, i) => `<circle cx="${xs[i].toFixed(1)}" cy="${ys[i].toFixed(1)}" r="3" fill="${p.margin > 0 ? '#4caf7d' : '#C0392B'}" opacity="0.9">
          <title>${p.title ? p.title.slice(0,30) : ''} â€” ${p.margin >= 0 ? '+' : ''}${p.margin.toFixed(2)}â‚¬</title>
        </circle>`).join('')}
      </svg>
      <div style="display:flex;justify-content:space-between;font-size:8px;color:var(--text-dim);margin-top:4px;">
        <span>${points[0].date || ''}</span>
        <span>${points[points.length-1].date || ''}</span>
      </div>`;
  });
}

function renderResults(data, aliBuyFromBg) {
  currentData = data || null;

  // Si le prix d'achat AliExpress a changÃ© significativement â†’ nouveau produit â†’ reset prix manuel
  if (aliBuyFromBg != null && initialAliBuyPriceFromBg != null &&
      Math.abs(Number(aliBuyFromBg) - Number(initialAliBuyPriceFromBg)) > 0.5) {
    _userBuyPrice = null;
  }

  initialAliBuyPriceFromBg = (aliBuyFromBg != null) ? aliBuyFromBg : null;
  const container = document.getElementById('resultsContainer');
  if (!container) return;
  container.innerHTML = '';

  // Feature Q : afficher l'Ã¢ge du cache
  if (data && data.fetchTs) updateCacheAgeDisplay(data.fetchTs);

  if (!data || !data.stats) {
    setStatus('Aucun rÃ©sultat reÃ§u.', '');
    return;
  }

  // Feature I : improved empty state when no listings
  if (data.stats.count === 0) {
    container.innerHTML = `
      <div class="waiting-state anim-fadein">
        <div class="waiting-icon">ðŸ”</div>
        <div class="waiting-text">Aucune annonce trouvÃ©e sur Vinted</div>
        <div class="waiting-sub">Le produit n'a pas de correspondance pour le moment.<br>Essaie une recherche directe ou le moteur Bing.</div>
        <div class="empty-actions">
          <a class="empty-action-btn" href="https://www.vinted.fr/catalog" target="_blank" rel="noopener noreferrer">â†’ Onglet Vinted</a>
          <button class="empty-action-btn" id="bingFallbackBtn">â†’ Recherche Bing</button>
        </div>
      </div>`;
    const bingFb = document.getElementById('bingFallbackBtn');
    if (bingFb) {
      bingFb.addEventListener('click', function() {
        bingFb.textContent = 'â³ En cours...';
        bingFb.disabled = true;
        chrome.runtime.sendMessage({
          type: 'SEARCH_BING_MANUAL',
          market: data.market || 'fr',
          condition: data.condition || 'all',
          aliPrice: data.aliPrice || 0
        }, function() { void chrome.runtime.lastError; });
      });
    }
    setStatus('0 annonce trouvÃ©e.', '');
    return;
  }

  const sourceLabel = data.source === 'api' ? 'RÃ©sultats API directs âœ…' : 'RÃ©sultats reÃ§us âœ…';
  setStatus(sourceLabel, 'ok');

  const stats = data.stats || {};
  const minPrice = (stats.minPrice != null) ? Number(stats.minPrice) : null;

  // Feature 4 : prix conseillÃ© intelligent avec dÃ©tection d'outliers
  // Si le min est < 50% de la moyenne â†’ annonce atypique â†’ on pondÃ¨re (25% min + 75% avg) Ã— 0.92
  // Sinon â†’ on reste proche du min compÃ©titif Ã— 0.92
  const avgPrice2 = (stats.avgPrice != null) ? Number(stats.avgPrice) : 0;
  let _advisedRef = minPrice;
  if (avgPrice2 > 0 && minPrice != null && minPrice < avgPrice2 * 0.5) {
    _advisedRef = minPrice * 0.25 + avgPrice2 * 0.75;
  }
  const advisedSell = (_advisedRef != null && _advisedRef > 0) ? Number((_advisedRef * 0.92).toFixed(2)) : null;

  let aliBuyPrice = null;
  if (initialAliBuyPriceFromBg != null) {
    aliBuyPrice = Number(initialAliBuyPriceFromBg);
  } else if (data.profitability && typeof data.profitability.aliBuyPrice === 'number') {
    aliBuyPrice = Number(data.profitability.aliBuyPrice);
  } else if (data.profit && typeof data.profit.aliBuyPrice === 'number') {
    aliBuyPrice = Number(data.profit.aliBuyPrice);
  }

  // Feature 1 (new) : frais envoi vendeur depuis profitability ou dÃ©faut 3â‚¬
  const vintedShipping = (data.profitability && typeof data.profitability.vintedShipping === 'number') ? data.profitability.vintedShipping : 3;

  // Feature 5 (new) : catÃ©gorie dÃ©tectÃ©e
  const detectedCategory = data.category || null;

  // Feature 6 (new) : Alerte saisonnalitÃ©
  const _seasonTitle = (data.aliTitle || (currentData && currentData.aliTitle) || data.bingProductName || '').toLowerCase();
  const _currentMonth = new Date().getMonth(); // 0=Jan...11=Dec
  const _seasonKeywords = {
    ete: ['maillot', 'short', 'tong', 'lunettes soleil', 'lunettes de soleil', 'parasol', 'swimsuit', 'bikini', 'swim'],
    hiver: ['manteau', 'doudoune', 'bonnet', 'Ã©charpe', 'echarpe', 'gants', 'coat', 'parka', 'puffer'],
    rentree: ['cartable', 'sac Ã©cole', 'sac ecole', 'school bag', 'pencil case', 'trousse'],
    noel: ['dÃ©co noÃ«l', 'deco noel', 'sapin', 'christmas', 'noÃ«l', 'noel decoration'],
  };
  const _monthNames = ['janvier','fÃ©vrier','mars','avril','mai','juin','juillet','aoÃ»t','septembre','octobre','novembre','dÃ©cembre'];
  let _seasonalWarning = null;
  // Ã‰tÃ© = juin/juil/aout (5,6,7), hors saison = oct-avr
  if (_seasonKeywords.ete.some(kw => _seasonTitle.includes(kw)) && (_currentMonth < 4 || _currentMonth > 8)) {
    _seasonalWarning = `Produit estival â€” demande faible en ${_monthNames[_currentMonth]}`;
  }
  // Hiver = nov/dÃ©c/jan/fÃ©v (10,11,0,1), hors saison = avr-oct
  else if (_seasonKeywords.hiver.some(kw => _seasonTitle.includes(kw)) && (_currentMonth >= 3 && _currentMonth <= 9)) {
    _seasonalWarning = `Produit hivernal â€” demande faible en ${_monthNames[_currentMonth]}`;
  }
  // RentrÃ©e = aoÃ»t/sept (7,8), hors saison = autres mois
  else if (_seasonKeywords.rentree.some(kw => _seasonTitle.includes(kw)) && (_currentMonth < 7 || _currentMonth > 9)) {
    _seasonalWarning = `Produit rentrÃ©e scolaire â€” demande faible en ${_monthNames[_currentMonth]}`;
  }
  // NoÃ«l = nov/dÃ©c (10,11), hors saison = jan-oct
  else if (_seasonKeywords.noel.some(kw => _seasonTitle.includes(kw)) && _currentMonth < 10) {
    _seasonalWarning = `Produit de NoÃ«l â€” demande faible en ${_monthNames[_currentMonth]}`;
  }

  // Feature 6 : activer le bouton CSV
  const exportBtn = document.getElementById('exportCsvBtn');
  if (exportBtn) {
    exportBtn.classList.add('visible');
    exportBtn.onclick = () => exportCsv(data, aliBuyPrice);
  }

  // Feature 9 : bouton Google Sheets
  const sheetsBtn = document.getElementById('exportSheetsBtn');
  if (sheetsBtn) {
    sheetsBtn.classList.add('visible');
    sheetsBtn.onclick = () => exportToGoogleSheets(data, aliBuyPrice);
  }

  // Feature 10 (new) : bouton Notion dans le header
  const notionHeaderBtn = document.getElementById('notionExportBtn');
  if (notionHeaderBtn) {
    notionHeaderBtn.style.display = 'inline-block';
    notionHeaderBtn.onclick = () => exportToNotion(data, aliBuyPrice);
  }

  // Badge selon le mode de recherche utilisÃ©
  const existingModeBanner = document.getElementById('search-mode-banner');
  if (existingModeBanner) existingModeBanner.remove();
  if (data.searchMode === "bing-visual") {
    const banner = document.createElement('div');
    banner.id = 'search-mode-banner';
    banner.style.cssText = 'padding:7px 12px;background:rgba(0,120,212,0.07);border:1px solid rgba(0,120,212,0.25);border-radius:6px;margin-bottom:12px;font-size:10px;color:#0078d4;display:flex;align-items:center;gap:6px;';
    const productLabel = data.bingProductName ? ` Â· <i>${data.bingProductName}</i>` : "";
    banner.innerHTML = `ðŸ” <span><b>Bing Visual Search</b> â€” Produit identifiÃ©${productLabel}, annonces Vinted filtrÃ©es par pertinence. <b>Ouvre Vinted dans un onglet</b> pour des rÃ©sultats encore plus prÃ©cis la prochaine fois.</span>`;
    container.insertBefore(banner, container.firstChild);
  } else if (data.searchMode === "text") {
    const banner = document.createElement('div');
    banner.id = 'search-mode-banner';
    banner.style.cssText = 'padding:7px 12px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);border-radius:6px;margin-bottom:12px;font-size:10px;color:#d97706;display:flex;align-items:center;gap:6px;';
    banner.innerHTML = 'ðŸ“ <span><b>Recherche par titre</b> â€” RÃ©sultats basÃ©s sur le titre du produit AliExpress. <b>Ouvre Vinted dans un onglet</b> pour des rÃ©sultats par image la prochaine fois.</span>';
    container.insertBefore(banner, container.firstChild);
  } else if (data.searchMode === "text-manual") {
    const banner = document.createElement('div');
    banner.id = 'search-mode-banner';
    banner.style.cssText = 'padding:7px 12px;background:rgba(76,175,125,0.08);border:1px solid rgba(76,175,125,0.25);border-radius:6px;margin-bottom:12px;font-size:10px;color:#4caf7d;display:flex;align-items:center;gap:6px;';
    const searchLabel = data.bingProductName ? ` Â· <i>${escHtml(data.bingProductName.slice(0,40))}</i>` : '';
    banner.innerHTML = `ðŸ”¤ <span><b>Recherche texte manuelle</b>${searchLabel} â€” RÃ©sultats filtrÃ©s par mots-clÃ©s Vinted.</span>`;
    container.insertBefore(banner, container.firstChild);
    // Update the manual search status
    const mss = document.getElementById('manualSearchStatus');
    if (mss) mss.textContent = data.stats ? `${data.stats.count || 0} annonces trouvÃ©es` : '';
  }

  // Feature 11 : afficher la mention multi-marchÃ© si applicable
  if (data.allMarkets && data.allMarkets.length > 1) {
    const existing = document.getElementById('multi-market-banner');
    if (existing) existing.remove();
    const banner = document.createElement('div');
    banner.id = 'multi-market-banner';
    banner.style.cssText = 'padding:8px 12px;background:rgba(76,175,125,0.08);border:1px solid rgba(76,175,125,0.25);border-radius:6px;margin-bottom:12px;font-size:10px;color:#4caf7d;';
    const mkts = data.allMarkets.map(m => `ðŸ³ï¸ ${m.market.toUpperCase()}: ${m.count} annonces Â· ${m.avgPrice ? m.avgPrice.toFixed(0) : '?'}â‚¬ moy.`).join(' &nbsp;|&nbsp; ');
    banner.innerHTML = 'ðŸŒ Multi-marchÃ© â€” Meilleur rÃ©sultat sÃ©lectionnÃ© &nbsp;|&nbsp; ' + mkts;
    container.insertBefore(banner, container.firstChild);
  }

  // Feature 7 : analyse marchÃ©
  if (data.marketAnalysis) {
    renderMarketAnalysis(data.marketAnalysis);
  }

  // â”€â”€ AUTO-COPY (Feature G)
  autoCopySummary(data, aliBuyPrice, advisedSell, stats);

  // â”€â”€ VINTED SEARCH LINK (Feature P)
  const _searchQuery = data.bingProductName || data.aliTitle || (currentData && currentData.aliTitle) || '';
  if (_searchQuery) {
    const vintedLinkBar = document.createElement('div');
    vintedLinkBar.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:12px;font-size:11px;color:var(--text-dim);';
    const vintedUrl = buildVintedSearchUrl(_searchQuery, data.market || 'fr');
    vintedLinkBar.innerHTML = `<span>Produit :</span> <b style="color:var(--text);font-family:var(--font-body);">${escHtml(_searchQuery.slice(0, 60))}</b> <a href="${escHtml(vintedUrl)}" target="_blank" rel="noopener noreferrer" class="vinted-search-link">ðŸ”— Voir sur Vinted</a>`;
    container.appendChild(vintedLinkBar);
  }

  // â”€â”€ GRID WRAPPER
  const grid = document.createElement('div');
  grid.className = 'results-grid anim-fadein';
  container.appendChild(grid);

  // â”€â”€ LEFT COLUMN
  const left = document.createElement('div');
  left.style.display = 'flex';
  left.style.flexDirection = 'column';
  left.style.gap = '14px';
  grid.appendChild(left);

  // Stats card
  const statsCard = document.createElement('div');
  statsCard.className = 'card';

  // Feature 3 (new) : concurrence indicator
  const _count = stats.count || 0;
  const _concLabel = _count < 5 ? 'ðŸŸ¢ Faible' : _count <= 15 ? 'ðŸŸ¡ ModÃ©rÃ©e' : 'ðŸ”´ Ã‰levÃ©e';
  const _concColor = _count < 5 ? 'var(--green)' : _count <= 15 ? 'var(--orange)' : 'var(--red)';

  // Feature 5 (new) : category badge HTML
  const _catBadgeHtml = detectedCategory
    ? `<span style="display:inline-block;padding:3px 9px;border-radius:3px;background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.25);color:var(--gold);font-size:9px;letter-spacing:0.8px;font-family:var(--font-ui);margin-left:6px;">${detectedCategory.label.toUpperCase()}</span>`
    : '';

  // Feature 6 (new) : seasonal warning HTML
  const _seasonalHtml = _seasonalWarning
    ? `<div style="margin-top:12px;padding:8px 12px;background:rgba(212,135,74,0.1);border:1px solid rgba(212,135,74,0.35);border-radius:5px;font-size:10px;color:var(--orange);display:flex;align-items:center;gap:6px;">
        âš ï¸ <span><b>Produit saisonnier</b> â€” ${_seasonalWarning}</span>
      </div>`
    : '';

  statsCard.innerHTML = `
    <div style="display:flex;align-items:center;margin-bottom:16px;">
      <div class="card-title" style="margin-bottom:0;">STATISTIQUES VINTED</div>
      ${_catBadgeHtml}
    </div>
    <div class="stats-row">
      <div class="stat-box">
        <div class="stat-val">${stats.count ?? 0}</div>
        <div class="stat-lbl">Annonces</div>
      </div>
      <div class="stat-box">
        <div class="stat-val">${fmtPrice(stats.avgPrice)} â‚¬</div>
        <div class="stat-lbl">Prix moyen</div>
      </div>
      <div class="stat-box">
        <div class="stat-val">${fmtPrice(stats.minPrice)}â€“${fmtPrice(stats.maxPrice)} â‚¬</div>
        <div class="stat-lbl">Fourchette</div>
      </div>
    </div>
    <div style="margin-top:10px;padding:8px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:5px;display:flex;align-items:center;gap:8px;">
      <span style="font-size:9px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.8px;">Concurrence</span>
      <span style="font-family:var(--font-head);font-size:13px;color:${_concColor};">${_concLabel}</span>
      <span style="font-size:9px;color:var(--text-dim);margin-left:auto;">${_count} annonces similaires sur Vinted</span>
    </div>
    ${_seasonalHtml}`;
  left.appendChild(statsCard);

  // Inspirations card
  const inspCard = document.createElement('div');
  inspCard.className = 'card';

  const inspHeader = document.createElement('div');
  inspHeader.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;';

  const inspTitle = document.createElement('div');
  inspTitle.className = 'card-title';
  inspTitle.style.marginBottom = '0';
  inspTitle.textContent = 'ANNONCES SIMILAIRES';
  inspHeader.appendChild(inspTitle);

  // ContrÃ´les de tri
  const sortBar = document.createElement('div');
  sortBar.style.cssText = 'display:flex;gap:5px;align-items:center;';
  const sortBtns = [
    { key: 'orig', label: 'â‰¡' , title: 'Ordre Vinted' },
    { key: 'asc',  label: 'â†‘â‚¬', title: 'Prix croissant' },
    { key: 'desc', label: 'â†“â‚¬', title: 'Prix dÃ©croissant' }
  ];
  let currentSort = 'orig';
  const sortBtnEls = {};
  sortBtns.forEach(sb => {
    const b = document.createElement('button');
    b.textContent = sb.label;
    b.title = sb.title;
    b.dataset.sort = sb.key;
    b.style.cssText = `padding:3px 7px;border-radius:4px;border:1px solid var(--border2);background:${sb.key === 'orig' ? 'var(--gold-dim)' : 'var(--bg3)'};color:${sb.key === 'orig' ? 'var(--gold)' : 'var(--text-dim)'};font-family:var(--font-ui);font-size:10px;cursor:pointer;transition:all 0.15s;`;
    b.onclick = () => {
      currentSort = sb.key;
      sortBtnEls['orig'].style.background = 'var(--bg3)'; sortBtnEls['orig'].style.color = 'var(--text-dim)';
      sortBtnEls['asc'].style.background  = 'var(--bg3)'; sortBtnEls['asc'].style.color  = 'var(--text-dim)';
      sortBtnEls['desc'].style.background = 'var(--bg3)'; sortBtnEls['desc'].style.color = 'var(--text-dim)';
      b.style.background = 'var(--gold-dim)'; b.style.color = 'var(--gold)';
      renderInspList(currentSort);
    };
    sortBtnEls[sb.key] = b;
    sortBar.appendChild(b);
  });
  inspHeader.appendChild(sortBar);
  inspCard.appendChild(inspHeader);

  const inspList = document.createElement('div');
  inspList.className = 'insp-grid';
  inspCard.appendChild(inspList);
  left.appendChild(inspCard);

  const insp = Array.isArray(data.inspirations) ? data.inspirations : [];

  function buildInspCard(it, i) {
    const safe = sanitizeUrl(it.url);
    // Feature L : whole card is clickable (opens in new tab)
    const d = document.createElement('a');
    d.className = 'insp-card';
    d.href   = safe;
    d.target = '_blank';
    d.rel    = 'noopener noreferrer';
    d.style.cssText = 'display:flex;flex-direction:column;text-decoration:none;cursor:pointer;';
    let deepHtml = '';
    if (it.deepData) {
      const dd = it.deepData;
      deepHtml = `<div class="insp-deep">
        ðŸ‘ ${dd.viewCount || 0} &nbsp;â¤ ${dd.favCount || 0} &nbsp;${speedSpan(dd.viewsPerDay)}
        ${dd.ageDays != null ? `&nbsp;ðŸ“… ${dd.ageDays}j` : ''}
      </div>`;
    }
    d.innerHTML = `
      <img src="${sanitizeImgSrc(it.image)}" alt="${escHtml(String(it.title || '').slice(0, 60))}" loading="lazy" />
      <div class="insp-body" style="flex:1;">
        <div class="insp-num">Annonce #${i + 1}</div>
        <div class="insp-title">${escHtml(String(it.title || 'Annonce Vinted'))}</div>
        <div class="insp-price">${it.price != null ? Number(it.price).toFixed(2) + ' â‚¬' : 'â€”'}</div>
        ${deepHtml}
        <span class="insp-link" style="margin-top:auto;">VOIR â†’</span>
      </div>`;
    return d;
  }

  function renderInspList(sortKey) {
    inspList.innerHTML = '';
    if (!insp.length) {
      const none = document.createElement('div');
      none.style.cssText = 'color:var(--text-dim);font-size:12px;';
      none.textContent = 'Aucune annonce trouvÃ©e.';
      inspList.appendChild(none);
      return;
    }
    let sorted = [...insp];
    if (sortKey === 'asc')  sorted.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    if (sortKey === 'desc') sorted.sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity));
    sorted.forEach((it, i) => inspList.appendChild(buildInspCard(it, i)));
  }

  renderInspList('orig');

  // â”€â”€ RIGHT COLUMN â€” Profit
  const right = document.createElement('div');
  right.style.display = 'flex';
  right.style.flexDirection = 'column';
  right.style.gap = '14px';
  grid.appendChild(right);

  const profitCard = document.createElement('div');
  profitCard.className = 'card';

  const profitTitleEl = document.createElement('div');
  profitTitleEl.className = 'card-title';
  profitTitleEl.textContent = 'RENTABILITÃ‰';
  profitCard.appendChild(profitTitleEl);

  // Prix d'achat input
  const buyRow = document.createElement('div');
  buyRow.className = 'profit-row';
  buyRow.innerHTML = `<span class="lbl">Prix achat AliExpress</span>`;
  const inputWrap = document.createElement('div');
  inputWrap.className = 'inline-input';
  const buyInput = document.createElement('input');
  buyInput.type = 'number'; buyInput.step = '0.01'; buyInput.placeholder = '5.50';
  buyInput.value = (_userBuyPrice != null) ? String(_userBuyPrice) : (aliBuyPrice != null ? String(aliBuyPrice) : '');
  inputWrap.appendChild(buyInput);
  const applyBtn = document.createElement('button');
  applyBtn.textContent = 'OK';
  inputWrap.appendChild(applyBtn);
  buyRow.appendChild(inputWrap);
  profitCard.appendChild(buyRow);

  const divider1 = document.createElement('div');
  divider1.className = 'divider';
  profitCard.appendChild(divider1);

  // Advised price (Feature 4 : min - 5%)
  const advisedLbl = document.createElement('div');
  advisedLbl.className = 'advised-label';
  advisedLbl.textContent = (avgPrice2 > 0 && minPrice != null && minPrice < avgPrice2 * 0.5)
    ? 'Prix conseillÃ© (marchÃ© pondÃ©rÃ© Ã— 0.92)'
    : 'Prix conseillÃ© (min Ã— 0.92)';
  profitCard.appendChild(advisedLbl);

  const advisedEl = document.createElement('div');
  advisedEl.className = 'advised-price';
  advisedEl.textContent = (advisedSell != null) ? (fmtPrice(advisedSell) + ' â‚¬') : 'â€”';
  profitCard.appendChild(advisedEl);

  // Details box
  const isOutlier = avgPrice2 > 0 && minPrice != null && minPrice < avgPrice2 * 0.5;
  const calcLabel = isOutlier
    ? `(${fmtPrice(minPrice)}Ã—0.25 + ${fmtPrice(avgPrice2)}Ã—0.75) Ã— 0.92 = ${fmtPrice(advisedSell)} â‚¬`
    : `${fmtPrice(minPrice)} Ã— 0.92 = ${fmtPrice(advisedSell)} â‚¬`;

  // Feature F : Fee breakdown table
  const details = document.createElement('div');
  details.className = 'profit-details';
  details.innerHTML = `
    <div class="profit-row">
      <span class="lbl">Calcul prix conseillÃ©</span>
      <span class="val" style="font-size:10px;">${advisedSell != null ? calcLabel : 'â€”'}</span>
    </div>
    <table class="fee-table" id="fee-breakdown-table">
      <tr><td>Prix de vente conseillÃ©</td><td style="color:var(--text);">${advisedSell != null ? fmtPrice(advisedSell) + ' â‚¬' : 'â€”'}</td></tr>
      <tr><td>Frais envoi vendeur</td><td style="color:var(--red);">âˆ’ ${vintedShipping.toFixed(2)} â‚¬</td></tr>
      <tr><td id="fee-ali-label">CoÃ»t produit AliExpress</td><td id="fee-ali-val" style="color:var(--red);">â€” â‚¬</td></tr>
      <tr class="fee-sep"><td>â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•</td><td></td></tr>
      <tr class="fee-total"><td>Marge nette</td><td id="margin-line">â€”</td></tr>
      <tr><td style="font-size:9px;color:var(--text-dim);">Formule</td><td id="mult-line" style="font-size:9px;color:var(--text-dim);"></td></tr>
    </table>`;
  profitCard.appendChild(details);

  // Feature E : Fourchette optimale section (after details)
  if (advisedSell != null && avgPrice2 > 0) {
    const priceRangeEl = document.createElement('div');
    priceRangeEl.className = 'price-range-section';
    const pAggressive = Number((minPrice != null ? minPrice * 0.90 : advisedSell * 0.92).toFixed(2));
    const pBalanced   = advisedSell;
    const pPremium    = Number((avgPrice2 * 0.95).toFixed(2));
    priceRangeEl.innerHTML = `
      <div class="price-range-label">FOURCHETTE OPTIMALE</div>
      <div class="price-pills">
        <div class="price-pill aggressive">
          <div><span class="pill-label">VENDRE VITE</span></div>
          <div class="pill-price">${fmtPrice(pAggressive)} â‚¬</div>
        </div>
        <div class="price-pill balanced">
          <div><span class="pill-label">RECOMMANDÃ‰</span></div>
          <div class="pill-price">${fmtPrice(pBalanced)} â‚¬</div>
        </div>
        <div class="price-pill premium">
          <div><span class="pill-label">MAXIMISER MARGE</span></div>
          <div class="pill-price">${fmtPrice(pPremium)} â‚¬</div>
        </div>
      </div>`;
    profitCard.appendChild(priceRangeEl);
  }

  // Badge
  const badgeEl = document.createElement('div');
  badgeEl.className = 'badge red';
  badgeEl.textContent = 'INDÃ‰TERMINÃ‰';
  profitCard.appendChild(badgeEl);

  // Feature 3 : Score bar
  const scoreSection = document.createElement('div');
  scoreSection.className = 'score-section';
  scoreSection.innerHTML = `
    <div class="score-header">
      <span class="score-label">Score de rentabilitÃ©</span>
      <span class="score-value" id="score-value">â˜… â€”/10</span>
    </div>
    <div class="score-bar-bg">
      <div class="score-bar-fill" id="score-bar-fill" style="width:0%"></div>
    </div>`;
  profitCard.appendChild(scoreSection);

  const noteEl = document.createElement('div');
  noteEl.className = 'badge-note';
  noteEl.textContent = isOutlier
    ? 'Min atypique dÃ©tectÃ© â†’ prix pondÃ©rÃ© (25% min + 75% moy) Ã— 0.92. Hors frais de port.'
    : 'Prix conseillÃ© = prix min Ã— 0.92 (compÃ©titif). Hors frais de port vendeur.';
  profitCard.appendChild(noteEl);

  // â”€â”€ ZONE D'ACTIONS (boutons amÃ©liorÃ©s) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const actionsDivider = document.createElement('div');
  actionsDivider.style.cssText = 'height:1px;background:linear-gradient(90deg,transparent,var(--border2),transparent);margin:16px 0 12px;';
  profitCard.appendChild(actionsDivider);

  const actionsLabel = document.createElement('div');
  actionsLabel.style.cssText = 'font-size:8px;color:var(--text-dim);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px;';
  actionsLabel.textContent = 'Actions';
  profitCard.appendChild(actionsLabel);

  const actionsDiv = document.createElement('div');
  actionsDiv.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
  profitCard.appendChild(actionsDiv);

  // â”€â”€ Bouton Bing Visual Search (recherche alternative manuelle) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const bingBtn = document.createElement('button');
  bingBtn.id = 'bing-search-btn';
  bingBtn.title = 'Identifier le produit via Bing et chercher sur Vinted (rÃ©sultats approx.)';
  bingBtn.innerHTML = 'ðŸ” Recherche Bing (approx.)';
  Object.assign(bingBtn.style, {
    width: '100%', padding: '9px 12px',
    background: 'rgba(0,120,212,0.08)', border: '1px solid rgba(0,120,212,0.25)',
    borderRadius: '4px', color: '#0078d4',
    fontFamily: 'var(--font-ui)', fontSize: '11px', letterSpacing: '0.8px',
    cursor: 'pointer', textAlign: 'left', transition: 'background 0.2s',
  });
  bingBtn.addEventListener('mouseenter', () => { bingBtn.style.background = 'rgba(0,120,212,0.15)'; });
  bingBtn.addEventListener('mouseleave', () => { bingBtn.style.background = 'rgba(0,120,212,0.08)'; });
  bingBtn.addEventListener('click', () => {
    bingBtn.innerHTML = 'â³ Identification en cours...';
    bingBtn.disabled = true;
    chrome.runtime.sendMessage({
      type: "SEARCH_BING_MANUAL",
      market:    data.market    || "fr",
      condition: data.condition || "all",
      aliPrice:  data.aliPrice  || 0,
    }, () => { void chrome.runtime.lastError; });
    // Re-activer aprÃ¨s 20s si pas de rÃ©ponse
    setTimeout(() => {
      if (bingBtn.disabled) {
        bingBtn.innerHTML = 'ðŸ” Recherche Bing (approx.)';
        bingBtn.disabled = false;
      }
    }, 20000);
  });
  actionsDiv.appendChild(bingBtn);

  // Bouton copier rÃ©sumÃ©
  const copyBtn = document.createElement('button');
  copyBtn.id = 'copy-summary-btn';
  copyBtn.title = 'Copier le rÃ©sumÃ© compact dans le presse-papier';
  copyBtn.innerHTML = 'ðŸ“‹ Copier rÃ©sumÃ©';
  Object.assign(copyBtn.style, {
    width: '100%', padding: '9px 12px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border2)',
    background: 'var(--bg3)', color: 'var(--text-sec)',
    fontFamily: 'var(--font-ui)', fontSize: '10px', cursor: 'pointer',
    transition: 'all 0.15s', letterSpacing: '0.5px',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
  });
  copyBtn.onmouseenter = () => { copyBtn.style.background = 'var(--bg4)'; copyBtn.style.borderColor = 'var(--border2)'; copyBtn.style.color = 'var(--text)'; };
  copyBtn.onmouseleave = () => { copyBtn.style.background = 'var(--bg3)'; copyBtn.style.color = 'var(--text-sec)'; };
  copyBtn.onclick = function() {
    try {
      const ali = parseFloat(buyInput.value || '0') || 0;
      const title = (currentData && currentData.aliTitle) ? currentData.aliTitle : 'Produit';
      const scoreVal = document.getElementById('score-value');
      const scoreText = scoreVal ? scoreVal.textContent : 'â€”';
      const margin = (advisedSell != null && ali > 0) ? (advisedSell - ali).toFixed(2) : 'â€”';
      const summary = [
        'ðŸ›’ ' + title.slice(0, 60),
        'Prix Ali : ' + (ali > 0 ? ali.toFixed(2) + ' â‚¬' : 'â€”'),
        'Annonces Vinted : ' + (stats.count || 0),
        'Moy. : ' + fmtPrice(stats.avgPrice) + ' â‚¬ | Min : ' + fmtPrice(stats.minPrice) + ' â‚¬',
        'Prix conseillÃ© : ' + (advisedSell != null ? fmtPrice(advisedSell) + ' â‚¬' : 'â€”'),
        'Marge estimÃ©e : ' + (margin !== 'â€”' ? (parseFloat(margin) >= 0 ? '+' : '') + margin + ' â‚¬' : 'â€”'),
        'Score : ' + scoreText,
        'â€” AliEdge'
      ].join('\n');
      navigator.clipboard.writeText(summary).then(() => {
        copyBtn.innerHTML = 'âœ… CopiÃ© dans le presse-papier !';
        copyBtn.style.background = 'var(--bg4)';
        copyBtn.style.color = 'var(--text)';
        setTimeout(() => { copyBtn.innerHTML = 'ðŸ“‹ Copier rÃ©sumÃ©'; copyBtn.style.color = 'var(--text-sec)'; }, 2000);
      }).catch(() => {
        copyBtn.innerHTML = 'âŒ Ã‰chec â€” vÃ©rifie les permissions';
        setTimeout(() => { copyBtn.innerHTML = 'ðŸ“‹ Copier rÃ©sumÃ©'; }, 2000);
      });
    } catch(e) {
      console.warn('[results] copy summary error:', e);
    }
  };
  actionsDiv.appendChild(copyBtn);

  // Feature 11 : Bouton partager â€” copie un rÃ©sumÃ© texte formatÃ© (Discord/WhatsApp/Notion)
  const shareBtn = document.createElement('button');
  shareBtn.id = 'share-results-btn';
  shareBtn.title = 'Copier le rÃ©sumÃ© Ã  partager (Discord, WhatsApp, Notionâ€¦)';
  shareBtn.innerHTML = 'ðŸ“¤ Partager le rÃ©sumÃ©';
  Object.assign(shareBtn.style, {
    marginTop: '8px', width: '100%', padding: '8px 12px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid rgba(139,92,246,0.3)',
    background: 'linear-gradient(135deg,rgba(139,92,246,0.07),rgba(139,92,246,0.03))',
    color: 'var(--gold)', fontFamily: 'var(--font-ui)', fontSize: '10px',
    cursor: 'pointer', transition: 'all 0.15s', letterSpacing: '0.5px',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
  });
  shareBtn.onmouseenter = () => { shareBtn.style.background = 'rgba(139,92,246,0.15)'; };
  shareBtn.onmouseleave = () => { shareBtn.style.background = 'linear-gradient(135deg,rgba(139,92,246,0.07),rgba(139,92,246,0.03))'; };
  shareBtn.onclick = function() {
    try {
      const ali = parseFloat(buyInput.value || '0') || aliBuyPrice || 0;
      const title = (currentData && currentData.aliTitle) ? currentData.aliTitle.slice(0, 60) : 'Produit AliExpress';
      const scoreEl = document.getElementById('score-value');
      const scoreText = scoreEl ? scoreEl.textContent : 'â€”';
      const margin = (advisedSell != null && ali > 0) ? advisedSell - ali : null;
      const roiPct = (margin != null && ali > 0) ? ((margin / ali) * 100).toFixed(0) : null;

      const summary = [
        'â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€',
        'ðŸ›’ ' + title,
        'â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€',
        'ðŸ’° Prix d\'achat Ali : ' + (ali > 0 ? ali.toFixed(2) + ' â‚¬' : 'N/A'),
        'ðŸ“Š Annonces Vinted  : ' + (stats.count || 0),
        'ðŸ“ˆ Prix moy. Vinted : ' + fmtPrice(stats.avgPrice) + ' â‚¬',
        'ðŸ“‰ Fourchette       : ' + fmtPrice(stats.minPrice) + ' â€“ ' + fmtPrice(stats.maxPrice) + ' â‚¬',
        'â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€',
        'ðŸ’¡ Prix conseillÃ©   : ' + (advisedSell != null ? fmtPrice(advisedSell) + ' â‚¬' : 'â€”'),
        'ðŸ’¸ Marge estimÃ©e    : ' + (margin != null ? (margin >= 0 ? '+' : '') + margin.toFixed(2) + ' â‚¬' + (roiPct ? ' (ROI ' + (roiPct > 0 ? '+' : '') + roiPct + '%)' : '') : 'â€”'),
        'â­ Score            : ' + scoreText,
        'â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€',
        'âš¡ AnalysÃ© avec AliEdge â€” ivanbara.com'
      ].join('\n');

      navigator.clipboard.writeText(summary).then(() => {
        shareBtn.innerHTML = 'âœ… RÃ©sumÃ© copiÃ© ! Colle-le oÃ¹ tu veux';
        shareBtn.style.background = 'rgba(76,175,125,0.12)';
        shareBtn.style.color = 'var(--green)';
        shareBtn.style.borderColor = 'rgba(76,175,125,0.3)';
        setTimeout(() => {
          shareBtn.innerHTML = 'ðŸ“¤ Partager le rÃ©sumÃ©';
          shareBtn.style.background = 'linear-gradient(135deg,rgba(139,92,246,0.07),rgba(139,92,246,0.03))';
          shareBtn.style.color = 'var(--gold)';
          shareBtn.style.borderColor = 'rgba(139,92,246,0.3)';
        }, 2800);
      }).catch(() => {
        shareBtn.innerHTML = 'âŒ Ã‰chec â€” autorise le presse-papier';
        setTimeout(() => { shareBtn.innerHTML = 'ðŸ“¤ Partager le rÃ©sumÃ©'; }, 2000);
      });
    } catch(e) {
      console.warn('[results] share error:', e);
    }
  };
  actionsDiv.appendChild(shareBtn);

  // Feature 6 : Bouton Watchlist
  const watchBtn = document.createElement('button');
  watchBtn.id = 'watchlist-add-btn';
  watchBtn.title = 'Surveiller ce produit â€” alerte si le marchÃ© Vinted Ã©volue';
  watchBtn.innerHTML = 'ðŸ”” Surveiller ce produit';
  Object.assign(watchBtn.style, {
    width: '100%', padding: '9px 12px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid rgba(76,175,125,0.25)',
    background: 'rgba(76,175,125,0.05)', color: '#4caf7d',
    fontFamily: 'var(--font-ui)', fontSize: '10px', cursor: 'pointer',
    transition: 'all 0.15s', letterSpacing: '0.5px',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
  });
  watchBtn.onmouseenter = () => { watchBtn.style.background = 'rgba(76,175,125,0.12)'; watchBtn.style.borderColor = 'rgba(76,175,125,0.4)'; };
  watchBtn.onmouseleave = () => { watchBtn.style.background = 'rgba(76,175,125,0.05)'; watchBtn.style.borderColor = 'rgba(76,175,125,0.25)'; };
  watchBtn.onclick = function() {
    try {
      chrome.runtime.sendMessage({
        type: 'ADD_TO_WATCHLIST',
        title: (currentData && currentData.aliTitle) ? currentData.aliTitle : 'Produit',
        aliPrice: parseFloat(buyInput.value || '0') || aliBuyPrice || 0,
        imageDataUrl: null,
        market: (data.market) ? data.market : 'fr',
        advisedSell: advisedSell
      }, function() {
        void chrome.runtime.lastError;
        watchBtn.innerHTML = 'âœ… AjoutÃ© Ã  la watchlist !';
        watchBtn.style.background = 'rgba(76,175,125,0.15)';
        setTimeout(() => {
          watchBtn.innerHTML = 'ðŸ”” Surveiller ce produit';
          watchBtn.style.background = 'rgba(76,175,125,0.05)';
        }, 2500);
      });
    } catch(e) {
      console.warn('[results] watchlist add error:', e);
    }
  };
  actionsDiv.appendChild(watchBtn);

  // Feature 10 (new) : Bouton Notion
  const notionBtn = document.createElement('button');
  notionBtn.id = 'notion-export-btn';
  notionBtn.title = 'Envoyer cette analyse Ã  Notion via webhook';
  notionBtn.innerHTML = 'ðŸ“ Notion';
  Object.assign(notionBtn.style, {
    width: '100%', padding: '9px 12px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid rgba(139,92,246,0.3)',
    background: 'rgba(139,92,246,0.06)', color: 'var(--gold)',
    fontFamily: 'var(--font-ui)', fontSize: '10px', cursor: 'pointer',
    transition: 'all 0.15s', letterSpacing: '0.5px',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
  });
  notionBtn.onmouseenter = () => { notionBtn.style.background = 'rgba(139,92,246,0.14)'; };
  notionBtn.onmouseleave = () => { notionBtn.style.background = 'rgba(139,92,246,0.06)'; };
  notionBtn.onclick = () => exportToNotion(data, aliBuyPrice || (buyInput ? parseFloat(buyInput.value || '0') : 0));
  actionsDiv.appendChild(notionBtn);

  right.appendChild(profitCard);

  // Scale card
  const scaleCard = document.createElement('div');
  scaleCard.className = 'card';
  scaleCard.innerHTML = `<div class="card-title">PROJECTION</div><div class="scale-grid" id="scale-grid"></div>`;
  right.appendChild(scaleCard);

  // Feature 8 (new) : save snapshot and render price history in left column
  const _aliTitleForHistory = (data.aliTitle) ? data.aliTitle : (currentData && currentData.aliTitle ? currentData.aliTitle : null);
  if (_aliTitleForHistory && stats.avgPrice) {
    savePriceSnapshot(data, _aliTitleForHistory);
  }
  // The price history card will be appended to the left column after a short delay (storage async)
  setTimeout(() => renderPriceHistory(_aliTitleForHistory || 'unknown', left), 300);

  // â”€â”€ COMPUTE
  function computeAndRender(aliPriceInput) {
    const ali = (aliPriceInput == null || aliPriceInput === '') ? null : Number(aliPriceInput);
    let margin = null, multiplier = null, profit10 = null, profit100 = null;
    if (advisedSell != null && ali != null && !Number.isNaN(ali)) {
      // Feature 1 (new): marge nette = prix vendu - frais envoi vendeur - prix achat
      margin = Number((advisedSell - vintedShipping - ali).toFixed(2));
      multiplier = ali > 0 ? Number((advisedSell / ali).toFixed(2)) : null;
      profit10  = Number((margin * 10).toFixed(2));
      profit100 = Number((margin * 100).toFixed(2));
    }

    const marginLine = document.getElementById('margin-line');
    const multLine   = document.getElementById('mult-line');
    const scaleGrid  = document.getElementById('scale-grid');
    const scoreValueEl = document.getElementById('score-value');
    const scoreBarFill = document.getElementById('score-bar-fill');

    // Feature N : update fee breakdown table
    const feeAliLabel = document.getElementById('fee-ali-label');
    const feeAliVal   = document.getElementById('fee-ali-val');
    if (feeAliLabel) feeAliLabel.textContent = 'CoÃ»t produit AliExpress';
    if (feeAliVal) {
      if (ali != null && !Number.isNaN(ali)) {
        feeAliVal.textContent = 'âˆ’ ' + fmtPrice(ali) + ' â‚¬';
        feeAliVal.style.color = 'var(--red)';
      } else {
        feeAliVal.textContent = 'â€” â‚¬';
      }
    }

    if (marginLine) {
      if (margin != null) {
        // Feature N : show marge as â‚¬ AND % AND Ã—
        const marginPct  = ali != null && ali > 0 ? ((margin / ali) * 100).toFixed(0) : null;
        const multTxt    = multiplier != null ? ` Â· Ã—${fmtMultiplier(multiplier)}` : '';
        const pctTxt     = marginPct != null ? ` Â· +${marginPct}%` : '';
        marginLine.innerHTML = `<b style="color:${margin > 0 ? 'var(--green)' : 'var(--red)'}">${fmtPrice(margin)} â‚¬</b><span style="font-size:9px;opacity:0.8;">${multTxt}${pctTxt}</span>`;
      } else {
        marginLine.textContent = ali == null ? 'Prix achat non spÃ©cifiÃ©' : 'â€”';
      }
    }

    if (multLine) {
      if (margin != null && ali != null) {
        multLine.textContent = `${fmtPrice(advisedSell)} âˆ’ ${vintedShipping.toFixed(2)} âˆ’ ${fmtPrice(ali)} = ${fmtPrice(margin)} â‚¬`;
      } else {
        multLine.textContent = '';
      }
    }

    if (scaleGrid) {
      scaleGrid.innerHTML = margin != null ? `
        <div class="scale-box">
          <div class="scale-val">${fmtPrice(profit10)} â‚¬</div>
          <div class="scale-lbl">Ã—10 ventes</div>
        </div>
        <div class="scale-box">
          <div class="scale-val">${fmtPrice(profit100)} â‚¬</div>
          <div class="scale-lbl">Ã—100 ventes</div>
        </div>` : `<div style="color:var(--text-dim);font-size:11px;padding:8px;">Entrez le prix d'achat pour calculer.</div>`;
    }

    // Feature 3 : score
    let score = 0;
    if (margin != null && ali != null) {
      score = computeScore(stats, margin, ali);
    }
    if (scoreValueEl) scoreValueEl.textContent = `â˜… ${score}/10`;
    if (scoreBarFill) scoreBarFill.style.width = (score * 10) + '%';

    if (margin != null) {
      if (margin > 0.5) {
        badgeEl.className = 'badge green';
        badgeEl.textContent = 'RENTABLE';
      } else if (margin > 0) {
        badgeEl.className = 'badge orange';
        badgeEl.textContent = 'FAIBLEMENT RENTABLE';
      } else {
        badgeEl.className = 'badge red';
        badgeEl.textContent = 'NON RENTABLE';
      }
    } else {
      badgeEl.className = 'badge red';
      badgeEl.textContent = 'INDÃ‰TERMINÃ‰';
    }
  }

  applyBtn.onclick = () => { _userBuyPrice = buyInput.value !== '' ? buyInput.value : null; computeAndRender(buyInput.value); };
  buyInput.addEventListener('keypress', e => { if (e.key === 'Enter') { e.preventDefault(); _userBuyPrice = buyInput.value !== '' ? buyInput.value : null; applyBtn.click(); } });
  computeAndRender(buyInput.value);
}

// Feature 7 : afficher l'analyse du marchÃ©
function renderMarketAnalysis(ma) {
  const card = document.getElementById('marketAnalysisCard');
  const grid = document.getElementById('marketStatsGrid');
  const badgeEl = document.getElementById('marketBadgeEl');
  if (!card || !grid || !badgeEl) return;

  grid.innerHTML = `
    <div class="stat-box">
      <div class="stat-val">${ma.avgViewsPerDay != null ? ma.avgViewsPerDay.toFixed(1) : 'â€”'}</div>
      <div class="stat-lbl">Vues/jour moy.</div>
    </div>
    <div class="stat-box">
      <div class="stat-val">${ma.avgFavs != null ? ma.avgFavs.toFixed(0) : 'â€”'}</div>
      <div class="stat-lbl">Favoris moy.</div>
    </div>
    <div class="stat-box">
      <div class="stat-val">${ma.avgAge != null ? ma.avgAge + 'j' : 'â€”'}</div>
      <div class="stat-lbl">AnciennetÃ© moy.</div>
    </div>`;

  const cls = ma.marketActive ? 'active' : 'slow';
  const label = ma.marketActive ? 'ðŸ“ˆ MARCHÃ‰ ACTIF' : 'ðŸ¢ MARCHÃ‰ LENT';
  badgeEl.innerHTML = `<span class="market-badge ${cls}">${label}</span>`;

  card.style.display = 'block';
}

function showSearchedImage(url) {
  if (!url) return;
  const existing = document.getElementById('searched-image-preview');
  if (existing) existing.remove();
  const wrap = document.createElement('div');
  wrap.id = 'searched-image-preview';
  Object.assign(wrap.style, {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '8px 12px', margin: '0 0 10px',
    background: 'rgba(139,92,246,0.08)', borderRadius: '8px',
    border: '1px solid rgba(139,92,246,0.3)', fontSize: '11px', color: '#aaa'
  });
  const img = document.createElement('img');
  img.src = url;
  Object.assign(img.style, { width: '48px', height: '48px', objectFit: 'cover', borderRadius: '6px', flexShrink: '0' });
  const lbl = document.createElement('span');
  lbl.textContent = 'Image recherchÃ©e sur Vinted';
  wrap.appendChild(img);
  wrap.appendChild(lbl);
  const container = document.getElementById('resultsContainer') || document.body;
  container.parentNode.insertBefore(wrap, container);
}

// â”€â”€ REFRESH BUTTON (Feature H) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
(function() {
  function initRefreshBtn() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (!refreshBtn) return;
    refreshBtn.addEventListener('click', function() {
      chrome.runtime.sendMessage({ type: 'GET_LAST_VINTED_RESULTS' }, function(resp) {
        void chrome.runtime.lastError;
        if (!resp) return;
        const market    = (resp.data && resp.data.market) || 'fr';
        const condition = (resp.data && resp.data.condition) || 'all';
        const aliPrice  = resp.aliBuyPrice || 0;
        refreshBtn.textContent = 'â³ Rechercheâ€¦';
        refreshBtn.disabled = true;
        chrome.runtime.sendMessage({
          type: 'SEARCH_VINTED_BY_IMAGE',
          aliPrice, aliTitle: (currentData && currentData.aliTitle) || '',
          market, condition, vintedShipping: 3
        }, function() { void chrome.runtime.lastError; });
        setTimeout(function() {
          refreshBtn.textContent = 'ðŸ”„ Relancer';
          refreshBtn.disabled = false;
        }, 20000);
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initRefreshBtn);
  else initRefreshBtn();
})();

// â”€â”€ CACHE AGE DISPLAY (Feature Q) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function updateCacheAgeDisplay(fetchTs) {
  const bar = document.getElementById('cache-age-bar');
  if (!bar || !fetchTs) return;
  const ageMs   = Date.now() - fetchTs;
  const ageMin  = Math.round(ageMs / 60000);
  const ageH    = (ageMs / 3600000).toFixed(1);
  const isStale = ageMs > 2 * 3600 * 1000; // >2h
  if (isStale) {
    bar.innerHTML = `<span class="cache-stale-badge" id="stale-badge" title="Cliquer pour relancer">âš ï¸ DonnÃ©es de ${ageH}h â€” Actualiser</span>`;
    bar.style.display = 'block';
    const badge = document.getElementById('stale-badge');
    if (badge) {
      badge.addEventListener('click', function() {
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn && !refreshBtn.disabled) refreshBtn.click();
      });
    }
  } else if (ageMin < 120) {
    bar.textContent = `DonnÃ©es du ${new Date(fetchTs).toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'})} â€” il y a ${ageMin < 1 ? '<1' : ageMin} min`;
    bar.style.display = 'block';
  } else {
    bar.style.display = 'none';
  }
}

// â”€â”€ VINTED SEARCH LINK BUILDER (Feature P) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function buildVintedSearchUrl(query, market) {
  const mkt = market || 'fr';
  const base = 'https://www.vinted.' + mkt + '/catalog?search_text=';
  try {
    return base + encodeURIComponent((query || '').slice(0, 80));
  } catch(e) { return '#'; }
}

// â”€â”€ AUTO-COPY (Feature G) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function autoCopySummary(data, aliBuyPrice, advisedSell, stats) {
  try {
    chrome.storage.local.get('ae_auto_copy', function(res) {
      void chrome.runtime.lastError;
      if (!res || !res.ae_auto_copy) return; // disabled by default
      const title = (currentData && currentData.aliTitle) ? currentData.aliTitle : 'Produit';
      const vintedShipping = (data.profitability && typeof data.profitability.vintedShipping === 'number') ? data.profitability.vintedShipping : 3;
      const margin = (advisedSell != null && aliBuyPrice) ? (advisedSell - vintedShipping - aliBuyPrice).toFixed(2) : 'â€”';
      const mult   = (advisedSell && aliBuyPrice && aliBuyPrice > 0) ? (advisedSell / aliBuyPrice).toFixed(2) : 'â€”';
      const summary = `ðŸ“¦ ${title.slice(0, 60)} | Ali: ${aliBuyPrice ? aliBuyPrice.toFixed(2) : '?'}â‚¬ | Vinted moy: ${fmtPrice(stats && stats.avgPrice)}â‚¬ | Marge: +${margin}â‚¬ (Ã—${mult})`;
      navigator.clipboard.writeText(summary).then(function() {
        setStatus('RÃ©sultats copiÃ©s âœ…', 'ok');
      }).catch(function() {});
    });
  } catch(e) {}
}

// 1) VÃ©rifier si URL partagÃ©e (Feature 11)
const sharedLoaded = loadFromShareUrl();

// 2) RÃ©cupÃ©rer les rÃ©sultats stockÃ©s au chargement
if (!sharedLoaded) {
  chrome.runtime.sendMessage({ type: "GET_LAST_VINTED_RESULTS" }, function(resp) {
    void chrome.runtime.lastError;
    if (resp && (resp.data || resp.aliBuyPrice != null)) {
      setStatus('RÃ©sultats reÃ§us (au chargement).', 'ok');
      showSearchedImage(resp.searchImageUrl);
      renderResults(resp.data || {}, resp.aliBuyPrice);
    } else {
      setStatus('En attente des rÃ©sultats...', '');
    }
    // Feature 12 : graphe historique
    setTimeout(renderHistoryGraph, 800);
  });
}

// 3) Ã‰couter les broadcasts runtime
if (chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener(function(msg) {
    if (msg && msg.type === "VINTED_IMAGE_RESULTS") {
      chrome.runtime.sendMessage({ type: "GET_LAST_VINTED_RESULTS" }, function(resp) {
        void chrome.runtime.lastError;
        const aliFromBg = resp && (resp.aliBuyPrice != null) ? resp.aliBuyPrice : null;
        showSearchedImage(resp && resp.searchImageUrl);
        renderResults(msg.data, aliFromBg);
        setTimeout(renderHistoryGraph, 1000);
      });
    }
  });
} else {
  console.warn('Runtime messaging not available');
}

// â”€â”€ FEATURE 4 : Recherche texte manuelle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
(function() {
  function initManualSearch() {
    var toggleBtn = document.getElementById('toggleManualSearch');
    var searchBar = document.getElementById('manualSearchBar');
    var searchInput = document.getElementById('manualSearchInput');
    var searchBtn = document.getElementById('manualSearchBtn');
    var statusEl = document.getElementById('manualSearchStatus');

    if (!toggleBtn || !searchBar || !searchInput || !searchBtn) return;

    toggleBtn.addEventListener('click', function() {
      if (searchBar.style.display === 'none') {
        searchBar.style.display = 'block';
        searchInput.focus();
        toggleBtn.style.color = 'var(--gold)';
        toggleBtn.style.borderColor = 'rgba(139,92,246,0.4)';
      } else {
        searchBar.style.display = 'none';
        toggleBtn.style.color = '';
        toggleBtn.style.borderColor = '';
      }
    });

    function doSearch() {
      var q = (searchInput.value || '').trim();
      if (!q || q.length < 2) return;
      if (statusEl) statusEl.textContent = 'Recherche en cours...';
      searchBtn.disabled = true;
      chrome.runtime.sendMessage({
        type: 'SEARCH_VINTED_TEXT_MANUAL',
        query: q,
        market: (currentData && currentData.market) || 'fr',
        aliPrice: _userBuyPrice || 0
      }, function() { void chrome.runtime.lastError; });
      setTimeout(function() {
        searchBtn.disabled = false;
        if (statusEl) statusEl.textContent = '';
      }, 25000);
    }

    searchBtn.addEventListener('click', doSearch);
    searchInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') doSearch();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initManualSearch);
  else initManualSearch();
})();

