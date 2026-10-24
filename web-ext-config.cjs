// web-ext : rechargement automatique pendant le développement (npx web-ext run).
module.exports = {
  run: { target: ["chromium"], startUrl: ["https://fr.aliexpress.com"] },
  ignoreFiles: ["tests/**", "tools/**", "dist/**", "*.md", ".git/**", ".github/**"],
};
