import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<!doctype html>');
globalThis.window=dom.window;globalThis.document=dom.window.document;
const {decorateActiveCode,normalizeNoteHtml}=await import('../src/utils/noteContent.js');
const source='<p>Texto</p><pre class="code-block" data-code-mode="code"><code>const a=1;</code></pre><p>Intervalo</p><pre class="code-block" data-code-mode="code"><code></code></pre>';
test('segundo bloco reserva altura estável sem modificar o primeiro ou o conteúdo salvo',()=>{
 const safe=normalizeNoteHtml(source);
 const decorated=decorateActiveCode(safe,1,225);
 const holder=document.createElement('div');holder.innerHTML=decorated;
 const blocks=holder.querySelectorAll('pre');
 assert.equal(blocks[0].style.visibility,'');
 assert.equal(blocks[1].style.visibility,'hidden');
 assert.equal(blocks[1].style.height,'256px');
 assert.equal(normalizeNoteHtml(decorated),safe);
 for(let i=0;i<20;i++) assert.equal(decorateActiveCode(normalizeNoteHtml(decorated),1,225),decorated);
 assert.equal(decorateActiveCode(safe,undefined,225),safe);
});
test('mudar o bloco ativo remove a reserva anterior, sem introduzir dados executáveis',()=>{
 const safe=normalizeNoteHtml(source);
 const result=decorateActiveCode(normalizeNoteHtml(decorateActiveCode(safe,0,1000)),1,200);
 const holder=document.createElement('div');holder.innerHTML=result;
 assert.equal(holder.querySelectorAll('pre')[0].getAttribute('style'),null);
 assert.equal(holder.querySelectorAll('pre')[1].style.height,'224px');
 assert.equal(decorateActiveCode(safe,1,NaN),safe);
});
test('código colado recebe exatamente uma linha editável acima e abaixo',()=>{
 const html=normalizeNoteHtml('<p>Texto</p><p><br></p><p><br></p><pre class="code-block"><code>const a=1;</code></pre><p><br></p><p><br></p><p>Fim</p>');
 const holder=document.createElement('div');holder.innerHTML=html;
 const block=holder.querySelector('pre');
 assert.equal(block.previousSibling.outerHTML,'<p><br></p>');
 assert.equal(block.previousSibling.previousSibling.textContent,'Texto');
 assert.equal(block.nextSibling.outerHTML,'<p><br></p>');
 assert.equal(block.nextSibling.nextSibling.textContent,'Fim');
 assert.equal(normalizeNoteHtml(html),html);
 const only=document.createElement('div');only.innerHTML=normalizeNoteHtml('<pre class="code-block"><code>print(1)</code></pre>');
 assert.equal(only.firstChild.outerHTML,'<p><br></p>');
 assert.equal(only.lastChild.outerHTML,'<p><br></p>');
});
test('blocos consecutivos compartilham uma linha e preservam o código literalmente',()=>{
 const html=normalizeNoteHtml('<pre class="code-block"><code>  a\n\n  b</code></pre><pre class="code-block"><code>c</code></pre>');
 const holder=document.createElement('div');holder.innerHTML=html;
 const blocks=holder.querySelectorAll('pre');
 assert.equal(blocks[0].nextSibling,blocks[1].previousSibling);
 assert.equal(blocks[0].textContent,'  a\n\n  b');
 assert.equal(normalizeNoteHtml(html),html);
});
test('digitar na linha existente não insere outro parágrafo nem desloca o cursor',()=>{
 const html='<p>Primeira letra</p><pre class="code-block"><code>x</code></pre><p>Depois</p>';
 const normalized=normalizeNoteHtml(html);
 assert.equal(normalized,html);
});
