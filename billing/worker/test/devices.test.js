import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handleDevices,deviceProof} from '../src/devices.js';
import {createDeviceToken,base64url,unbase64,verifyDeviceUser} from '../src/auth.js';
import {MemoryStore,env} from './helpers.js';

class DeviceStore extends MemoryStore {
    queue=Promise.resolve();
    atomic(action){const run=this.queue.then(async()=>{
        const writes=[];const result=await action({get:path=>this.get(path),put:(p,d)=>writes.push([p,d]),delete:p=>writes.push([p,null])});
        for(const[p,d]of writes){if(d)this.docs.set(p,structuredClone(d));else this.docs.delete(p);}return result;
    });this.queue=run.catch(()=>{});return run;}
}
async function fixture(){
    let clock=Date.now();
    const user={uid:'owner',firebase:{sign_in_provider:'password'},auth_time:Math.floor(clock/1000)};
    const store=new DeviceStore([['access/owner',{active:true}],['users/owner/security/vault',{phase:'active',cryptoRecord:{keyId:'vault-key'}}]]);
    const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
    const deviceId='d_'+crypto.randomUUID(),publicKey=await crypto.subtle.exportKey('jwk',pair.publicKey);
    const dependencies={now:()=>clock,verifyDeviceUser:async()=>user,createDeviceToken:async(_env,uid,id)=>`signed:${uid}:${id}`};
    const call=(path,body,overrides={})=>handleDevices(new Request('https://devices.example/devices/'+path,{method:path==='status'?'GET':'POST',headers:{Authorization:'Bearer test'}}),env,store,body,{...dependencies,...overrides});
    const prepare=async(purpose,payload={})=>{
        const c=await call('challenge',{deviceId,purpose});
        return {deviceId,challengeId:c.challengeId,payload,signature:base64url(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},pair.privateKey,await deviceProof(user.uid,deviceId,purpose,c.nonce,payload)))};
    };
    const session=async()=>{const result=await call('session',await prepare('session',{publicKey,label:'Meu aparelho'}));user.deviceId=deviceId;user.firebase.sign_in_provider='custom';return result;};
    const resumeProof=async(payload={issuedAt:clock},requestId=crypto.randomUUID())=>({deviceId,requestId,payload,
        signature:base64url(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},pair.privateKey,await deviceProof(user.uid,deviceId,'resume',requestId,payload)))});
    return {user,store,deviceId,call,prepare,session,resumeProof,advance:ms=>{clock+=ms;}};
}
test('fast resume releases only the encrypted grant and rejects replay across instances',async()=>{
 const f=await fixture();await f.session();
 const grant={keyId:'vault-key',envelope:{iv:'a'.repeat(16),ciphertext:'b'.repeat(64)},expiresAt:null};
 f.store.docs.set('users/owner/devices/'+f.deviceId+'/grants/key',grant);
 const proof=await f.resumeProof();
 assert.deepEqual(await f.call('resume',proof),{grant});
 await assert.rejects(f.call('resume',proof),{status:403});
 const concurrent=await f.resumeProof();
 const results=await Promise.allSettled([f.call('resume',concurrent),f.call('resume',concurrent)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(results.find(r=>r.status==='rejected').reason.status,403);
});
test('fast resume rejects revoked devices, unpaid accounts, wrong claims and forged proofs',async()=>{
 const f=await fixture();await f.session();
 const proof=await f.resumeProof();
 await assert.rejects(f.call('resume',{...proof,payload:{issuedAt:proof.payload.issuedAt+1}}),{status:403});
 f.user.deviceId='d_other';await assert.rejects(f.call('resume',proof),{status:401});f.user.deviceId=f.deviceId;
 f.store.docs.set('access/owner',{active:false});await assert.rejects(f.call('resume',proof),{status:403});f.store.docs.set('access/owner',{active:true});
 const path='users/owner/devices/'+f.deviceId;
 f.store.docs.set(path,{...f.store.docs.get(path),active:false});await assert.rejects(f.call('resume',proof),{status:410});
});
test('fast resume clock window, missing grant and expired grant fail closed',async()=>{
 const f=await fixture();await f.session();
 const proof=await f.resumeProof();f.advance(120001);await assert.rejects(f.call('resume',proof),{status:422});
 assert.deepEqual(await f.call('resume',await f.resumeProof()),{grant:null});
 f.store.docs.set('users/owner/devices/'+f.deviceId+'/grants/key',{expiresAt:0,envelope:{ciphertext:'not returned'}});
 assert.deepEqual(await f.call('resume',await f.resumeProof()),{grant:null});
 const ahead=await f.resumeProof({issuedAt:proof.payload.issuedAt+240000});
 await f.call('resume',ahead);f.advance(119998);await assert.rejects(f.call('resume',ahead),{status:403});
});
test('fast resume has a persistent per-account rate limit',async()=>{
 const f=await fixture();await f.session();
 for(let i=0;i<60;i++)await f.call('resume',await f.resumeProof());
 await assert.rejects(f.call('resume',await f.resumeProof()),{status:429});
 f.advance(60001);assert.deepEqual(await f.call('resume',await f.resumeProof()),{grant:null});
});
test('production devices: signed session, indefinite encrypted grant, forget and revoke',async()=>{
    const f=await fixture();assert.deepEqual(await f.call('status'),{hasVault:true});
    assert.match((await f.session()).customToken,/^signed:owner:d_/);
    const payload={keyId:'vault-key',envelope:{iv:'a'.repeat(16),ciphertext:'b'.repeat(64)}};
    await f.call('trust',await f.prepare('trust',payload));
    f.advance(10*365*86400000);
    assert.deepEqual(await f.call('grant',await f.prepare('grant')),{...payload,expiresAt:null});
    await f.call('forget',await f.prepare('forget'));
    await assert.rejects(f.call('grant',await f.prepare('grant')),{status:404});
    await f.call('revoke',await f.prepare('revoke',{targetId:f.deviceId}));
    await assert.rejects(f.call('session',await f.prepare('session')),{status:410});
});
test('production devices: challenges survive instances and are consumed atomically once',async()=>{
    const f=await fixture();await f.session();
    const proof=await f.prepare('forget');
    const results=await Promise.allSettled([f.call('forget',proof),f.call('forget',proof)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(results.find(r=>r.status==='rejected').reason.status,403);
    const expired=await f.prepare('forget');f.advance(60001);
    await assert.rejects(f.call('forget',expired),{status:403});
});
test('production devices: altered payloads, cross-account replay and stale enrolment fail',async()=>{
    const f=await fixture();
    f.advance(301000);await assert.rejects(f.session(),{status:401});
    f.user.auth_time=Math.floor(Date.now()/1000)+301;await f.session();
    const proof=await f.prepare('revoke',{targetId:f.deviceId});proof.payload.targetId='d_'+crypto.randomUUID();
    await assert.rejects(f.call('revoke',proof),{status:403});
    const valid=await f.prepare('forget');f.user.uid='victim';f.store.docs.set('access/victim',{active:true});
    await assert.rejects(f.call('forget',valid),{status:403});
});
test('production devices: paid access, device claim, per-account rate limit and vault key required',async()=>{
    const f=await fixture();await f.session();
    const proof=await f.prepare('forget');f.user.deviceId='different';
    await assert.rejects(f.call('forget',proof),{status:401});f.user.deviceId=f.deviceId;
    await assert.rejects(f.call('trust',await f.prepare('trust',{keyId:'wrong',envelope:{iv:'a'.repeat(16),ciphertext:'b'.repeat(64)}})),{status:400});
    f.store.docs.set('access/owner',{active:false});await assert.rejects(f.call('status'),{status:403});f.store.docs.set('access/owner',{active:true});
    for(let i=0;i<8;i++)await f.call('challenge',{deviceId:f.deviceId,purpose:'session'});
    await assert.rejects(f.call('challenge',{deviceId:f.deviceId,purpose:'session'}),{status:429});
});
test('device custom tokens use the service identity, five-minute expiry and device-only claims',async()=>{
    const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
    const privateKey='-----BEGIN PRIVATE KEY-----\n'+btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('pkcs8',pair.privateKey))))+'\n-----END PRIVATE KEY-----';
    const token=await createDeviceToken({...env,FIREBASE_PRIVATE_KEY:privateKey},'owner','device-1',1000000);
    const[header,payload,signature]=token.split('.');
    assert(await crypto.subtle.verify('RSASSA-PKCS1-v1_5',pair.publicKey,unbase64(signature),new TextEncoder().encode(header+'.'+payload)));
    const data=JSON.parse(new TextDecoder().decode(unbase64(payload)));
    assert.deepEqual(data.claims,{deviceId:'device-1'});assert.equal(data.uid,'owner');assert.equal(data.exp-data.iat,300);
    assert.equal(data.iss,env.FIREBASE_CLIENT_EMAIL);assert.equal(data.sub,data.iss);
});
test('device authorization checks current Firebase account revocation, disabled and missing users',async()=>{
    const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
    const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'device-auth-test'};
    const seconds=Math.floor(Date.now()/1000);
    const claims={sub:'owner',aud:'test-project',iss:'https://securetoken.google.com/test-project',exp:seconds+3600,iat:seconds,auth_time:seconds};
    const input=[{alg:'RS256',kid:jwk.kid},claims].map(v=>base64url(new TextEncoder().encode(JSON.stringify(v)))).join('.');
    const token=input+'.'+base64url(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(input)));
    let account={localId:'owner',validSince:String(seconds-1)};
    const fetcher=async url=>new Response(JSON.stringify(url.includes('/jwk/')?{keys:[jwk]}:{users:account?[account]:[]} ),{headers:{'cache-control':'max-age=0'}});
    assert.equal((await verifyDeviceUser(token,{...env,FIREBASE_WEB_API_KEY:'public'},fetcher)).uid,'owner');
    for(const invalid of [{localId:'owner',disabled:true,validSince:'0'},{localId:'owner',validSince:String(seconds+1)},null,{localId:'owner'}]){
        account=invalid;await assert.rejects(verifyDeviceUser(token,{...env,FIREBASE_WEB_API_KEY:'public'},fetcher),{status:401});
    }
});
