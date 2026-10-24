// Nouvelle version : node tools/release.mjs [patch|minor|major] "notes"
// Met à jour manifest.json et version.json. Ensuite : commit + push sur main → publication automatique.
import { readFileSync, writeFileSync } from "node:fs";
const kind = process.argv[2] || "patch";
const notes = process.argv[3];
const m = JSON.parse(readFileSync("manifest.json", "utf8"));
const [a, b, c] = m.version.split(".").map(Number);
const next = kind === "major" ? `${a + 1}.0.0` : kind === "minor" ? `${a}.${b + 1}.0` : `${a}.${b}.${c + 1}`;
m.version = next;
writeFileSync("manifest.json", JSON.stringify(m, null, 2) + "\n");
const v = JSON.parse(readFileSync("version.json", "utf8"));
Object.assign(v, { version: next, releaseDate: new Date().toISOString().slice(0, 10) }, notes ? { notes } : {});
writeFileSync("version.json", JSON.stringify(v, null, 2) + "\n");
console.log(next);
