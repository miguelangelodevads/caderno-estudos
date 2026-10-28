import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc} from 'firebase/firestore';
import {writeFile,mkdir} from 'node:fs/promises';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8089')throw new Error('Somente emuladores locais.');
const email='cofre-teste@example.invalid',password='Login-local-de-teste-2026!';
let response=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});
let account=await response.json();
if(!response.ok){response=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});account=await response.json();}
if(!response.ok)throw new Error('Falha na conta do emulador.');
const uid=account.localId,base=`artifacts/caderno-estudos/users/${uid}`;
const env=await initializeTestEnvironment({projectId:'demo-caderno-billing'});
try{await env.withSecurityRulesDisabled(async c=>{
 const db=c.firestore();
 await setDoc(doc(db,base),{email,lifetimeAccess:true,accessCount:1});
 await setDoc(doc(db,`artifacts/caderno-estudos/access/${uid}`),{active:true,expiresAt:null});
 const notebookRef=doc(db,`${base}/notebooks/demo-notebook`);
 if(!(await getDoc(doc(db,`${base}/security/vault`))).exists() && !(await getDoc(notebookRef)).exists())await setDoc(notebookRef,{ownerUid:uid,title:'Caderno privado de teste',coverColor:'bg-teal-600',topics:[{id:'topic-1',title:'Anotações privadas',color:'bg-blue-400',notes:[{id:'note-1',title:'Texto preservado',content:'<span data-text-color="#2563eb" style="color:#2563eb">Anotação fictícia com cor.</span><br>Segunda linha.'}]}]});
});await mkdir(new URL('private/',import.meta.url),{recursive:true});await writeFile(new URL('private/encryption-test-account.json',import.meta.url),JSON.stringify({uid,email,password}));console.log('Conta fictícia e caderno local preparados; credenciais somente em billing/private.');}finally{await env.cleanup();}
