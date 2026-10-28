import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const { sanitizeHtmlContent } = await import("../src/utils/sanitize.js");
const { formatNotePaste, normalizeNoteHtml } = await import("../src/utils/noteContent.js");

test("stored HTML cannot insert executable elements, handlers or unsafe links", () => {
  const html = sanitizeHtmlContent('<p onclick="alert(1)">Privado<script>alert(1)</script><iframe src="https://example.com"></iframe><svg onload="alert(1)"></svg><a href="javascript:alert(1)">link</a></p>');
  const holder = document.createElement("div"); holder.innerHTML = html;
  assert.equal(holder.querySelector("script,iframe,svg,[onclick],[onload],[onerror]"), null);
  assert.equal(holder.querySelector("a").getAttribute("href"), null);
  assert.match(holder.textContent, /Privado/);
});

test("stored CSS cannot load remote tracking images or cover the interface", () => {
  const html = sanitizeHtmlContent('<span style="color:rgb(220,38,38);background:url(https://example.com/track);position:fixed;inset:0">Texto</span>');
  const holder = document.createElement("div"); holder.innerHTML = html;
  const node = holder.querySelector("span");
  assert.equal(node.style.color, "rgb(220, 38, 38)");
  assert.equal(node.style.background, ""); assert.equal(node.style.position, "");
  assert.doesNotMatch(html, /https:\/\/example.com/);
});

test("external links opened in another tab cannot control the notebook tab", () => {
  const html = sanitizeHtmlContent('<a href="https://example.com" target="_blank" rel="opener">Referência</a>');
  const holder = document.createElement("div"); holder.innerHTML = html;
  const link = holder.querySelector("a");
  assert.equal(link.getAttribute("href"), "https://example.com");
  assert.equal(link.getAttribute("rel"), "noopener noreferrer");
});

test("text colors, line breaks and code highlighting survive real DOM sanitization", () => {
  const html = normalizeNoteHtml('<span data-text-color="#dc2626" style="color:#dc2626">Minha revisão</span><br>Segunda linha');
  assert.match(html, /data-text-color="#dc2626"/); assert.match(html, /<br>/);
  const code = normalizeNoteHtml(formatNotePaste('const segredo = "exemplo";\nconsole.log(segredo);'));
  const holder = document.createElement("div"); holder.innerHTML = code;
  assert.ok(holder.querySelector("pre.code-block code"));
  assert.match(holder.textContent, /const segredo/);
  assert.ok(holder.querySelector('[class*="hljs-"]'));
});
