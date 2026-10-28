import { Buffer } from "node:buffer";
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {base64url,verifyFirebaseToken,verifyMercadoPagoSignature,googleAccessToken,toBase64} from '../src/auth.js';
import {encodeValue,decodeValue} from '../src/firestore.js';
import {signature} from './helpers.js';

test('Firebase tokens require a real signature, matching project/issuer, valid times and subject',async()=>{
    const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
    const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'test-key',alg:'RS256',use:'sig'};
    const fetcher=async()=>new Response(JSON.stringify({keys:[jwk]}),{headers:{'cache-control':'max-age=3600'}});
    const now=Date.now(),seconds=Math.floor(now/1000),encoder=new TextEncoder();
    const claims={sub:'user-a',aud:'test-project',iss:'https://securetoken.google.com/test-project',exp:seconds+3600,iat:seconds,auth_time:seconds};
    async function token(overrides={},header={alg:'RS256',kid:'test-key'}) {
        const input=[header,{...claims,...overrides}].map(data=>base64url(encoder.encode(JSON.stringify(data)))).join('.');
        return input+'.'+base64url(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,encoder.encode(input)));
    }
    assert.equal((await verifyFirebaseToken(await token(),'test-project',fetcher,now)).uid,'user-a');
    for(const invalid of [{aud:'another-project'},{iss:'https://evil.example'},{exp:seconds-1},{iat:seconds+1000},{auth_time:seconds+1000},{sub:''},{sub:'../victim'},{firebase:{sign_in_provider:'anonymous'}}]) {
        await assert.rejects(verifyFirebaseToken(await token(invalid),'test-project',fetcher,now),{status:401});
    }
    await assert.rejects(verifyFirebaseToken(await token({},{alg:'none',kid:'test-key'}),'test-project',fetcher,now),{status:401});
    const signed=await token();const parts=signed.split('.');parts[1]=base64url(encoder.encode(JSON.stringify({...claims,sub:'victim'})));
    await assert.rejects(verifyFirebaseToken(parts.join('.'),'test-project',fetcher,now),{status:401});
});
test('webhook signature accepts seconds/milliseconds and rejects tampering, replays and missing headers',async()=>{
    const now=Date.now();
    for(const ts of [String(Math.floor(now/1000)),String(now)]) {
        const hash=await signature('secret','123','request',ts);
        const request=new Request('https://test.example',{headers:{'x-signature':`ts=${ts},v1=${hash}`,'x-request-id':'request'}});
        await verifyMercadoPagoSignature(request,'123','secret',now);
        await assert.rejects(verifyMercadoPagoSignature(request,'456','secret',now),{status:401});
        await assert.rejects(verifyMercadoPagoSignature(request,'123','different-secret',now),{status:401});
        await assert.rejects(verifyMercadoPagoSignature(request,'123','secret',now+700000),{status:401});
    }
    await assert.rejects(verifyMercadoPagoSignature(new Request('https://test.example'),'123','secret',now),{status:401});
});
test('Google OAuth assertion is scoped to Firestore and cached; credentials are never returned',async()=>{
    const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
    const pem='-----BEGIN PRIVATE KEY-----\n'+toBase64(await crypto.subtle.exportKey('pkcs8',pair.privateKey))+'\n-----END PRIVATE KEY-----';
    let calls=0;
    const fetcher=async(url,options)=>{calls++;assert.equal(url,'https://oauth2.googleapis.com/token');
        const assertion=new URLSearchParams(options.body).get('assertion');const [header,payload,signature]=assertion.split('.');
        assert(await crypto.subtle.verify('RSASSA-PKCS1-v1_5',pair.publicKey,Uint8Array.from(Buffer.from(signature,'base64url')),new TextEncoder().encode(header+'.'+payload)));
        const claims=JSON.parse(Buffer.from(payload,'base64url').toString());
        assert.equal(claims.scope,'https://www.googleapis.com/auth/datastore');
        return new Response(JSON.stringify({access_token:'mock-token',expires_in:3600}));};
    const env={FIREBASE_PROJECT_ID:'oauth-test',FIREBASE_CLIENT_EMAIL:'test@example.invalid',FIREBASE_PRIVATE_KEY:pem};
    assert.equal(await googleAccessToken(env,fetcher),'mock-token');assert.equal(await googleAccessToken(env,fetcher),'mock-token');assert.equal(calls,1);
    for(const [index,value] of [pem.replace(/\n/g,'\\n'),JSON.stringify(pem),JSON.stringify(pem)+','].entries()) {
        assert.equal(await googleAccessToken({...env,FIREBASE_PROJECT_ID:'copied-key-'+index,FIREBASE_PRIVATE_KEY:value},fetcher),'mock-token');
    }
});
test('invalid service-account key is diagnosed without exposing secrets or calling provider',async()=>{
    for(const key of ['truncated-secret','"not a PEM",','-----BEGIN PRIVATE KEY-----\\ninvalid\\n-----END PRIVATE KEY-----']) {
        await assert.rejects(googleAccessToken({FIREBASE_PROJECT_ID:'invalid-key-test',FIREBASE_CLIENT_EMAIL:'private@example.invalid',FIREBASE_PRIVATE_KEY:key},()=>{throw Error('must not call provider')}),error=>{
            assert.equal(error.status,503);assert(error.message.includes('FIREBASE_PRIVATE_KEY'));assert(!error.message.includes(key));return true;
        });
    }
});
test('Firestore timestamps and nested grants round-trip without changing entitlement types',()=>{
    const data={active:true,expiresAt:null,updatedAt:new Date('2026-10-21'),grants:{123:{environment:'production'}},amountCents:999,items:['a','b']};
    assert.deepEqual(decodeValue(encodeValue(data)),data);
});
