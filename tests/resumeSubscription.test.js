import test from "node:test";
import assert from "node:assert/strict";
import { subscribeOnResume } from "../src/utils/resumeSubscription.js";

function setup() {
  const windowTarget = new EventTarget();
  const documentTarget = new EventTarget();
  documentTarget.visibilityState = "visible";
  let time = 0;
  let stops = 0;
  const callbacks = [];
  const dispose = subscribeOnResume((isCurrent) => {
    callbacks.push(isCurrent);
    return () => { stops++; };
  }, { windowTarget, documentTarget, now: () => time });
  return {
    windowTarget, documentTarget, callbacks, dispose,
    advance() { time += 2000; },
    get stops() { return stops; },
  };
}

test("retornar à janela renova a assinatura e ignora respostas atrasadas", () => {
  const s = setup();
  assert.equal(s.callbacks.length, 1);
  s.advance();
  s.windowTarget.dispatchEvent(new Event("focus"));
  assert.equal(s.callbacks.length, 2);
  assert.equal(s.stops, 1);
  assert.equal(s.callbacks[0](), false);
  assert.equal(s.callbacks[1](), true);
  s.documentTarget.dispatchEvent(new Event("visibilitychange"));
  assert.equal(s.callbacks.length, 2);
  s.dispose();
});

test("retorno da conexão e da visibilidade recuperam a assinatura", () => {
  const s = setup();
  s.advance();
  s.documentTarget.visibilityState = "hidden";
  s.documentTarget.dispatchEvent(new Event("visibilitychange"));
  assert.equal(s.callbacks.length, 1);
  s.documentTarget.visibilityState = "visible";
  s.documentTarget.dispatchEvent(new Event("visibilitychange"));
  assert.equal(s.callbacks.length, 2);
  s.advance();
  s.windowTarget.dispatchEvent(new Event("online"));
  assert.equal(s.callbacks.length, 3);
  s.dispose();
});

test("sair da conta remove eventos e invalida respostas pendentes", () => {
  const s = setup();
  s.dispose();
  assert.equal(s.callbacks[0](), false);
  assert.equal(s.stops, 1);
  s.advance();
  s.windowTarget.dispatchEvent(new Event("focus"));
  s.windowTarget.dispatchEvent(new Event("online"));
  s.documentTarget.dispatchEvent(new Event("visibilitychange"));
  assert.equal(s.callbacks.length, 1);
});
