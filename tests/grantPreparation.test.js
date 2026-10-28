import test from 'node:test';
import assert from 'node:assert/strict';
import {createGrantPreparation} from '../src/utils/grantPreparation.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((ok,no)=>{resolve=ok;reject=no;});return {promise,resolve,reject};};
const key={key:{type:'secret',extractable:false},keyId:'vault-a'};
test('online grant begins before metadata and concurrent consumers share one request',async()=>{
 const online=deferred();let requests=0;
 const preparation=createGrantPreparation(async()=>key,()=>{requests++;return online.promise;});
 const prefetch=preparation.prefetch();await Promise.resolve();
 assert.equal(requests,1);
 let consumed=false;
 const take=preparation.take('vault-a').then(value=>{consumed=true;return value;});
 assert.equal(consumed,false);online.resolve({encrypted:true});
 assert.deepEqual(await take,{stored:key,grant:{encrypted:true}});await prefetch;
 assert.equal(requests,1);
});
test('devices without persistent trust make no speculative request',async()=>{
 const preparation=createGrantPreparation(async()=>null,()=>assert.fail('not a trusted device'));
 await preparation.prefetch();assert.equal(await preparation.take('vault-a'),null);
});
test('vault identity mismatch never returns prepared authorization',async()=>{
 const preparation=createGrantPreparation(async()=>key,async()=>({encrypted:true}));
 await preparation.prefetch();assert.equal(await preparation.take('vault-b'),null);
});
test('lock/logout invalidates a late response instead of reopening the vault',async()=>{
 const online=deferred(),preparation=createGrantPreparation(async()=>key,()=>online.promise);
 const take=preparation.take('vault-a');preparation.clear();online.resolve({encrypted:true});
 await assert.rejects(take,/autorização/);
});
test('trust removed by another tab is rechecked before the key can be used',async()=>{
 let stored=key;const preparation=createGrantPreparation(async()=>stored,async()=>({encrypted:true}));
 await preparation.prefetch();stored=null;assert.equal(await preparation.take('vault-a'),null);
});
test('slow metadata refreshes stale authorization and each opening consumes a fresh grant',async()=>{
 let clock=0,requests=0;
 const preparation=createGrantPreparation(async()=>key,async()=>({request:++requests}),{now:()=>clock});
 await preparation.prefetch();clock=6000;
 assert.equal((await preparation.take('vault-a')).grant.request,2);
 assert.equal((await preparation.take('vault-a')).grant.request,3);
});
test('network/revocation failures cannot return a cached key without online authorization',async()=>{
 const preparation=createGrantPreparation(async()=>key,async()=>{throw Error('revoked');});
 await assert.rejects(preparation.prefetch(),/revoked/);
 await assert.rejects(preparation.take('vault-a'),/revoked/);
});
