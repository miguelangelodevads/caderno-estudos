import test from 'node:test';
import assert from 'node:assert/strict';
import {createVault,unlockVault,recoverVault,changeVaultPassword,encryptNotebook,decryptNotebook,wrapVaultForDevice,unlockVaultFromDevice} from '../src/utils/notebookCrypto.js';

const identity={appId:'caderno-estudos',uid:'fake-user'};
const phrase='Uma frase longa só para teste!';
const notebook={title:'Meu caderno privado',topics:[{title:'Segredo',notes:[{title:'Código',content:'<pre>const ação = "Olá 🌎";</pre>'}]}]};
const vault=await createVault(phrase,identity);
const binding={...identity,keyId:vault.record.keyId};

test('encrypts titles, topics and HTML without storing plaintext or exporting session key',async()=>{
 const envelope=await encryptNotebook(vault.key,notebook,binding,'notebook-1');
 assert.doesNotMatch(JSON.stringify(envelope),/privado|Segredo|Olá/);
 assert.doesNotMatch(JSON.stringify(vault.record),new RegExp(vault.recoveryKey));
 assert.equal(JSON.stringify(vault.record).includes(phrase),false);
 assert.equal(vault.key.extractable,false);
 await assert.rejects(crypto.subtle.exportKey('raw',vault.key));
 assert.deepEqual(await decryptNotebook(vault.key,envelope,binding,'notebook-1'),notebook);
});
test('vault can unlock on another device using only the record and its passphrase',async()=>{
 const key=await unlockVault(JSON.parse(JSON.stringify(vault.record)),phrase,identity);
 const envelope=await encryptNotebook(vault.key,notebook,binding,'n1');
 assert.deepEqual(await decryptNotebook(key,envelope,binding,'n1'),notebook);
});
test('independent recovery key decrypts the existing notebook without the passphrase',async()=>{
 const key=await recoverVault(vault.record,vault.recoveryKey,identity);
 const envelope=await encryptNotebook(vault.key,notebook,binding,'n1');
 assert.deepEqual(await decryptNotebook(key,envelope,binding,'n1'),notebook);
});
test('wrong passphrase, recovery key, account and altered KDF cannot unlock',async()=>{
 await assert.rejects(unlockVault(vault.record,'Outra frase longa de teste!',identity));
 await assert.rejects(recoverVault(vault.record,'A'.repeat(43),identity));
 await assert.rejects(unlockVault(vault.record,phrase,{...identity,uid:'stranger'}));
 await assert.rejects(unlockVault({...vault.record,iterations:1},phrase,identity));
});
test('random IVs prevent repeated ciphertext and account/document binding rejects swapping',async()=>{
 const first=await encryptNotebook(vault.key,notebook,binding,'n1');
 const second=await encryptNotebook(vault.key,notebook,binding,'n1');
 assert.notEqual(first.iv,second.iv); assert.notEqual(first.ciphertext,second.ciphertext);
 await assert.rejects(decryptNotebook(vault.key,first,binding,'n2'));
 await assert.rejects(decryptNotebook(vault.key,first,{...binding,uid:'stranger'},'n1'));
 const tampered={...first,ciphertext:(first.ciphertext[0]==='A'?'B':'A')+first.ciphertext.slice(1)};
 await assert.rejects(decryptNotebook(vault.key,tampered,binding,'n1'));
});
test('large payloads and malformed envelopes fail without falling back to plaintext',async()=>{
 const text='texto'.repeat(160000);
 await assert.rejects(encryptNotebook(vault.key,{text},binding,'n1'));
 await assert.rejects(decryptNotebook(vault.key,{version:1,keyId:binding.keyId,iv:'bad',ciphertext:'bad'},binding,'n1'));
 await assert.rejects(createVault('curta',identity));
});
test('recovery changes the vault password without changing its data key',async()=>{
 const updated=await changeVaultPassword(vault.record,vault.recoveryKey,'Minha nova frase secreta de teste',identity);
 assert.equal(updated.keyId,vault.record.keyId);
 assert.deepEqual(updated.recoveryWrap,vault.record.recoveryWrap);
 await assert.rejects(unlockVault(updated,phrase,identity));
 const key=await unlockVault(updated,'Minha nova frase secreta de teste',identity);
 const encrypted=await encryptNotebook(vault.key,notebook,binding,'n1');
 assert.deepEqual(await decryptNotebook(key,encrypted,binding,'n1'),notebook);
});
test('a trusted-device wrapper cannot be unlocked with another device key or identifier',async()=>{
 const deviceKey=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 const another=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 const envelope=await wrapVaultForDevice(vault.record,phrase,false,identity,'device-a',deviceKey);
 const grant={keyId:vault.record.keyId,envelope};
 const key=await unlockVaultFromDevice(vault.record,grant,deviceKey,identity,'device-a');
 const content=await encryptNotebook(vault.key,notebook,binding,'n1');assert.deepEqual(await decryptNotebook(key,content,binding,'n1'),notebook);
 await assert.rejects(unlockVaultFromDevice(vault.record,grant,another,identity,'device-a'));
 await assert.rejects(unlockVaultFromDevice(vault.record,grant,deviceKey,identity,'device-b'));
});
