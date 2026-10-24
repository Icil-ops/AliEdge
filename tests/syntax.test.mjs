import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";

// Une erreur de syntaxe casse toute l'extension : on vérifie chaque script avant tout envoi au store.
test("tous les scripts de l'extension sont valides", () => {
  const files = execFileSync("git", ["ls-files", "src/*.js", "src/**/*.js", "app/*.js"], { encoding: "utf8" }).split("\n").filter(Boolean);
  assert.ok(files.length > 5);
  for (const f of files) {
    const r = spawnSync(process.execPath, ["--check", f], { encoding: "utf8" });
    assert.equal(r.status, 0, `${f} : ${r.stderr}`);
  }
});
