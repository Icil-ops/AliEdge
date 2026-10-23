// compare.js â€” AliEdge Mode Comparaison v1.2
// Features: side-by-side cards, best highlighted, Recommandation section, Effacer btn

function dbg(level, msg) {
  if (level === 'error' || level === 'warn') console.warn('[Compare]', msg);
  else console.log('[Compare]', msg);
}

function fmtP(p) {
  return (p == null || isNaN(Number(p))) ? 'â€”' : Number(p).toFixed(2);
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

function computeScore(stats, margin, aliPrice) {
  if (!stats || margin == null || !aliPrice) return 0;
  var score = 0;
  var marginPct = aliPrice > 0 ? (margin / aliPrice) * 100 : 0;
  if (marginPct > 200) score += 4;
  else if (marginPct > 100) score += 3;
  else if (marginPct > 30) score += 2;
  else if (marginPct > 0) score += 1;
  var count = stats.count || 0;
  if (count > 30) score += 3;
  else if (count > 15) score += 2;
  else if (count > 5) score += 1;
  if (stats.avgPrice > 0) {
    var spread = (stats.maxPrice - stats.minPrice) / stats.avgPrice;
    if (spread < 0.3) score += 3;
    else if (spread < 0.6) score += 2;
    else if (spread < 1.0) score += 1;
  }
  return Math.min(10, score);
}

// â”€â”€ RENDER RECOMMENDATION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function renderRecommendation(enriched, bestIdx) {
  var existing = document.getElementById('recommendationSection');
  if (existing) existing.remove();

  if (!enriched || enriched.length === 0 || bestIdx < 0) return;

  var best = enriched[bestIdx];
  if (!best) return;

  var aliPrice    = typeof best.aliPrice    === 'number' ? best.aliPrice    : 0;
  var margin      = typeof best.margin      === 'number' ? best.margin      : null;
  var advisedSell = typeof best.advisedSell === 'number' ? best.advisedSell : null;
  var score       = typeof best.score       === 'number' ? best.score       : 0;

  var marginPctStr = '';
  if (margin != null && aliPrice > 0) {
    var pct = ((margin / aliPrice) * 100).toFixed(0);
    marginPctStr = ' (+' + pct + '%)';
  }

  // Raisons
  var reasons = [];
  if (margin != null && margin > 0) reasons.push('marge positive de +' + fmtP(margin) + ' â‚¬' + marginPctStr);
  if (score >= 7) reasons.push('score Ã©levÃ© de ' + score + '/10');
  else if (score >= 4) reasons.push('score correct de ' + score + '/10');
  if (best.stats && best.stats.count > 10) reasons.push(best.stats.count + ' annonces similaires sur Vinted');
  if (advisedSell != null) reasons.push('prix conseillÃ© de ' + fmtP(advisedSell) + ' â‚¬');

  var reasonsHtml = reasons.length
    ? reasons.map(function(r) { return '<li>' + escH(r) + '</li>'; }).join('')
    : '<li>Meilleure marge parmi les produits comparÃ©s.</li>';

  var section = document.createElement('div');
  section.id = 'recommendationSection';
  section.style.cssText = 'margin-top:24px;padding:20px;background:rgba(139,92,246,0.06);border:1px solid rgba(139,92,246,0.3);border-radius:8px;';
  section.innerHTML =
    '<div style="font-family:var(--font-head);font-size:17px;letter-spacing:2px;color:var(--gold);margin-bottom:12px;">RECOMMANDATION</div>' +
    '<div style="display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap;">' +
      '<div style="font-size:36px;line-height:1;">ðŸ†</div>' +
      '<div style="flex:1;min-width:180px;">' +
        '<div style="font-family:var(--font-body);font-size:16px;color:var(--text);margin-bottom:6px;">' +
          '<b>Produit ' + (bestIdx + 1) + '</b> â€” ' + escH((best.title || 'Produit AliExpress').slice(0, 70)) +
        '</div>' +
        '<ul style="padding-left:16px;font-size:11px;color:var(--text-sec);line-height:1.8;">' + reasonsHtml + '</ul>' +
        (margin != null && margin <= 0
          ? '<div style="margin-top:8px;padding:6px 10px;background:var(--orange-dim);border:1px solid rgba(212,135,74,0.3);border-radius:4px;font-size:10px;color:var(--orange);">âš ï¸ Attention : aucun produit n\'est rentable dans cette comparaison.</div>'
          : '') +
      '</div>' +
    '</div>';

  var container = document.getElementById('compareContainer');
  if (container && container.parentNode) {
    container.parentNode.insertBefore(section, container.nextSibling);
  }
}

// â”€â”€ RENDER COMPARISON â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function renderComparison(queue) {
  var container = document.getElementById('compareContainer');
  if (!container) return;

  // Supprimer ancienne recommandation
  var existing = document.getElementById('recommendationSection');
  if (existing) existing.remove();

  if (!queue || !queue.length) {
    container.innerHTML =
      '<div class="empty-state">' +
        '<div class="empty-icon">âŠ•</div>' +
        '<div class="empty-text">Aucun produit Ã  comparer</div>' +
        '<div class="empty-sub">Clique sur "âŠ• Comparer" dans le popup sur une fiche produit AliExpress<br>pour ajouter des produits Ã  la file de comparaison (max 3).</div>' +
      '</div>';
    return;
  }

  // Charger l'historique pour enrichir les donnÃ©es
  chrome.storage.local.get('ae_history', function(res) {
    void chrome.runtime.lastError;
    var history = Array.isArray(res.ae_history) ? res.ae_history : [];

    // Enrichir chaque item de la queue avec les donnÃ©es de l'historique
    var enriched = queue.map(function(item) {
      var histMatch = history.find(function(h) {
        if (!h.title || !item.title) return false;
        return h.title.slice(0, 30) === item.title.slice(0, 30);
      });
      if (histMatch) {
        return Object.assign({}, item, {
          margin:      histMatch.margin,
          score:       histMatch.score,
          advisedSell: histMatch.advisedSell,
          vintedAvg:   histMatch.vintedAvg,
          stats:       histMatch.stats,
          imageUrl:    item.imageUrl || histMatch.imageUrl
        });
      }
      return item;
    });

    // Trouver la meilleure marge
    var bestIdx = -1, bestMargin = -Infinity;
    enriched.forEach(function(item, i) {
      var m = typeof item.margin === 'number' ? item.margin : -Infinity;
      if (m > bestMargin) { bestMargin = m; bestIdx = i; }
    });

    var grid = document.createElement('div');
    grid.className = 'compare-grid';

    enriched.forEach(function(item, i) {
      var isBest = (i === bestIdx && typeof item.margin === 'number');
      var card = document.createElement('div');
      card.className = 'compare-card' + (isBest ? ' best-card' : '');

      var margin      = typeof item.margin      === 'number' ? item.margin      : null;
      var aliPrice    = typeof item.aliPrice    === 'number' ? item.aliPrice    : 0;
      var advisedSell = typeof item.advisedSell === 'number' ? item.advisedSell : null;
      var vintedAvg   = typeof item.vintedAvg   === 'number' ? item.vintedAvg   : null;
      var score       = typeof item.score       === 'number' ? item.score
                      : (margin != null ? computeScore(item.stats || {}, margin, aliPrice) : 0);

      var marginColor = margin == null ? '' : (margin > 0.5 ? 'green' : (margin > 0 ? 'gold' : 'red'));
      var marginTxt   = margin != null ? ((margin >= 0 ? '+' : '') + fmtP(margin) + ' â‚¬') : 'â€”';

      // Marge en %
      var marginPctStr = '';
      if (margin != null && aliPrice > 0) {
        var pct = ((margin / aliPrice) * 100).toFixed(0);
        marginPctStr = ' (' + (pct > 0 ? '+' : '') + pct + '%)';
      }

      var imgSrc = sanitizeImgSrc(item.imageUrl || '');
      var imgHtml = imgSrc
        ? '<img class="prod-img" src="' + escH(imgSrc) + '" alt="" loading="lazy" />'
        : '<div class="img-placeholder">ðŸ›’</div>';

      var vintedAvgHtml = vintedAvg != null
        ? fmtP(vintedAvg) + ' â‚¬'
        : (advisedSell != null ? '~' + fmtP(advisedSell) + ' â‚¬' : 'â€”');

      card.innerHTML =
        (isBest ? '<div class="best-label">MEILLEURE MARGE</div>' : '') +
        '<div class="card-num">PRODUIT ' + (i + 1) + '</div>' +
        imgHtml +
        '<div class="prod-title">' + escH((item.title || 'Produit AliExpress').slice(0, 80)) + '</div>' +
        '<div class="data-row"><span class="data-lbl">Prix AliExpress</span><span class="data-val gold">' + fmtP(aliPrice) + ' â‚¬</span></div>' +
        '<div class="data-row"><span class="data-lbl">Vinted moyen</span><span class="data-val">' + vintedAvgHtml + '</span></div>' +
        '<div class="data-row"><span class="data-lbl">Prix conseillÃ©</span><span class="data-val">' + (advisedSell != null ? fmtP(advisedSell) + ' â‚¬' : 'â€”') + '</span></div>' +
        '<div class="data-row"><span class="data-lbl">Marge nette</span><span class="data-val ' + marginColor + '">' + marginTxt + '<span style="font-size:9px;opacity:0.75;">' + marginPctStr + '</span></span></div>' +
        '<div class="data-row"><span class="data-lbl">MarchÃ©</span><span class="data-val"><span class="market-badge">' + escH((item.market || 'fr').toUpperCase()) + '</span></span></div>' +
        '<div class="score-row"><div class="score-val">â˜… ' + score + '/10</div><div class="score-lbl">Score de rentabilitÃ©</div></div>';

      grid.appendChild(card);
    });

    container.innerHTML = '';
    container.appendChild(grid);

    // Afficher la recommandation
    renderRecommendation(enriched, bestIdx);
  });
}

document.addEventListener('DOMContentLoaded', function() {
  dbg('info', 'Compare init');

  var clearBtn = document.getElementById('clearBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      if (!confirm('Vider la file de comparaison ?')) return;
      chrome.storage.local.remove('ae_compare_queue', function() {
        void chrome.runtime.lastError;
        var rec = document.getElementById('recommendationSection');
        if (rec) rec.remove();
        renderComparison([]);
      });
    });
  }

  chrome.storage.local.get('ae_compare_queue', function(res) {
    void chrome.runtime.lastError;
    var queue = Array.isArray(res.ae_compare_queue) ? res.ae_compare_queue : [];
    dbg('info', 'Queue chargÃ©e: ' + queue.length + ' produits');
    renderComparison(queue);
  });
});

