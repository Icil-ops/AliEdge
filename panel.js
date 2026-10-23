// panel.js â€” AliEdge Side Panel v1.0
// Features: market selector, condition filter, license check, analysis trigger,
//           autofill, inline mini results, recent history, quick links

(function() {
  'use strict';

  // â”€â”€ PATCH chrome API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const _send = chrome.runtime.sendMessage.bind(chrome.runtime);
  chrome.runtime.sendMessage = function(msg, cb) {
    if (typeof cb === 'function') {
      _send(msg, function() { void chrome.runtime.lastError; cb.apply(this, arguments); });
    } else {
      _send(msg, function() { void chrome.runtime.lastError; });
    }
  };

  // â”€â”€ STATE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let selectedMarket = 'fr';
  let selectedCondition = 'all';
  let isLicensed = false;
  let currentImageUrl = null;

  // â”€â”€ DOM REFS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const titleInput    = document.getElementById('panelTitle');
  const priceInput    = document.getElementById('panelPrice');
  const shippingInput = document.getElementById('panelShipping');
  const analyseBtn    = document.getElementById('panelAnalyseBtn');
  const statusEl      = document.getElementById('panelStatus');
  const progressWrap  = document.getElementById('panelProgressWrap');
  const progressFill  = document.getElementById('panelProgressFill');
  const licenseEl     = document.getElementById('panelLicenseStatus');

  const miniResults   = document.getElementById('miniResults');
  const miniCount     = document.getElementById('miniCount');
  const miniAvg       = document.getElementById('miniAvg');
  const miniMargin    = document.getElementById('miniMargin');
  const miniScore     = document.getElementById('miniScore');
  const miniVerdict   = document.getElementById('miniVerdictWrap');
  const openFullBtn   = document.getElementById('panelOpenFullBtn');

  const historyCard   = document.getElementById('panelHistoryCard');
  const historyList   = document.getElementById('panelHistoryList');

  // â”€â”€ HELPERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function setStatus(txt, cls) {
    if (!statusEl) return;
    statusEl.textContent = txt;
    statusEl.className = cls || '';
  }

  function setProgress(pct) {
    if (!progressWrap || !progressFill) return;
    if (pct <= 0) {
      progressWrap.style.display = 'none';
      progressFill.style.width = '0%';
    } else {
      progressWrap.style.display = 'block';
      progressFill.style.width = Math.min(100, pct) + '%';
    }
  }

  function fmt(p) {
    return (p == null || isNaN(Number(p))) ? 'â€”' : Number(p).toFixed(2);
  }

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

  // â”€â”€ LICENSE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const gateEl       = document.getElementById('panelLicenseGate');
  const analyseCard  = document.getElementById('panelAnalyseCard');
  const keyInput     = document.getElementById('panelKeyInput');
  const activateBtn  = document.getElementById('panelActivateBtn');
  const gateError    = document.getElementById('panelGateError');

  function showLicenseGate(show) {
    if (gateEl)      gateEl.style.display      = show ? 'block' : 'none';
    if (analyseCard) analyseCard.style.display  = show ? 'none'  : 'block';
    if (analyseBtn)  analyseBtn.disabled        = show;
  }

  function checkLicense() {
    chrome.runtime.sendMessage({ type: 'CHECK_LICENSE_STATUS' }, function(res) {
      isLicensed = !!(res && res.ok);
      if (!isLicensed) {
        if (licenseEl) { licenseEl.textContent = 'ðŸ”’ Licence requise'; licenseEl.className = ''; }
        showLicenseGate(true);
        return;
      }
      // Lis le statut depuis le cache local pour afficher les jours d'essai
      chrome.storage.local.get(['ae_status', 'ae_days_left', 'ae_email'], function(stored) {
        void chrome.runtime.lastError;
        const status   = stored && stored.ae_status;
        const daysLeft = stored && stored.ae_days_left;
        if (licenseEl) {
          if (status === 'trial' && daysLeft) {
            licenseEl.textContent = `â³ Essai gratuit â€” ${daysLeft}j restants`;
          } else if (status === 'trial') {
            licenseEl.textContent = 'â³ Essai gratuit actif';
          } else {
            licenseEl.textContent = 'âœ… Pro actif';
          }
          licenseEl.className = 'ok';
        }
        // Bandeau trial sous le header si essai
        let trialBanner = document.getElementById('panelTrialBanner');
        if (status === 'trial') {
          if (!trialBanner) {
            trialBanner = document.createElement('div');
            trialBanner.id = 'panelTrialBanner';
            trialBanner.style.cssText = 'background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.25);border-radius:4px;padding:7px 10px;font-size:9px;color:#8B5CF6;text-align:center;letter-spacing:0.4px;line-height:1.5;';
            const mainEl = document.querySelector('.panel-main');
            if (mainEl && mainEl.firstChild) mainEl.insertBefore(trialBanner, mainEl.firstChild);
          }
          trialBanner.innerHTML = `ðŸŽ <strong>ESSAI GRATUIT ACTIF</strong> â€” ${daysLeft || '?'} jour${daysLeft > 1 ? 's' : ''} restant${daysLeft > 1 ? 's' : ''}<br><span style="color:#888;">Abonne-toi sur ivanbara.com pour continuer aprÃ¨s l'essai.</span>`;
        } else if (trialBanner) {
          trialBanner.remove();
        }
        showLicenseGate(false);
      });
    });
  }

  // Activation depuis le panel
  if (activateBtn) {
    activateBtn.addEventListener('click', async function() {
      const key = (keyInput ? keyInput.value.trim().toUpperCase() : '');
      if (!/^AE-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(key)) {
        if (gateError) { gateError.textContent = 'âŒ Format invalide. Exemple : AE-XXXX-XXXX-XXXX'; gateError.className = 'gate-error'; }
        return;
      }
      activateBtn.disabled = true;
      activateBtn.textContent = 'VÃ©rification...';
      if (gateError) gateError.textContent = '';
      try {
        const resp = await fetch('https://aliedge-api.vercel.app/api/verify-license', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key })
        });
        const data = await resp.json();
        if (!data.valid) {
          const msgs = { key_not_found: 'âŒ ClÃ© introuvable.', trial_expired: 'â° Essai expirÃ©.', expired: 'â° AccÃ¨s expirÃ©.', cancelled: 'ðŸš« Abonnement annulÃ©.' };
          if (gateError) { gateError.textContent = msgs[data.reason] || 'âŒ ClÃ© invalide.'; gateError.className = 'gate-error'; }
          activateBtn.disabled = false; activateBtn.textContent = 'ACTIVER MON ACCÃˆS';
          return;
        }
        chrome.storage.local.set({
          ae_license_key: key, ae_status: data.status,
          ae_days_left: data.daysLeft, ae_email: data.email, ae_last_check: Date.now()
        }, function() {
          void chrome.runtime.lastError;
          if (gateError) { gateError.textContent = 'âœ… AccÃ¨s activÃ© !'; gateError.className = 'gate-error ok'; }
          setTimeout(function() { isLicensed = true; checkLicense(); }, 800);
        });
      } catch (e) {
        if (gateError) { gateError.textContent = 'âš ï¸ Pas de connexion. RÃ©essaie.'; gateError.className = 'gate-error'; }
        activateBtn.disabled = false; activateBtn.textContent = 'ACTIVER MON ACCÃˆS';
      }
    });
    if (keyInput) {
      keyInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') activateBtn.click(); });
    }
  }

  // â”€â”€ MARKET SELECTOR â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function initMarketSelector() {
    chrome.storage.local.get(['ae_market', 'ae_condition'], function(res) {
      void chrome.runtime.lastError;
      if (res && res.ae_market) setMarket(res.ae_market, false);
      if (res && res.ae_condition) setCondition(res.ae_condition, false);
    });

    document.querySelectorAll('[data-market]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        setMarket(btn.getAttribute('data-market'), true);
      });
    });

    document.querySelectorAll('[data-cond]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        setCondition(btn.getAttribute('data-cond'), true);
      });
    });
  }

  function setMarket(mkt, save) {
    selectedMarket = mkt || 'fr';
    document.querySelectorAll('[data-market]').forEach(function(btn) {
      btn.classList.toggle('active', btn.getAttribute('data-market') === selectedMarket);
    });
    if (save) chrome.storage.local.set({ ae_market: selectedMarket }, function() { void chrome.runtime.lastError; });
  }

  function setCondition(cond, save) {
    selectedCondition = cond || 'all';
    document.querySelectorAll('[data-cond]').forEach(function(btn) {
      btn.classList.toggle('active', btn.getAttribute('data-cond') === selectedCondition);
    });
    if (save) chrome.storage.local.set({ ae_condition: selectedCondition }, function() { void chrome.runtime.lastError; });
  }

  // â”€â”€ AUTOFILL FROM ALIEXPRESS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function autoFill() {
    chrome.runtime.sendMessage({ type: 'GET_ALI_INFO' }, function(res) {
      if (res && res.ok) {
        if (titleInput && res.title) titleInput.value = res.title;
        if (priceInput && typeof res.price === 'number') priceInput.value = String(res.price);
        currentImageUrl = res.image || null;
        setStatus('Produit AliExpress dÃ©tectÃ© âœ…', 'ok');
      }
    });
  }

  // â”€â”€ ANALYSE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (analyseBtn) {
    analyseBtn.addEventListener('click', function() {
      if (!isLicensed) { setStatus('Licence requise', 'error'); return; }

      const aliPrice = parseFloat((priceInput && priceInput.value) || '0') || 0;
      const aliTitle = (titleInput && titleInput.value) ? titleInput.value.trim() : '';
      const shipping = parseFloat((shippingInput && shippingInput.value) || '3') || 3;

      setStatus('Recherche en cours...', 'loading');
      setProgress(20);
      analyseBtn.disabled = true;

      // Need image â€” fetch from background if we have currentImageUrl
      function doSearch(dataUrl, imgUrl) {
        if (dataUrl) {
          chrome.runtime.sendMessage({
            type: 'UPLOAD_IMAGE_FOR_VINTED',
            dataUrl: dataUrl,
            imageUrl: imgUrl || ''
          }, function() { void chrome.runtime.lastError; });
        }

        chrome.runtime.sendMessage({
          type: 'SEARCH_VINTED_BY_IMAGE',
          aliPrice: aliPrice,
          aliTitle: aliTitle,
          market: selectedMarket,
          condition: selectedCondition,
          vintedShipping: shipping
        }, function() { void chrome.runtime.lastError; });

        setProgress(40);

        // Also open full results tab
        chrome.runtime.sendMessage({ type: 'OPEN_RESULTS_PAGE' }, function() { void chrome.runtime.lastError; });

        setTimeout(function() {
          analyseBtn.disabled = !isLicensed;
          setStatus('RÃ©sultats en attente...', 'loading');
        }, 4000);
      }

      if (currentImageUrl) {
        chrome.runtime.sendMessage({ type: 'FETCH_IMAGE', url: currentImageUrl }, function(res) {
          void chrome.runtime.lastError;
          doSearch(res && res.dataUrl ? res.dataUrl : null, currentImageUrl);
        });
      } else {
        doSearch(null, null);
      }
    });
  }

  // â”€â”€ MINI RESULTS RENDERING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function renderMiniResults(data, aliBuyPrice) {
    if (!data || !data.stats) return;
    const stats = data.stats;
    const shipping = (data.profitability && typeof data.profitability.vintedShipping === 'number')
      ? data.profitability.vintedShipping : 3;

    // Compute advised sell
    let ref = stats.minPrice || 0;
    if (stats.avgPrice > 0 && ref < stats.avgPrice * 0.5) {
      ref = ref * 0.25 + stats.avgPrice * 0.75;
    }
    const advisedSell = ref > 0 ? parseFloat((ref * 0.92).toFixed(2)) : null;
    const margin = advisedSell != null && aliBuyPrice > 0
      ? parseFloat((advisedSell - shipping - aliBuyPrice).toFixed(2))
      : null;
    const score = margin != null && aliBuyPrice > 0
      ? computeScore(stats, margin, aliBuyPrice)
      : null;

    if (miniCount)  miniCount.textContent  = String(stats.count || 0);
    if (miniAvg)    miniAvg.textContent    = fmt(stats.avgPrice) + 'â‚¬';
    if (miniMargin) {
      miniMargin.textContent = margin != null ? (margin >= 0 ? '+' : '') + fmt(margin) + 'â‚¬' : 'â€”';
      miniMargin.style.color = margin == null ? '' : margin > 0.5 ? 'var(--green)' : margin > 0 ? 'var(--orange)' : 'var(--red)';
    }
    if (miniScore) {
      miniScore.textContent = score != null ? String(score) + '/10' : 'â€”';
      miniScore.style.color = score == null ? '' : score >= 7 ? 'var(--green)' : score >= 4 ? 'var(--gold)' : 'var(--red)';
    }

    if (miniVerdict) {
      const label = margin == null ? 'IndÃ©terminÃ©' : margin > 0.5 ? 'Rentable' : margin > 0 ? 'Faible marge' : 'Non rentable';
      const cls   = margin == null ? '' : margin > 0.5 ? 'green' : margin > 0 ? 'orange' : 'red';
      const emoji = margin == null ? 'âšª' : margin > 0.5 ? 'ðŸŸ¢' : margin > 0 ? 'ðŸŸ¡' : 'ðŸ”´';
      miniVerdict.innerHTML = `<span class="mini-verdict ${cls}">${emoji} ${label}</span>`;
    }

    if (miniResults) miniResults.style.display = 'block';
    setProgress(100);
    setTimeout(() => setProgress(0), 800);
    setStatus('Analyse terminÃ©e âœ…', 'ok');
  }

  // â”€â”€ HISTORY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function loadHistory() {
    chrome.storage.local.get('ae_history', function(res) {
      void chrome.runtime.lastError;
      const history = Array.isArray(res && res.ae_history) ? res.ae_history : [];
      if (!history.length) { if (historyCard) historyCard.style.display = 'none'; return; }
      if (historyCard) historyCard.style.display = 'block';
      if (!historyList) return;
      historyList.innerHTML = '';
      history.slice(0, 5).forEach(function(item) {
        const row = document.createElement('div');
        row.className = 'history-row';

        const name = document.createElement('div');
        name.className = 'history-name';
        name.textContent = (item.title || 'Produit').slice(0, 28);
        name.title = item.title || '';

        const marginEl = document.createElement('div');
        marginEl.className = 'history-margin';
        const m = typeof item.margin === 'number' ? item.margin : null;
        marginEl.textContent = m != null ? (m >= 0 ? '+' : '') + m.toFixed(2) + 'â‚¬' : 'â€”';
        marginEl.style.color = m == null ? '#777' : m > 0.5 ? 'var(--green)' : m > 0 ? 'var(--orange)' : 'var(--red)';

        const scoreEl = document.createElement('div');
        scoreEl.className = 'history-score';
        scoreEl.textContent = item.score != null ? 'â˜…' + item.score : '';

        row.appendChild(name);
        row.appendChild(marginEl);
        row.appendChild(scoreEl);

        row.addEventListener('click', function() {
          chrome.tabs.create({ url: chrome.runtime.getURL('results.html') });
        });

        historyList.appendChild(row);
      });
    });
  }

  // â”€â”€ LISTEN FOR RESULTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  chrome.runtime.onMessage.addListener(function(msg) {
    if (!msg) return;

    if (msg.type === 'VINTED_STATUS') {
      const s = msg.status;
      if (s === 'step') {
        setStatus(msg.message || 'Recherche...', 'loading');
        const steps = { 1: 30, 2: 60, 3: 85 };
        setProgress(steps[msg.step] || 50);
      } else if (s === 'fallback') {
        setStatus(msg.message || 'Fallback...', 'loading');
        setProgress(50);
      } else if (s === 'error') {
        setStatus(msg.message || 'Erreur', 'error');
        setProgress(0);
        if (analyseBtn) analyseBtn.disabled = !isLicensed;
      }
    }

    if (msg.type === 'VINTED_IMAGE_RESULTS' && msg.data) {
      chrome.runtime.sendMessage({ type: 'GET_LAST_VINTED_RESULTS' }, function(resp) {
        void chrome.runtime.lastError;
        const aliPrice = resp && resp.aliBuyPrice != null ? resp.aliBuyPrice : 0;
        renderMiniResults(msg.data, aliPrice);
        loadHistory();
      });
    }
  });

  // Open full results tab
  if (openFullBtn) {
    openFullBtn.addEventListener('click', function() {
      chrome.runtime.sendMessage({ type: 'OPEN_RESULTS_PAGE' }, function() { void chrome.runtime.lastError; });
    });
  }

  // â”€â”€ QUICK LINKS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const dashBtn   = document.getElementById('panelOpenDashboard');
  const compareBtn = document.getElementById('panelOpenCompare');
  const resultsBtn = document.getElementById('panelOpenResults');

  if (dashBtn) dashBtn.addEventListener('click', function() {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  });
  if (compareBtn) compareBtn.addEventListener('click', function() {
    chrome.tabs.create({ url: chrome.runtime.getURL('compare.html') });
  });
  if (resultsBtn) resultsBtn.addEventListener('click', function() {
    chrome.runtime.sendMessage({ type: 'OPEN_RESULTS_PAGE' }, function() { void chrome.runtime.lastError; });
  });

  // â”€â”€ INIT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  checkLicense();
  initMarketSelector();
  autoFill();
  loadHistory();

  // Load any existing results
  chrome.runtime.sendMessage({ type: 'GET_LAST_VINTED_RESULTS' }, function(resp) {
    void chrome.runtime.lastError;
    if (resp && resp.data && resp.data.stats) {
      renderMiniResults(resp.data, resp.aliBuyPrice || 0);
    }
  });

})();

