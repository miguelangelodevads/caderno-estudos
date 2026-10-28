import hljs from "highlight.js/lib/common";

const explanationHeading = /^\s*(?:#{1,6}\s|\d+[.)]\s|(?:[-*•]\s)?(?:o que faz|o porqu[eê]|por qu[eê]|onde foi feito|onde fica|explicaç[aã]o|observaç[aã]o|nota|resumo|resultado|exemplo|o c[oó]digo|c[oó]digo|como funciona)\s*[:：])/i;
const codeSyntax = /^\s*(?:[{}()[\];,.]|(?:export\s+)?(?:const|let|var|function|class|interface|type|import|return|throw|if|else|for|while|switch|case|try|catch|finally|async|await|def|from|print|public|private|protected|package|func|fn|pub|use|select|where|join|order|group)\b|\/\/|\/\*|\*\s|#|--\s|<\/?[!a-z]|\w+(?:\.\w+)+\s*(?:\(|=)|\w+\s*\([^)]*\)\s*(?:=>|\{|;|$))/i;

function languageLabel(line) {
  const label = line.trim().replace(/^(?:\/\/|#|--|<!--)\s*/, "").replace(/\s*-->$/, "").toLowerCase();
  return /^[\w#+.-]+$/.test(label) && hljs.getLanguage(label) ? label : null;
}

function soundsLikeExplanation(line) {
  const words = line.match(/[\p{L}]+/gu) || [];
  if (words.length < 4) return false;
  return /\b(?:que|para|uma?|de|da|do|das|dos|essa?|esse|esta?|este|the|this|with|when|because)\b/i.test(line) &&
    !/^\s*["'`]/.test(line);
}

function scanCode(line, state) {
  if (line.trimStart().startsWith("<")) {
    for (const tag of line.matchAll(/<(\/?)([a-z][\w:-]*)\b[^>]*>/gi)) {
      if (/^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i.test(tag[2]) || tag[0].endsWith("/>")) continue;
      state.markupDepth = Math.max(0, state.markupDepth + (tag[1] ? -1 : 1));
    }
  }
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (state.blockComment) {
      if (line.startsWith("*/", i)) { state.blockComment = false; i++; }
      continue;
    }
    if (state.quote) {
      if (char === "\\") { i++; continue; }
      if (line.startsWith(state.quote, i)) { i += state.quote.length - 1; state.quote = ""; }
      continue;
    }
    if (line.startsWith("//", i)) break;
    if (line.startsWith("/*", i)) { state.blockComment = true; i++; continue; }
    if (line.startsWith('"""', i) || line.startsWith("'''", i)) {
      state.quote = line.slice(i, i + 3); i += 2; continue;
    }
    if (["'", '"', "`"].includes(char)) { state.quote = char; continue; }
    if ("{[(".includes(char)) state.depth++;
    if ("}])".includes(char)) state.depth = Math.max(0, state.depth - 1);
  }
}

// Classifica cada região antes de colorir: frases nunca entram no analisador de código.
export function splitMixedContent(text, isCode) {
  const segments = [];
  let fenced = false;
  let fenceMarker = "";
  let language;
  let activeCode = false;
  const state = { quote: "", blockComment: false, depth: 0, markupDepth: 0 };
  const add = (kind, line, currentLanguage = language) => {
    const previous = segments.at(-1);
    if (previous?.kind === kind && previous.language === currentLanguage) previous.text += `\n${line}`;
    else segments.push({ kind, text: line, language: currentLanguage });
  };
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const trimmed = line.trim();
    const fence = line.match(/^\s*(`{3,}|~{3,})([\w#+.-]*)\s*$/);
    if (fence && !state.quote && !state.blockComment) {
      if (!fenced) {
        fenced = true;
        fenceMarker = fence[1][0];
        language = fence[2]?.toLowerCase() || undefined;
        if (language) add("label", language, language);
      } else if (fence[1][0] === fenceMarker && !fence[2]) {
        fenced = false;
        state.depth = 0;
        activeCode = false;
      } else add("code", line);
      continue;
    }
    if (fenced) { add("code", line); continue; }
    if (state.quote || state.blockComment) { add("code", line); scanCode(line, state); continue; }
    const label = languageLabel(line);
    if (label) { language = label; add("label", line); activeCode = false; continue; }
    if (!trimmed) { add("blank", ""); continue; }
    if (/^\s*(?:\/\/|#\s|--\s|<!--.*-->\s*$)/.test(line)) {
      add("explanation", line);
      continue;
    }
    const heading = explanationHeading.test(line);
    const syntax = codeSyntax.test(line) || /^\s*[\w$]+(?:\.[\w$]+)*\s*=/.test(line) ||
      /^[.#:@&]?[\w.#>+~\s:-]+\s*\{\s*$/.test(line);
    const prose = state.markupDepth === 0 && (heading || (!syntax && soundsLikeExplanation(line)));
    const code = !prose && (syntax || isCode(line) || state.markupDepth > 0 || (activeCode && (state.depth > 0 || /^\s+\S/.test(line))));
    if (code) {
      add("code", line);
      scanCode(line, state);
      activeCode = true;
    } else {
      add("explanation", line);
      activeCode = false;
      state.depth = 0;
    }
  }
  return segments;
}
