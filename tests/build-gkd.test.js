const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.resolve(__dirname, "..");
const outputPath = path.join(root, "gkd.json5");
const versionPath = path.join(root, "gkd.version.json5");
const localRulesPath = path.join(root, "local-rules.json");

function parseJson(text) {
  return JSON.parse(text);
}

function computeNextVersion({ previousOutputVersion, previousVersionMeta, remoteVersion, hasContentChange }) {
  const baseline = Math.max(
    Number(previousOutputVersion || 1),
    Number(previousVersionMeta || 1),
    Number(remoteVersion || 1),
  );
  return hasContentChange ? baseline + 1 : baseline;
}

function main() {
  const output = parseJson(fs.readFileSync(outputPath, "utf8"));
  const localRules = JSON.parse(fs.readFileSync(localRulesPath, "utf8"));

  assert.notStrictEqual(
    output.checkUpdateUrl,
    output.updateUrl,
    "checkUpdateUrl should point to a lightweight version file, not the full subscription",
  );

  assert.ok(fs.existsSync(versionPath), "gkd.version.json5 should be generated");

  const versionMeta = parseJson(fs.readFileSync(versionPath, "utf8"));

  assert.strictEqual(versionMeta.id, output.id, "version file id should match subscription id");
  assert.strictEqual(
    versionMeta.version,
    output.version,
    "version file version should match subscription version",
  );

  const ecprintApp = localRules.apps.find((app) => app.id === "com.gfd.ecprint");
  assert.ok(ecprintApp, "local rules should contain com.gfd.ecprint");

  const aIsoulerApp = output.apps.find((app) => app.id === "com.cto51.student");
  assert.ok(aIsoulerApp, "output should include an app from the AIsouler upstream");

  const dreamXiaoyaoApp = output.apps.find((app) => app.id === "com.skyworthdigital.picamera");
  assert.ok(dreamXiaoyaoApp, "output should include an app from the dream-xiaoyao upstream");

  const gkd667App = output.apps.find((app) => app.id === "com.abdownloadmanager");
  assert.ok(gkd667App, "output should include an app from the gkd667.vv.ax upstream");

  const homeAdCloseRule = ecprintApp.groups
    .flatMap((group) => group.rules || [])
    .find((rule) => rule.matches === 'ImageView[id="com.gfd.ecprint:id/ad_close"][clickable=true]');

  assert.ok(homeAdCloseRule, "local rules should contain the home ad close rule for com.gfd.ecprint");
  assert.ok(
    (homeAdCloseRule.snapshotUrls || []).includes("https://i.gkd.li/i/28674939"),
    "home ad close rule should reference the uploaded snapshot",
  );

  const sunloginRule = output.apps
    .find((app) => app.id === "com.oray.sunlogin")
    .groups.flatMap((group) => group.rules || [])
    .find((rule) => String(rule.matches).includes('tobid_interstitial_skip_text') && String(rule.matches).includes('text*=\"??\"'));

  assert.ok(sunloginRule, "output should contain the updated sunlogin skip rule");
  assert.ok(
    (sunloginRule.snapshotUrls || []).includes("https://i.gkd.li/i/28854628"),
    "sunlogin rule should reference the new uploaded snapshot",
  );

  assert.strictEqual(
    computeNextVersion({ previousOutputVersion: 33, previousVersionMeta: 34, remoteVersion: 35, hasContentChange: true }),
    36,
    "remote version should be used as the baseline when it is ahead of local output",
  );

  assert.strictEqual(
    computeNextVersion({ previousOutputVersion: 35, previousVersionMeta: 35, remoteVersion: 35, hasContentChange: false }),
    35,
    "version should stay unchanged when content does not change",
  );
}

main();
