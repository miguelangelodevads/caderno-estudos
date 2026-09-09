import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeHtmlContent } from "../src/utils/sanitize.js";

test("removes script and event handlers from note html", () => {
  const dirty =
    '<p onclick="alert(1)">Olá <script>alert(1)</script><img src=x onerror=alert(1) /> <a href="javascript:alert(1)">link</a></p>';
  const clean = sanitizeHtmlContent(dirty);

  assert.doesNotMatch(clean, /<script/i);
  assert.doesNotMatch(clean, /onerror/i);
  assert.doesNotMatch(clean, /javascript:/i);
  assert.match(clean, /Olá/i);
});
