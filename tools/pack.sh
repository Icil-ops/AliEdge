#!/usr/bin/env bash
# Construit dist/aliedge-<version>.zip pour le Chrome Web Store.
# Le champ "key" (qui fixe l'identifiant en développement) est retiré : le Store le refuse.
set -euo pipefail
cd "$(dirname "$0")/.."
version=$(node -p "require('./manifest.json').version")
rm -rf dist/pkg && mkdir -p dist/pkg
cp -r manifest.json icons src app dist/pkg/
node -e "const f='dist/pkg/manifest.json';const m=require('./'+f);delete m.key;delete m.update_url;require('fs').writeFileSync(f,JSON.stringify(m,null,2))"
(cd dist/pkg && zip -qr "../aliedge-$version.zip" .)
rm -rf dist/pkg
echo "dist/aliedge-$version.zip"
