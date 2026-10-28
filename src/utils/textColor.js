export const TEXT_COLORS = [
  { name: "Padrão", value: "#334155" },
  { name: "Vermelha", value: "#dc2626" },
  { name: "Laranja", value: "#c2410c" },
  { name: "Verde", value: "#15803d" },
  { name: "Azul", value: "#2563eb" },
  { name: "Roxa", value: "#7c3aed" },
  { name: "Rosa", value: "#be185d" },
];

// Aceita somente cores sólidas, nunca outros estilos copiados de fora do app.
export function normalizeTextColor(value) {
  if (typeof value !== "string") return null;
  const color = value.trim().toLowerCase();
  if (/^#[\da-f]{6}$/.test(color)) return color;
  if (/^#[\da-f]{3}$/.test(color)) return `#${[...color.slice(1)].map((digit) => digit + digit).join("")}`;
  const rgb = color.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/);
  if (!rgb) return null;
  const channels = rgb.slice(1).map(Number);
  return channels.every((channel) => channel <= 255)
    ? `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`
    : null;
}

export function markEditorTextColors(editor, activeColor) {
  editor.querySelectorAll("[style]").forEach((element) => {
    if (element.closest("pre.code-block")) return;
    const color = normalizeTextColor(element.style.color);
    const wasColored = normalizeTextColor(element.dataset.textColor);
    if (color && (color === activeColor || wasColored)) {
      element.dataset.textColor = color;
    } else if (wasColored && !color) {
      element.removeAttribute("data-text-color");
    }
  });
}
