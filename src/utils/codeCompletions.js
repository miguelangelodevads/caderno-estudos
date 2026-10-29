import { snippetCompletion, completeAnyWord } from '@codemirror/autocomplete';

export const HTML_TEMPLATE = '<!DOCTYPE html>\n<html lang="pt-BR">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>${Título}</title>\n</head>\n<body>\n  ${}\n</body>\n</html>';
const snippets = {
  javascript: [['log', 'console.log(${valor});'], ['function', 'function ${nome}(${argumentos}) {\n  ${}\n}'], ['if', 'if (${condição}) {\n  ${}\n}'], ['for', 'for (let ${i} = 0; ${i} < ${limite}; ${i}++) {\n  ${}\n}']],
  python: [['print', 'print(${valor})'], ['def', 'def ${nome}(${argumentos}):\n    ${}'], ['if', 'if ${condição}:\n    ${}'], ['for', 'for ${item} in ${itens}:\n    ${}']],
  css: [['rule', '${seletor} {\n  ${propriedade}: ${valor};\n}']],
  sql: [['select', 'SELECT ${colunas}\nFROM ${tabela}\nWHERE ${condição};']],
  java: [['main', 'public static void main(String[] args) {\n  ${}\n}'], ['print', 'System.out.println(${valor});']],
  c: [['main', 'int main(void) {\n  ${}\n  return 0;\n}']],
  cpp: [['main', 'int main() {\n  ${}\n  return 0;\n}']],
  csharp: [['print', 'Console.WriteLine(${valor});']],
  php: [['echo', 'echo ${valor};']],
  go: [['func', 'func ${nome}() {\n  ${}\n}']],
  rust: [['fn', 'fn ${nome}() {\n  ${}\n}']],
  dart: [['main', 'void main() {\n  ${}\n}']],
  bash: [['if', 'if [ ${condição} ]; then\n  ${}\nfi']],
  powershell: [['if', 'if (${condição}) {\n  ${}\n}']],
};
const keywords = {
 javascript: 'const let var function return async await import export class extends new if else for while try catch true false null console document window',
 typescript: 'interface type implements readonly public private string number boolean unknown never',
 python: 'def class return import from as if elif else for while in try except with lambda True False None self',
 css: 'color background display flex grid margin padding width height border font-size align-items justify-content position',
 sql: 'SELECT FROM WHERE JOIN LEFT RIGHT INNER ON INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE ORDER BY GROUP LIMIT',
 java: 'public private protected static void class extends implements new return int String boolean if else for while',
 c: 'int char float double void return struct typedef const sizeof if else for while include',
 cpp: 'class public private namespace using std auto template vector string cout cin nullptr',
 csharp: 'using namespace class public private static void var string int bool async await return new',
 php: 'function echo return public private class new foreach as if else null true false',
 go: 'package import func return var const type struct interface range defer go make',
 rust: 'fn let mut pub use impl struct enum match return if else for while Some None',
 dart: 'void main class final const var String int double bool return if else async await Future',
 bash: 'echo cd export source if then else fi for do done function',
 powershell: 'Get-Item Get-ChildItem Write-Host Set-Location ForEach-Object Where-Object function param if else',
 json: 'true false null',
};
export function codeCompletions(language, context) {
  const word = context.matchBefore(/[\w!.-]*/);
  if (!word || (!word.text && !context.explicit)) return null;
  const options = [];
  if (language === 'html') {
    const before = context.state.sliceDoc(context.state.doc.lineAt(word.from).from, word.from);
    if (/^\s*$/.test(before)) {
      options.push(snippetCompletion(HTML_TEMPLATE, {label:'!', detail:'Estrutura HTML completa', type:'snippet'}));
      for (const tag of 'p div span h1 h2 h3 section main header footer nav article ul ol li a button form label textarea select option script style title body head html table tr td'.split(' ')) {
        options.push(snippetCompletion(`<${tag}>\u0024{}<\u002f${tag}>`, {label:tag, detail:`<${tag}>…</${tag}>`, type:'snippet'}));
      }
      for (const tag of ['img', 'input', 'br', 'hr', 'meta', 'link']) options.push(snippetCompletion(`<${tag} \u0024{}>`, {label:tag, type:'snippet'}));
    }
  }
  const base = language === 'typescript' ? 'javascript' : language;
  for (const [label, template] of snippets[base] || []) options.push(snippetCompletion(template,{label, type:'snippet'}));
  for (const label of `${keywords[base] || ''} ${keywords[language] || ''}`.split(/\s+/).filter(Boolean)) {
    if (!options.some(option => option.label === label)) options.push({label,type:'keyword'});
  }
  const words = completeAnyWord(context);
  for (const option of words?.options || []) if (!options.some(item => item.label === option.label)) options.push(option);
  return {from:word.from, options, validFor:/^[\w!.-]*$/};
}
