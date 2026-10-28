import { useState } from "react";
import { ChevronDown, Palette } from "lucide-react";
import { TEXT_COLORS } from "../utils/textColor.js";

const keepSelection = (event) => event.preventDefault();

export default function MobileTextColors({ activeColor, insideCode, onApplyColor, saveStatus, onRetry, actions }) {
  const [open, setOpen] = useState(false);
  return <div className='note-color-toolbar-mobile'>
    <div className='mobile-color-toolbar-row'><button type='button' className='mobile-color-toggle' aria-label='Abrir cores do texto'
      aria-expanded={open} onPointerDown={keepSelection} onClick={() => setOpen((current) => !current)}>
      <Palette size={18} /> <span className='mobile-color-label'>Cor do texto</span>
      <span className='mobile-current-color' style={{ backgroundColor: activeColor }} />
      <ChevronDown size={16} className={open ? "rotate-180" : ""} />
    </button>
    {actions}
    <span role='status' aria-live='polite' className='mobile-note-save-status'>
      {{ idle: "Automático", pending: "Salvando…", saving: "Salvando…", saved: "Salvo", error: "Falha ao salvar" }[saveStatus]}
    </span>
    {saveStatus === "error" && <button type='button' className='mobile-save-retry' onPointerDown={keepSelection} onClick={onRetry}>Tentar</button>}
    </div>
    {open && <div role='toolbar' aria-label='Cores do texto no celular' className='mobile-color-panel'>
      {TEXT_COLORS.map((color) => <button key={color.value} type='button'
        className='mobile-color-swatch' aria-label={`Cor ${color.name.toLowerCase()}`}
        aria-pressed={activeColor === color.value} disabled={insideCode} title={color.name}
        onPointerDown={keepSelection}
        onClick={() => { onApplyColor(color.value); setOpen(false); }}>
        <span style={{ backgroundColor: color.value }} />
      </button>)}
      <label className='mobile-custom-color'>
        <span>Outra cor</span><input type='color' aria-label='Cor personalizada no celular'
          value={activeColor} disabled={insideCode} onChange={(event) => onApplyColor(event.target.value)} />
      </label>
    </div>}
    {open && insideCode && <p className='mobile-color-hint'>As cores do código são automáticas.</p>}
  </div>;
}
