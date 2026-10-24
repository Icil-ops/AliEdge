import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("sans secrets, la publication ne fait rien et réussit", () => {
  const env = { ...process.env };
  for (const k of ["CWS_CLIENT_ID", "CWS_CLIENT_SECRET", "CWS_REFRESH_TOKEN", "CWS_PUBLISHER_ID"]) delete env[k];
  const r = spawnSync(process.execPath, ["tools/publish-cws.mjs"], { env, encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /secrets manquants/);
});
