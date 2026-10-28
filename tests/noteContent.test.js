import test from "node:test";
import assert from "node:assert/strict";
import { formatNotePaste } from "../src/utils/noteContent.js";

test("texto colado ignora fonte, tamanho, cor e peso externos", () => {
  const result = formatNotePaste('Era uma manhã tranquila.\nSegunda linha.', '<span style="font-family:Arial;font-size:32px;color:red;font-weight:bold">Era uma manhã tranquila.<br>Segunda linha.</span>');
  assert.equal(result, '<span>Era uma manhã tranquila.<br>Segunda linha.</span>');
  assert.doesNotMatch(result, /style=|font-family|font-size|color:|<b>|<strong>/);
});

test("texto conserva parágrafos, acentos e caracteres especiais", () => {
  assert.equal(formatNotePaste('Revisão & prática\r\n\r\nPreço: R$ 42,00'), '<span>Revisão &amp; prática<br><br>Preço: R$ 42,00</span>');
});

test("código é identificado e organizado automaticamente na colagem", () => {
  const result = formatNotePaste('<!DOCTYPE html><html><body><h1>Olá</h1><script>function x(){return 1;}</script></body></html>');
  assert.match(result, /pre class="code-block"/);
  assert.match(result, /data-language="html"/);
  assert.match(result, /\n/);
  assert.doesNotMatch(result, /<script\b/);
});

test("texto com aparência de marcação é escapado quando não é código", () => {
  const result = formatNotePaste('Comparação: 2 < 3 & 4 > 1.');
  assert.equal(result, '<span>Comparação: 2 &lt; 3 &amp; 4 &gt; 1.</span>');
});
