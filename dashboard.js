// dashboard.js — AliEdge Dashboard v1.2
// Améliorations : tri, recherche/filtre, suppression par carte, export JSON/CSV,
// stats bar améliorée, marge semaine, image thumbnails, animations

function dbg(level, msg) {
  if (level === 'error' || level === 'warn') console.warn('[Dashboard]', msg);
  else console.log('[Dashboard]', msg);
}

function fmtP(p) {
  return (p == null || isNaN(Number(p))) ? '—' : Number(p).toFixed(2);
}

function escH(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, function(c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
  });
}

function sanitizeImgSrc(u) {
  if (!u || typeof u !== 'string') return '';
  try {
    var p = new URL(u);
    return (p.protocol === 'https:' || p.protocol === 'http:') ? u : '';
  } catch(e) { return ''; }
}

// ── STATS BAR ───────────────────────────────────────────────────────────────
function renderKPIs(history, watchlist) {
  var totalEl       = document.getElementById('kpi-total');
  var bestMarginEl  = document.getElementById('kpi-best-margin');
  var avgScoreEl    = document.getElementById('kpi-avg-score');
  var weekMarginEl  = document.getElementById('kpi-week-margin');

  if (totalEl) totalEl.textContent = history.length || '0';

  if (bestMarginEl) {
    var margins = history.filter(function(it) { return typeof it.margin === 'number'; });
    if (margins.length > 0) {
      var best = margins.reduce(function(max, it) { return it.margin > max.margin ? it : max; }, margins[0]);
      bestMarginEl.textContent = (best.margin >= 0 ? '+' : '') + fmtP(best.margin) + ' €';
      bestMarginEl.style.color = best.margin > 0 ? 'var(--green)' : 'var(--red)';
    } else {
      bestMarginEl.textContent = '—';
    }
  }

  if (avgScoreEl) {
    var withScore = history.filter(function(it) { return typeof it.score === 'number'; });
    if (withScore.length > 0) {
      var avg = withScore.reduce(function(s, it) { return s + it.score; }, 0) / withScore.length;
      avgScoreEl.textContent = '★ ' + avg.toFixed(1) + '/10';
    } else {
      avgScoreEl.textContent = '—';
    }
  }

  // Marge moyenne de la semaine (7 derniers jours)
  if (weekMarginEl) {
    var now = Date.now();
    var sevenDays = 7 * 24 * 3600 * 1000;
    var recentItems = history.filter(function(it) {
      return typeof it.margin === 'number' && it.ts && (now - it.ts) < sevenDays;
    });
    if (recentItems.length > 0) {
      var weekAvg = recentItems.reduce(function(s, it) { return s + it.margin; }, 0) / recentItems.length;
      weekMarginEl.textContent = (weekAvg >= 0 ? '+' : '') + fmtP(weekAvg) + ' € /sem.';
      weekMarginEl.style.color = weekAvg > 0 ? 'var(--green)' : 'var(--red)';
    } else {
      weekMarginEl.textContent = '—';
    }
  }
}

// ── STATS BAR TEXTE ─────────────────────────────────────────────────────────
function renderStatsBar(history) {
  var bar = document.getElementById('statsBar');
  if (!bar) return;

  if (!history.length) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';

  var margins = history.filter(function(it) { return typeof it.margin === 'number'; });
  var bestMargin = margins.length ? margins.reduce(function(m, it) { return it.margin > m ? it.margin : m; }, -Infinity) : null;
  var withScore = history.filter(function(it) { return typeof it.score === 'number'; });
  var avgScore = withScore.length ? (withScore.reduce(function(s, it) { return s + it.score; }, 0) / withScore.length) : null;

  bar.innerHTML =
    '<span><b style="color:var(--gold);">' + history.length + '</b> produits analysés</span>' +
    (bestMargin != null ? '  ·  Meilleure marge: <b style="color:var(--green);">+' + fmtP(bestMargin) + ' €</b>' : '') +
    (avgScore != null ? '  ·  Score moyen: <b style="color:var(--gold);">★ ' + avgScore.toFixed(1) + '/10</b>' : '');
}

// ── RENDER CARDS ─────────────────────────────────────────────────────────────
var _currentHistory = [];
var _currentSort    = 'date';
var _currentFilter  = '';

function renderHistoryCards(history, sortKey, filter) {
  _currentHistory = Array.isArray(history) ? history : [];
  _currentSort    = sortKey  || _currentSort;
  _currentFilter  = filter  != null ? filter : _currentFilter;

  var grid = document.getElementById('historyGrid');
  if (!grid) return;

  var items = _currentHistory.slice();

  // Filtre par texte
  var q = _currentFilter.trim().toLowerCase();
  if (q) {
    items = items.filter(function(it) {
      return (it.title || '').toLowerCase().includes(q);
    });
  }

  // Tri
  if (_currentSort === 'margin') {
    items.sort(function(a, b) { return ((b.margin || 0) - (a.margin || 0)); });
  } else if (_currentSort === 'score') {
    items.sort(function(a, b) { return ((b.score || 0) - (a.score || 0)); });
  } else {
    // Date décroissante (newest first)
    items.sort(function(a, b) { return ((b.ts || 0) - (a.ts || 0)); });
  }

  if (!items.length) {
    grid.innerHTML = '<div class="empty-state">Aucune analyse' + (q ? ' pour "' + escH(q) + '"' : '') + '.<br>Lance une analyse depuis AliExpress.</div>';
    return;
  }

  // Trouver le produit avec la meilleure marge
  var bestIdx = -1, bestMargin = -Infinity;
  items.forEach(function(it, i) {
    if (typeof it.margin === 'number' && it.margin > bestMargin) {
      bestMargin = it.margin;
      bestIdx = i;
    }
  });

  grid.innerHTML = '';

  items.slice(0, 50).forEach(function(item, i) {
    var card = document.createElement('div');
    card.className = 'history-card';
    card.style.animationDelay = (i * 40) + 'ms';
    card.classList.add('card-fadein');

    var isBest  = (i === bestIdx && bestMargin > 0);
    var margin  = typeof item.margin === 'number' ? item.margin : null;
    var marginCls = margin == null ? 'margin-neu' : (margin > 0.5 ? 'margin-pos' : (margin > 0 ? 'margin-neu' : 'margin-neg'));
    var marginTxt = margin != null ? ((margin >= 0 ? '+' : '') + fmtP(margin) + ' €') : '—';

    // Marge en pourcentage
    var marginPctStr = '';
    if (margin != null && item.aliPrice && item.aliPrice > 0) {
      var pct = ((margin / item.aliPrice) * 100).toFixed(0);
      marginPctStr = ' <span style="font-size:10px;color:var(--text-dim);font-family:var(--font-ui);">(' + (pct > 0 ? '+' : '') + pct + '%)</span>';
    }

    var imgSrc = sanitizeImgSrc(item.imageUrl || '');
    var imageHtml = imgSrc
      ? '<img src="' + escH(imgSrc) + '" alt="" loading="lazy" />'
      : '<div class="card-img-placeholder">🛒</div>';

    // Vinted avg
    var vintedAvgStr = (item.vintedAvg != null) ? fmtP(item.vintedAvg) + ' €' : (item.advisedSell != null ? '~' + fmtP(item.advisedSell) + ' €' : '—');

    // Date lisible
    var dateStr = '';
    if (item.ts) {
      var d = new Date(item.ts);
      dateStr = d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } else if (item.date) {
      dateStr = item.date;
    }

    card.innerHTML =
      (isBest ? '<div class="best-badge">MEILLEURE MARGE</div>' : '') +
      imageHtml +
      '<div class="history-card-title" title="' + escH(item.title || '') + '">' + escH((item.title || 'Produit').slice(0, 55)) + '</div>' +
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:4px;">' +
        '<span class="history-card-price">' + (item.aliPrice != null ? fmtP(item.aliPrice) + ' €' : '—') + '</span>' +
        '<span style="font-size:9px;color:var(--text-dim);font-family:var(--font-ui);">Ali</span>' +
        '<span style="font-size:10px;color:var(--text-dim);">→</span>' +
        '<span style="font-family:var(--font-head);font-size:14px;color:var(--text);">' + vintedAvgStr + '</span>' +
        '<span style="font-size:9px;color:var(--text-dim);font-family:var(--font-ui);">Vinted moy.</span>' +
      '</div>' +
      '<div class="history-card-margin ' + marginCls + '">' + marginTxt + marginPctStr + '</div>' +
      '<div class="history-card-meta">' +
        '<span style="color:var(--text-dim);font-size:9px;">' + escH(dateStr) + '</span>' +
        (item.score != null ? '<span class="score-pill">★ ' + item.score + '/10</span>' : '') +
      '</div>' +
      '<button class="del-btn" data-idx="' + item._idx + '" title="Supprimer cette analyse">🗑 Supprimer</button>';

    grid.appendChild(card);
  });

  // Boutons suppression
  grid.querySelectorAll('.del-btn').forEach(function(delBtn) {
    delBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var idx = parseInt(delBtn.getAttribute('data-idx'), 10);
      deleteHistoryItem(idx);
    });
  });
}

function deleteHistoryItem(originalIdx) {
  chrome.storage.local.get('ae_history', function(res) {
    void chrome.runtime.lastError;
    var history = Array.isArray(res.ae_history) ? res.ae_history : [];
    history = history.filter(function(it) { return it._idx !== originalIdx; });
    chrome.storage.local.set({ ae_history: history }, function() {
      void chrome.runtime.lastError;
      dbg('info', 'Item supprimé, idx=' + originalIdx);
      loadAndRender();
    });
  });
}

// ── EXPORT JSON ──────────────────────────────────────────────────────────────
function exportJSON(history) {
  try {
    var json = JSON.stringify(history, null, 2);
    var blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href     = url;
    a.download = 'aliedge-history-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function() { URL.revokeObjectURL(url); a.remove(); }, 1000);
  } catch(e) { dbg('error', 'exportJSON: ' + e.message); }
}

// ── EXPORT CSV COMPLET ───────────────────────────────────────────────────────
function exportCSV(history) {
  try {
    var headers = ['Titre', 'Prix Ali (€)', 'Vinted Moy. (€)', 'Prix conseillé (€)', 'Marge (€)', 'Marge (%)', 'Score', 'Marché', 'Date'];
    var rows = [headers.join(';')];
    history.forEach(function(it) {
      var marginPct = (it.margin != null && it.aliPrice) ? ((it.margin / it.aliPrice) * 100).toFixed(1) : '';
      rows.push([
        '"' + (it.title || '').replace(/"/g, '""') + '"',
        fmtP(it.aliPrice),
        fmtP(it.vintedAvg),
        fmtP(it.advisedSell),
        fmtP(it.margin),
        marginPct,
        it.score != null ? it.score : '',
        it.market || 'fr',
        it.date || ''
      ].join(';'));
    });
    var csv  = '\uFEFF' + rows.join('\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href     = url;
    a.download = 'aliedge-history-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(function() { URL.revokeObjectURL(url); a.remove(); }, 1000);
  } catch(e) { dbg('error', 'exportCSV: ' + e.message); }
}

// ── WATCHLIST ─────────────────────────────────────────────────────────────────
function renderWatchlist(watchlist) {
  var container = document.getElementById('watchlistContainer');
  if (!container) return;

  if (!watchlist || !watchlist.length) {
    container.innerHTML = '<div class="empty-state">Aucun produit en watchlist.<br><span style="font-size:11px;">Ajoute un produit depuis les résultats d\'analyse.</span></div>';
    return;
  }

  var table = document.createElement('table');
  table.className = 'watchlist-table';
  table.innerHTML = '<thead><tr><th>Produit</th><th>Marché</th><th>Prix conseillé</th><th>Ajouté le</th><th>Vérifié le</th></tr></thead>';
  var tbody = document.createElement('tbody');

  watchlist.forEach(function(item) {
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + escH((item.title || 'Produit').slice(0, 50)) + '</td>' +
      '<td style="color:var(--gold);font-family:var(--font-head);">' + escH((item.market || 'fr').toUpperCase()) + '</td>' +
      '<td style="font-family:var(--font-head);color:var(--green);">' + (item.lastAdvisedSell != null ? fmtP(item.lastAdvisedSell) + ' €' : '—') + '</td>' +
      '<td style="color:var(--text-dim);">' + (item.addedDate || '') + '</td>' +
      '<td style="color:var(--text-dim);">' + (item.lastChecked ? new Date(item.lastChecked).toLocaleDateString('fr-FR') : '—') + '</td>';
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  container.innerHTML = '';
  container.appendChild(table);
}

// ── LOAD & RENDER ─────────────────────────────────────────────────────────────
function loadAndRender() {
  chrome.storage.local.get(['ae_history', 'ae_watchlist'], function(res) {
    void chrome.runtime.lastError;
    var history   = Array.isArray(res.ae_history)   ? res.ae_history   : [];
    var watchlist = Array.isArray(res.ae_watchlist) ? res.ae_watchlist : [];

    // Ajouter un index immuable à chaque item pour la suppression
    history.forEach(function(it, i) {
      if (it._idx == null) it._idx = i;
    });

    renderKPIs(history, watchlist);
    renderStatsBar(history);
    renderHistoryCards(history, _currentSort, _currentFilter);
    renderWatchlist(watchlist);
  });
}

// ── INIT ───────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  dbg('info', 'Dashboard init');

  var openPopupBtn = document.getElementById('openPopupBtn');
  if (openPopupBtn) {
    openPopupBtn.addEventListener('click', function() {
      if (chrome.action && chrome.action.openPopup) {
        chrome.action.openPopup().catch(function() {});
      } else {
        window.close();
      }
    });
  }

  // Tri
  var sortBtns = document.querySelectorAll('.sort-btn');
  sortBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      sortBtns.forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      renderHistoryCards(_currentHistory, btn.getAttribute('data-sort'), _currentFilter);
    });
  });

  // Recherche / filtre
  var searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      renderHistoryCards(_currentHistory, _currentSort, searchInput.value);
    });
  }

  // Export JSON
  var exportJsonBtn = document.getElementById('exportJsonBtn');
  if (exportJsonBtn) {
    exportJsonBtn.addEventListener('click', function() {
      exportJSON(_currentHistory);
    });
  }

  // Export CSV
  var exportCsvBtn = document.getElementById('exportCsvBtn');
  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', function() {
      exportCSV(_currentHistory);
    });
  }

  // Vider historique
  var clearHistoryBtn = document.getElementById('clearHistoryBtn');
  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', function() {
      if (!confirm('Vider tout l\'historique ?')) return;
      chrome.storage.local.remove('ae_history', function() {
        void chrome.runtime.lastError;
        loadAndRender();
      });
    });
  }

  loadAndRender();
});
