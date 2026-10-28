import test from "node:test";
import assert from "node:assert/strict";
import { createAutosave } from "../src/utils/autosave.js";

test("grava somente a versão mais recente após uma pausa", async () => {
  const saved = [];
  const autosave = createAutosave(async (value) => { saved.push(value); }, () => {}, 15);
  autosave.schedule({ title: "A" });
  autosave.schedule({ title: "Aula" });
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.deepEqual(saved, [{ title: "Aula" }]);
  await autosave.close();
});

test("digitar durante uma gravação preserva a nova versão e a ordem", async () => {
  const saved = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const autosave = createAutosave(async (value) => {
    saved.push(value);
    if (saved.length === 1) await gate;
  }, () => {}, 1000);
  autosave.schedule("primeira");
  const pending = autosave.flush();
  await Promise.resolve();
  autosave.schedule("segunda");
  release();
  assert.equal(await pending, true);
  assert.deepEqual(saved, ["primeira", "segunda"]);
  await autosave.close();
});

test("falhas não mostram salvo e permitem tentar novamente sem perder o texto", async () => {
  const status = [];
  let fail = true;
  const saved = [];
  const autosave = createAutosave(async (value) => {
    if (fail) throw new Error("Sem conexão");
    saved.push(value);
  }, (value) => status.push(value), 1000);
  autosave.schedule("rascunho");
  assert.equal(await autosave.flush(), false);
  assert.equal(status.at(-1), "error");
  fail = false;
  assert.equal(await autosave.flush(), true);
  assert.deepEqual(saved, ["rascunho"]);
  assert.equal(status.at(-1), "saved");
  await autosave.close();
});

test("sair da folha grava o texto pendente sem esperar o temporizador", async () => {
  const saved = [];
  const autosave = createAutosave(async (value) => { saved.push(value); }, () => {}, 1000);
  autosave.schedule("última alteração");
  assert.equal(await autosave.close(), true);
  assert.deepEqual(saved, ["última alteração"]);
});
