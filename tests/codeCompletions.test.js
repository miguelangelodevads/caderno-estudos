import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';
import { codeCompletions } from '../src/utils/codeCompletions.js';
const result=(language,doc)=>codeCompletions(language,new CompletionContext(EditorState.create({doc}),doc.length,false));
test('HTML oferece tag com fechamento e estrutura inicial por !',()=>{
 const p=result('html','p').options.find(x=>x.label==='p');
 assert.equal(p.detail,'<p>…</p>');
 assert.equal(typeof p.apply,'function');
 assert.ok(result('html','!').options.some(x=>x.label==='!'));
 assert.equal(result('javascript','!').options.some(x=>x.label==='!'),false);
});
test('snippets e palavras de diferentes linguagens ficam disponíveis sem rede',()=>{
 for(const [language,label] of [['javascript','log'],['typescript','function'],['python','def'],['java','main'],['sql','select'],['rust','fn'],['css','rule'],['powershell','if']]) assert.ok(result(language,label).options.some(x=>x.label===label),language);
});
test('sugestões aproveitam nomes do documento e não expandem tag no meio de uma frase',()=>{
 assert.ok(result('javascript','const temperatura = 25;\ntem').options.some(x=>x.label==='temperatura'));
 assert.equal(result('html','Uma frase p').options.some(x=>x.label==='p'),false);
});
import { createEditableCodeBlock } from '../src/utils/codeFormatting.js';
test('edição manual colore sem reformatar e escapa HTML executável',()=>{
 const code='<p>Olá</p>\n<script>alert("teste")</script>';
 const html=createEditableCodeBlock(code,'html');
 assert.match(html,/hljs-tag/);
 assert.doesNotMatch(html,/<script\b/);
 const text=html.replace(/<[^>]+>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#x27;|&#39;/g,"'").replace(/&amp;/g,'&');
 assert.equal(text,code);
});
