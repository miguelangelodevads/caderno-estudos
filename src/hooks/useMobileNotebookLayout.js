import { useEffect, useRef, useState } from "react";
import { MOBILE_LAYOUT_QUERY, mobileViewportMetrics } from "../utils/mobileViewport.js";

export function useMobileNotebookLayout({ active, menuOpen, onCloseMenu, contentKey }) {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_LAYOUT_QUERY).matches);
  const shellRef = useRef(null);
  const drawerRef = useRef(null);
  const menuButtonRef = useRef(null);
  const closeRef = useRef(onCloseMenu);
  useEffect(() => { closeRef.current = onCloseMenu; }, [onCloseMenu]);
  useEffect(() => {
    const media = window.matchMedia(MOBILE_LAYOUT_QUERY);
    const update = () => { setIsMobile(media.matches); if (!media.matches) closeRef.current(); };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!active || !isMobile || !shellRef.current) return;
    const shell = shellRef.current;
    const viewport = window.visualViewport;
    let baselineHeight = window.innerHeight;
    let baselineWidth = window.innerWidth;
    let frame;
    const update = () => {
      const element = document.activeElement;
      const editing = shell.contains(element) && element?.matches("input:not([type=color]), textarea, [contenteditable=true]");
      const visualHeight = viewport?.height ?? window.innerHeight;
      if (Math.abs(window.innerWidth - baselineWidth) > 100) {
        baselineHeight = window.innerHeight;
        baselineWidth = window.innerWidth;
      }
      if (!editing && visualHeight >= baselineHeight - 80) baselineHeight = visualHeight;
      const metrics = mobileViewportMetrics({
        layoutHeight: window.innerHeight, visualHeight, baselineHeight,
        scale: viewport?.scale ?? 1, editing,
      });
      shell.style.setProperty("--mobile-viewport-height", `${metrics.height}px`);
      shell.dataset.keyboardOpen = String(metrics.keyboardOpen);
      if (!editing || !metrics.keyboardOpen) return;
      const paper = element.closest(".notebook-paper, .notebook-topic-list");
      if (!paper) return;
      const selection = window.getSelection();
      if (element.isContentEditable && selection && !selection.isCollapsed) return;
      let rect = element.isContentEditable && selection?.rangeCount && element.contains(selection.anchorNode)
        ? selection.getRangeAt(0).getBoundingClientRect()
        : element.getBoundingClientRect();
      if (!rect.height) {
        const box = element.getBoundingClientRect();
        rect = { top: box.top, bottom: box.top + 32, height: 32 };
      }
      const bounds = paper.getBoundingClientRect();
      const topPadding = 12;
      if (rect.bottom > bounds.bottom - 20) paper.scrollTop += rect.bottom - bounds.bottom + 20;
      if (rect.top < bounds.top + topPadding) paper.scrollTop -= bounds.top + topPadding - rect.top;
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    const content = shell.querySelector(".notebook-paper-content");
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    if (content) resizeObserver?.observe(content);
    update();
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", schedule);
    document.addEventListener("selectionchange", schedule);
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", schedule);
      document.removeEventListener("selectionchange", schedule);
      shell.style.removeProperty("--mobile-viewport-height");
      delete shell.dataset.keyboardOpen;
    };
  }, [active, isMobile, contentKey]);

  useEffect(() => {
    if (!active || !isMobile || !menuOpen || !drawerRef.current) return;
    const drawer = drawerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => [...drawer.querySelectorAll("button:not([disabled]), input:not([disabled]), [tabindex='0']")]
      .filter((element) => element.getClientRects().length);
    focusable()[0]?.focus({ preventScroll: true });
    const onKeyDown = (event) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0];
      const last = elements.at(-1);
      if (!first) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    drawer.addEventListener("keydown", onKeyDown);
    const menuButton = menuButtonRef.current;
    return () => {
      document.body.style.overflow = previousOverflow;
      drawer.removeEventListener("keydown", onKeyDown);
      if (menuButton?.isConnected) menuButton.focus({ preventScroll: true });
    };
  }, [active, isMobile, menuOpen]);

  return { isMobile, shellRef, drawerRef, menuButtonRef };
}
