import createDOMPurify from "dompurify";

const domWindow = typeof window !== "undefined" ? window : globalThis;
const sanitizer = createDOMPurify(domWindow);

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
      "mark",
      "a",
    ],
    ALLOWED_ATTR: ["href", "target", "rel", "style"],
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
    ADD_ATTR: ["target"],
    FORBID_TAGS: ["script", "iframe", "object", "embed", "svg", "math"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
  });

  return clean || "";
}
