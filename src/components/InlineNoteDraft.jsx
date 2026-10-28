import { useEffect, useRef, useState } from "react";
import { createAutosave } from "../utils/autosave.js";

export default function InlineNoteDraft({ initialValue, onSave, onDone, storageKey, noteId,draftStorage=globalThis.localStorage }) {
  const [value, setValue] = useState(initialValue);
  const [status, setStatus] = useState("idle");
  const saveRef = useRef(onSave);
  const autosaveRef = useRef(null);
  const latestRef = useRef(initialValue);
  useEffect(() => { saveRef.current = onSave; }, [onSave]);
  useEffect(() => {
    const autosave = createAutosave(async (next) => {
      await saveRef.current(next);
      if (latestRef.current === next) {
        try { await draftStorage.removeItem(storageKey); } catch { /* Armazenamento local opcional. */ }
      }
    }, setStatus);
    autosaveRef.current = autosave;
    try {
      if (JSON.parse(draftStorage.getItem(storageKey))?.id === noteId) autosave.schedule(initialValue);
    } catch { /* Rascunhos locais são opcionais. */ }
    const flush = () => { autosave.flush(); };
    window.addEventListener("online", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("online", flush);
      window.removeEventListener("pagehide", flush);
      autosave.close();
    };
  }, [storageKey, noteId, initialValue,draftStorage]);
  const change = async (field, text) => {
    const next = { ...latestRef.current, [field]: text };
    latestRef.current = next;
    setValue(next);
    try { await draftStorage.setItem(storageKey, JSON.stringify({ ...next, id: noteId })); } catch { setStatus('error'); }
    if(latestRef.current===next)autosaveRef.current?.schedule(next);
  };
  const finish = async () => {
    if (await autosaveRef.current.flush()) onDone();
  };
  return <section aria-label='Adicionar título' className='mb-6'>
    <input autoFocus aria-label='Título' placeholder='Digite o título e pressione Enter' enterKeyHint='done'
      value={value.title} onChange={(event) => change("title", event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") { event.preventDefault(); finish(); }
      }}
      onBlur={finish}
      className='note-title-input w-full bg-transparent border-0 border-b border-stone-400/50 outline-none focus:border-slate-600 font-serif font-bold text-xl md:text-2xl text-slate-800 placeholder:text-slate-400 pb-1'
      style={{ lineHeight: "2rem" }} />
    <span role='status' aria-live='polite' className={status === "error" ? "text-sm text-red-700" : "sr-only"}>
      {{ idle: "Salvamento automático", pending: "Alterações pendentes…", saving: "Salvando…", saved: "Salvo na nuvem", error: "Não foi possível salvar o título. Tente novamente." }[status]}
    </span>
    {status === "error" && <button onMouseDown={(event) => event.preventDefault()} onClick={finish} className='text-sm text-red-700 underline'>Tentar novamente</button>}
  </section>;
}
