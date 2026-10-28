import ContentEditableModule from "react-contenteditable";
import { useEffect, useRef, useState } from "react";
import { createCodeBlock } from "../utils/codeFormatting.js";
import { formatNotePaste, normalizeNoteHtml } from "../utils/noteContent.js";
import { sanitizeHtmlContent } from "../utils/sanitize.js";
import { TEXT_COLORS, markEditorTextColors, normalizeTextColor } from "../utils/textColor.js";
import MobileTextColors from "./MobileTextColors.jsx";
import { createAutosave } from "../utils/autosave.js";

const ContentEditable = ContentEditableModule.default || ContentEditableModule;

export default function NoteEditor({ html, onChange, autoFocus = false, storageKey, ...props }) {
  const changeRef = useRef(onChange);
  const editorRef = useRef(null);
  const savedRangeRef = useRef(null);
  const colorRef = useRef(TEXT_COLORS[0].value);
  const [activeColor, setActiveColor] = useState(TEXT_COLORS[0].value);
  const [insideCode, setInsideCode] = useState(false);
  const [restoredDraft] = useState(() => {
    try { return storageKey ? localStorage.getItem(storageKey) : null; } catch { return null; }
  });
  const [draftHtml, setDraftHtml] = useState(restoredDraft);
  const [saveStatus, setSaveStatus] = useState("idle");
  const latestHtmlRef = useRef(restoredDraft ?? html);
  const autosaveRef = useRef(null);
  // Não substitui o que está sendo digitado por uma confirmação antiga da nuvem.
  if (draftHtml !== null && draftHtml === html && saveStatus === "saved") setDraftHtml(null);
  useEffect(() => { changeRef.current = onChange; }, [onChange]);
  useEffect(() => {
    const autosave = createAutosave(async (value) => {
      await changeRef.current(value);
      if (storageKey && latestHtmlRef.current === value) {
        try { localStorage.removeItem(storageKey); } catch { /* A nuvem continua disponível. */ }
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
  }, [storageKey, restoredDraft]);
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
  const emitChange = (editor) => {
    markEditorTextColors(editor, colorRef.current);
    const normalized = normalizeNoteHtml(editor.innerHTML);
    latestHtmlRef.current = normalized;
    if (storageKey) {
      try { localStorage.setItem(storageKey, normalized); } catch { /* O salvamento na nuvem continua. */ }
    }
    setDraftHtml(normalized);
    autosaveRef.current?.schedule(normalized);
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

  return <div className='note-editor-wrap min-w-0'>
    <MobileTextColors activeColor={activeColor} insideCode={insideCode} onApplyColor={applyColor}
      saveStatus={saveStatus} onRetry={() => autosaveRef.current?.flush()} />
    <div role='toolbar' aria-label='Cores do texto' className='note-color-toolbar-desktop flex items-center flex-wrap gap-2 mb-2 font-sans text-xs text-slate-500'>
      <span>Cor do texto</span>
      {TEXT_COLORS.map((color) => <button key={color.value} type='button'
        aria-label={`Cor ${color.name.toLowerCase()}`} aria-pressed={activeColor === color.value}
        title={insideCode ? "As cores do código são automáticas" : color.name}
        disabled={insideCode} onMouseDown={(event) => event.preventDefault()}
        onClick={() => applyColor(color.value)}
        className={`w-5 h-5 rounded-full border border-white shadow-sm disabled:opacity-30 disabled:cursor-not-allowed ${activeColor === color.value ? "ring-2 ring-offset-2 ring-slate-400" : "hover:scale-110"}`}
        style={{ backgroundColor: color.value }} />)}
      <label className='flex items-center gap-1 cursor-pointer'>
        <span>Outra cor</span>
        <input type='color' aria-label='Cor personalizada' value={activeColor} disabled={insideCode}
          onChange={(event) => applyColor(event.target.value)}
          className='w-6 h-6 cursor-pointer border-0 bg-transparent p-0 disabled:opacity-30' />
      </label>
    </div>
    <ContentEditable {...props} innerRef={editorRef} html={normalizeNoteHtml(draftHtml ?? html, { upgradeCodeBlocks: true })}
      onChange={() => emitChange(editorRef.current)}
      onPaste={handlePaste} onBlur={handleBlur} spellCheck={false}
      role='textbox' aria-multiline='true' autoCapitalize='off' autoCorrect='off' />
  </div>;
}
