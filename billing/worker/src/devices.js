import {HttpError,base64url,unbase64,verifyDeviceUser,createDeviceToken} from './auth.js';
import {isAccessActive} from './payments.js';

const encoder=new TextEncoder();
const purposes=['session','trust','grant','forget','revoke'];
const validId=id=>typeof id==='string'&&/^d_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id);
const fail=(status,message)=>{throw new HttpError(status,message);};
export async function deviceProof(uid,deviceId,purpose,nonce,payload) {
    const digest=await crypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify(payload)));
    return encoder.encode(JSON.stringify(['caderno-device-v1',uid,deviceId,purpose,nonce,base64url(digest)]));
}

// Challenges and throttles are transactional Firestore records, shared by all Worker instances.
// No plaintext vault keys or user notes pass through these endpoints.
export async function handleDevices(request,env,store,body,dependencies={}) {
    const now=dependencies.now?.()??Date.now();
    const token=/^Bearer (\S+)$/.exec(request.headers.get('Authorization')||'')?.[1];
    const user=await (dependencies.verifyDeviceUser||verifyDeviceUser)(token,env,dependencies.fetcher||fetch,now);
    const root=`users/${user.uid}/`, vaultPath=root+'security/vault', noncePath=root+'security/deviceChallenges';
    const path=new URL(request.url).pathname.replace('/devices/','');
    const access=await store.get('access/'+user.uid);
    if(!isAccessActive(access?.data))fail(403,'Acesso à conta indisponível.');
    if(path==='status') {
        if(request.method!=='GET')fail(405,'Método não permitido.');
        return {hasVault:!!await store.get(vaultPath)};
    }
    if(request.method!=='POST')fail(405,'Método não permitido.');
    if(!body||typeof body!=='object'||Array.isArray(body)||!validId(body.deviceId))fail(400,'Dispositivo inválido.');
    const {deviceId}=body, devicePath=root+'devices/'+deviceId;
    if(path==='challenge') {
        if(!purposes.includes(body.purpose))fail(400,'Operação inválida.');
        const challengeId=crypto.randomUUID(),nonce=base64url(crypto.getRandomValues(new Uint8Array(32)));
        await store.atomic(async tx=>{
            const prior=await tx.get(noncePath),state=prior?.data;
            const slots=(state?.slots||[]).filter(c=>c.expires>now);
            const within=state?.windowStart>now-60000;
            const count=within?state.count:0;
            if(slots.length>=10||count>=60)fail(429,'Aguarde um minuto antes de tentar novamente.');
            slots.push({challengeId,nonce,deviceId,purpose:body.purpose,expires:now+60000});
            tx.put(noncePath,{slots,count:count+1,windowStart:within?state.windowStart:now},prior);
        });
        return {challengeId,nonce};
    }
    if(!purposes.includes(path))fail(404,'Operação não encontrada.');
    const prior=await store.get(noncePath),challenge=prior?.data.slots?.find(c=>c.challengeId===body.challengeId);
    if(!challenge||challenge.deviceId!==deviceId||challenge.purpose!==path||challenge.expires<=now)fail(403,'Confirmação expirada. Tente novamente.');
    const stored=await store.get(devicePath),device=stored?.data,payload=body.payload||{};
    if(device?.active===false)fail(410,'Acesso deste dispositivo revogado. Entre novamente.');
    if(!device&&(path!=='session'||user.firebase?.sign_in_provider!=='password'||now/1000-user.auth_time>300))
        fail(401,'Entre novamente com sua senha de login para cadastrar este aparelho.');
    const publicKey=device?.publicKey||payload.publicKey;
    if(publicKey?.kty!=='EC'||publicKey?.crv!=='P-256'||publicKey.d||!/^[-\w]{43}$/.test(publicKey.x||'')||!/^[-\w]{43}$/.test(publicKey.y||''))fail(403,'Identidade do dispositivo inválida.');
    let verified=false;
    try {
        const key=await crypto.subtle.importKey('jwk',publicKey,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
        if(typeof body.signature==='string'&&/^[-\w]{86}$/.test(body.signature))verified=await crypto.subtle.verify(
            {name:'ECDSA',hash:'SHA-256'},key,unbase64(body.signature),await deviceProof(user.uid,deviceId,path,challenge.nonce,payload));
    }catch { /* Invalid keys and signatures are rejected uniformly. */ }
    if(!verified)fail(403,'Não foi possível confirmar este aparelho.');
    const result=await store.atomic(async tx=>{
        const currentNonce=await tx.get(noncePath),current=await tx.get(devicePath),entitlement=await tx.get('access/'+user.uid);
        const c=currentNonce?.data.slots?.find(c=>c.challengeId===body.challengeId);
        if(!c||c.nonce!==challenge.nonce||c.expires<=now)fail(403,'Confirmação expirada. Tente novamente.');
        if(!isAccessActive(entitlement?.data))fail(403,'Acesso à conta indisponível.');
        const saved=current?.data;
        if(saved?.active===false)fail(410,'Acesso deste dispositivo revogado. Entre novamente.');
        if(saved&&(saved.publicKey?.x!==publicKey.x||saved.publicKey?.y!==publicKey.y))fail(403,'Identidade do dispositivo alterada.');
        if(!saved&&path!=='session')fail(401,'Sessão de aparelho inválida. Entre novamente.');
        const nonceData={...currentNonce.data,slots:currentNonce.data.slots.filter(s=>s.challengeId!==body.challengeId)};
        if(path==='session') {
            const data=saved||{publicKey:{kty:'EC',crv:'P-256',x:publicKey.x,y:publicKey.y},label:typeof payload.label==='string'?payload.label.slice(0,80):'Navegador',active:true,trusted:false,createdAt:now};
            tx.put(noncePath,nonceData,currentNonce);tx.put(devicePath,{...data,lastSeen:now},current);
            return {session:true};
        }
        if(user.deviceId!==deviceId||!saved?.active)fail(401,'Sessão de aparelho inválida. Entre novamente.');
        const grantPath=devicePath+'/grants/key';
        if(path==='trust') {
            const vault=await tx.get(vaultPath),grant=await tx.get(grantPath),e=payload.envelope;
            if(vault?.data.cryptoRecord?.keyId!==payload.keyId||!/^[-\w]{16}$/.test(e?.iv||'')||!/^[-\w]{64}$/.test(e?.ciphertext||''))fail(400,'Autorização do cofre inválida.');
            tx.put(grantPath,{keyId:payload.keyId,envelope:{iv:e.iv,ciphertext:e.ciphertext},expiresAt:null},grant);
            tx.put(devicePath,{...saved,trusted:true,trustedUntil:null,...(typeof payload.label==='string'&&payload.label.trim()?{label:payload.label.trim().slice(0,80)}:{})},current);
        } else if(path==='grant') {
            const grant=await tx.get(grantPath);
            if(!grant||(grant.data.expiresAt!==null&&(!Number.isFinite(grant.data.expiresAt)||grant.data.expiresAt<=now)))fail(404,'Desbloqueie com a senha do cofre.');
            tx.put(noncePath,nonceData,currentNonce);
            return grant.data;
        } else if(path==='forget') {
            const grant=await tx.get(grantPath);
            tx.delete(grantPath,grant);tx.put(devicePath,{...saved,trusted:false,trustedUntil:0},current);
        } else if(path==='revoke') {
            if(!validId(payload.targetId))fail(400,'Dispositivo inválido.');
            const targetPath=root+'devices/'+payload.targetId,target=await tx.get(targetPath),grant=await tx.get(targetPath+'/grants/key');
            if(!target)fail(404,'Dispositivo não encontrado.');
            tx.put(targetPath,{...target.data,active:false,trusted:false,revokedAt:now},target);tx.delete(targetPath+'/grants/key',grant);
        }
        tx.put(noncePath,nonceData,currentNonce);return {ok:true};
    });
    if(result.session)return {customToken:await (dependencies.createDeviceToken||createDeviceToken)(env,user.uid,deviceId,now)};
    return result;
}
