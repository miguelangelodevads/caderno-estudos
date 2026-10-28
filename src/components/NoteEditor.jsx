import ContentEditableModule from "react-contenteditable";
import { useEffect, useRef } from "react";
import { createCodeBlock } from "../utils/codeFormatting.js";
import { formatNotePaste, normalizeNoteHtml } from "../utils/noteContent.js";
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
    changeRef.current(normalizeNoteHtml(editor.innerHTML));
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
    if (editor.innerHTML !== previous) changeRef.current(normalizeNoteHtml(editor.innerHTML));
  };

  return <div className='note-editor-wrap min-w-0'>
    <ContentEditable {...props} innerRef={editorRef} html={normalizeNoteHtml(html, { upgradeCodeBlocks: true })}
      onChange={(event) => changeRef.current(normalizeNoteHtml(event.target.value))}
      onPaste={handlePaste} onBlur={handleBlur} spellCheck={false} />
  </div>;
}
