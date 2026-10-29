import ContentEditableModule from "react-contenteditable";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CodeXml, Pencil, Trash2, X } from "lucide-react";
import { createCodeBlock } from "../utils/codeFormatting.js";
import { formatNotePaste, normalizeNoteHtml } from "../utils/noteContent.js";
import { sanitizeHtmlContent } from "../utils/sanitize.js";
import { TEXT_COLORS, markEditorTextColors, normalizeTextColor } from "../utils/textColor.js";
import { createAutosave } from "../utils/autosave.js";

const ContentEditable = ContentEditableModule.default || ContentEditableModule;

export default function NoteEditor({ html, onChange, autoFocus = false, storageKey, draftStorage=globalThis.localStorage, ...props }) {
  const changeRef = useRef(onChange);
  const editorRef = useRef(null);
  const savedRangeRef = useRef(null);
  const colorRef = useRef(TEXT_COLORS[0].value);
  const [activeColor, setActiveColor] = useState(TEXT_COLORS[0].value);
  const [insideCode, setInsideCode] = useState(false);
  const [codeDraft, setCodeDraft] = useState(null);
  const [codeCards, setCodeCards] = useState([]);
  const wrapRef = useRef(null);
  const codeDialogRef = useRef(null);
  const codeInputRef = useRef(null);
  const [restoredDraft] = useState(() => {
    try { return storageKey ? draftStorage.getItem(storageKey) : null; } catch { return null; }
  });
  const [draftHtml, setDraftHtml] = useState(restoredDraft);
  const [saveStatus, setSaveStatus] = useState("idle");
  const latestHtmlRef = useRef(restoredDraft ?? html);
  const autosaveRef = useRef(null);
  const codeDialogOpen = codeDraft !== null;
  useLayoutEffect(() => {
    const editor = editorRef.current;
    const wrap = wrapRef.current;
    if (!editor || !wrap) return;
    const measure = () => {
      const origin = wrap.getBoundingClientRect();
      setCodeCards([...editor.querySelectorAll('pre.code-block')].map((block) => {
        const rect = block.getBoundingClientRect();
        return { block, top: rect.top - origin.top, right: origin.right - rect.right };
      }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(editor);
    return () => observer.disconnect();
  }, [draftHtml, html]);
  useEffect(() => {
    if (codeDialogOpen) {
      codeDialogRef.current?.showModal();
      codeInputRef.current?.focus();
    } else codeDialogRef.current?.close();
  }, [codeDialogOpen]);
  // Não substitui o que está sendo digitado por uma confirmação antiga da nuvem.
  if (draftHtml !== null && draftHtml === html && saveStatus === "saved") setDraftHtml(null);
  useEffect(() => { changeRef.current = onChange; }, [onChange]);
  useEffect(() => {
    const autosave = createAutosave(async (value) => {
      await changeRef.current(value);
      if (storageKey && latestHtmlRef.current === value) {
        try { await draftStorage.removeItem(storageKey); } catch { /* A nuvem continua disponível. */ }
      }
    }, setSaveStatus);
    autosaveRef.current = autosave;
    if (restoredDraft !== null) {
      const normalized = normalizeNoteHtml(restoredDraft);
      latestHtmlRef.current = normalized;
      autosave.schedule(normalized);
    }
    const flush = () => { autosave.flush(); };
    window.addEventListener("online", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("online", flush);
      window.removeEventListener("pagehide", flush);
      autosave.close();
    };
  }, [storageKey, restoredDraft,draftStorage]);
  useEffect(() => {
    const rememberSelection = () => {
      const editor = editorRef.current;
      const selection = window.getSelection();
      if (!editor || !selection?.rangeCount || !editor.contains(selection.anchorNode) || !editor.contains(selection.focusNode)) return;
      const range = selection.getRangeAt(0);
      savedRangeRef.current = range.cloneRange();
      const inCode = [...editor.querySelectorAll("pre.code-block")].some((block) => range.intersectsNode(block));
      setInsideCode(inCode);
      if (!inCode) {
        const selectedColor = normalizeTextColor(document.queryCommandValue("foreColor"));
        if (selectedColor) {
          colorRef.current = selectedColor;
          setActiveColor(selectedColor);
        }
      }
    };
    document.addEventListener("selectionchange", rememberSelection);
    return () => document.removeEventListener("selectionchange", rememberSelection);
  }, []);
  useEffect(() => {
    if (autoFocus) editorRef.current?.focus();
  }, [autoFocus]);
  const emitChange = async (editor) => {
    markEditorTextColors(editor, colorRef.current);
    const normalized = normalizeNoteHtml(editor.innerHTML);
    latestHtmlRef.current = normalized;
    setDraftHtml(normalized);
    if (storageKey) {
      try { await draftStorage.setItem(storageKey, normalized); } catch { setSaveStatus('error'); }
    }
    if(latestHtmlRef.current===normalized)autosaveRef.current?.schedule(normalized);
  };
  const applyColor = (value) => {
    const color = normalizeTextColor(value);
    const editor = editorRef.current;
    if (!color || !editor) return;
    let range = savedRangeRef.current?.cloneRange();
    if (!range || !editor.contains(range.commonAncestorContainer)) {
      range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
    }
    if ([...editor.querySelectorAll("pre.code-block")].some((block) => range.intersectsNode(block))) return;
    editor.focus();
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    colorRef.current = color;
    setActiveColor(color);
    document.execCommand("styleWithCSS", false, true);
    document.execCommand("foreColor", false, color);
    emitChange(editor);
    if (selection.rangeCount) savedRangeRef.current = selection.getRangeAt(0).cloneRange();
  };
  const handlePaste = (event) => {
    const editor = event.currentTarget;
    const text = event.clipboardData.getData("text/plain");
    if (!text) return;
    const selection = window.getSelection();
    if (!selection?.rangeCount || !editor.contains(selection.anchorNode) || !editor.contains(selection.focusNode)) return;
    const anchor = selection.anchorNode.nodeType === 1
      ? selection.anchorNode : selection.anchorNode.parentElement;
    const insideCode = anchor.closest("pre");
    const formatted = insideCode ? null : formatNotePaste(text, event.clipboardData.getData("text/html"));
    event.preventDefault();
    // A inserção nativa preserva o cursor e o histórico de desfazer do editor.
    const insertion = insideCode ? text : sanitizeHtmlContent(formatted);
    if (!document.execCommand(insideCode ? "insertText" : "insertHTML", false, insertion)) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const fragment = insideCode ? document.createTextNode(text) : range.createContextualFragment(insertion);
      const last = fragment.lastChild || fragment;
      range.insertNode(fragment);
      range.setStartAfter(last);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    if (insideCode?.isConnected) {
      const code = insideCode.querySelector("code");
      const source = code ? code.innerText : insideCode.innerText;
      const template = document.createElement("template");
      template.innerHTML = sanitizeHtmlContent(createCodeBlock(source, undefined, { forceFormat: true }));
      const replacement = template.content.firstElementChild;
      insideCode.replaceWith(replacement);
      const caret = document.createRange();
      caret.selectNodeContents(replacement.querySelector("code") || replacement);
      caret.collapse(false);
      selection.removeAllRanges();
      selection.addRange(caret);
    }
    emitChange(editor);
  };

  const handleBlur = (event) => {
    if (codeDialogOpen) { autosaveRef.current?.flush(); return; }
    const editor = event.currentTarget;
    const previous = editor.innerHTML;
    // Recolore somente ao sair do editor, para não deslocar o cursor ao digitar.
    editor.querySelectorAll("pre.code-block").forEach((block) => {
      const code = block.querySelector("code");
      const text = code ? code.innerText : block.innerText;
      block.outerHTML = sanitizeHtmlContent(createCodeBlock(text, block.dataset.language));
    });
    if (editor.innerHTML !== previous) emitChange(editor);
    autosaveRef.current?.flush();
  };

  const openCode = (block = null) => {
    setCodeDraft({ block, text: block?.querySelector('code')?.innerText || '', language: block?.dataset.language || '' });
  };
  const saveCode = () => {
    const editor = editorRef.current;
    if (!editor || !codeDraft?.text.trim()) return;
    const template = document.createElement('template');
    template.innerHTML = sanitizeHtmlContent(createCodeBlock(codeDraft.text, codeDraft.language || undefined));
    const block = template.content.firstElementChild;
    if (codeDraft.block?.isConnected && editor.contains(codeDraft.block)) codeDraft.block.replaceWith(block);
    else {
      editor.append(block);
      const paragraph = document.createElement('p');
      paragraph.append(document.createElement('br'));
      editor.append(paragraph);
    }
    savedRangeRef.current = null;
    emitChange(editor);
    setCodeDraft(null);
    editor.focus();
    block.scrollIntoView({ block: 'nearest' });
  };
  const deleteCode = (block) => {
    if (!editorRef.current?.contains(block)) return;
    if (block.textContent.trim() && !window.confirm('Excluir este bloco de código? O restante da anotação será mantido.')) return;
    block.remove();
    savedRangeRef.current = null;
    emitChange(editorRef.current);
  };

  return <div ref={wrapRef} className='note-editor-wrap min-w-0 relative'>
    <div role='toolbar' aria-label='Cores do texto' className='note-color-toolbar-desktop flex items-center flex-wrap gap-2 mb-2 font-sans text-xs text-slate-500'>
      <span>Cor do texto</span>
      {TEXT_COLORS.map((color) => <button key={color.value} type='button'
        aria-label={`Cor ${color.name.toLowerCase()}`} aria-pressed={activeColor === color.value}
        title={insideCode ? "As cores do código são automáticas" : color.name}
        disabled={insideCode} onPointerDown={(event) => event.preventDefault()}
        onClick={() => applyColor(color.value)}
        className={`w-5 h-5 rounded-full border border-white shadow-sm disabled:opacity-30 disabled:cursor-not-allowed ${activeColor === color.value ? "ring-2 ring-offset-2 ring-slate-400" : "hover:scale-110"}`}
        style={{ backgroundColor: color.value }}><span style={{ backgroundColor: color.value }} /></button>)}
      <label className='flex items-center gap-1 cursor-pointer'>
        <span>Outra cor</span>
        <input type='color' aria-label='Cor personalizada' value={activeColor} disabled={insideCode}
          onChange={(event) => applyColor(event.target.value)}
          className='w-6 h-6 cursor-pointer border-0 bg-transparent p-0 disabled:opacity-30' />
      </label>
      <button type='button' className='note-add-code' aria-label='Escrever código' title='Escrever código'
        onPointerDown={(event) => event.preventDefault()} onClick={() => openCode()}><CodeXml size={20} /></button>
    </div>
    <ContentEditable {...props} innerRef={editorRef} html={normalizeNoteHtml(draftHtml ?? html, { upgradeCodeBlocks: true })}
      onChange={() => emitChange(editorRef.current)}
      onPaste={handlePaste} onBlur={handleBlur} spellCheck={false}
      role='textbox' aria-multiline='true' autoCapitalize='off' autoCorrect='off' />
    {codeCards.map(({ top, right }, index) => <div key={index} className='note-code-actions' style={{ top, right }}>
      <button type='button' onPointerDown={(event) => event.preventDefault()} aria-label={`Editar bloco de código ${index + 1}`} title='Editar código' onClick={() => openCode(editorRef.current?.querySelectorAll("pre.code-block")[index])}><Pencil size={16} /></button>
      <button type='button' onPointerDown={(event) => event.preventDefault()} aria-label={`Excluir bloco de código ${index + 1}`} title='Excluir código' onClick={() => deleteCode(editorRef.current?.querySelectorAll("pre.code-block")[index])}><Trash2 size={16} /></button>
    </div>)}
    <dialog ref={codeDialogRef} className='note-code-dialog' aria-labelledby={`${storageKey}-code-title`}
      onCancel={(event) => { event.preventDefault(); setCodeDraft(null); }}>
      {codeDraft !== null && <>
        <header><h2 id={`${storageKey}-code-title`}>Editor de código</h2><button type='button' aria-label='Fechar editor de código' onClick={() => setCodeDraft(null)}><X size={22} /></button></header>
        <label>Linguagem<select value={codeDraft.language} onChange={(event) => setCodeDraft({ ...codeDraft, language: event.target.value })}>
          <option value=''>Automática</option>
          {[...new Set(['javascript', 'typescript', 'html', 'css', 'python', 'json', 'sql', 'bash', 'powershell', 'java', 'c', 'cpp', 'csharp', 'php', 'go', 'rust', 'dart', codeDraft.language].filter(Boolean))].map((language) => <option key={language} value={language}>{language}</option>)}
        </select></label>
        <textarea ref={codeInputRef} aria-label='Código' value={codeDraft.text} placeholder='Escreva seu código aqui…' spellCheck={false} autoCapitalize='off' autoCorrect='off'
          onChange={(event) => setCodeDraft({ ...codeDraft, text: event.target.value })}
          onKeyDown={(event) => {
            if (event.key !== 'Tab' || event.shiftKey) return;
            event.preventDefault();
            const input = event.currentTarget;
            input.setRangeText('  ', input.selectionStart, input.selectionEnd, 'end');
            setCodeDraft({ ...codeDraft, text: input.value });
          }} />
        <footer><button type='button' onClick={() => setCodeDraft(null)}>Cancelar</button><button type='button' disabled={!codeDraft.text.trim()} onClick={saveCode}>Inserir e salvar código</button></footer>
      </>}
    </dialog>
    <div className={`mobile-editor-save ${saveStatus === "idle" ? "mobile-editor-save-idle" : ""}`} role='status' aria-live='polite'>
      {{ idle: "", pending: "Salvando…", saving: "Salvando…", saved: "Salvo", error: "Falha ao salvar" }[saveStatus]}
      {saveStatus === "error" && <button type='button' onPointerDown={(event) => event.preventDefault()} onClick={() => autosaveRef.current?.flush()}>Tentar novamente</button>}
    </div>
  </div>;
}
