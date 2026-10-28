import { escapeHtml, formatCodePaste } from "./codeFormatting.js";
import { sanitizeHtmlContent } from "./sanitize.js";

export function formatNotePaste(text, clipboardHtml = "") {
  const code = formatCodePaste(text, clipboardHtml);
  if (code) return code;
  // Texto comum usa somente o conteúdo e as quebras de linha da origem.
  return `<span>${escapeHtml(text.replace(/\r\n?/g, "\n")).replace(/\n/g, "<br>")}</span>`;
}

export function normalizeNoteHtml(html) {
  const safe = sanitizeHtmlContent(html || "");
  if (typeof document === "undefined") return safe;
  const template = document.createElement("template");
  template.innerHTML = safe;
  template.content.querySelectorAll("*").forEach((element) => {
    element.removeAttribute("style");
    // Mantém somente as classes que dão cor aos blocos de código.
    if (!element.closest("pre.code-block")) element.removeAttribute("class");
  });
  return template.innerHTML;
}
