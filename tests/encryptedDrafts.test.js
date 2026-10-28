import test from 'node:test';
import assert from 'node:assert/strict';
import {createVault} from '../src/utils/notebookCrypto.js';
import {createEncryptedDraftStorage} from '../src/utils/encryptedStorage.js';
const vault=await createVault('Frase de teste para o cofre', {uid:'test',appId:'caderno-estudos'});
function memory(entries=[]){const map=new Map(entries);return {get length(){return map.size;},key:i=>[...map.keys()][i],getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};}
function session(){return {key:vault.key,identity:{uid:'test',appId:'caderno-estudos',keyId:vault.record.keyId}};}
test('draft storage converts only own legacy drafts and restores them after a new unlock',async()=>{
 const storage=memory([['note-draft:test:n:t','Privado <br> ação'],['note-draft:other:n:t','Outro usuário']]);
 const s=session();const drafts=await createEncryptedDraftStorage(storage,()=>s);
 assert.equal(drafts.getItem('note-draft:test:n:t'),'Privado <br> ação');
 assert.equal(storage.getItem('note-draft:other:n:t'),'Outro usuário');
 assert.equal(storage.getItem('note-draft:test:n:t').includes('Privado'),false);
 const restored=await createEncryptedDraftStorage(storage,()=>s);
 assert.equal(restored.getItem('note-draft:test:n:t'),'Privado <br> ação');
});
test('rapid edits are persisted in order and locked sessions cannot read or write drafts',async()=>{
 const storage=memory();let s=session();const drafts=await createEncryptedDraftStorage(storage,()=>s);
 const key='note-draft:test:n:t';const one=drafts.setItem(key,'primeira');const two=drafts.setItem(key,'última');
 await Promise.all([one,two]);await drafts.flush();
 const restored=await createEncryptedDraftStorage(storage,()=>s);assert.equal(restored.getItem(key),'última');
 s=null;assert.throws(()=>drafts.getItem(key));assert.throws(()=>drafts.setItem(key,'falha'));
});
test('corrupted draft blocks unlock instead of silently deleting the draft',async()=>{
 const storage=memory();const s=session();const key='note-draft:test:n:t';const drafts=await createEncryptedDraftStorage(storage,()=>s);
 await drafts.setItem(key,'Conteúdo');const raw=JSON.parse(storage.getItem(key));raw.envelope.ciphertext='AAAA';storage.setItem(key,JSON.stringify(raw));
 await assert.rejects(createEncryptedDraftStorage(storage,()=>s));assert.notEqual(storage.getItem(key),null);
});
test('storage failure keeps pending state and blocks lock until persistence succeeds',async()=>{
 const storage=memory();const s=session();const drafts=await createEncryptedDraftStorage(storage,()=>s);
 const original=storage.setItem;storage.setItem=()=>{throw new Error('Quota exceeded');};
 await assert.rejects(drafts.setItem('note-draft:test:n:t','Não perder'));
 await assert.rejects(drafts.flush());assert.equal(drafts.pending(),true);
 assert.equal(drafts.getItem('note-draft:test:n:t'),'Não perder');
 storage.setItem=original;await drafts.setItem('note-draft:test:n:t','Não perder');await drafts.flush();
 const restored=await createEncryptedDraftStorage(storage,()=>s);assert.equal(restored.getItem('note-draft:test:n:t'),'Não perder');
});
