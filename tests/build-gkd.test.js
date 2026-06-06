const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.resolve(__dirname, "..");
const outputPath = path.join(root, "gkd.json5");
const versionPath = path.join(root, "gkd.version.json5");

function parseLooseObject(text) {
  return vm.runInNewContext(`(${text})`, {}, { timeout: 5000 });
}

function main() {
  const output = parseLooseObject(fs.readFileSync(outputPath, "utf8"));

  assert.notStrictEqual(
    output.checkUpdateUrl,
    output.updateUrl,
    "checkUpdateUrl should point to a lightweight version file, not the full subscription",
  );

  assert.ok(fs.existsSync(versionPath), "gkd.version.json5 should be generated");

  const versionMeta = parseLooseObject(fs.readFileSync(versionPath, "utf8"));

  assert.strictEqual(versionMeta.id, output.id, "version file id should match subscription id");
  assert.strictEqual(
    versionMeta.version,
    output.version,
    "version file version should match subscription version",
  );
}

main();
