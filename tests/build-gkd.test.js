const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.resolve(__dirname, "..");
const outputPath = path.join(root, "gkd.json5");
const versionPath = path.join(root, "gkd.version.json5");
const localRulesPath = path.join(root, "local-rules.json");

function parseLooseObject(text) {
  return vm.runInNewContext(`(${text})`, {}, { timeout: 5000 });
}

function main() {
  const output = parseLooseObject(fs.readFileSync(outputPath, "utf8"));
  const localRules = JSON.parse(fs.readFileSync(localRulesPath, "utf8"));

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

  const ecprintApp = localRules.apps.find((app) => app.id === "com.gfd.ecprint");
  assert.ok(ecprintApp, "local rules should contain com.gfd.ecprint");

  const aIsoulerApp = output.apps.find((app) => app.id === "com.cto51.student");
  assert.ok(aIsoulerApp, "output should include an app from the AIsouler upstream");

  const dreamXiaoyaoApp = output.apps.find((app) => app.id === "com.skyworthdigital.picamera");
  assert.ok(dreamXiaoyaoApp, "output should include an app from the dream-xiaoyao upstream");

  const splashRule = ecprintApp.groups
    .flatMap((group) => group.rules || [])
    .find((rule) => rule.matches === 'ImageView[id="com.gfd.ecprint:id/print_navact_jump"][clickable=true]');

  assert.ok(splashRule, "local rules should contain the splash skip rule for com.gfd.ecprint");

  const channelSkipRule = ecprintApp.groups
    .flatMap((group) => group.rules || [])
    .find((rule) => rule.matches === 'TextView[text="跳过"][clickable=true]');

  assert.ok(channelSkipRule, "local rules should contain the channel code skip rule for com.gfd.ecprint");

  const welfareReminderRule = ecprintApp.groups
    .flatMap((group) => group.rules || [])
    .find((rule) => rule.matches === 'View[id="com.gfd.ecprint:id/tool_bcudlg_update_rule"][clickable=true]');

  assert.ok(welfareReminderRule, "local rules should contain the welfare reminder dismiss rule for com.gfd.ecprint");

  const rewardLoadingRule = ecprintApp.groups
    .flatMap((group) => group.rules || [])
    .find((rule) => rule.matches === 'ImageView[id="com.gfd.ecprint:id/loadingClose"][clickable=true]');

  assert.ok(rewardLoadingRule, "local rules should contain the reward loading dismiss rule for com.gfd.ecprint");

  const homeAdCloseRule = ecprintApp.groups
    .flatMap((group) => group.rules || [])
    .find((rule) => rule.matches === 'ImageView[id="com.gfd.ecprint:id/ad_close"][clickable=true]');

  assert.ok(homeAdCloseRule, "local rules should contain the home ad close rule for com.gfd.ecprint");

  assert.ok(
    (homeAdCloseRule.snapshotUrls || []).includes("https://i.gkd.li/i/28674939"),
    "home ad close rule should reference the uploaded snapshot",
  );
}

main();
