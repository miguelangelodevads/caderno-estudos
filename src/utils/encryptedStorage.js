import {setDoc,runTransaction} from 'firebase/firestore';
import {encryptNotebook,decryptNotebook} from './notebookCrypto.js';

export function createNotebookGateway(getSession, enabled=false) {
  const required=()=>typeof enabled==='function'?enabled():enabled;
  const isNotebook=ref=>/\/notebooks\/[^/]+$/.test(ref.path);
  const session=()=>{const value=getSession();if(!value?.key)throw new Error('Desbloqueie o cofre antes de salvar.');return value;};
  const decode=async(ref,data)=>{
    if(!data)return data;
    if(data.encrypted){const s=session();return decryptNotebook(s.key,data.encrypted,s.identity,ref.id);}
    if(required() && getSession()?.phase==='active')throw new Error('Encontramos dados sem proteção. Retome a migração antes de continuar.');
    return data;
  };
  const encode=async(ref,data)=>{
    const s=getSession();
    if(!s){if(required())throw new Error('Cofre bloqueado.');return data;}
    const encrypted=await encryptNotebook(s.key,data,s.identity,ref.id);
    if(getSession()!==s)throw new Error('A sessão do cofre mudou. Tente novamente.');
    return {ownerUid:s.identity.uid,encrypted};
  };
  return {
    decode,
    async setDoc(ref,data){await setDoc(ref,await encode(ref,data));},
    async runTransaction(db,callback){
      return runTransaction(db,async transaction=>{
        const pending=[]; const source=new Map();
        const wrapped={
          async get(ref){const snapshot=await transaction.get(ref);const raw=snapshot.data();const data=isNotebook(ref)?await decode(ref,raw):raw;source.set(ref.path,data);return {exists:()=>snapshot.exists(),data:()=>data,id:snapshot.id,ref:snapshot.ref};},
          set(ref,value,...options){if(!isNotebook(ref)){transaction.set(ref,value,...options);return;}pending.push({ref,value});},
          update(ref,value){if(!isNotebook(ref)){transaction.update(ref,value);return;}if(!source.has(ref.path))throw new Error('Leia o caderno antes de atualizá-lo.');pending.push({ref,value:{...source.get(ref.path),...value}});},
          delete(ref){transaction.delete(ref);},
        };
        const result=await callback(wrapped);
        for(const write of pending)transaction.set(write.ref,await encode(write.ref,write.value));
        return result;
      });
    },
  };
}

// Synchronous reads come only from unlocked memory. Persistent values are encrypted.
export async function createEncryptedDraftStorage(storage,getSession) {
  const s=getSession();if(!s)throw new Error('Cofre bloqueado.');
  const cache=new Map();let tail=Promise.resolve();let pending=0;let lastError=null;
  const prefix=`note-draft:${s.identity.uid}:`;
  const current=()=>{if(getSession()!==s)throw new Error('Cofre bloqueado.');};
  const enqueue=job=>{pending++;const task=tail.catch(()=>{}).then(job);tail=task;task.then(()=>{lastError=null;},error=>{lastError=error;}).finally(()=>{pending--;});return task;};
  const api={
    getItem(key){current();return cache.get(key)??null;},
    setItem(key,value){current();if(!key.startsWith(prefix))throw new Error('Rascunho de outra conta.');cache.set(key,value);return enqueue(async()=>{
      current();const envelope=await encryptNotebook(s.key,{value},s.identity,key);current();storage.setItem(key,JSON.stringify({e2eeDraft:1,envelope}));
    });},
    removeItem(key){current();if(!key.startsWith(prefix))throw new Error('Rascunho de outra conta.');cache.delete(key);return enqueue(()=>{current();storage.removeItem(key);});},
    async flush(){await tail;if(lastError)throw lastError;},
    pending:()=>pending>0||!!lastError,
    clearMemory(){cache.clear();},
  };
  const keys=Array.from({length:storage.length},(_,i)=>storage.key(i)).filter(key=>key?.startsWith(prefix));
  for(const key of keys){
    const raw=storage.getItem(key);let record;try{record=JSON.parse(raw);}catch{/* Legacy content can be raw HTML. */}
    if(record?.e2eeDraft===1){const data=await decryptNotebook(s.key,record.envelope,s.identity,key);if(typeof data.value!=='string')throw new Error('Rascunho inválido.');cache.set(key,data.value);}
    else await api.setItem(key,raw);
  }
  return api;
}
