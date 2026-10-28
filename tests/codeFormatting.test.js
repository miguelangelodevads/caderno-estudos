import test from "node:test";
import assert from "node:assert/strict";
import { createCodeBlock, formatCodePaste, looksLikeCode } from "../src/utils/codeFormatting.js";

test("texto comum, acentos, listas e URLs continuam sendo anotações normais", () => {
  for (const text of ["Hoje estudei funções e objetos.", "Olá, mundo!", "1. Ler\n2. Revisar", "https://exemplo.com/pagina", "Preço: R$ 42,00\nDesconto de 10%", "Lembrete { importante }"]) {
    assert.equal(formatCodePaste(text), null, text);
  }
});

test("reconhece código colado em linguagens comuns, inclusive comandos curtos", () => {
  for (const text of [
    'const aluno = "João";', 'console.log("Olá");',
    'def soma(a, b):\n    return a + b',
    '<button type="button">Olá</button>',
    '.card { color: red; }', '{"ativo":true,"total":42}',
    'SELECT nome FROM alunos;', 'npm install react', 'git status',
    'public class Pessoa { }',
  ]) {
    assert.equal(looksLikeCode(text), true, text);
    assert.match(formatCodePaste(text), /<pre class="code-block"/);
  }
});

test("preserva indentação, linhas em branco, tabs e caracteres de código", () => {
  const code = 'function exemplo() {\n\n\treturn a < b && c > 0;\n}';
  const html = createCodeBlock(code, "javascript");
  assert.match(html, /\n\n\t/);
  assert.match(html, /&lt;/);
  assert.match(html, /&amp;&amp;/);
  assert.match(html, /hljs-keyword/);
});

test("separa explicações e múltiplos blocos entre três crases", () => {
  const paste = 'Exemplo JS:\r\n```js\r\nconst x = 1;\r\n```\r\nOutro exemplo:\r\n```python\r\nprint("Olá")\r\n```\r\nFim.';
  const html = formatCodePaste(paste);
  assert.equal((html.match(/<pre /g) || []).length, 2);
  assert.match(html, /data-language="js"/);
  assert.match(html, /data-language="python"/);
  assert.match(html, /Exemplo JS:/);
  assert.match(html, /Outro exemplo:/);
  assert.match(html, /Fim\./);
});

test("linguagens desconhecidas continuam legíveis e não injetam HTML", () => {
  const html = createCodeBlock('<script>alert("oi")</script>', 'desconhecida');
  assert.match(html, /data-language="texto"/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script\b/);
  const markup = createCodeBlock('<img src=x onerror="alert(1)">', 'html');
  assert.doesNotMatch(markup, /<img\b/);
});

test("colagem já marcada como código é reconhecida sem sinais de linguagem", () => {
  assert.match(formatCodePaste("resultado", "<pre><code>resultado</code></pre>"), /code-block/);
  assert.equal(formatCodePaste("resultado", "<p>resultado</p>"), null);
});

test("reconhece um documento HTML inteiro em uma única linha como o exemplo relatado", () => {
  const code = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Minha Página</title><style>body { color: white; }</style></head><body><button onclick="mostrarMensagem()">Clique Aqui</button><script>function mostrarMensagem() { alert("Olá!"); }</script></body></html>';
  const result = formatCodePaste(code);
  assert.match(result, /data-language="html"/);
  assert.match(result, /hljs-/);
  assert.match(result, /DOCTYPE/);
  assert.doesNotMatch(result, /<(?:script|button|style|html)\b/i);
});

test("amplia a detecção para C, C++, Go, Rust, PHP, PowerShell, CSS e comandos", () => {
  for (const code of [
    '#include <stdio.h>\nint main() { return 0; }',
    'std::cout << "Olá";',
    'package main\nfunc main() { fmt.Println("Olá") }',
    'fn main() { println!("Olá"); }',
    '<?php echo "Olá"; ?>',
    'Get-ChildItem -Path C:\\teste',
    '$nome = "Miguel"',
    'body { color: red; background: white; }',
    'x = 42', 'ls -la', 'DELETE FROM alunos WHERE id = 1;',
  ]) {
    assert.equal(looksLikeCode(code), true, code);
    assert.match(formatCodePaste(code), /code-block/);
  }
});

test("usa sinais de sintaxe para não confundir Python, JavaScript e C com CSS", () => {
  for (const [code, language] of [
    ['def soma(a, b):\n    return a + b\n\nprint(soma(2, 3))', 'python'],
    ['const nome = "Olá";\nconsole.log(nome);', 'javascript'],
    ['#include <stdio.h>\nint main() { return 0; }', 'c'],
    ['body { color: red; }', 'css'],
    ['{"nome":"Ana","idade":30}', 'json'],
  ]) assert.match(formatCodePaste(code), new RegExp(`data-language="${language}"`));
});
