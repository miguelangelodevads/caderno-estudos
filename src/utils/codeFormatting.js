import hljs from "highlight.js/lib/common";
import powershell from "highlight.js/lib/languages/powershell";
import dart from "highlight.js/lib/languages/dart";

hljs.registerLanguage("powershell", powershell);
hljs.registerLanguage("dart", dart);

function isHtmlSource(code) {
  return /^\s*<!doctype\s+html\b/i.test(code) ||
    /^\s*<\/?[a-z][\w:-]*(?:\s[^<>]*|\s*\/?)>/i.test(code) ||
    (code.match(/<\/?[a-z][\w:-]*(?:\s[^<>]*|\s*\/?)>/gi) || []).length >= 2;
}

function languageHint(code) {
  if (isHtmlSource(code)) return "html";
  const hints = [
    ["python", /^\s*(?:def\s+\w+\(|from\s+[\w.]+\s+import\b|print\s*\(|class\s+\w+\s*:)/m],
    ["powershell", /^\s*(?:(?:Get|Set|New|Write|Invoke|Remove)-[A-Z]\w+|\$[\w:]+\s*=)/m],
    ["rust", /^\s*(?:pub\s+)?(?:fn|impl|trait)\s+\w+/m],
    ["go", /^\s*(?:package\s+\w+|func\s+\w+\s*\()/m],
    ["cpp", /(?:std::\w+|#\s*include\s*<iostream>|using\s+namespace\s+std)/],
    ["c", /^\s*(?:#\s*include\s*[<"]|(?:int|void)\s+main\s*\()/m],
    ["csharp", /(?:using\s+System\b|\bConsole\.WriteLine\s*\()/],
    ["typescript", /^\s*(?:interface\s+\w+|type\s+\w+\s*=|(?:const|let)\s+\w+\s*:\s*\w+)/m],
    ["javascript", /(?:^\s*(?:(?:export\s+)?(?:const|let|var)\s+\w+|(?:async\s+)?function\s*\w*\s*\()|\bconsole\.(?:log|warn|error)\s*\(|=>)/m],
    ["php", /<\?php\b/],
    ["ruby", /^\s*(?:puts\s+['"]|require\s*\(?['"])/m],
    ["sql", /^\s*(?:SELECT\b.+\bFROM|INSERT\s+INTO|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE|UPDATE\b.+\bSET)/im],
    ["css", /^\s*[.#:]?[\w*-]+[^{}]*\{\s*[\w-]+\s*:/m],
  ];
  for (const [language, pattern] of hints) if (pattern.test(code)) return language;
  if (/^\s*[{[]/.test(code)) {
    try { JSON.parse(code); return "json"; } catch { /* Não é JSON completo. */ }
  }
  return undefined;
}

export function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function highlight(code, language) {
  language ||= languageHint(code);
  if (language) {
    if (hljs.getLanguage(language)) {
      return { ...hljs.highlight(code, { language, ignoreIllegals: true }), language };
    }
    return { language: "texto", value: escapeHtml(code) };
  }
  // Evita analisar blocos enormes com todas as gramáticas.
  const detected = hljs.highlightAuto(code.slice(0, 10000));
  return detected.language
    ? { ...hljs.highlight(code, { language: detected.language, ignoreIllegals: true }), language: detected.language }
    : { language: "texto", value: escapeHtml(code) };
}

export function createCodeBlock(code, language) {
  const result = highlight(code, language?.toLowerCase());
  return `<pre class="code-block" data-language="${escapeHtml(result.language)}"><code class="hljs">${result.value}</code></pre>`;
}

export function looksLikeCode(text) {
  const value = text.trim();
  if (!value) return false;
  if (isHtmlSource(value)) return true;
  const signatures = [
    /^\s*(?:export\s+)?(?:const|let|var)\s+[\w$]+\s*[:=]/m,
    /^\s*[a-z_$][\w$]*(?:\.[\w$]+)*\s*=\s*(?:["'`\d[{(]|true\b|false\b|null\b|None\b)/im,
    /^\s*(?:async\s+)?function\s*[\w$]*\s*\([^)]*\)\s*\{/m,
    /^\s*(?:import\s+.+\s+from\s+['"]|(?:from\s+[\w.]+\s+)?import\s+[\w.]+\s*$)/m,
    /^\s*(?:def\s+\w+\s*\([^)]*\)|(?:if|for|while)\s+.+):\s*$/m,
    /^\s*(?:console\.(?:log|error|warn)|print|printf)\s*\(/m,
    /^\s*(?:public|private|protected)\s+(?:(?:static|async|final)\s+)*(?:class\s+\w+|\w+\s+\w+\s*\()/m,
    /^\s*<\/?[a-z][\w:-]*(?:\s+[^<>]*|\s*\/?)>/im,
    /^\s*[.#:]?[\w*-]+(?:[\s.:#>+~[\]="'\w-]*)\s*\{[\s\S]*[\w-]+\s*:/m,
    /^\s*(?:SELECT\s+.+\s+FROM|INSERT\s+INTO|CREATE\s+TABLE|UPDATE\s+\w+\s+SET|DELETE\s+FROM|ALTER\s+TABLE)\b/im,
    /^\s*(?:\$\s*)?(?:npm|npx|pnpm|yarn|git|pip|docker|curl|ls|cd|mkdir|chmod|sudo|apt|winget|dotnet|cargo)\s+[\w./~-]+/m,
    /^\s*#!\s*\/.*(?:sh|python|node)/m,
    /^\s*#\s*(?:include\s*[<"]|define\s+\w+)/m,
    /^\s*(?:std::\w+\s*(?:<<|\()|using\s+namespace\s+\w+\s*;|(?:return|throw)\s+.+;)/m,
    /^\s*(?:int|void|char|float|double|bool|auto)\s+\w+\s*\([^)]*\)\s*\{/m,
    /^\s*(?:(?:pub\s+)?(?:fn|struct|enum|trait|impl)|func|package)\s+\w+/m,
    /^\s*(?:class|interface|type|namespace|module)\s+\w+(?:\s*[<{=:]|\s+extends\b)/m,
    /^\s*(?:FROM\s+[\w./:-]+|RUN\s+\S+|COPY\s+\S+\s+\S+|CMD\s*\[)/m,
    /^\s*\$[\w:]+\s*=\s*.+/m,
    /^\s*(?:Get|Set|New|Remove|Write|Invoke|Select|ConvertTo|ConvertFrom)-[A-Z]\w+/m,
    /^\s*(?:require\s*\(?['"]|puts\s+['"]|use\s+[\w:]+;|echo\s+['"])/m,
    /^\s*(?:if\s+.+;?\s*then|for\s+\w+\s+in\s+.+;?\s*do|fi\s*$|done\s*$)/m,
  ];
  if (signatures.some((pattern) => pattern.test(value))) return true;
  if (/^[{[]/.test(value)) {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === "object" && parsed !== null;
    } catch { /* Pode ser um trecho incompleto; os demais sinais decidem. */ }
  }
  const codeLines = value.split("\n").filter((line) =>
    /(?:=>|===|!==|\w+\([^)]*\);?\s*$|^\s*[{}]\s*[,;]?\s*$|^\s*\w+(?:\.\w+)*\s*=\s*.+)/.test(line));
  if (codeLines.length >= 2 && codeLines.length >= value.split("\n").length / 2) return true;
  const structural = /[{};]|=>|^\s*[\w.-]+:\s*\n\s+\S|^\s*\[[\w.-]+\]\s*$/m.test(value);
  return structural && hljs.highlightAuto(value.slice(0, 10000)).relevance >= 5;
}

// Retorna null para manter a colagem normal de texto e formatação rica.
export function formatCodePaste(text, clipboardHtml = "") {
  const normalized = text.replace(/\r\n?/g, "\n");
  const fences = [...normalized.matchAll(/^```([\w#+.-]*)[^\S\n]*\n([\s\S]*?)^```[^\S\n]*(?=\n|$)/gm)];
  if (fences.length) {
    let html = "";
    let offset = 0;
    for (const match of fences) {
      const prose = normalized.slice(offset, match.index);
      if (prose) html += `<p>${escapeHtml(prose).replace(/\n/g, "<br>")}</p>`;
      html += createCodeBlock(match[2].replace(/\n$/, ""), match[1] || undefined);
      offset = match.index + match[0].length;
    }
    const tail = normalized.slice(offset);
    if (tail) html += `<p>${escapeHtml(tail).replace(/\n/g, "<br>")}</p>`;
    return `${html}<p><br></p>`;
  }
  if (/<(?:pre|code)\b/i.test(clipboardHtml) || looksLikeCode(normalized)) {
    return `${createCodeBlock(normalized)}<p><br></p>`;
  }
  return null;
}
