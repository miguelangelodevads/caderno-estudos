import test from "node:test";
import assert from "node:assert/strict";
import { createCodeBlock, formatCodePaste } from "../src/utils/codeFormatting.js";

const codeText = (html) => html.replace(/<[^>]*>/g, "").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

test("explicações com aspas viram comentários e não contaminam o TypeScript seguinte", () => {
  const source = `export const isEmergency = (incident: IIncident): boolean => {
  if (!incident) return false;
  return incident.status === 'DISPATCH';
};

O que faz: Recebe uma ocorrência e verifica se ela está aguardando despacho.
O porquê: Seguindo o princípio DRY (Don't Repeat Yourself), alteramos a regra "a emergência ativa" em um único lugar.
2. O Alerta Sonoro
Onde foi feito: src/hooks/useEmergencySiren.ts (Arquivo novo)
O Código:
typescript
export const useEmergencySiren = (incidents: IIncident[]) => {
  const audioRef = useRef(null);
  useEffect(() => {
    if (!audioRef.current) return;
  }, []);
};`;
  const html = formatCodePaste(source);
  assert.equal((html.match(/<pre /g) || []).length, 1);
  assert.match(html, /data-language="typescript"/);
  assert.match(html, /code-explanation[^>]*>\/\/ O que faz:/);
  assert.match(html, /code-explanation[^>]*>\/\/ O porquê:/);
  assert.match(html, /code-explanation[^>]*>\/\/ Onde foi feito:/);
  assert.match(html, /hljs-keyword[^>]*>export/);
  assert.match(codeText(html), /const audioRef = useRef\(null\);/);
  assert.match(codeText(html), /Don't Repeat Yourself/);
});

test("mantém código em template strings e strings triplas sem transformá-lo em explicação", () => {
  const js = 'const texto = `\nO que faz: esta frase pertence à string.\n`;\nconsole.log(texto);';
  const python = 'documentacao = """\nO que faz: esta frase pertence à documentação.\n"""\nprint(documentacao)';
  assert.doesNotMatch(codeText(createCodeBlock(js)), /\/\/ O que faz:/);
  assert.doesNotMatch(codeText(createCodeBlock(python)), /# O que faz:/);
});

test("fences de linguagens diferentes ficam juntos e preservam suas próprias cores", () => {
  const source = 'Exemplo em JavaScript:\n```js\nconst total = 42;\n```\nAgora o exemplo em Python:\n```python\nprint("Olá")\n```';
  const html = formatCodePaste(source);
  assert.equal((html.match(/<pre /g) || []).length, 1);
  assert.match(html, /data-language="misto"/);
  assert.match(html, /code-region" data-language="js"/);
  assert.match(html, /code-region" data-language="python"/);
  assert.match(html, /code-explanation/);
  assert.doesNotMatch(codeText(html), /```/);
});

test("texto de elementos HTML continua código, mesmo quando parece uma explicação", () => {
  const source = '<html>\n<body>\n<p>\nEsta é uma explicação dentro do elemento HTML.\n</p>\n</body>\n</html>';
  assert.equal(codeText(createCodeBlock(source)), source);
});

test("atribuições com frases e comentários originais mantêm o código intacto", () => {
  const source = 'function exemplo() {\n  // Mantém o comentário original.\n  mensagem = "Este é o texto do botão";\n  return mensagem;\n}';
  const html = createCodeBlock(source);
  assert.match(codeText(html), /mensagem = "Este é o texto do botão";/);
  assert.doesNotMatch(codeText(html), /\/\/\s+mensagem =/);
  assert.doesNotMatch(codeText(html), /\/\/ \/\/ Mantém/);
});

test("explicação pura segue como texto e explicação com HTML não executa marcação", () => {
  assert.equal(formatCodePaste('O que faz: explica como usamos a função.\nO porquê: melhora a leitura da documentação.'), null);
  const html = formatCodePaste('O que faz: mostra <img src=x onerror="alert(1)"> na explicação.\nconst total = 42;');
  assert.doesNotMatch(html, /<img\b/);
  assert.match(html, /code-explanation/);
});

test("recolorir conteúdo já anotado não duplica os marcadores de comentário", () => {
  const first = formatCodePaste('O que faz: recebe um valor e calcula o dobro.\nconst dobro = (valor) => valor * 2;');
  const again = createCodeBlock(codeText(first));
  assert.doesNotMatch(codeText(again), /\/\/ \/\/ O que faz/);
  assert.match(codeText(again), /\/\/ O que faz:/);
});
