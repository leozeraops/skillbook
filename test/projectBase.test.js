import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { getProjectHealthStatus } from "../src/projectHealth.js";

test("health status confirms a healthy Apps Script project", () => {
  const status = getProjectHealthStatus();

  assert.equal(status.healthy, true);
  assert.equal(status.runtimeVersion, "V8");
  assert.equal(status.timeZone, "America/Sao_Paulo");
});

test("project manifest declares V8 and the Sao Paulo timezone", async () => {
  const manifest = JSON.parse(await readFile("appsscript.json", "utf8"));

  assert.equal(manifest.runtimeVersion, "V8");
  assert.equal(manifest.timeZone, "America/Sao_Paulo");
});

test("local clasp configuration excludes credentials and ignores local state", async () => {
  const claspIgnore = await readFile(".claspignore", "utf8");
  const gitignore = await readFile(".gitignore", "utf8");

  assert.match(claspIgnore, /\.clasp\.json/);
  assert.match(gitignore, /\.clasp\.json/);
  assert.match(gitignore, /\*\.clasprc\.json/);
});

test("development guide documents push, version, pinned deployment and syntax check", async () => {
  const readme = await readFile("README.md", "utf8");

  assert.match(readme, /clasp push/);
  assert.match(readme, /clasp version/i);
  assert.match(readme, /clasp deploy/i);
  assert.match(readme, /@HEAD/);
  assert.match(readme, /npm run check/);
});
