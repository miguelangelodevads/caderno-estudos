import ContentEditableModule from "react-contenteditable";
import { useEffect, useRef } from "react";
import { createCodeBlock, formatCodePaste } from "../utils/codeFormatting.js";
import { sanitizeHtmlContent } from "../utils/sanitize.js";

const ContentEditable = ContentEditableModule.default || ContentEditableModule;

export default function NoteEditor({ html, onChange, autoFocus = false, ...props }) {
  const changeRef = useRef(onChange);
  const editorRef = useRef(null);
  useEffect(() => { changeRef.current = onChange; }, [onChange]);
  useEffect(() => {
    if (autoFocus) editorRef.current?.focus();
  }, [autoFocus]);
  const handlePaste = (event) => {
    const editor = event.currentTarget;
    const text = event.clipboardData.getData("text/plain");
    if (!text) return;
    const selection = window.getSelection();
    if (!selection?.rangeCount || !editor.contains(selection.anchorNode) || !editor.contains(selection.focusNode)) return;
    const anchor = selection.anchorNode.nodeType === 1
      ? selection.anchorNode : selection.anchorNode.parentElement;
    const insideCode = anchor.closest("pre");
    const formatted = insideCode ? null : formatCodePaste(text, event.clipboardData.getData("text/html"));
    if (!insideCode && !formatted) return;
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
    changeRef.current(sanitizeHtmlContent(editor.innerHTML));
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
    if (editor.innerHTML !== previous) changeRef.current(sanitizeHtmlContent(editor.innerHTML));
  };

  const formatSelection = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    const hasSelection = selection?.rangeCount && !selection.isCollapsed &&
      editor.contains(selection.anchorNode) && editor.contains(selection.focusNode);
    const text = hasSelection ? selection.toString() : editor.innerText;
    if (!text.trim()) return;
    const anchor = selection?.anchorNode;
    const existingBlock = anchor && editor.contains(anchor)
      ? (anchor.nodeType === 1 ? anchor : anchor.parentElement).closest("pre.code-block")
      : null;
    if (existingBlock && hasSelection && existingBlock.contains(selection.focusNode)) {
      const code = existingBlock.querySelector("code");
      existingBlock.outerHTML = sanitizeHtmlContent(createCodeBlock(code?.innerText || existingBlock.innerText));
      changeRef.current(sanitizeHtmlContent(editor.innerHTML));
      return;
    }
    editor.focus();
    const range = hasSelection ? selection.getRangeAt(0) : document.createRange();
    if (!hasSelection) range.selectNodeContents(editor);
    selection.removeAllRanges();
    selection.addRange(range);
    const block = sanitizeHtmlContent(`${createCodeBlock(text)}<p><br></p>`);
    if (!hasSelection) {
      editor.innerHTML = block;
      const after = document.createRange();
      after.selectNodeContents(editor.lastElementChild || editor);
      after.collapse(false);
      selection.removeAllRanges();
      selection.addRange(after);
    } else if (!document.execCommand("insertHTML", false, block)) {
      range.deleteContents();
      range.insertNode(range.createContextualFragment(block));
    }
    changeRef.current(sanitizeHtmlContent(editor.innerHTML));
  };

  return <div className='note-editor-wrap min-w-0'>
    <ContentEditable {...props} innerRef={editorRef} html={sanitizeHtmlContent(html || "")}
    onChange={(event) => changeRef.current(sanitizeHtmlContent(event.target.value))}
    onPaste={handlePaste} onBlur={handleBlur} spellCheck={false} />
    <button type='button' onMouseDown={(event) => event.preventDefault()} onClick={formatSelection}
      title='Formata a seleção como código. Sem seleção, formata todo o texto desta anotação.'
      className='text-xs font-sans text-slate-500 hover:text-purple-700 underline mt-1'>
      Formatar como código
    </button>
  </div>;
}
