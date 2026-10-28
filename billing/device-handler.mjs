const encode=v=>Buffer.from(v).toString('base64url');
const fail=(message,status=403)=>{const e=new Error(message);e.status=status;throw e;};
export async function proofBytes(uid,deviceId,purpose,nonce,payload){
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)));
 return new TextEncoder().encode(JSON.stringify(['caderno-device-v1',uid,deviceId,purpose,nonce,encode(digest)]));
}
export function createDeviceHandler({auth,db,now=Date.now}) {
 const challenges=new Map();
 const deviceRef=(uid,id)=>db.doc(`artifacts/caderno-estudos/users/${uid}/devices/${id}`);
 return async(req,res)=>{
  const origin=req.headers.origin;
  const allowed=['http://127.0.0.1:5174','http://localhost:5174'];
  const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(origin&&allowed.includes(origin)?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{})});res.end(JSON.stringify(data));};
  try{
   if(origin&&!allowed.includes(origin))return reply(403,{error:'Origem não autorizada.'});
   if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':origin||allowed[0],'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'});return res.end();}
   if(req.url==='/health')return reply(200,{service:'local-device-tests'});
   if(req.method!=='POST')return reply(405,{error:'Método não permitido.'});
   const token=/^Bearer (\S+)$/.exec(req.headers.authorization||'')?.[1];if(!token)fail('Entre novamente.',401);
   let user;try{user=await auth.verifyIdToken(token,true);}catch{fail('Entre novamente.',401);}
   let text='';for await(const chunk of req){text+=chunk.toString();if(Buffer.byteLength(text)>16384)fail('Requisição muito grande.',413);}
   let body;try{body=JSON.parse(text);}catch{fail('Requisição inválida.',400);}
   const {deviceId}=body;
   if(typeof deviceId!=='string'||!/^d_[a-f0-9-]{36}$/.test(deviceId))fail('Dispositivo inválido.',400);
   if(req.url==='/challenge'){
    if(!['session','trust','grant','forget','revoke'].includes(body.purpose))fail('Operação inválida.',400);
    for(const[id,c]of challenges)if(c.expires<now())challenges.delete(id);
    if(challenges.size>=2000||[...challenges.values()].filter(c=>c.uid===user.uid).length>=10)fail('Aguarde antes de tentar novamente.',429);
    const challengeId=crypto.randomUUID(),nonce=encode(crypto.getRandomValues(new Uint8Array(32)));
    challenges.set(challengeId,{uid:user.uid,deviceId,purpose:body.purpose,nonce,expires:now()+60000});
    return reply(200,{challengeId,nonce});
   }
   const purpose=req.url.slice(1);const c=challenges.get(body.challengeId);challenges.delete(body.challengeId);
   if(!c||c.uid!==user.uid||c.deviceId!==deviceId||c.purpose!==purpose||c.expires<now())fail('Confirmação expirada. Tente novamente.');
   const ref=deviceRef(user.uid,deviceId),snapshot=await ref.get(),device=snapshot.data(),payload=body.payload||{};
   if(device?.active===false)fail('Acesso deste dispositivo revogado. Entre novamente.',410);
   if(!device && (purpose!=='session'||user.firebase?.sign_in_provider!=='password'||now()/1000-user.auth_time>300))fail('Entre com sua senha de login para cadastrar este aparelho.',401);
   const publicKey=device?.publicKey||payload.publicKey;
   if(publicKey?.kty!=='EC'||publicKey?.crv!=='P-256'||publicKey?.d)fail('Identidade do dispositivo inválida.');
   const key=await crypto.subtle.importKey('jwk',publicKey,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
   if(typeof body.signature!=='string'||!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,Buffer.from(body.signature,'base64url'),await proofBytes(user.uid,deviceId,purpose,c.nonce,payload)))fail('Não foi possível confirmar este aparelho.');
   if(purpose==='session'){
    if(!device){const label=typeof payload.label==='string'?payload.label.slice(0,80):'Navegador';await db.runTransaction(async tx=>{const current=await tx.get(ref);if(current.exists){const saved=current.data();if(!saved.active)fail('Acesso revogado.',410);if(saved.publicKey?.x!==publicKey.x||saved.publicKey?.y!==publicKey.y)fail('Identidade do dispositivo alterada.');tx.update(ref,{lastSeen:now()});return;}tx.set(ref,{publicKey,label,active:true,trusted:false,createdAt:now(),lastSeen:now()});});}
    else await ref.update({lastSeen:now()});
    return reply(200,{customToken:await auth.createCustomToken(user.uid,{deviceId})});
   }
   if(user.deviceId!==deviceId||!device?.active)fail('Sessão de aparelho inválida. Entre novamente.',401);
   const grantRef=ref.collection('grants').doc('key');
   const access=(await db.doc(`artifacts/caderno-estudos/access/${user.uid}`).get()).data();
   if(!access?.active)fail('Acesso à conta indisponível.');
   if(purpose==='trust'){
    const vault=(await db.doc(`artifacts/caderno-estudos/users/${user.uid}/security/vault`).get()).data();const e=payload.envelope;
    if(vault?.cryptoRecord?.keyId!==payload.keyId||typeof e?.iv!=='string'||e.iv.length!==16||typeof e?.ciphertext!=='string'||e.ciphertext.length!==64)fail('Autorização do cofre inválida.',400);
    const expiresAt=null; // Trust lasts until explicit revocation, lock or logout.
    await db.runTransaction(async tx=>{const current=await tx.get(ref);if(!current.data()?.active)fail('Acesso revogado.',410);tx.set(grantRef,{keyId:payload.keyId,envelope:e,expiresAt});tx.update(ref,{trusted:true,trustedUntil:expiresAt,...(typeof payload.label==='string'&&payload.label.trim()?{label:payload.label.trim().slice(0,80)}:{})});});
    return reply(200,{ok:true});
   }
   if(purpose==='grant'){
    const grant=(await grantRef.get()).data();if(!grant||(grant.expiresAt!==null&&(!Number.isFinite(grant.expiresAt)||grant.expiresAt<=now())))fail('Desbloqueie com a senha do cofre.',404);
    return reply(200,grant);
   }
   if(purpose==='forget'){await db.runTransaction(async tx=>{tx.delete(grantRef);tx.update(ref,{trusted:false,trustedUntil:0});});return reply(200,{ok:true});}
   if(purpose==='revoke'){
    if(typeof payload.targetId!=='string'||!/^d_[a-f0-9-]{36}$/.test(payload.targetId))fail('Dispositivo inválido.',400);
    const target=deviceRef(user.uid,payload.targetId);
    await db.runTransaction(async tx=>{const current=await tx.get(target);if(!current.exists)fail('Dispositivo não encontrado.',404);tx.update(target,{active:false,trusted:false,revokedAt:now()});tx.delete(target.collection('grants').doc('key'));});
    return reply(200,{ok:true});
   }
   return reply(404,{error:'Operação não encontrada.'});
  }catch(e){return reply(e.status||500,{error:e.status?e.message:'Não foi possível consultar os dispositivos.'});}
 };
}
