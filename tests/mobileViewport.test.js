import test from "node:test";
import assert from "node:assert/strict";
import { mobileViewportMetrics } from "../src/utils/mobileViewport.js";

test("a área da folha acompanha a altura disponível quando o teclado abre", () => {
  assert.deepEqual(mobileViewportMetrics({layoutHeight:844,visualHeight:390,baselineHeight:844,editing:true}), {height:390,keyboardOpen:true});
});

test("barras do navegador não são confundidas com um teclado", () => {
  assert.deepEqual(mobileViewportMetrics({layoutHeight:844,visualHeight:770,baselineHeight:844,editing:true}), {height:770,keyboardOpen:false});
});

test("reduzir a janela sem editar não oculta a navegação", () => {
  assert.equal(mobileViewportMetrics({layoutHeight:390,visualHeight:300,baselineHeight:844,editing:false}).keyboardOpen, false);
});

test("zoom de acessibilidade mantém o tamanho do layout e não simula teclado", () => {
  assert.deepEqual(mobileViewportMetrics({layoutHeight:844,visualHeight:420,baselineHeight:844,editing:true,scale:2}), {height:844,keyboardOpen:false});
});

test("ausência da VisualViewport usa a altura normal e evita altura negativa", () => {
  assert.equal(mobileViewportMetrics({layoutHeight:700,visualHeight:undefined,baselineHeight:700}).height, 700);
  assert.equal(mobileViewportMetrics({layoutHeight:100,visualHeight:100,baselineHeight:700,editing:true}).height, 160);
});
