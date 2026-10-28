export function createAutosave(save, onStatus, delay = 700) {
  let timer;
  let latest;
  let inFlight;
  let closed = false;
  const status = (value) => { if (!closed) onStatus(value); };
  const flush = () => {
    clearTimeout(timer);
    if (inFlight) return inFlight.then((ok) => ok && latest ? flush() : ok);
    if (!latest) return Promise.resolve(true);
    const value = latest;
    latest = undefined;
    status("saving");
    inFlight = Promise.resolve().then(() => save(value)).then(() => {
      status(latest ? "pending" : "saved");
      return true;
    }, () => {
      latest ??= value;
      status("error");
      return false;
    }).finally(() => { inFlight = undefined; });
    return inFlight.then((ok) => ok && latest ? flush() : ok);
  };
  return {
    schedule(value) {
      latest = value;
      clearTimeout(timer);
      status("pending");
      timer = setTimeout(flush, delay);
    },
    flush,
    close() {
      closed = true;
      return flush();
    },
  };
}
