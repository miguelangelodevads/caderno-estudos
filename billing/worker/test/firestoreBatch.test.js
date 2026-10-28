import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Firestore,encodeFields} from '../src/firestore.js';
import {env} from './helpers.js';

test('batch reads preserve requested order, missing documents and version preconditions with one call',async()=>{
 const store=new Firestore(env);let calls=0;
 const names=['a/first','a/absent','a/last'].map(path=>store.name+'/'+store.prefix+path);
 store.call=async(suffix,options)=>{calls++;assert.equal(suffix,':batchGet');assert.deepEqual(JSON.parse(options.body),{documents:names,transaction:'tx-id'});
  return [{found:{name:names[2],fields:encodeFields({active:true}),updateTime:'version-last'}},{missing:names[1]},{found:{name:names[0],fields:encodeFields({value:1}),updateTime:'version-first'}}];};
 assert.deepEqual(await store.getMany(['a/first','a/absent','a/last'],'tx-id'),[{data:{value:1},updateTime:'version-first'},null,{data:{active:true},updateTime:'version-last'}]);
 assert.equal(calls,1);
});
test('incomplete batch responses cannot silently treat an existing grant or device as absent',async()=>{
 const store=new Firestore(env);store.call=async()=>[];
 await assert.rejects(store.getMany(['a/device'],'transaction'),{status:503});
});

test('read-set transaction starts with batchGet and commits without a separate begin or repeated reads',async()=>{
 const store=new Firestore(env),events=[],name=store.name+'/'+store.prefix+'a/device';
 store.call=async(suffix,options)=>{
  const body=JSON.parse(options.body);events.push(suffix);
  if(suffix===':batchGet'){
   assert.deepEqual(body,{documents:[name],newTransaction:{readWrite:{}}});
   return [{transaction:'new-transaction',found:{name,fields:encodeFields({active:true}),updateTime:'version-current'}}];
  }
  assert.equal(suffix,':commit');assert.equal(body.transaction,'new-transaction');
  assert.deepEqual(body.writes[0].currentDocument,{updateTime:'version-current'});return {};
 };
 await store.atomic(async tx=>{
  const [device]=await tx.getMany(['a/device']);assert.equal(device.data.active,true);
  assert.deepEqual(await tx.get('a/device'),device);
  tx.put('a/device',{active:false},device);
 },['a/device']);
 assert.deepEqual(events,[':batchGet',':commit']);
});
test('read-set transaction retries conflicts with new authorization reads and rolls back invalid state',async()=>{
 const store=new Firestore(env),events=[],name=store.name+'/'+store.prefix+'a/device';let attempt=0,actions=0;
 store.call=async(suffix)=>{
  events.push(suffix);
  if(suffix===':batchGet'){attempt++;return [{transaction:'tx-'+attempt,found:{name,fields:encodeFields({active:attempt===1}),updateTime:'version-'+attempt}}];}
  if(suffix===':commit'){const error=Error('conflict');error.status=409;throw error;}
  return {};
 };
 await assert.rejects(store.atomic(async tx=>{
  actions++;const [device]=await tx.getMany(['a/device']);
  if(!device.data.active){const error=Error('revoked');error.status=410;throw error;}
  tx.put('a/device',{active:true},device);
 },['a/device']),{status:410});
 assert.equal(actions,2);assert.deepEqual(events,[':batchGet',':commit',':rollback',':batchGet',':rollback']);
});
test('missing transaction identity cannot execute a security decision or write',async()=>{
 const store=new Firestore(env),name=store.name+'/'+store.prefix+'a/device';
 store.call=async()=>[{found:{name,fields:encodeFields({active:true})}}];
 await assert.rejects(store.atomic(()=>assert.fail('must not act without a transaction'),['a/device']),{status:503});
});
