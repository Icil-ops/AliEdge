// watch.js — vérifie la syntaxe JS à chaque sauvegarde + lance web-ext lint
// Usage : node watch.js
const { execSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const DIR = __dirname;
const JS_FILES = ["background.js", "content.js", "popup.js", "vinted-content.js", "results.js", "auth.js"];

function check(file) {
  try {
    execSync(`node --check "${path.join(DIR, file)}"`, { stdio: "pipe" });
    console.log(`  ✅ ${file} — syntaxe OK`);
    return true;
  } catch (e) {
    console.error(`  ❌ ${file} — ERREUR SYNTAXE:\n${e.stderr?.toString() || e.message}`);
    return false;
  }
}

function checkAll() {
  console.log(`\n[${new Date().toLocaleTimeString()}] Vérification de tous les fichiers...`);
  let allOk = true;
  for (const f of JS_FILES) {
    if (fs.existsSync(path.join(DIR, f))) {
      if (!check(f)) allOk = false;
    }
  }
  console.log(allOk ? "  → Tous les fichiers sont valides.\n" : "  → Des erreurs ont été trouvées.\n");
}

// Vérification initiale
checkAll();

// Watch des fichiers
const watchers = {};
for (const file of JS_FILES) {
  const fullPath = path.join(DIR, file);
  if (!fs.existsSync(fullPath)) continue;

  watchers[file] = fs.watch(fullPath, (event) => {
    if (event === "change") {
      console.log(`\n[${new Date().toLocaleTimeString()}] Changement détecté : ${file}`);
      check(file);
    }
  });
}

console.log(`👁  Surveillance active sur : ${JS_FILES.filter(f => watchers[f]).join(", ")}`);
console.log("    Ctrl+C pour arrêter.\n");

process.on("SIGINT", () => {
  Object.values(watchers).forEach(w => w.close());
  console.log("\nSurveillance arrêtée.");
  process.exit(0);
});
