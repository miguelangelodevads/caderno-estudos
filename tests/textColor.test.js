import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTextColor } from "../src/utils/textColor.js";
import { formatNotePaste } from "../src/utils/noteContent.js";

test("cores do seletor e do navegador são salvas em um formato consistente", () => {
  assert.equal(normalizeTextColor("#DC2626"), "#dc2626");
  assert.equal(normalizeTextColor("#f0a"), "#ff00aa");
  assert.equal(normalizeTextColor("rgb(220, 38, 38)"), "#dc2626");
});

test("marcadores de cor não aceitam CSS arbitrário nem valores inválidos", () => {
  for (const value of ["red; font-size: 99px", "url(https://example.com)", "rgb(999, 0, 0)", "#zzzzzz", "inherit", null]) {
    assert.equal(normalizeTextColor(value), null);
  }
});

test("colar texto de fora não importa nem mesmo marcadores de cor do aplicativo", () => {
  const html = formatNotePaste("Texto copiado", '<span data-text-color="#dc2626" style="color:red;font-family:Arial">Texto copiado</span>');
  assert.equal(html, "<span>Texto copiado</span>");
  assert.doesNotMatch(html, /style=|data-text-color/);
});
