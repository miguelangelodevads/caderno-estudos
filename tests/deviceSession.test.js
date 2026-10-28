import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureDeviceSession} from '../src/utils/deviceSession.js';

test('reopening the same authenticated device skips enrollment and token exchange',async()=>{
 const user={uid:'owner',getIdTokenResult:async()=>({claims:{sub:'owner',deviceId:'d_current',firebase:{sign_in_provider:'custom'}}})};
 await ensureDeviceSession({user,deviceId:'d_current',authorize:()=>assert.fail('must not enroll again'),signIn:()=>assert.fail('must not replace the valid session')});
});
test('password login, different account or different device still require signed authorization',async()=>{
 for(const claims of [
  {sub:'owner',deviceId:'d_current',firebase:{sign_in_provider:'password'}},
  {sub:'other-user',deviceId:'d_current',firebase:{sign_in_provider:'custom'}},
  {sub:'owner',deviceId:'d_other',firebase:{sign_in_provider:'custom'}},
  {sub:'owner'},
 ]){
  const events=[];
  await ensureDeviceSession({user:{uid:'owner',getIdTokenResult:async()=>({claims})},deviceId:'d_current',
   authorize:async()=>{events.push('authorize');return{customToken:'signed-token'};},signIn:async token=>{assert.equal(token,'signed-token');events.push('signIn');}});
  assert.deepEqual(events,['authorize','signIn']);
 }
});
test('failed token refresh or revoked authorization never falls back to an unchecked session',async()=>{
 await assert.rejects(ensureDeviceSession({user:{getIdTokenResult:async()=>{throw Error('refresh failed');}},deviceId:'d_current',authorize:()=>assert.fail('must not bypass refresh'),signIn:()=>assert.fail('must not sign in')}),/refresh failed/);
 await assert.rejects(ensureDeviceSession({user:{uid:'owner',getIdTokenResult:async()=>({claims:{sub:'owner'}})},deviceId:'d_current',authorize:async()=>{const e=Error('revoked');e.status=410;throw e;},signIn:()=>assert.fail('must not sign in')}),{status:410});
});
