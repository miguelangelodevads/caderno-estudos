import { escapeHtml, formatCodePaste, createMixedCodeBlock } from "./codeFormatting.js";
import { sanitizeHtmlContent } from "./sanitize.js";
import { normalizeTextColor } from "./textColor.js";

export function formatNotePaste(text, clipboardHtml = "") {
  const code = formatCodePaste(text, clipboardHtml);
  if (code) return code;
  // Texto comum usa somente o conteúdo e as quebras de linha da origem.
  return `<span>${escapeHtml(text.replace(/\r\n?/g, "\n")).replace(/\n/g, "<br>")}</span>`;
}

// A reserva de espaço pertence ao HTML de exibição, nunca a uma mutação feita
// pelo observador de tamanho. Assim o contenteditable não a desfaz a cada render.
export function decorateActiveCode(safeHtml, index, height) {
  if (!Number.isInteger(index) || index < 0 || !Number.isFinite(height) || typeof document === 'undefined') return safeHtml;
  const template = document.createElement('template');
  template.innerHTML = safeHtml;
  const block = template.content.querySelectorAll('pre.code-block')[index];
  if (block) {
    const size = `${Math.ceil(Math.max(128, height) / 32) * 32}px`;
    block.style.visibility = 'hidden';
    block.style.height = size;
    block.style.minHeight = size;
    block.style.overflow = 'hidden';
  }
  return template.innerHTML;
}

export function normalizeNoteHtml(html, { upgradeCodeBlocks = false } = {}) {
  const safe = sanitizeHtmlContent(html || "");
  if (typeof document === "undefined") return safe;
  const template = document.createElement("template");
  template.innerHTML = safe;
  template.content.querySelectorAll("*").forEach((element) => {
    const color = normalizeTextColor(element.getAttribute("data-text-color"));
    if (color && !element.closest("pre.code-block")) {
      element.setAttribute("data-text-color", color);
      element.style.cssText = `color: ${color};`;
    } else {
      element.removeAttribute("style");
      element.removeAttribute("data-text-color");
    }
    // Mantém somente as classes que dão cor aos blocos de código.
    if (!element.closest("pre.code-block")) element.removeAttribute("class");
  });
  if (upgradeCodeBlocks) {
    template.content.querySelectorAll("pre.code-block:not([data-code-mode])").forEach((block) => {
      const code = block.querySelector("code");
      const mixed = createMixedCodeBlock(code?.textContent || block.textContent, block.dataset.language);
      if (mixed) block.outerHTML = sanitizeHtmlContent(mixed);
      else block.dataset.codeMode = "code";
    });
  }
  return template.innerHTML;
}
