// web-ext configuration — auto-reload on file change
// Lance avec : web-ext run (dans ce dossier)
module.exports = {
  run: {
    // Perplexity Comet (Chromium)
    target: ["chromium"],
    chromiumBinary: "C:\\Users\\istva\\AppData\\Local\\Perplexity\\Comet\\Application\\comet.exe",
    chromiumProfile: "C:\\Users\\istva\\AppData\\Local\\Perplexity\\Comet\\User Data\\Default",
    startUrl: ["https://fr.aliexpress.com"],
  },
  // Fichiers à ignorer (non pertinents pour le rechargement)
  ignoreFiles: [
    "web-ext-config.js",
    "*.md",
    ".git/**",
  ],
};
