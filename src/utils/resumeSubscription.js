// Renova uma assinatura ao retornar ao aplicativo, sem recarregar a página.
export function subscribeOnResume(subscribe, {
  windowTarget = window,
  documentTarget = document,
  now = Date.now,
} = {}) {
  let unsubscribe = () => {};
  let generation = 0;
  let lastSubscriptionAt = -Infinity;

  const start = () => {
    const currentGeneration = ++generation;
    unsubscribe();
    lastSubscriptionAt = now();
    unsubscribe = subscribe(() => currentGeneration === generation);
  };
  const resume = () => {
    if (documentTarget.visibilityState !== "visible") return;
    // Foco e visibilidade podem mudar juntos.
    if (now() - lastSubscriptionAt < 1000) return;
    start();
  };
  start();
  windowTarget.addEventListener("focus", resume);
  windowTarget.addEventListener("online", resume);
  documentTarget.addEventListener("visibilitychange", resume);
  return () => {
    generation++;
    unsubscribe();
    windowTarget.removeEventListener("focus", resume);
    windowTarget.removeEventListener("online", resume);
    documentTarget.removeEventListener("visibilitychange", resume);
  };
}
