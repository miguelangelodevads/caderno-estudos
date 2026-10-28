import { useEffect, useRef } from "react";
import { ArrowUp, ArrowDown, Edit2, Trash2, MoreHorizontal } from "lucide-react";

export default function NoteActions({ index, count, title, onMove, onEdit, onDelete, mobile = false }) {
  const menuRef = useRef(null);
  useEffect(() => {
    if (!mobile) return;
    const closeOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) menuRef.current.open = false;
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && menuRef.current?.open) {
        menuRef.current.open = false;
        menuRef.current.querySelector("summary").focus();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobile]);
  const actions = [
    ...(index > 0 ? [{ label: "Mover para cima", Icon: ArrowUp, run: () => onMove(index, "up") }] : []),
    ...(index < count - 1 ? [{ label: "Mover para baixo", Icon: ArrowDown, run: () => onMove(index, "down") }] : []),
    { label: "Editar título", Icon: Edit2, run: onEdit },
    { label: "Excluir anotação", Icon: Trash2, run: onDelete },
  ];
  if (mobile) return <details ref={menuRef} className="mobile-note-menu"
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }}>
    <summary role="button" aria-label={`Ações de ${title}`} title="Ações da anotação"><MoreHorizontal size={20} /></summary>
    <div className="mobile-note-menu-panel" role="group" aria-label={`Ações de ${title}`}>
      {actions.map(({ label, Icon, run }) => <button type="button" key={label} aria-label={label}
        onClick={() => { menuRef.current.open = false; run(); }}>
        <Icon size={17} /><span>{label}</span>
      </button>)}
    </div>
  </details>;
  return <div className="note-actions flex self-start opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity bg-white/80 rounded-md shadow-sm border border-slate-100">
    {actions.map(({ label, Icon, run }, position) => <div className="flex" key={label}>
      {position > 0 && <div className="w-px bg-slate-200" />}
      <button type="button" onClick={run} aria-label={`${label} ${title}`} title={label}
        className={`p-1.5 md:p-2 text-slate-400 transition-colors ${label === "Excluir anotação" ? "hover:text-red-500" : "hover:text-blue-500"}`}>
        <Icon className="w-3 h-3 md:w-4 md:h-4" />
      </button>
    </div>)}
  </div>;
}
