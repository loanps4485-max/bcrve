const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { test } = require("node:test");

const root = join(__dirname, "..");
const pageScripts = [
  { html: "index.html", script: "app.js", dynamicIds: ["adminAccessState", "ordersList", "shareUrl"] },
  { html: "admin.html", script: "admin.js", dynamicIds: [] },
];

test("shop pages contain every static DOM element their scripts use", async () => {
  for (const page of pageScripts) {
    const [html, script] = await Promise.all([
      readFile(join(root, page.html), "utf8"),
      readFile(join(root, page.script), "utf8"),
    ]);
    const htmlIds = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(new Set(htmlIds).size, htmlIds.length, `${page.html} must not repeat element IDs`);

    const availableIds = new Set([...htmlIds, ...page.dynamicIds]);
    const referencedIds = [...script.matchAll(/getElementById\(["']([^"']+)["']\)/g)]
      .map((match) => match[1]);
    const missingIds = [...new Set(referencedIds.filter((id) => !availableIds.has(id)))];
    assert.deepEqual(missingIds, [], `${page.script} refers to missing page elements`);

    const externalScripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)]
      .map((match) => match[1].split("?")[0])
      .filter((source) => !source.startsWith("https://"));
    for (const source of externalScripts) {
      assert.equal(source === page.script || source === "promotions.js", true);
      await readFile(join(root, source), "utf8");
    }
  }
});

test("shop stylesheets have balanced rule blocks", async () => {
  for (const filename of ["styles.css", "admin.css"]) {
    const source = await readFile(join(root, filename), "utf8");
    let depth = 0;
    let quote = null;
    let escaped = false;

    for (const character of source) {
      if (quote) {
        if (escaped) {
          escaped = false;
        } else if (character === "\\") {
          escaped = true;
        } else if (character === quote) {
          quote = null;
        }
        continue;
      }
      if (character === '"' || character === "'") {
        quote = character;
      } else if (character === "{") {
        depth += 1;
      } else if (character === "}") {
        depth -= 1;
        assert.ok(depth >= 0, `${filename} closes a rule before opening one`);
      }
    }

    assert.equal(depth, 0, `${filename} has an unclosed rule`);
    assert.equal(quote, null, `${filename} has an unclosed string`);
  }
});
