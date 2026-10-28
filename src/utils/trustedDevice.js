import {signInWithCustomToken} from 'firebase/auth';
import {wrapVaultForDevice,unlockVaultFromDevice} from './notebookCrypto.js';
const LOCAL_TEST=import.meta.env.DEV&&import.meta.env.VITE_USE_FIREBASE_EMULATORS==='true';
const API=LOCAL_TEST?'http://127.0.0.1:5175':import.meta.env.VITE_DEVICE_API_URL;
const starting=new Map();
const encoder=new TextEncoder();
const base64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
async function item(uid,operation,value){
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open('caderno-device-keys-v1',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('keys');
  request.onerror=()=>reject(new Error('Não foi possível guardar a identidade deste aparelho.'));
  request.onsuccess=()=>{const db=request.result,tx=db.transaction('keys',operation==='get'?'readonly':'readwrite'),store=tx.objectStore('keys');let result;
   const query=operation==='get'||operation==='ensure'?store.get(uid):operation==='delete'?store.delete(uid):store.put(value,uid);
   query.onsuccess=()=>{result=query.result;if(operation==='ensure'&&!result){store.put(value,uid);result=value;}};tx.oncomplete=()=>{db.close();resolve(result);};tx.onerror=()=>{db.close();reject(new Error('Este navegador não conseguiu guardar a chave do aparelho.'));};tx.onabort=tx.onerror;
  };
 });
}
export function browserDeviceLabel(){
 const ua=navigator.userAgent;
 const browser=/Edg\//.test(ua)?'Edge':/Firefox\//.test(ua)?'Firefox':/Chrome\//.test(ua)?'Chrome':'Navegador';
 const platform=/Android/.test(ua)?'Android':/iPhone|iPad/.test(ua)?'iPhone/iPad':/Windows/.test(ua)?'Windows':/Mac/.test(ua)?'Mac':'Computador';
 return `${browser} · ${platform}`;
}
export async function createDeviceClient(auth,user){
 const id=auth.app.name+':'+user.uid;
 if(starting.has(id))return starting.get(id);
 const pending=startDeviceClient(auth,user).finally(()=>starting.delete(id));starting.set(id,pending);return pending;
}
async function startDeviceClient(auth,user,retried=false){
 if(!LOCAL_TEST){let url;try{url=new URL(API);}catch{throw new Error('Proteção dos aparelhos em preparação.');}if(url.protocol!=='https:')throw new Error('A confirmação do aparelho exige uma conexão segura.');}
 const uid=user.uid;let device=await item(`identity:${uid}`,'get');
 if(!device){const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);device=await item(`identity:${uid}`,'ensure',{id:'d_'+crypto.randomUUID(),privateKey:pair.privateKey,publicKey:await crypto.subtle.exportKey('jwk',pair.publicKey)});}
 const request=async(path,body)=>{
  if(auth.currentUser?.uid!==uid)throw new Error('A conta mudou.');
  let response;try{response=await fetch(API+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await auth.currentUser.getIdToken()}`},body:JSON.stringify(body),cache:'no-store'});}catch{throw new Error('Não foi possível confirmar o aparelho. Confira a conexão e tente novamente.');}
  const data=await response.json();if(!response.ok){const error=new Error(data.error||'Falha ao confirmar este aparelho.');error.status=response.status;throw error;}return data;
 };
 const call=async(purpose,payload={})=>{
  const c=await request('/challenge',{deviceId:device.id,purpose});
  const hash=await crypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify(payload)));
  const message=encoder.encode(JSON.stringify(['caderno-device-v1',uid,device.id,purpose,c.nonce,base64(hash)]));
  const signature=base64(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},device.privateKey,message));
  return request('/'+purpose,{deviceId:device.id,challengeId:c.challengeId,signature,payload});
 };
 try{const response=await call('session',{publicKey:device.publicKey,label:browserDeviceLabel()});await signInWithCustomToken(auth,response.customToken);}
 catch(e){if(e.status===410){await item(`identity:${uid}`,'delete');await item(`remember:${uid}:${device.id}`,'delete');const token=await auth.currentUser.getIdTokenResult();if(!retried&&token.claims.firebase?.sign_in_provider==='password'&&Date.now()/1000-token.claims.auth_time<300)return startDeviceClient(auth,auth.currentUser,true);}throw e;}
 const localName=`remember:${uid}:${device.id}`;
 return {
  id:device.id,
  async trust(record,secret,recovery,label){
   const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
   await item(localName,'put',{key,keyId:record.keyId});
   const stored=await item(localName,'get');if(!stored?.key||stored.key.extractable)throw new Error('Não foi possível proteger a chave neste navegador.');
   const envelope=await wrapVaultForDevice(record,secret,recovery,{uid,appId:record.appId},device.id,stored.key);
   await call('trust',{keyId:record.keyId,envelope,label});
  },
  async restore(record){
   const stored=await item(localName,'get');if(!stored?.key||stored.keyId!==record.keyId)return null;
   try{const grant=await call('grant');return await unlockVaultFromDevice(record,grant,stored.key,{uid,appId:record.appId},device.id);}
   catch(e){if([404,410].includes(e.status))await item(localName,'delete');if(e.status===410)throw e;return null;}
  },
  async forget(){await item(localName,'delete');await call('forget').catch(()=>{});},
  clearLocal:()=>item(localName,'delete'),
  revoke:targetId=>call('revoke',{targetId}),
 };
}
