import {HttpError,unbase64} from './auth.js';
import {isAccessActive} from './payments.js';

const fail=(status,message)=>{throw new HttpError(status,message);};
// One signed request, one atomic read set. The server retains single-use receipts
// for the entire accepted timestamp window, including allowed forward clock skew.
export async function resumeDevice(user,body,store,now,proofBytes) {
 const {deviceId,requestId,payload,signature}=body;
 if(user.deviceId!==deviceId)fail(401,'Sessão de aparelho inválida.');
 if(typeof requestId!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(requestId))fail(400,'Confirmação inválida.');
 if(!Number.isSafeInteger(payload?.issuedAt)||Math.abs(now-payload.issuedAt)>120000)fail(422,'Atualize o relógio do aparelho.');
 const root=`users/${user.uid}/`,devicePath=root+'devices/'+deviceId,receiptPath=root+'security/deviceResumes';
 return store.atomic(async tx=>{
  const paths=[receiptPath,devicePath,'access/'+user.uid,devicePath+'/grants/key'];
  const [prior,device,access,grant]=tx.getMany?await tx.getMany(paths):await Promise.all(paths.map(path=>tx.get(path)));
  if(!isAccessActive(access?.data))fail(403,'Acesso à conta indisponível.');
  if(!device?.data.active)fail(410,'Acesso deste dispositivo revogado. Entre novamente.');
  const keyData=device.data.publicKey;
  let verified=false;
  try {
   if(typeof signature==='string'&&/^[-\w]{86}$/.test(signature)){
    const key=await crypto.subtle.importKey('jwk',keyData,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
    verified=await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,unbase64(signature),await proofBytes(user.uid,deviceId,'resume',requestId,payload));
   }
  }catch { /* Invalid proofs never release the encrypted grant. */ }
  if(!verified)fail(403,'Não foi possível confirmar este aparelho.');
  const slots=(prior?.data.slots||[]).filter(item=>item.expires>now);
  if(slots.some(item=>item.id===requestId))fail(403,'Confirmação já utilizada.');
  const within=prior?.data.windowStart>now-60000,count=within?prior.data.count:0;
  if(count>=60||slots.length>=240)fail(429,'Aguarde um minuto antes de tentar novamente.');
  slots.push({id:requestId,expires:payload.issuedAt+120000});
  tx.put(receiptPath,{slots,count:count+1,windowStart:within?prior.data.windowStart:now},prior);
  // This response holds only the device-encrypted wrapper. The open key never
  // leaves the browser, and absence/expiry never falls back to plaintext.
  const valid=grant&&(grant.data.expiresAt===null||(Number.isFinite(grant.data.expiresAt)&&grant.data.expiresAt>now));
  return {grant:valid?grant.data:null};
 });
}
