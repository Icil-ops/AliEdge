// ===============================
// popup.js – AliExpress → Vinted v0.7
// Features: notifications, historique, score, frais Vinted réels, market selector, analyse approfondie
// ===============================

// ── PATCH GLOBAL : garantit que chrome.runtime.lastError est toujours lu ──
(function () {
  const _send = chrome.runtime.sendMessage.bind(chrome.runtime);
  chrome.runtime.sendMessage = function (msg, cb) {
    if (typeof cb === "function") {
      _send(msg, function () {
        void chrome.runtime.lastError;
        cb.apply(this, arguments);
      });
    } else {
      _send(msg, function () { void chrome.runtime.lastError; });
    }
  };

  const _get = chrome.storage.local.get.bind(chrome.storage.local);
  chrome.storage.local.get = function (keys, cb) {
    _get(keys, function () {
      void chrome.runtime.lastError;
      if (typeof cb === "function") cb.apply(this, arguments);
    });
  };
  const _set = chrome.storage.local.set.bind(chrome.storage.local);
  chrome.storage.local.set = function (items, cb) {
    _set(items, function () {
      void chrome.runtime.lastError;
      if (typeof cb === "function") cb.apply(this, arguments);
    });
  };
})();

console.log("[POPUP] AliEdge v2.0 — ADMIN BUILD");

// ----- GESTION LICENCE -----

var LICENSE_STORAGE_KEY = "ae_license_key";
var isLicensed = false;

var licenseInput = document.getElementById("licenseKeyInput");
var licenseStatusEl = document.getElementById("licenseStatus");
var activateLicenseBtn = document.getElementById("activateBtn");
var appSection = document.getElementById("mainApp");

// Clés admin — bypass de la vérification API distante (usage interne Ivan Bara)
var ADMIN_KEYS = [
  "AE-IVAN-BARA-2026",
  "AE-PRIV-ADMIN-KEY",
];

function validateLicenseFormat(key) {
  if (!key) return false;
  return /^AE-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(key.trim());
}

function isAdminKey(key) {
  if (!key) return false;
  var k = key.trim().toUpperCase();
  return ADMIN_KEYS.some(function(ak) { return ak.toUpperCase() === k; });
}

function setAppLocked(locked) {
  if (!appSection) return;
  if (locked) {
    appSection.classList.add("locked");
    appSection.style.display = "none";
  } else {
    appSection.classList.remove("locked");
    appSection.style.display = "";
  }
}

function updateLicenseUI_OK(key, data) {
  isLicensed = true;
  setAppLocked(false);
  if (licenseInput) licenseInput.value = key || "";
  if (licenseStatusEl) {
    if (data && data.status === "admin") {
      licenseStatusEl.textContent = "✅ Accès Admin actif";
    } else if (data && data.status === "trial" && data.daysLeft) {
      licenseStatusEl.textContent = `✅ Essai gratuit — ${data.daysLeft}j restants`;
    } else {
      licenseStatusEl.textContent = "✅ Accès Pro actif";
    }
    licenseStatusEl.className = "ok";
  }
  if (activateLicenseBtn) {
    activateLicenseBtn.textContent = "Clé enregistrée";
    activateLicenseBtn.disabled = true;
    activateLicenseBtn.style.opacity = 0.5;
  }
}

function updateLicenseUI_Locked(msg) {
  isLicensed = false;
  setAppLocked(true);
  if (licenseStatusEl) {
    licenseStatusEl.textContent =
      msg || "Entrez la clé reçue après ton achat pour débloquer l'extension.";
    licenseStatusEl.style.color = "#f97316";
  }
  if (activateLicenseBtn) {
    activateLicenseBtn.textContent = "Activer mon accès";
    activateLicenseBtn.disabled = false;
    activateLicenseBtn.style.opacity = 1;
  }
}

function loadLicenseFromStorage() {
  try {
    chrome.storage.local.get(
      ["ae_license_key", "ae_status", "ae_days_left"],
      function (res) {
        var key = res.ae_license_key;

        // Pas de clé → écran de lock
        if (!key || !validateLicenseFormat(key)) {
          updateLicenseUI_Locked();
          return;
        }

        // Clé admin → toujours valide, jamais d'API
        if (isAdminKey(key)) {
          updateLicenseUI_OK(key, { status: "admin" });
          return;
        }

        // Clé normale : on fait confiance au statut sauvegardé localement.
        // Le statut est mis en cache lors de l'activation (saveLicenseFromInput).
        // On NE rappelle JAMAIS l'API à l'ouverture du popup — trop fragile.
        var status = res.ae_status;
        if (status === "active" || status === "trial" || status === "pro") {
          updateLicenseUI_OK(key, { status: status, daysLeft: res.ae_days_left });
        } else {
          // Statut absent = clé jamais vérifiée correctement → on efface et on relance
          chrome.storage.local.remove(["ae_license_key", "ae_status", "ae_days_left"]);
          updateLicenseUI_Locked("Clé non vérifiée — entre-la à nouveau.");
        }
      }
    );
  } catch (e) {
    console.warn("[POPUP] loadLicenseFromStorage error", e);
    updateLicenseUI_Locked();
  }
}

function saveLicenseFromInput() {
  if (!licenseInput) return;
  var key = (licenseInput.value || "").trim();
  if (!validateLicenseFormat(key)) {
    updateLicenseUI_Locked("Format invalide. Exemple : AE-AB12-CD34-EF56");
    return;
  }
  // Clé admin → activation immédiate, pas d'appel API
  if (isAdminKey(key)) {
    chrome.storage.local.set({ [LICENSE_STORAGE_KEY]: key, ae_last_check: Date.now(), ae_status: "admin" }, function() {
      void chrome.runtime.lastError;
    });
    updateLicenseUI_OK(key, { status: "admin" });
    return;
  }
  // Clé normale → vérification API une seule fois à l'activation
  if (licenseStatusEl) {
    licenseStatusEl.textContent = "Vérification en cours...";
    licenseStatusEl.className = "loading";
  }
  if (activateLicenseBtn) { activateLicenseBtn.disabled = true; }

  fetch("https://aliedge-api.vercel.app/api/verify-license", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: key })
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (!data.valid) {
      if (activateLicenseBtn) { activateLicenseBtn.disabled = false; }
      var msg = data.reason === "trial_expired"
        ? "⏰ Essai expiré — abonne-toi sur ivanbara.com"
        : "❌ " + (data.message || "Clé invalide.");
      updateLicenseUI_Locked(msg);
      return;
    }
    // Valide → sauvegarder clé + statut (ne plus rappeler l'API)
    chrome.storage.local.set({
      ae_license_key: key,
      ae_status:      data.status || "active",
      ae_days_left:   data.daysLeft || null,
    }, function() { void chrome.runtime.lastError; });
    updateLicenseUI_OK(key, data);
  })
  .catch(function() {
    // API injoignable → activer quand même (safe fail)
    chrome.storage.local.set({
      ae_license_key: key,
      ae_status:      "active",
    }, function() { void chrome.runtime.lastError; });
    updateLicenseUI_OK(key, { status: "active" });
  });
}

// ----- MARKET SELECTOR (Feature 5) -----

var selectedMarket = "fr";
var isMultiMarket = false;

function initMarketSelector() {
  chrome.storage.local.get(["ae_market", "ae_multimarket"], function (res) {
    var saved = (res && res.ae_market) ? res.ae_market : "fr";
    isMultiMarket = !!(res && res.ae_multimarket);
    setMarket(saved, false);
    if (isMultiMarket) {
      var mmBtn = document.getElementById("multiMarketBtn");
      if (mmBtn) mmBtn.classList.add("active");
    }
  });

  var btns = document.querySelectorAll(".market-btn");
  btns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var mkt = btn.getAttribute("data-market");
      if (mkt === "multi") {
        // Toggle multi-marché
        isMultiMarket = !isMultiMarket;
        if (isMultiMarket) {
          btn.classList.add("active");
        } else {
          btn.classList.remove("active");
        }
        chrome.storage.local.set({ ae_multimarket: isMultiMarket }, function () { void chrome.runtime.lastError; });
        return;
      }
      setMarket(mkt, true);
    });
  });
}

function setMarket(market, save) {
  selectedMarket = market || "fr";
  var btns = document.querySelectorAll(".market-btn");
  btns.forEach(function (btn) {
    var mkt = btn.getAttribute("data-market");
    if (mkt === "multi") return; // multi-market toggle has its own state
    if (mkt === selectedMarket) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
  if (save) {
    chrome.storage.local.set({ ae_market: selectedMarket }, function () {
      void chrome.runtime.lastError;
    });
  }
}

// ----- CONDITION FILTER (Feature 8) -----

var selectedCondition = "all";

function initConditionFilter() {
  chrome.storage.local.get("ae_condition", function (res) {
    var saved = (res && res.ae_condition) ? res.ae_condition : "all";
    setCondition(saved, false);
  });

  var btns = document.querySelectorAll(".cond-btn");
  btns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      setCondition(btn.getAttribute("data-cond"), true);
    });
  });
}

function setCondition(cond, save) {
  selectedCondition = cond || "all";
  var btns = document.querySelectorAll(".cond-btn");
  btns.forEach(function (btn) {
    if (btn.getAttribute("data-cond") === selectedCondition) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
  if (save) {
    chrome.storage.local.set({ ae_condition: selectedCondition }, function () {
      void chrome.runtime.lastError;
    });
  }
}

// ----- MARGIN THRESHOLD (Feature 3) -----

var marginThreshold = 0.5;

function initMarginThreshold() {
  var inp = document.getElementById("marginThresholdInput");
  if (!inp) return;
  chrome.storage.local.get("ae_margin_threshold", function (res) {
    void chrome.runtime.lastError;
    if (res && res.ae_margin_threshold != null) {
      marginThreshold = parseFloat(res.ae_margin_threshold) || 0.5;
      inp.value = String(marginThreshold);
    }
  });
  inp.addEventListener("change", function () {
    marginThreshold = parseFloat(inp.value) || 0.5;
    chrome.storage.local.set({ ae_margin_threshold: marginThreshold }, function () { void chrome.runtime.lastError; });
  });
}

// ----- WATCHLIST (Feature 6) -----

function loadWatchlist() {
  chrome.runtime.sendMessage({ type: "GET_WATCHLIST" }, function (res) {
    void chrome.runtime.lastError;
    var list = (res && Array.isArray(res.watchlist)) ? res.watchlist : [];
    renderWatchlist(list);
  });
}

function renderWatchlist(list) {
  var section = document.getElementById("watchlistSection");
  var listEl = document.getElementById("watchlistList");
  if (!section || !listEl) return;

  if (!list || !list.length) {
    section.style.display = "none";
    return;
  }

  section.style.display = "block";
  listEl.innerHTML = "";

  list.slice(0, 8).forEach(function (item) {
    var div = document.createElement("div");
    div.className = "watchlist-item";

    var titleEl = document.createElement("div");
    titleEl.className = "watchlist-title";
    titleEl.textContent = (item.title || "Produit").slice(0, 28);
    titleEl.title = item.title || "";

    var priceEl = document.createElement("div");
    priceEl.className = "watchlist-price";
    priceEl.textContent = item.lastAdvisedSell ? item.lastAdvisedSell.toFixed(2) + "€" : "—";

    var delBtn = document.createElement("button");
    delBtn.className = "watchlist-del";
    delBtn.textContent = "✕";
    delBtn.title = "Retirer de la watchlist";
    delBtn.onclick = function () {
      chrome.runtime.sendMessage({ type: "REMOVE_FROM_WATCHLIST", id: item.id }, function () {
        void chrome.runtime.lastError;
        setTimeout(loadWatchlist, 200);
      });
    };

    div.appendChild(titleEl);
    div.appendChild(priceEl);
    div.appendChild(delBtn);
    listEl.appendChild(div);
  });
}

// ----- UI EXISTANTE -----

var titleInput = document.getElementById("title");
var priceInput = document.getElementById("buyPrice");
var shippingInput = document.getElementById("shipping");
var analyseBtn = document.getElementById("analyseBtn");
var statusEl = document.getElementById("status");
var resultsSection = document.getElementById("resultsSection");
var statCountEl = document.getElementById("stat-count");
var statAvgEl = document.getElementById("stat-avg");
var statRangeEl = document.getElementById("stat-range");
var marginLinesEl = document.getElementById("marginLines");
var verdictEl = document.getElementById("verdict");
var vintedInspiSection = document.getElementById("vintedInspiSection");
var inspiDivider = document.getElementById("inspiDivider");

var currentImageUrl = null;

function setText(el, txt) {
  if (el) el.textContent = txt;
}

// 1) AUTO-REMPLISSAGE
function autoFillFromAliExpress() {
  chrome.runtime.sendMessage({ type: "GET_ALI_INFO" }, function (res) {
    void chrome.runtime.lastError;
    if (res && res.ok) fillAliFields(res);
  });
}

function fillAliFields(res) {
  if (titleInput && res.title) titleInput.value = res.title;
  if (priceInput && typeof res.price === "number")
    priceInput.value = String(res.price).replace(",", ".");
  if (shippingInput) {
    // N'écraser la livraison que si elle n'a pas été modifiée manuellement
    var sh = typeof res.shipping === "number" ? res.shipping : 0;
    if (!shippingInput.dataset.userModified) {
      shippingInput.value = String(sh).replace(",", ".");
    }
  }
  currentImageUrl = res.image || null;

  var previewEl = document.getElementById("imagePreview");
  if (!previewEl) {
    previewEl = document.createElement("img");
    previewEl.id = "imagePreview";
    Object.assign(previewEl.style, {
      width: "60px", height: "60px", objectFit: "cover",
      borderRadius: "6px", border: "1px solid var(--gold,#C9A84C)",
      display: "block", margin: "6px auto 0"
    });
    if (statusEl && statusEl.parentNode) statusEl.parentNode.insertBefore(previewEl, statusEl.nextSibling);
  }
  if (currentImageUrl) {
    previewEl.src = currentImageUrl;
    previewEl.title = currentImageUrl;
    previewEl.style.display = "block";
  } else {
    previewEl.style.display = "none";
  }

  var srcLabel = (res.source === 'temu') ? 'Temu' : 'AliExpress';
  statusEl.textContent = "Produit " + srcLabel + " détecté ✅";
  statusEl.className = "ok";

  // Badge source
  var existingBadge = document.getElementById('ae-source-badge');
  if (!existingBadge) {
    existingBadge = document.createElement('div');
    existingBadge.id = 'ae-source-badge';
    Object.assign(existingBadge.style, {
      display: 'inline-block', padding: '2px 8px', borderRadius: '3px',
      fontSize: '9px', letterSpacing: '1.5px', textTransform: 'uppercase',
      fontFamily: 'var(--font-ui)', marginBottom: '4px',
    });
    if (titleInput && titleInput.parentNode) {
      titleInput.parentNode.insertBefore(existingBadge, titleInput);
    }
  }
  existingBadge.textContent = srcLabel;
  existingBadge.style.background = res.source === 'temu' ? 'rgba(76,175,125,0.15)' : 'rgba(139,92,246,0.15)';
  existingBadge.style.color      = res.source === 'temu' ? '#4caf7d' : '#8B5CF6';
  existingBadge.style.border     = res.source === 'temu' ? '1px solid rgba(76,175,125,0.3)' : '1px solid rgba(139,92,246,0.3)';
}

// 2) Conversion image en PNG Blob
function convertToPngBlob(imageUrl) {
  return new Promise(function (resolve, reject) {
    fetch(imageUrl)
      .then(function (response) {
        if (!response.ok) return reject(new Error("fetch failed " + response.status));
        return response.blob();
      })
      .then(function (blob) {
        if (typeof createImageBitmap === "function") {
          createImageBitmap(blob)
            .then(function (bitmap) {
              var canvas = document.createElement("canvas");
              canvas.width = bitmap.width;
              canvas.height = bitmap.height;
              var ctx = canvas.getContext("2d");
              ctx.drawImage(bitmap, 0, 0);
              canvas.toBlob(function (pngBlob) {
                if (pngBlob) resolve(pngBlob);
                else resolve(blob);
              }, "image/png");
            })
            .catch(function () { resolve(blob); });
        } else {
          var img = new Image();
          img.crossOrigin = "anonymous";
          img.src = URL.createObjectURL(blob);
          img.onload = function () {
            var canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            var ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);
            canvas.toBlob(function (pngBlob) {
              if (pngBlob) resolve(pngBlob);
              else resolve(blob);
            }, "image/png");
          };
          img.onerror = function () { resolve(blob); };
        }
      })
      .catch(function (e) { reject(e); });
  });
}

function blobToDataURL(blob) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function () { resolve(reader.result); };
    reader.onerror = function (e) { reject(e); };
    reader.readAsDataURL(blob);
  });
}

// 3) Feature 3 : Score de rentabilité
function computeScore(stats, margin, aliPrice) {
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

// 4) Feature 4 : Prix conseillé intelligent avec détection d'outliers
function computeRentability(minPrice, avgPrice, aliBuyPrice) {
  if (minPrice == null || !aliBuyPrice) {
    return { advisedSell: null, margin: null, emoji: "⚪", label: "Indéterminé" };
  }
  // Si le min est un outlier (< 50% de la moyenne) → pondérer vers la moyenne
  // pour éviter de sous-estimer la rentabilité sur des marchés à prix élevés
  var ref = minPrice;
  if (avgPrice && avgPrice > 0 && minPrice < avgPrice * 0.5) {
    ref = minPrice * 0.25 + avgPrice * 0.75;
  }
  var advisedSell = parseFloat((ref * 0.92).toFixed(2));
  var margin = advisedSell - aliBuyPrice;
  var emoji = "";
  var label = "";
  var thresh = (typeof marginThreshold === "number" && marginThreshold >= 0) ? marginThreshold : 0.5;
  if (margin > thresh) {
    emoji = "✅";
    label = "Rentable";
  } else if (margin > 0) {
    emoji = "🟡";
    label = "Rentabilité faible";
  } else {
    emoji = "❌";
    label = "Non rentable";
  }
  return { advisedSell: advisedSell, margin: margin, emoji: emoji, label: label };
}

// 5) Feature 7 : indicateur de vitesse de vente
function speedIndicator(viewsPerDay) {
  if (viewsPerDay == null) return "";
  var cls = viewsPerDay > 5 ? "spd-green" : viewsPerDay >= 2 ? "spd-orange" : "spd-red";
  return '<span class="' + cls + '">' + viewsPerDay.toFixed(1) + ' vues/j</span>';
}

function escHtml(str) {
  if (!str) return "";
  return String(str).replace(/[&<>"']/g, function(s) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[s];
  });
}

function safeImgSrc(u) {
  if (!u || typeof u !== "string") return "";
  try {
    var p = new URL(u);
    return (p.protocol === "https:" || p.protocol === "http:") ? u : "";
  } catch(e) { return ""; }
}

function renderInspirationCards(list) {
  if (!Array.isArray(list) || !list.length) return "";
  var top3 = list.slice(0, 3);
  var html = "";
  for (var i = 0; i < top3.length; i++) {
    var ins = top3[i];
    var img = safeImgSrc(ins.image);
    var titleText = escHtml((ins.title || "Annonce Vinted").slice(0, 38));
    var price = ins.price != null ? Number(ins.price).toFixed(2) + " €" : "";
    var url = ins.url || "#";

    var deepHtml = "";
    if (ins.deepData) {
      var d = ins.deepData;
      var spdHtml = speedIndicator(d.viewsPerDay);
      deepHtml = '<div class="inspi-deep">';
      deepHtml += '👁 ' + (d.viewCount || 0) + ' · ❤ ' + (d.favCount || 0) + ' · ';
      deepHtml += spdHtml;
      if (d.ageDays != null) deepHtml += ' · 📅 ' + d.ageDays + 'j';
      deepHtml += '</div>';
    }

    html += '<div class="inspi-card">';
    html += '<img src="' + img + '" alt="' + titleText + '" />';
    html += '<div class="inspi-info">';
    html += '<div class="inspi-rank">Annonce #' + (i + 1) + '</div>';
    html += '<div class="inspi-title">' + titleText + '</div>';
    html += '<div class="inspi-price">' + price + '</div>';
    html += deepHtml;
    html += '</div>';
    html += '<a href="' + url + '" target="_blank" rel="noopener noreferrer" class="inspi-link">Voir →</a>';
    html += '</div>';
  }
  return html;
}

function updatePanelWithResults(data) {
  var aliBuyPrice = parseFloat((priceInput.value || "0").replace(",", ".")) || 0;
  var statsV = data.stats || {};

  // Feature 4 : frais Vinted réels
  var minP = statsV.minPrice || 0;
  var rV = computeRentability(minP, statsV.avgPrice, aliBuyPrice);

  // Feature 3 : score
  var score = 0;
  if (data.profitability && typeof data.profitability.score === "number") {
    score = data.profitability.score;
  } else if (rV.margin != null) {
    score = computeScore(statsV, rV.margin, aliBuyPrice);
  }

  // Stat boxes
  if (statCountEl) setText(statCountEl, statsV.count || 0);
  if (statAvgEl) setText(statAvgEl, statsV.avgPrice ? statsV.avgPrice.toFixed(2) + "€" : "—");
  if (statRangeEl) {
    var minPStr = statsV.minPrice ? statsV.minPrice.toFixed(0) : "—";
    var maxPStr = statsV.maxPrice ? statsV.maxPrice.toFixed(0) : "—";
    setText(statRangeEl, minPStr + "–" + maxPStr + "€");
  }

  // Margin block
  var pvConseilleV = rV.advisedSell != null ? rV.advisedSell.toFixed(2) : "—";
  var shipping = parseFloat((shippingInput && shippingInput.value) ? shippingInput.value.replace(",", ".") : "0") || 0;
  var totalCost = aliBuyPrice + shipping;
  var roiPct = (rV.margin != null && totalCost > 0) ? ((rV.margin / totalCost) * 100) : null;
  if (marginLinesEl) {
    var margeStr = rV.margin != null
      ? pvConseilleV + " € – " + totalCost.toFixed(2) + " € = <b>" + rV.margin.toFixed(2) + " €</b>"
      : "—";
    var roiStr = roiPct != null
      ? ' <span style="color:' + (roiPct > 0 ? "var(--green)" : "var(--red)") + ';font-size:10px;">(ROI ' + (roiPct > 0 ? "+" : "") + roiPct.toFixed(0) + '%)</span>'
      : "";
    marginLinesEl.innerHTML =
      '<div style="font-size:10px;color:var(--text-dim);margin-bottom:4px;">Prix conseillé (min −5%)</div>' +
      '<div style="font-size:18px;font-weight:800;color:var(--text);margin-bottom:6px;">' + pvConseilleV + ' €</div>' +
      '<div style="font-size:10px;color:var(--text-sec);">Marge : ' + margeStr + roiStr + '</div>' +
      (shipping > 0 ? '<div style="font-size:9px;color:var(--text-dim);margin-top:3px;">Coût total : ' + aliBuyPrice.toFixed(2) + ' + ' + shipping.toFixed(2) + ' livraison = ' + totalCost.toFixed(2) + ' €</div>' : '');
  }

  // Verdict + score
  if (verdictEl) {
    var cls = rV.margin > 0.5 ? "green" : rV.margin > 0 ? "orange" : "red";
    verdictEl.innerHTML =
      '<div class="verdict-badge ' + cls + '">' +
        rV.emoji + ' ' + rV.label +
        '<span class="score-badge">★ ' + score + '/10</span>' +
      '</div>';
  }

  // Inspirations
  if (vintedInspiSection && data.inspirations && data.inspirations.length) {
    vintedInspiSection.innerHTML = renderInspirationCards(data.inspirations);
    if (inspiDivider) inspiDivider.style.display = "block";
  }

  if (resultsSection) resultsSection.style.display = "block";
  statusEl.textContent = "Analyse terminée ✅";
  statusEl.className = "ok";

  if (analyseBtn) {
    analyseBtn.disabled = false;
    analyseBtn.textContent = "ANALYSER SUR VINTED";
  }
}

// 6) Feature 2 : Historique
function loadHistory() {
  chrome.storage.local.get("ae_history", function (res) {
    var history = (res && Array.isArray(res.ae_history)) ? res.ae_history : [];
    renderHistory(history);
  });
}

function renderHistory(history) {
  var section = document.getElementById("historySection");
  var list = document.getElementById("historyList");
  if (!section || !list) return;

  if (!history || !history.length) {
    section.style.display = "none";
    return;
  }

  section.style.display = "block";
  list.innerHTML = "";

  var top5 = history.slice(0, 5);
  top5.forEach(function (item) {
    var div = document.createElement("div");
    div.className = "history-item";

    var titleEl = document.createElement("div");
    titleEl.className = "history-title";
    titleEl.textContent = (item.title || "Produit").slice(0, 30);

    var marginEl = document.createElement("div");
    marginEl.className = "history-margin";
    var m = typeof item.margin === "number" ? item.margin : null;
    if (m != null) {
      marginEl.textContent = (m >= 0 ? "+" : "") + m.toFixed(2) + "€";
      marginEl.classList.add(m > 0.5 ? "pos" : m > 0 ? "neu" : "neg");
    } else {
      marginEl.textContent = "—";
      marginEl.classList.add("neu");
    }

    var metaEl = document.createElement("div");
    metaEl.className = "history-meta";
    metaEl.textContent = (item.date || "") + (item.score != null ? "\n★" + item.score : "");
    metaEl.style.whiteSpace = "pre";

    div.appendChild(titleEl);
    div.appendChild(marginEl);
    div.appendChild(metaEl);

    div.addEventListener("click", function () {
      chrome.runtime.sendMessage({ type: "OPEN_RESULTS_PAGE" }, function () {
        void chrome.runtime.lastError;
      });
    });

    list.appendChild(div);
  });
}

// ── PROGRESS STEPS ────────────────────────────────────────────────────────────
var progressStepsEl = document.getElementById("progressSteps");
var retryBtn = document.getElementById("retryBtn");

function showProgress(activeStep) {
  if (!progressStepsEl) return;
  progressStepsEl.style.display = "flex";
  [1, 2, 3].forEach(function (n) {
    var el = document.getElementById("step" + n);
    if (!el) return;
    el.classList.remove("done", "active");
    if (n < activeStep) el.classList.add("done");
    else if (n === activeStep) el.classList.add("active");
  });
}

function hideProgress() {
  if (progressStepsEl) progressStepsEl.style.display = "none";
  [1, 2, 3].forEach(function (n) {
    var el = document.getElementById("step" + n);
    if (el) { el.classList.remove("done", "active"); }
  });
}

function completeProgress() {
  if (!progressStepsEl) return;
  [1, 2, 3].forEach(function (n) {
    var el = document.getElementById("step" + n);
    if (el) { el.classList.remove("active"); el.classList.add("done"); }
  });
  setTimeout(hideProgress, 1200);
}

function showRetryBtn(show) {
  if (retryBtn) retryBtn.style.display = show ? "block" : "none";
}

// 7) Écoute des résultats et statuts
chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg.type === "VINTED_IMAGE_RESULTS") {
    console.log("[POPUP] Résultats image reçus:", msg.data);
    clearAnalysisTimeout();
    completeProgress();
    showRetryBtn(false);
    // Feature R : cleanup progress bar
    if (typeof window._currentProgressBarCleanup === 'function') {
      window._currentProgressBarCleanup();
      window._currentProgressBarCleanup = null;
    }
    updatePanelWithResults(msg.data);
    setTimeout(loadHistory, 800);
    triggerCTAAfterAnalysis();
  }

  if (msg.type === "VINTED_STATUS") {
    if (msg.status === "error") { clearAnalysisTimeout(); }
    if (msg.status === "step") {
      var stepNum = msg.step || 1;
      statusEl.textContent = msg.message || "En cours...";
      statusEl.className = "loading";
      showProgress(stepNum);
      showRetryBtn(false);
      if (analyseBtn) analyseBtn.textContent = "ANALYSE EN COURS...";
    } else if (msg.status === "searching") {
      statusEl.textContent = "Recherche en cours...";
      statusEl.className = "loading";
      showProgress(2);
      if (analyseBtn) analyseBtn.textContent = "RECHERCHE...";
    } else if (msg.status === "fallback") {
      statusEl.textContent = msg.message || "Connexion Vinted en cours...";
      statusEl.className = "loading";
      showProgress(2);
      // Distinguer le fallback scripting (rapide, invisible) du fallback UI (onglet)
      var isUiTab = (msg.message || "").toLowerCase().includes("méthode ui") || (msg.message || "").toLowerCase().includes("arrière-plan");
      if (analyseBtn) analyseBtn.textContent = isUiTab ? "VINTED EN ARRIÈRE-PLAN..." : "RECONNEXION VINTED...";
    } else if (msg.status === "error") {
      statusEl.textContent = msg.message || "Erreur lors de la recherche.";
      statusEl.className = "error";
      hideProgress();
      showRetryBtn(true);
      if (analyseBtn) { analyseBtn.disabled = false; analyseBtn.textContent = "ANALYSER SUR VINTED"; }
    }
  }
});

// 8) ANALYSE PRINCIPALE
var _analysisTimeoutId = null;

// ─── CTA ESSAI GRATUIT ─────────────────────────────────────────────────────
var AE_SITE_URL       = "https://ivanbara.com";
var AE_TRIAL_LIMIT    = 5;   // analyses offertes avant CTA fort
var AE_TRIAL_STORAGE  = "ae_trial_count";

function incrementTrialCount(cb) {
  chrome.storage.local.get([LICENSE_STORAGE_KEY, AE_TRIAL_STORAGE], function(res) {
    void chrome.runtime.lastError;
    var key = (res && res[LICENSE_STORAGE_KEY]) ? String(res[LICENSE_STORAGE_KEY]).trim() : "";
    var licensed = /^AE-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(key);
    if (licensed) { if (cb) cb(0, true); return; } // Utilisateur payant → pas de CTA
    var count = (res && res[AE_TRIAL_STORAGE]) ? parseInt(res[AE_TRIAL_STORAGE], 10) : 0;
    count = isNaN(count) ? 0 : count;
    var newCount = count + 1;
    chrome.storage.local.set({ [AE_TRIAL_STORAGE]: newCount }, function() {
      void chrome.runtime.lastError;
      if (cb) cb(newCount, false);
    });
  });
}

function showCTABanner(trialCount) {
  var banner = document.getElementById("ae-cta-banner");
  var subtitle = document.getElementById("ae-cta-subtitle");
  var ctaBtn = document.getElementById("ae-cta-btn");
  var closeBtn = document.getElementById("ae-cta-close");
  if (!banner) return;

  if (trialCount >= AE_TRIAL_LIMIT) {
    // Essai épuisé → message urgent
    if (subtitle) subtitle.textContent = "Tu as utilisé tes " + AE_TRIAL_LIMIT + " analyses gratuites. Active ta clé pour continuer.";
    if (ctaBtn) ctaBtn.textContent = "OBTENIR MA CLÉ →";
    banner.style.borderColor = "rgba(139,92,246,0.7)";
  } else {
    // Encore des analyses dispo → message doux
    var remaining = AE_TRIAL_LIMIT - trialCount;
    if (subtitle) subtitle.textContent = "Plus que " + remaining + " analyse" + (remaining > 1 ? "s" : "") + " gratuite" + (remaining > 1 ? "s" : "") + ". Passe au niveau supérieur avec Ivan Bara.";
    if (ctaBtn) ctaBtn.textContent = "DÉCOUVRIR →";
  }

  if (ctaBtn) ctaBtn.href = AE_SITE_URL;
  banner.style.display = "block";

  if (closeBtn) {
    closeBtn.onclick = function() {
      banner.style.display = "none";
    };
  }
}

function triggerCTAAfterAnalysis() {
  incrementTrialCount(function(count, licensed) {
    if (licensed) return;
    // Afficher le CTA : dès la 2ème analyse, ou si essai épuisé
    if (count >= 2) {
      setTimeout(function() { showCTABanner(count); }, 1200);
    }
  });
}

function clearAnalysisTimeout() {
  if (_analysisTimeoutId) { clearTimeout(_analysisTimeoutId); _analysisTimeoutId = null; }
}

async function runAnalysis() {
  if (!isLicensed) {
    if (statusEl) {
      statusEl.textContent = "🔑 Active ta clé dans la section Accès ci-dessus";
      statusEl.className = "error";
    }
    // Scroll to license section
    var licSec = document.getElementById("licenseSection");
    if (licSec) licSec.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  var title = (titleInput && titleInput.value) ? titleInput.value.trim() : "";
  var price =
    parseFloat((priceInput && priceInput.value) ? priceInput.value.replace(",", ".") : "0") || 0;

  if (!title) {
    if (statusEl) { statusEl.textContent = "⚠️ Ouvre une fiche produit AliExpress ou Temu d'abord"; statusEl.className = "error"; }
    return;
  }
  if (!price) {
    if (statusEl) { statusEl.textContent = "⚠️ Prix d'achat manquant — entre-le manuellement"; statusEl.className = "error"; }
    if (priceInput) priceInput.focus();
    return;
  }
  if (!currentImageUrl) {
    if (statusEl) { statusEl.textContent = "⚠️ Image non détectée — attends le chargement de la page"; statusEl.className = "error"; }
    return;
  }

  analyseBtn.disabled = true;
  analyseBtn.textContent = "PRÉPARATION IMAGE...";
  statusEl.textContent = "Préparation image...";
  statusEl.className = "loading";
  showProgress(1);
  showRetryBtn(false);
  clearAnalysisTimeout();

  // Feature R : progress bar animation + alerte timeout après 45s
  var _cleanupProgressBar = null;
  if (typeof window._showTimeoutProgress === 'function') {
    _cleanupProgressBar = window._showTimeoutProgress();
  }
  _analysisTimeoutId = setTimeout(function () {
    if (analyseBtn.disabled) {
      statusEl.textContent = "Toujours en cours... Vinted répond lentement.";
      statusEl.className = "loading";
    }
  }, 45000);
  // Store cleanup ref globally for later cleanup
  window._currentProgressBarCleanup = _cleanupProgressBar;

  if (resultsSection) resultsSection.style.display = "none";

  try {
    var pngBlob = await convertToPngBlob(currentImageUrl);
    var dataUrl = await blobToDataURL(pngBlob);

    chrome.runtime.sendMessage(
      { type: "UPLOAD_IMAGE_FOR_VINTED", dataUrl: dataUrl, imageUrl: currentImageUrl },
      function (resp) {
        if (chrome.runtime.lastError) {
          console.warn("[POPUP] UPLOAD_IMAGE_FOR_VINTED failed:", chrome.runtime.lastError);
        } else {
          console.log("[POPUP] UPLOAD_IMAGE_FOR_VINTED response:", resp);
        }
      }
    );

    analyseBtn.textContent = "CONNEXION VINTED...";
    statusEl.textContent = "Analyse directe en cours...";
    statusEl.className = "loading";

    // Feature 5 : passer le market + condition + multi-marché + vintedShipping (Feature 1 new)
    chrome.runtime.sendMessage(
      {
        type: "SEARCH_VINTED_BY_IMAGE",
        aliPrice: price,
        aliTitle: title,
        market: selectedMarket,
        condition: selectedCondition,
        multiMarket: isMultiMarket,
        vintedShipping: vintedShippingFee
      },
      function () { void chrome.runtime.lastError; }
    );
  } catch (err) {
    console.error("[POPUP] Erreur:", err);
    statusEl.textContent = "Erreur préparation image : " + (err.message || err);
    statusEl.className = "error";
    analyseBtn.disabled = false;
    analyseBtn.textContent = "ANALYSER SUR VINTED";
    hideProgress();
    showRetryBtn(true);
  }
}

// 9) Vérifier s'il y a des résultats stockés au chargement
function checkForStoredResults() {
  chrome.runtime.sendMessage({ type: "GET_LAST_VINTED_RESULTS" }, function (response) {
    if (chrome.runtime.lastError) {
      console.log("[POPUP] Erreur récupération résultats:", chrome.runtime.lastError);
      return;
    }
    if (response && response.data && response.data.stats && response.data.stats.count > 0) {
      console.log("[POPUP] Résultats stockés trouvés:", response.data);
      updatePanelWithResults(response.data);
    }
  });
}

// Feature 1 (new) : Frais Vinted (envoi vendeur)
var vintedShippingFee = 3;

function initVintedShippingSetting() {
  chrome.storage.local.get('ae_vinted_shipping', function(res) {
    void chrome.runtime.lastError;
    if (res && res.ae_vinted_shipping != null) {
      vintedShippingFee = parseFloat(res.ae_vinted_shipping) || 3;
    }
    var inp = document.getElementById('vintedShippingInput');
    if (inp) inp.value = String(vintedShippingFee);
  });
  var inp = document.getElementById('vintedShippingInput');
  if (inp) {
    inp.addEventListener('change', function() {
      vintedShippingFee = parseFloat(inp.value) || 3;
      chrome.storage.local.set({ ae_vinted_shipping: vintedShippingFee }, function() { void chrome.runtime.lastError; });
    });
  }
}

// Feature 9 (new) : Mode comparaison multi-produits
var _compareQueue = [];

function addToCompareQueue() {
  var title = (titleInput && titleInput.value) ? titleInput.value.trim() : '';
  var price = parseFloat((priceInput && priceInput.value) ? priceInput.value.replace(',', '.') : '0') || 0;
  if (!title || !price) {
    if (statusEl) { statusEl.textContent = "⚠️ Remplis d'abord le titre et le prix du produit"; statusEl.className = "error"; }
    return;
  }
  // Deduplicate by title
  _compareQueue = _compareQueue.filter(function(it) { return it.title !== title; });
  _compareQueue.push({
    title: title,
    aliPrice: price,
    imageUrl: currentImageUrl || null,
    market: selectedMarket,
    ts: Date.now()
  });
  if (_compareQueue.length > 3) _compareQueue = _compareQueue.slice(_compareQueue.length - 3);

  chrome.storage.local.set({ ae_compare_queue: _compareQueue }, function() { void chrome.runtime.lastError; });

  var btn = document.getElementById('compareBtn');
  if (btn) {
    btn.textContent = '✅ ' + _compareQueue.length + '/3 en file';
    setTimeout(function() {
      btn.textContent = _compareQueue.length >= 2 ? '⊕ Voir comparaison' : '⊕ Comparer';
    }, 1500);
  }

  if (_compareQueue.length >= 2) {
    chrome.tabs.create({ url: chrome.runtime.getURL('compare.html') });
  }
}

// 10) INIT GLOBAL
document.addEventListener("DOMContentLoaded", function () {
  if (activateLicenseBtn) {
    activateLicenseBtn.addEventListener("click", saveLicenseFromInput);
  }
  if (licenseInput) {
    licenseInput.addEventListener("keypress", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        saveLicenseFromInput();
      }
    });
  }

  loadLicenseFromStorage();
  initMarketSelector();
  initConditionFilter();
  initMarginThreshold();
  autoFillFromAliExpress();

  // Marquer le champ livraison si l'utilisateur le modifie manuellement
  if (shippingInput) {
    // Restaurer la dernière valeur sauvegardée
    chrome.storage.local.get("ae_shipping", function (res) {
      void chrome.runtime.lastError;
      if (res && res.ae_shipping != null && shippingInput && !shippingInput.dataset.userModified) {
        shippingInput.value = String(res.ae_shipping);
        if (parseFloat(res.ae_shipping) > 0) shippingInput.dataset.userModified = "1";
      }
    });
    shippingInput.addEventListener("input", function () {
      shippingInput.dataset.userModified = "1";
      chrome.storage.local.set({ ae_shipping: shippingInput.value }, function () { void chrome.runtime.lastError; });
    });
  }

  if (analyseBtn) analyseBtn.addEventListener("click", runAnalysis);
  if (retryBtn) retryBtn.addEventListener("click", function() { showRetryBtn(false); runAnalysis(); });

  // Feature 2 : bouton "VOIR TOUT"
  var historyViewAllBtn = document.getElementById("historyViewAllBtn");
  if (historyViewAllBtn) {
    historyViewAllBtn.addEventListener("click", function () {
      chrome.runtime.sendMessage({ type: "OPEN_RESULTS_PAGE" }, function () {
        void chrome.runtime.lastError;
      });
    });
  }

  // Bouton "VIDER" historique
  var historyClearBtn = document.getElementById("historyClearBtn");
  if (historyClearBtn) {
    historyClearBtn.addEventListener("click", function () {
      if (!confirm("Vider tout l'historique ?")) return;
      chrome.storage.local.remove("ae_history", function () {
        void chrome.runtime.lastError;
        renderHistory([]);
      });
    });
  }

  // Watchlist check button
  var watchlistCheckBtn = document.getElementById("watchlistCheckBtn");
  if (watchlistCheckBtn) {
    watchlistCheckBtn.addEventListener("click", function () {
      watchlistCheckBtn.textContent = "↻ EN COURS...";
      watchlistCheckBtn.disabled = true;
      chrome.runtime.sendMessage({ type: "CHECK_WATCHLIST_NOW" }, function () {
        void chrome.runtime.lastError;
        watchlistCheckBtn.textContent = "↻ VÉRIFIER";
        watchlistCheckBtn.disabled = false;
        setTimeout(loadWatchlist, 500);
      });
    });
  }

  // Bouton "📋 Logs" — copie les logs debug dans le presse-papier
  var copyLogsBtn = document.getElementById("copyLogsBtn");
  if (copyLogsBtn) {
    copyLogsBtn.addEventListener("click", function () {
      chrome.runtime.sendMessage({ type: "GET_DEBUG_LOGS" }, function (response) {
        void chrome.runtime.lastError;
        var logs = (response && response.logs) ? response.logs : [];
        if (!logs.length) {
          copyLogsBtn.textContent = "📋 Vide";
          setTimeout(function() { copyLogsBtn.textContent = "📋 Logs"; }, 2000);
          return;
        }
        var text = "=== ALIEDGE DEBUG LOGS (" + new Date().toISOString() + ") ===\n\n" +
          logs.map(function(e) {
            return "[" + e.ts.slice(11, 23) + "] [" + (e.level || "info").toUpperCase() + "] " + e.msg;
          }).join("\n");
        navigator.clipboard.writeText(text).then(function() {
          copyLogsBtn.textContent = "✅ Copié!";
          setTimeout(function() { copyLogsBtn.textContent = "📋 Logs"; }, 2500);
        }).catch(function() {
          // Fallback : ouvrir dans un nouvel onglet
          var blob = new Blob([text], { type: "text/plain" });
          var url = URL.createObjectURL(blob);
          chrome.tabs.create({ url: url });
          copyLogsBtn.textContent = "📋 Logs";
        });
      });
    });
  }

  // Feature 1 (new) : Vinted shipping fee setting
  initVintedShippingSetting();

  // Feature 2 (new) : Dashboard button
  var dashboardBtn = document.getElementById('dashboardBtn');
  if (dashboardBtn) {
    dashboardBtn.addEventListener('click', function() {
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
    });
  }

  // Feature 9 (new) : Compare button
  var compareBtn = document.getElementById('compareBtn');
  if (compareBtn) {
    compareBtn.addEventListener('click', function() {
      addToCompareQueue();
    });
  }

  setTimeout(checkForStoredResults, 500);
  setTimeout(loadHistory, 600);
  setTimeout(loadWatchlist, 700);

  // ── CHECK FOR UPDATE ──────────────────────────────────────────────────────
  // Stratégie :
  //   1. chrome.runtime.requestUpdateCheck() → demande à Chrome de vérifier (Chrome Store)
  //   2. Fetch du endpoint /api/version (Vercel) → pour afficher les notes de version
  //   3. Compare la version manifest avec la version distante
  //   4. Si update dispo → affiche la bannière avec bouton "Mettre à jour"

  var CURRENT_VERSION = chrome.runtime.getManifest().version; // "2.0"
  // Sources de version — priorité : GitHub Raw (toujours à jour) → Netlify (backup)
  var VERSION_URLS    = [
    "https://raw.githubusercontent.com/Ivanbaraofm/Extension-google/main/version.json",
    "https://ivanbara.com/api/aliedge-version",
  ];
  var STORE_URL       = "https://chrome.google.com/webstore/detail/" + chrome.runtime.id;
  var UPDATE_CHECK_KEY = "ae_last_update_check";
  var UPDATE_CHECK_TTL = 6 * 60 * 60 * 1000; // re-checker toutes les 6h max

  // Afficher la version dans le footer
  var versionTag = document.getElementById('ae-version-tag');
  if (versionTag) versionTag.textContent = 'v' + CURRENT_VERSION;

  function compareVersions(a, b) {
    // Retourne 1 si a > b, -1 si a < b, 0 si égal
    var pa = String(a).split('.').map(Number);
    var pb = String(b).split('.').map(Number);
    var len = Math.max(pa.length, pb.length);
    for (var i = 0; i < len; i++) {
      var na = pa[i] || 0, nb = pb[i] || 0;
      if (na > nb) return 1;
      if (na < nb) return -1;
    }
    return 0;
  }

  function showUpdateBanner(latestVersion, notes, storeUrl) {
    var banner   = document.getElementById('ae-update-banner');
    var textEl   = document.getElementById('ae-update-text');
    var updateBtn = document.getElementById('ae-update-btn');
    if (!banner) return;

    if (textEl) {
      textEl.innerHTML =
        'v' + CURRENT_VERSION + ' → <strong style="color:var(--gold)">v' + latestVersion + '</strong>' +
        (notes ? '<br>' + notes.slice(0, 80) : '');
    }

    if (updateBtn) {
      updateBtn.onclick = function () {
        // 1. Demander à Chrome de vérifier + appliquer la mise à jour
        try {
          chrome.runtime.requestUpdateCheck(function (status) {
            void chrome.runtime.lastError;
            if (status === 'update_available') {
              // Recharger l'extension après que la mise à jour soit téléchargée
              chrome.runtime.reload();
            } else {
              // Chrome Store pas encore prêt → ouvrir la page store
              chrome.tabs.create({ url: storeUrl || STORE_URL });
            }
          });
        } catch (e) {
          // Fallback → ouvrir le store
          chrome.tabs.create({ url: storeUrl || STORE_URL });
        }
      };
    }

    banner.style.display = 'block';

    // Badger le bouton de check
    var checkBtn = document.getElementById('checkUpdateBtn');
    if (checkBtn) {
      checkBtn.textContent = '🔴';
      checkBtn.title = 'Mise à jour disponible — v' + latestVersion;
    }
  }

  function hideUpdateBanner(upToDate) {
    var checkBtn = document.getElementById('checkUpdateBtn');
    if (checkBtn) {
      if (upToDate) {
        checkBtn.textContent = '✅';
        checkBtn.title = 'Extension à jour (v' + CURRENT_VERSION + ')';
        setTimeout(function() {
          checkBtn.textContent = '🔄';
          checkBtn.title = 'Vérifier les mises à jour';
        }, 3000);
      } else {
        checkBtn.textContent = '🔄';
        checkBtn.title = 'Vérifier les mises à jour';
      }
    }
  }

  async function checkForUpdate(manual) {
    var checkBtn = document.getElementById('checkUpdateBtn');
    if (checkBtn) {
      checkBtn.textContent = '⏳';
      checkBtn.disabled = true;
    }

    try {
      // 1. Vérifier le throttle (sauf si manuel)
      if (!manual) {
        var stored = await new Promise(function(resolve) {
          chrome.storage.local.get(UPDATE_CHECK_KEY, function(res) {
            void chrome.runtime.lastError;
            resolve(res);
          });
        });
        var lastCheck = (stored && stored[UPDATE_CHECK_KEY]) ? stored[UPDATE_CHECK_KEY] : 0;
        if ((Date.now() - lastCheck) < UPDATE_CHECK_TTL) {
          if (checkBtn) { checkBtn.textContent = '🔄'; checkBtn.disabled = false; }
          return; // pas besoin de revérifier
        }
      }

      // 2. Sauvegarder le timestamp du check
      chrome.storage.local.set({ [UPDATE_CHECK_KEY]: Date.now() }, function() { void chrome.runtime.lastError; });

      // 3. Vérifier via Chrome runtime (Chrome Store)
      var chromeUpdateStatus = await new Promise(function(resolve) {
        try {
          chrome.runtime.requestUpdateCheck(function(status, details) {
            void chrome.runtime.lastError;
            resolve({ status: status, details: details });
          });
        } catch (e) {
          resolve({ status: 'no_update', details: null });
        }
      });

      if (chromeUpdateStatus.status === 'update_available') {
        var newVer = chromeUpdateStatus.details && chromeUpdateStatus.details.version
          ? chromeUpdateStatus.details.version
          : '?';
        showUpdateBanner(newVer, 'Nouvelle version disponible sur le Chrome Web Store.', STORE_URL);
        if (checkBtn) { checkBtn.disabled = false; }
        return;
      }

      // 4. Vérifier via GitHub Raw + Netlify (notes de version + version distante)
      var fetchedData = null;
      for (var vi = 0; vi < VERSION_URLS.length; vi++) {
        try {
          var ctrl = new AbortController();
          var timer = setTimeout(function() { ctrl.abort(); }, 5000);
          var resp = await fetch(VERSION_URLS[vi], { signal: ctrl.signal });
          clearTimeout(timer);
          if (resp.ok) {
            fetchedData = await resp.json();
            break; // succès → on arrête de chercher
          }
        } catch (e) {
          clearTimeout(timer);
          // Source indisponible → essayer la suivante
        }
      }
      if (fetchedData) {
        var latest   = fetchedData.version || fetchedData.latest || null;
        var notes    = fetchedData.notes || (Array.isArray(fetchedData.changelog) ? fetchedData.changelog[0] : null) || null;
        var storeUrl = fetchedData.storeUrl || STORE_URL;
        if (latest && compareVersions(latest, CURRENT_VERSION) > 0) {
          showUpdateBanner(latest, notes, storeUrl);
          if (checkBtn) { checkBtn.disabled = false; }
          return;
        }
      }

      // 5. À jour
      hideUpdateBanner(true);
    } catch (e) {
      console.warn('[POPUP] checkForUpdate error:', e);
    }

    if (checkBtn) { checkBtn.disabled = false; }
  }

  // Bouton check update
  var checkUpdateBtn = document.getElementById('checkUpdateBtn');
  if (checkUpdateBtn) {
    checkUpdateBtn.addEventListener('click', function () {
      checkForUpdate(true); // manuel → ignore throttle
    });
  }

  // Vérification automatique au démarrage (throttlée à 6h)
  setTimeout(function() { checkForUpdate(false); }, 2000);

  // Feature J : Keyboard shortcuts
  document.addEventListener('keydown', function(e) {
    // Enter → trigger analysis (if app visible and no modal active)
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      var active = document.activeElement;
      // Only trigger if not inside a text/number field (let normal Enter work there)
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
      if (isLicensed && analyseBtn && !analyseBtn.disabled) {
        e.preventDefault();
        runAnalysis();
      }
    }
    // Escape → clear fields
    if (e.key === 'Escape') {
      if (titleInput) titleInput.value = '';
      if (priceInput) priceInput.value = '';
      currentImageUrl = null;
      var previewEl = document.getElementById('imagePreview');
      if (previewEl) previewEl.style.display = 'none';
      if (statusEl) { statusEl.textContent = ''; statusEl.className = ''; }
      if (resultsSection) resultsSection.style.display = 'none';
    }
  });

  // Feature D : Stats strip — load and show mini stats at top of popup
  (function renderStatsStrip() {
    chrome.storage.local.get('ae_history', function(res) {
      void chrome.runtime.lastError;
      var history = Array.isArray(res && res.ae_history) ? res.ae_history : [];
      var strip = document.getElementById('ae-stats-strip');
      if (!strip || !history.length) return;

      var now = Date.now();
      var sevenDays = 7 * 24 * 3600 * 1000;
      var recentItems = history.filter(function(it) { return it.ts && (now - it.ts) < sevenDays && typeof it.margin === 'number'; });
      var weekAvg = recentItems.length ? (recentItems.reduce(function(s, it) { return s + it.margin; }, 0) / recentItems.length) : null;

      // Best product today
      var todayItems = history.filter(function(it) {
        return it.ts && (now - it.ts) < 86400000 && typeof it.margin === 'number';
      });
      var bestToday = todayItems.length ? todayItems.reduce(function(best, it) { return it.margin > best.margin ? it : best; }, todayItems[0]) : null;

      var html = '<b style="color:var(--gold);">' + history.length + '</b> analysés';
      if (weekAvg != null) {
        html += ' · Sem: <b style="color:' + (weekAvg > 0 ? 'var(--green)' : 'var(--red)') + ';">' + (weekAvg >= 0 ? '+' : '') + weekAvg.toFixed(2) + '€</b>';
      }
      if (bestToday) {
        html += ' · Auj: <b style="color:var(--gold);" title="' + (bestToday.title || '').replace(/"/g, '') + '">' + (bestToday.title ? bestToday.title.slice(0, 18) : '?') + ' +' + bestToday.margin.toFixed(2) + '€</b>';
      }
      strip.innerHTML = html;
      strip.style.display = 'flex';
    });
  })();

  // Feature O : Recently viewed chips
  (function renderRecentChips() {
    chrome.storage.local.get('ae_history', function(res) {
      void chrome.runtime.lastError;
      var history = Array.isArray(res && res.ae_history) ? res.ae_history : [];
      var recentContainer = document.getElementById('ae-recent-chips');
      if (!recentContainer || !history.length) return;

      var top3 = history.slice(0, 3);
      recentContainer.innerHTML = '';

      top3.forEach(function(item) {
        var chip = document.createElement('button');
        chip.className = 'recent-chip';
        chip.title = item.title || 'Produit';
        chip.textContent = (item.title || 'Produit').slice(0, 18) + (item.aliPrice != null ? ' · ' + item.aliPrice.toFixed(2) + '€' : '');
        chip.addEventListener('click', function() {
          if (titleInput) titleInput.value = item.title || '';
          if (priceInput) priceInput.value = item.aliPrice != null ? item.aliPrice.toFixed(2) : '';
          currentImageUrl = item.imageUrl || null;
          // Show image preview if available
          var previewEl = document.getElementById('imagePreview');
          if (currentImageUrl) {
            if (!previewEl) {
              previewEl = document.createElement('img');
              previewEl.id = 'imagePreview';
              Object.assign(previewEl.style, {
                width: '60px', height: '60px', objectFit: 'cover',
                borderRadius: '6px', border: '1px solid var(--gold,#8B5CF6)',
                display: 'block', margin: '6px auto 0'
              });
              if (statusEl && statusEl.parentNode) statusEl.parentNode.insertBefore(previewEl, statusEl.nextSibling);
            }
            previewEl.src = currentImageUrl;
            previewEl.style.display = 'block';
          }
          if (statusEl) { statusEl.textContent = 'Produit rechargé ↩'; statusEl.className = 'ok'; }
        });
        recentContainer.appendChild(chip);
      });

      if (top3.length) {
        var label = document.createElement('span');
        label.style.cssText = 'font-size:9px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.8px;display:block;margin-bottom:4px;';
        label.textContent = 'Récents';
        recentContainer.insertBefore(label, recentContainer.firstChild);
        recentContainer.style.display = 'block';
      }
    });
  })();

  // Feature R : Progress bar animation on timeout warning
  (function setupTimeoutProgressBar() {
    var _progressBarEl = null;
    var _progressTimerId = null;

    function showTimeoutProgress() {
      var existing = document.getElementById('ae-timeout-progress');
      if (existing) existing.remove();

      var wrapper = document.createElement('div');
      wrapper.id = 'ae-timeout-progress';
      wrapper.style.cssText = 'margin-top:6px;';

      var bar = document.createElement('div');
      bar.style.cssText = 'height:3px;background:var(--border2);border-radius:2px;overflow:hidden;';
      var fill = document.createElement('div');
      fill.style.cssText = 'height:100%;width:0%;background:linear-gradient(90deg,var(--gold),var(--gold-lt));border-radius:2px;transition:width 0.5s linear;';
      bar.appendChild(fill);
      wrapper.appendChild(bar);

      if (statusEl && statusEl.parentNode) statusEl.parentNode.insertBefore(wrapper, statusEl.nextSibling);
      _progressBarEl = fill;

      // Animate from 0 to 100% over 45s
      var startTs = Date.now();
      var TOTAL = 45000;
      function tick() {
        var elapsed = Date.now() - startTs;
        var pct = Math.min(100, (elapsed / TOTAL) * 100);
        if (_progressBarEl) _progressBarEl.style.width = pct + '%';
        if (pct < 100) {
          _progressTimerId = setTimeout(tick, 400);
        } else {
          if (_progressBarEl) {
            _progressBarEl.style.background = 'var(--orange)';
          }
        }
      }
      tick();

      return function() {
        clearTimeout(_progressTimerId);
        if (wrapper.parentNode) wrapper.remove();
        _progressBarEl = null;
      };
    }

    // Wrap runAnalysis to hook the progress bar
    var _originalRunAnalysis = window.runAnalysis;
    if (typeof _originalRunAnalysis === 'function') {
      // Attach cleanup to VINTED_IMAGE_RESULTS listener and hook via timeout display
      // The actual integration happens in the listener in popup.js
    }

    // Expose cleanup so the message listener can call it
    window._showTimeoutProgress = showTimeoutProgress;
  })();
});
