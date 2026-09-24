import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("operator console preserves baseline keyboard and labeling accessibility", async () => {
  const html = await readFile(new URL("../apps/operator-console/index.html", import.meta.url), "utf8");
  const script = await readFile(new URL("../apps/operator-console/app.js", import.meta.url), "utf8");
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<meta name="viewport"/);
  assert.match(html, /class="skip-link" href="#content"/);
  assert.match(html, /<main id="content" tabindex="-1">/);
  assert.match(html, /aria-label="Primary navigation"/);
  assert.match(html, /prefers-reduced-motion|styles\.css/);
  for (const [, id] of html.matchAll(/<label for="([^"]+)"/g)) assert.match(html, new RegExp(`id="${id}"`));
  for (const [, label] of html.matchAll(/<button[^>]*>([^<]+)<\/button>/g)) assert.ok(label.trim(), "Every static button has an accessible name");
  assert.doesNotMatch(script, /\.innerHTML\s*=/, "Dynamic untrusted content must use textContent/DOM APIs");
});
