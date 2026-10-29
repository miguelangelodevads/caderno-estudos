import test from 'node:test';
import assert from 'node:assert/strict';
import { renameTopic } from '../src/utils/renameTopic.js';

test('renomear conserva identificadores, ordem, cores e anotações da versão atual', () => {
  const notebook = { topics: [
    { id: 'a', title: 'Antigo', color: 'blue', notes: [{ id: 'n', content: 'conteúdo privado' }] },
    { id: 'b', title: 'Outro', notes: [] },
  ] };
  const topics = renameTopic(notebook, 'a', '  Novo nome  ');
  assert.equal(topics[0].title, 'Novo nome');
  assert.equal(topics[0].id, 'a');
  assert.equal(topics[0].color, 'blue');
  assert.equal(topics[0].notes, notebook.topics[0].notes);
  assert.equal(topics[1], notebook.topics[1]);
  assert.equal(notebook.topics[0].title, 'Antigo');
});

test('nome vazio e assunto excluído não podem gerar uma atualização', () => {
  assert.throws(() => renameTopic({ topics: [{ id: 'a' }] }, 'a', '  '));
  assert.throws(() => renameTopic({ topics: [] }, 'a', 'Novo'));
});
