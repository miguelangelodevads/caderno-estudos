import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {Buffer} from 'node:buffer';
import {createDeviceHandler,proofBytes} from '../billing/device-handler.mjs';
function fixture(){
 let clock=Date.now();const data=new Map();
 const ref=path=>({path,get:async()=>({exists:data.has(path),data:()=>data.get(path)}),update:async value=>data.set(path,{...data.get(path),...value}),collection:name=>({doc:id=>ref(path+'/'+name+'/'+id)})});
 const db={doc:ref,runTransaction:async cb=>cb({get:r=>r.get(),set:(r,v)=>data.set(r.path,v),update:(r,v)=>data.set(r.path,{...data.get(r.path),...v}),delete:r=>data.delete(r.path)})};
 const tokens={login:{uid:'owner',auth_time:Math.floor(clock/1000),firebase:{sign_in_provider:'password'}}};
 const auth={verifyIdToken:async t=>{if(!tokens[t])throw new Error('bad token');return tokens[t];},createCustomToken:async(uid,claims)=>{const t='session-'+claims.deviceId;tokens[t]={uid,...claims,auth_time:Math.floor(clock/1000),firebase:{sign_in_provider:'custom'}};return t;}};
 const handler=createDeviceHandler({auth,db,now:()=>clock});
 const request=async(path,body,token='login',origin='http://127.0.0.1:5174')=>{
  const req=Readable.from([Buffer.from(JSON.stringify(body))]);Object.assign(req,{method:'POST',url:path,headers:{authorization:'Bearer '+token,origin}});
  let status,headers,result;await handler(req,{writeHead:(s,h)=>{status=s;headers=h;},end:v=>{result=JSON.parse(v);}});return {status,headers,data:result};
 };
 const client=async()=>{const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);return{id:'d_'+crypto.randomUUID(),privateKey:pair.privateKey,publicKey:await crypto.subtle.exportKey('jwk',pair.publicKey)};};
 const signed=async(c,purpose,payload,token='login')=>{
  const challenge=await request('/challenge',{deviceId:c.id,purpose},token);assert.equal(challenge.status,200);
  const signature=Buffer.from(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},c.privateKey,await proofBytes('owner',c.id,purpose,challenge.data.nonce,payload))).toString('base64url');
  return {deviceId:c.id,challengeId:challenge.data.challengeId,signature,payload};
 };
 const call=async(c,purpose,payload,token)=>request('/'+purpose,await signed(c,purpose,payload,token),token);
 data.set('artifacts/caderno-estudos/access/owner',{active:true});
 return{data,tokens,request,client,signed,call,advance:n=>{clock+=n;}};
}
test('signed device sessions reject replay, forged proofs and registration from a custom session',async()=>{
 const f=fixture(),a=await f.client();const payload={publicKey:a.publicKey,label:'Meu notebook'};
 const body=await f.signed(a,'session',payload);const result=await f.request('/session',body);assert.equal(result.status,200);
 assert.equal((await f.request('/session',body)).status,403);
 const forged=await f.signed(a,'session',payload);forged.signature='AAAA';assert.equal((await f.request('/session',forged)).status,403);
 const b=await f.client();assert.equal((await f.call(b,'session',{publicKey:b.publicKey},result.data.customToken)).status,401);
 assert.equal((await f.request('/challenge',{deviceId:a.id,purpose:'session'},'login','https://evil.example')).status,403);
});
test('trust grant is private, remains valid without expiry and is deleted on revoke or forget',async()=>{
 const f=fixture(),a=await f.client(),b=await f.client();
 const ta=(await f.call(a,'session',{publicKey:a.publicKey,label:'A'})).data.customToken;
 const tb=(await f.call(b,'session',{publicKey:b.publicKey,label:'B'})).data.customToken;
 f.data.set('artifacts/caderno-estudos/users/owner/security/vault',{cryptoRecord:{keyId:'test-key'}});
 const payload={keyId:'test-key',envelope:{iv:'A'.repeat(16),ciphertext:'B'.repeat(64)},label:'Meu celular'};
 assert.equal((await f.call(b,'trust',payload,tb)).status,200);
 const grant=await f.call(b,'grant',{},tb);assert.equal(grant.status,200);assert.equal(grant.headers['Cache-Control'],'no-store');
 const revoke=await f.signed(a,'revoke',{targetId:b.id},ta);const changed={...revoke,payload:{targetId:a.id}};
 assert.equal((await f.request('/revoke',changed,ta)).status,403);
 assert.equal((await f.call(a,'revoke',{targetId:b.id},ta)).status,200);
 assert.equal((await f.call(b,'grant',{},tb)).status,410);
 assert.equal(f.data.has(`artifacts/caderno-estudos/users/owner/devices/${b.id}/grants/key`),false);
 assert.equal(f.data.get(`artifacts/caderno-estudos/users/owner/devices/${b.id}`).active,false);
 assert.equal((await f.call(a,'trust',payload,ta)).status,200);f.advance(3650*86400000);
 const permanent=await f.call(a,'grant',{},ta);assert.equal(permanent.status,200);assert.equal(permanent.data.expiresAt,null);
 assert.equal((await f.call(a,'forget',{},ta)).status,200);
 assert.equal((await f.call(a,'grant',{},ta)).status,404);
 // Old grants with a finite expiry keep their original deadline until reauthorized.
 f.data.set(`artifacts/caderno-estudos/users/owner/devices/${a.id}/grants/key`,{keyId:'test-key',envelope:payload.envelope,expiresAt:1});
 assert.equal((await f.call(a,'grant',{},ta)).status,404);
});
