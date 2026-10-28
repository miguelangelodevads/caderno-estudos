export const MOBILE_LAYOUT_QUERY = "(max-width: 767px), (pointer: coarse) and (max-width: 1023px)";

export function mobileViewportMetrics({ layoutHeight, visualHeight, baselineHeight, scale = 1, editing = false }) {
  const layout = Number.isFinite(layoutHeight) ? layoutHeight : 600;
  // O zoom de acessibilidade deve continuar sob controle do navegador.
  const zoomed = Math.abs(scale - 1) > 0.05;
  const available = !zoomed && Number.isFinite(visualHeight) ? visualHeight : layout;
  return {
    height: Math.max(160, Math.round(available)),
    keyboardOpen: !zoomed && editing && (baselineHeight - available > 100 || available < 400),
  };
}
