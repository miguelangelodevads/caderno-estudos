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
