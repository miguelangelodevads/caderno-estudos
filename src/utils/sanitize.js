import createDOMPurify from "dompurify";
import { normalizeTextColor } from "./textColor.js";

const domWindow = typeof window !== "undefined" ? window : globalThis;
const sanitizer = createDOMPurify(domWindow);

// Stored notes can predate the paste normalizer. Apply the same restrictions
// every time content is rendered, including legacy notes and restored drafts.
if (typeof sanitizer.addHook === "function") sanitizer.addHook("afterSanitizeAttributes", (node) => {
  if (!node.getAttribute) return;
  const color = normalizeTextColor(node.style?.color);
  node.removeAttribute("style");
  if (color) node.setAttribute("style", `color: ${color};`);
  if (node.tagName === "A") {
    const href = node.getAttribute("href");
    if (href && !/^(https?:|mailto:|\/|#|\.|\?)/i.test(href)) node.removeAttribute("href");
    if (node.getAttribute("target") === "_blank") node.setAttribute("rel", "noopener noreferrer");
    else node.removeAttribute("target");
  }
});

const stripDangerousPatterns = (value) =>
  String(value)
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, "")
    .replace(/<svg[\s\S]*?>[\s\S]*?<\/svg>/gi, "")
    .replace(/on\w+\s*=\s*("[^"]*"|'[^']*'|[\w\s]+)/gi, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/<\s*\/?\s*(script|iframe|object|embed|svg|math)[^>]*>/gi, "");

export function sanitizeHtmlContent(input) {
  if (!input) return "";

  if (typeof document === "undefined") {
    return stripDangerousPatterns(input).trim();
  }

  const clean = sanitizer.sanitize(input, {
    ALLOWED_TAGS: [
      "p",
      "div",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "ul",
      "ol",
      "li",
      "span",
      "font",
      "mark",
      "a",
      "pre",
      "code",
    ],
    ALLOWED_ATTR: ["href", "target", "rel", "style", "class", "data-language", "data-code-mode", "data-text-color"],
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
    ADD_ATTR: ["target"],
    FORBID_TAGS: ["script", "iframe", "object", "embed", "svg", "math"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
  });

  return clean || "";
}
