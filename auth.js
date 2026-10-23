// auth.js — AliEdge v1.2
// Vérifie la licence via l'API Vercel au lieu des clés hardcodées

const API_URL = "https://aliedge-api.vercel.app/api/verify-license"; // ⚠️ Change cette URL par ton URL Vercel une fois déployé

const keyInput = document.getElementById("keyInput");
const errorEl = document.getElementById("error");
const btn = document.getElementById("activateBtn");

keyInput.addEventListener("keydown", function(e) {
  if (e.key === "Enter") btn.click();
});

btn.addEventListener("click", async () => {
  const key = keyInput.value.trim().toUpperCase();

  // Validation format basique côté client
  if (!/^AE-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(key)) {
    errorEl.textContent = "❌ Format invalide. Exemple : AE-XXXX-XXXX-XXXX";
    errorEl.style.color = "#ef4444";
    return;
  }

  // UI loading
  btn.disabled = true;
  btn.textContent = "Vérification...";
  errorEl.textContent = "";

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key })
    });

    const data = await response.json();

    if (!data.valid) {
      // Messages d'erreur selon la raison
      const messages = {
        key_not_found:  "❌ Clé introuvable. Vérifie ta clé ou contacte le support.",
        trial_expired:  "⏰ Ton essai gratuit de 30 jours est terminé. Abonne-toi sur ivanbara.com",
        expired:        "⏰ Ton accès a expiré. Renouvelle sur ivanbara.com",
        cancelled:      "🚫 Abonnement annulé. Réabonne-toi sur ivanbara.com",
        invalid_format: "❌ Format de clé invalide.",
        server_error:   "⚠️ Erreur serveur. Réessaie dans quelques secondes."
      };
      errorEl.textContent = messages[data.reason] || "❌ Clé invalide.";
      errorEl.style.color = "#ef4444";
      btn.disabled = false;
      btn.textContent = "Activer";
      return;
    }

    // ✅ Clé valide — stocke localement
    const storageData = {
      ae_license_key: key,
      ae_status:      data.status,    // "trial" ou "active"
      ae_days_left:   data.daysLeft,  // jours restants si trial
      ae_email:       data.email,
      ae_last_check:  Date.now()      // timestamp dernière vérification
    };

    chrome.storage.local.set(storageData, () => {
      // Message selon le statut
      if (data.status === "trial") {
        errorEl.textContent = `✅ Accès activé ! Il te reste ${data.daysLeft} jours d'essai gratuit.`;
      } else {
        errorEl.textContent = "✅ Accès activé !";
      }
      errorEl.style.color = "#22c55e";

      chrome.runtime.sendMessage({ type: "LICENSE_VALIDATED" },
        function() { void chrome.runtime.lastError; }
      );

      setTimeout(() => {
        window.location.href = "popup.html";
      }, 1200);
    });

  } catch (err) {
    // Fallback offline — si pas de connexion, utilise le cache local
    console.warn("[AUTH] API unreachable, checking cache...", err);

    chrome.storage.local.get(["ae_license_key", "ae_last_check", "ae_status"], (res) => {
      const cachedKey = res.ae_license_key;
      const lastCheck = res.ae_last_check || 0;
      const hoursSinceCheck = (Date.now() - lastCheck) / (1000 * 60 * 60);

      // Cache valide 24h max en mode offline
      if (cachedKey === key && hoursSinceCheck < 24) {
        errorEl.textContent = "✅ Accès activé (mode hors ligne).";
        errorEl.style.color = "#22c55e";
        setTimeout(() => { window.location.href = "popup.html"; }, 1200);
      } else {
        errorEl.textContent = "⚠️ Impossible de vérifier. Vérifie ta connexion internet.";
        errorEl.style.color = "#f97316";
        btn.disabled = false;
        btn.textContent = "Activer";
      }
    });
  }
});
