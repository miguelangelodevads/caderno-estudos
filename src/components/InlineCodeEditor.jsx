import { useEffect, useRef, useState } from 'react';
import { basicSetup } from 'codemirror';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { acceptCompletion, autocompletion, completeFromList } from '@codemirror/autocomplete';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { tags } from '@lezer/highlight';
import { codeCompletions } from '../utils/codeCompletions.js';

const colors = HighlightStyle.define([
  {tag:tags.keyword,color:'#ff79c6'}, {tag:[tags.string,tags.regexp],color:'#f1fa8c'},
  {tag:[tags.number,tags.bool,tags.null],color:'#bd93f9'}, {tag:[tags.function(tags.variableName),tags.definition(tags.variableName)],color:'#50fa7b'},
  {tag:[tags.typeName,tags.tagName],color:'#8be9fd'}, {tag:tags.attributeName,color:'#50fa7b'},
  {tag:tags.comment,color:'#6272a4',fontStyle:'italic'},
  {tag:tags.operator,color:'#ff79c6'}, {tag:tags.propertyName,color:'#8be9fd'}, {tag:tags.meta,color:'#ff79c6'},
]);
const theme = EditorView.theme({
  '&':{backgroundColor:'#282a36',color:'#f8f8f2',fontSize:'16px'},
  '.cm-scroller':{fontFamily:'var(--font-mono)',lineHeight:'32px',overflow:'auto',maxHeight:'60dvh'},
  '.cm-content':{padding:'12px 0',minHeight:'128px',caretColor:'#f8f8f2'},
  '.cm-gutters':{backgroundColor:'#21222c',color:'#a4adcd',border:'none'},
  '.cm-activeLine, .cm-activeLineGutter':{backgroundColor:'#44475a55'},
  '&.cm-focused .cm-cursor':{borderLeftColor:'#f8f8f2'},
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection':{backgroundColor:'#6272a466'},
  '.cm-tooltip':{backgroundColor:'#21222c',color:'#f8f8f2',border:'1px solid #6272a4'},
  '.cm-tooltip-autocomplete > ul > li[aria-selected]':{backgroundColor:'#44475a',color:'#f8f8f2'},
},{dark:true});

export default function InlineCodeEditor({text, language, onChange, onHeight, onDone, onDelete}) {
  const host = useRef(null);
  const view = useRef(null);
  const languageSlot = useRef(new Compartment());
  const completionSlot = useRef(new Compartment());
  const changeRef = useRef(onChange);
  const initial = useRef(text);
  const [loadError,setLoadError] = useState(false);
  useEffect(()=>{changeRef.current=onChange;},[onChange]);
  useEffect(()=>{
    const editor = new EditorView({parent:host.current,state:EditorState.create({doc:initial.current,extensions:[
      basicSetup,theme,syntaxHighlighting(colors),languageSlot.current.of([]),completionSlot.current.of([]),
      keymap.of([{key:'Tab',run:acceptCompletion},indentWithTab]),
      EditorView.contentAttributes.of({'aria-label':'Código',spellcheck:'false',autocapitalize:'off',autocorrect:'off'}),
      EditorView.updateListener.of(update=>{if(update.docChanged)changeRef.current(update.state.doc.toString());}),
    ]})});
    view.current=editor;
    editor.focus();
    return ()=>{view.current=null;editor.destroy();};
  },[]);
  useEffect(()=>{
    let alive=true;
    const editor=view.current;
    // Fonte adicional local; preserva as sugestões nativas das linguagens.
    editor.dispatch({effects:completionSlot.current.reconfigure(autocompletion({override:[
      context=>codeCompletions(language,context),
      context=>{
        const prefix=context.state.sliceDoc(context.state.doc.lineAt(context.pos).from,context.pos);
        if(language==='html' && /^\s*[\w!.-]+$/.test(prefix)) return null;
        for(const source of context.state.languageDataAt('autocomplete',context.pos)) {
          const result=(typeof source==='function'?source:completeFromList(source))(context);
          if(result) return result;
        }
        return null;
      },
    ]}))});
    const match=languages.find(item=>item.name.toLowerCase()===language || item.alias.includes(language));
    if (!match) {editor.dispatch({effects:languageSlot.current.reconfigure([])});return;}
    match.load().then(support=>{if(alive){setLoadError(false);editor.dispatch({effects:languageSlot.current.reconfigure(support)});}}).catch(()=>{if(alive)setLoadError(true);});
    return ()=>{alive=false;};
  },[language]);
  useEffect(()=>{
    const element=host.current.parentElement;
    let frame;
    const observer=new ResizeObserver(()=>{
      cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>onHeight(element.getBoundingClientRect().height));
    });
    observer.observe(element);
    return ()=>{observer.disconnect();cancelAnimationFrame(frame);};
  },[onHeight]);
  return <section className='inline-code-surface' aria-label='Editor de código na folha — tema Dracula'>
    <header><label><span className='sr-only'>Linguagem do código</span><select aria-label='Linguagem do código' value={language} onChange={event=>onChange(view.current.state.doc.toString(),event.target.value)}>
      {[...new Set(['html','javascript','typescript','css','python','json','sql','java','c','cpp','csharp','php','go','rust','dart','bash','powershell',language])].map(name=><option key={name} value={name}>{name}</option>)}
    </select></label><div><button type='button' onClick={onDone}>Concluir</button><button type='button' aria-label='Excluir bloco de código em edição' onClick={onDelete}>Excluir</button></div></header>
    <div ref={host} />
    {loadError && <p role='status'>Cores indisponíveis. Seu código continua sendo salvo; selecione a linguagem novamente para tentar.</p>}
    <p className='inline-code-hint'>Sugestões: Ctrl + Espaço · Aceitar: Tab ou Enter · HTML: p ou !</p>
  </section>;
}
