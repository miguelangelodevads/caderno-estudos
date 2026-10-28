import {useEffect,useMemo,useRef,useState} from 'react';
import {doc,collection,onSnapshot,getDocs,runTransaction} from 'firebase/firestore';
import {createVault,unlockVault,recoverVault,changeVaultPassword,encryptNotebook,decryptNotebook} from '../utils/notebookCrypto.js';
import {createNotebookGateway,createEncryptedDraftStorage} from '../utils/encryptedStorage.js';
import {createDeviceClient} from '../utils/trustedDevice.js';
import {signOut} from 'firebase/auth';

// Explicit deployment flag; Firebase emulators remain restricted to DEV in firebase.js.
export const VAULT_ENABLED=import.meta.env.VITE_E2EE_ENABLED==='true';

export function useNotebookVault({db,auth,user,appId,active}) {
  const uid=user?.uid;
  const [status,setStatus]=useState('checking');const [error,setError]=useState('');
  const [record,setRecord]=useState(null);const [draftStorage,setDraftStorage]=useState(null);
  const [panel,setPanel]=useState(false);const [prepared,setPrepared]=useState(null);
  const [devices,setDevices]=useState([]),[devicesPanel,setDevicesPanel]=useState(false);
  const deviceClientRef=useRef(null),draftsRef=useRef(null);
  const connectDeviceRef=useRef(null);
  const recordRef=useRef(null),sessionRef=useRef(null),uidRef=useRef(uid);
  const getSession=()=>sessionRef.current?.identity.uid===uidRef.current?sessionRef.current:null;
  // The gateway stores deferred callbacks; it never invokes them during render.
  // eslint-disable-next-line react-hooks/refs
  const gateway=useMemo(()=>createNotebookGateway(getSession,()=>VAULT_ENABLED && recordRef.current!==null),[]);
  const ref=()=>doc(db,'artifacts',appId,'users',uid,'security','vault');
  const install=async(key,data)=>{
    if(uidRef.current!==uid)throw new Error('A conta mudou.');
    const s={key,identity:{uid,appId,keyId:data.cryptoRecord.keyId},phase:data.phase};
    sessionRef.current=s;
    try {const drafts=await createEncryptedDraftStorage(localStorage,getSession);if(getSession()!==s)throw new Error('Cofre bloqueado.');draftsRef.current=drafts;setDraftStorage(drafts);setStatus(data.phase==='active'?'ready':'migration');}
    catch(e){sessionRef.current=null;throw e;}
  };
  useEffect(()=>{
    let alive=true,autoAttempted=false;const stops=[];uidRef.current=uid;sessionRef.current=null;recordRef.current=null;deviceClientRef.current=null;
    queueMicrotask(()=>{if(alive){setRecord(null);setDraftStorage(null);setPrepared(null);setError('');setPanel(false);setDevices([]);setDevicesPanel(false);setStatus(VAULT_ENABLED&&uid&&active?'checking':'disabled');}});
    if(!VAULT_ENABLED || !uid || !active)return()=>{alive=false;};
    let connecting;
    const connect=()=>connecting||(connecting=(async()=>{
    const client=await createDeviceClient(auth,user);if(!alive)throw new Error('A conta mudou.');deviceClientRef.current=client;
    stops.push(onSnapshot(doc(db,'artifacts',appId,'users',uid,'devices',client.id),{includeMetadataChanges:true},async snapshot=>{
      if(!alive||snapshot.metadata.fromCache||snapshot.data()?.active!==false)return;
      await draftsRef.current?.flush().catch(()=>{});await client.clearLocal().catch(()=>{});
      draftsRef.current?.clearMemory();sessionRef.current=null;setDraftStorage(null);setStatus('locked');
      await signOut(auth);
    }));
    stops.push(onSnapshot(collection(db,'artifacts',appId,'users',uid,'devices'),snapshot=>{if(alive)setDevices(snapshot.docs.map(d=>({...d.data(),id:d.id,current:d.id===client.id})).sort((a,b)=>b.lastSeen-a.lastSeen));}));
    return client;
    })().catch(e=>{connecting=null;throw e;}));
    connectDeviceRef.current=connect;
    // Start with the live server snapshot rather than reading the same document
    // once and then subscribing again. Only a new device needs session enrollment.
    let enrollmentAttempted=false;
    const watchVault=()=>{
    if(!alive)return;
    stops.push(onSnapshot(ref(),{includeMetadataChanges:true},snapshot=>{
      if(!alive || snapshot.metadata.fromCache)return;
      const data=snapshot.exists()?snapshot.data():null;
      if(data && (!data.cryptoRecord || !['migrating','active'].includes(data.phase))){setStatus('error');setError('Registro do cofre inválido. Não vamos sobrescrever seus dados.');return;}
      recordRef.current=data;setRecord(data);
      const s=getSession();
      if(!data){setStatus('unconfigured');return;}
      if(!s || s.identity.keyId!==data.cryptoRecord.keyId){
        sessionRef.current=null;setDraftStorage(null);setStatus('locked');
        if(!autoAttempted&&data.phase==='active'){
          autoAttempted=true;setStatus('checking');
          connect().then(client=>client.restore(data.cryptoRecord)).then(key=>{if(!alive)return;if(key)return install(key,data);setStatus('locked');}).catch(()=>{if(alive)setStatus('locked');});
        }
      }
      else {s.phase=data.phase;setStatus(data.phase==='active'?'ready':'migration');}
    },error=>{
      if(!alive)return;
      if(error.code==='permission-denied'&&!enrollmentAttempted){
        enrollmentAttempted=true;
        connect().then(watchVault).catch(e=>{if(alive){setStatus('error');setError(e.message||'Não foi possível confirmar este aparelho.');}});
      }else{setStatus('error');setError('Não foi possível consultar o cofre. Confira a conexão.');}
    }));
    };
    watchVault();
    return ()=>{alive=false;sessionRef.current=null;deviceClientRef.current=null;connectDeviceRef.current=null;stops.forEach(stop=>stop());};
    // Vault lifetime follows the account, never an open notebook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[uid,active,db,appId]);
  useEffect(()=>{
    const warn=event=>{if(draftStorage?.pending()){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
  },[draftStorage]);
  const identity=()=>({uid,appId});
  const prepare=async passphrase=>{
    if(!VAULT_ENABLED || recordRef.current)throw new Error('Este cofre já existe.');
    await connectDeviceRef.current?.();
    const value=await createVault(passphrase,identity());if(uidRef.current!==uid)throw new Error('A conta mudou.');setPrepared(value);
  };
  const migrate=async()=>{
    const s=getSession();if(!s)throw new Error('Desbloqueie o cofre.');
    setStatus('migrating');
    try {
      const notebooks=await getDocs(collection(db,'artifacts',appId,'users',uid,'notebooks'));
      for(const entry of notebooks.docs){
        await runTransaction(db,async tx=>{
          const snapshot=await tx.get(entry.ref);if(!snapshot.exists())return;
          const data=snapshot.data();
          if(data.encrypted){await decryptNotebook(s.key,data.encrypted,s.identity,entry.id);return;}
          const encrypted=await encryptNotebook(s.key,data,s.identity,entry.id);
          await decryptNotebook(s.key,encrypted,s.identity,entry.id);
          if(getSession()!==s)throw new Error('Cofre bloqueado.');
          tx.set(entry.ref,{ownerUid:uid,encrypted});
        });
      }
      await draftStorage?.flush();
      await runTransaction(db,async tx=>{const snap=await tx.get(ref());if(getSession()!==s || snap.data()?.cryptoRecord.keyId!==s.identity.keyId)throw new Error('A sessão mudou.');tx.update(ref(),{phase:'active'});});
      s.phase='active';setStatus('ready');setPanel(false);setPrepared(null);
    }catch(e){setStatus('migration');throw e;}
  };
  const activate=async()=>{
    if(!prepared || !VAULT_ENABLED)throw new Error('Configure o cofre primeiro.');
    // Preflight and encrypted backup happen before any cloud document is replaced.
    const all=await getDocs(collection(db,'artifacts',appId,'users',uid,'notebooks'));
    const binding={uid,appId,keyId:prepared.record.keyId};
    const backup=[];
    for(const entry of all.docs){if(entry.data().encrypted)throw new Error('Já existem cadernos protegidos. Não crie outro cofre.');const encrypted=await encryptNotebook(prepared.key,entry.data(),binding,entry.id);await decryptNotebook(prepared.key,encrypted,binding,entry.id);backup.push({id:entry.id,encrypted});}
    const file=new Blob([JSON.stringify({version:1,cryptoRecord:prepared.record,notebooks:backup})],{type:'application/json'});
    const url=URL.createObjectURL(file);const link=document.createElement('a');link.href=url;link.download='caderno-backup-criptografado.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
    const value={phase:'migrating',cryptoRecord:prepared.record,deviceControl:true};
    await runTransaction(db,async tx=>{const snap=await tx.get(ref());if(snap.exists())throw new Error('O cofre foi criado em outro aparelho. Recarregue.');if(uidRef.current!==uid)throw new Error('A conta mudou.');tx.set(ref(),value);});
    recordRef.current=value;setRecord(value);await install(prepared.key,value);
    setPrepared(null);setStatus('migration');
  };
  const unlock=async(secret,recovery=false,remember=false,label='')=>{
    const data=recordRef.current;if(!data)throw new Error('Cofre indisponível.');
    const key=await (recovery?recoverVault(data.cryptoRecord,secret.trim(),identity()):unlockVault(data.cryptoRecord,secret,identity()));
    if(!data.deviceControl){await runTransaction(db,async tx=>{const snap=await tx.get(ref());if(snap.data()?.cryptoRecord.keyId!==data.cryptoRecord.keyId)throw new Error('O cofre mudou.');tx.update(ref(),{deviceControl:true});});data.deviceControl=true;}
    const client=deviceClientRef.current||await connectDeviceRef.current?.();if(!client)throw new Error('Confirme este aparelho novamente.');
    if(remember)await client.trust(data.cryptoRecord,secret,recovery,label);
    else await client.forget();
    await install(key,data);setPanel(false);
  };
  const changePassword=async(recovery,newPassword)=>{
    const old=recordRef.current;if(!old)throw new Error('Cofre indisponível.');
    const cryptoRecord=await changeVaultPassword(old.cryptoRecord,recovery.trim(),newPassword,identity());
    await runTransaction(db,async tx=>{const snapshot=await tx.get(ref());const current=snapshot.data()?.cryptoRecord;if(current?.keyId!==old.cryptoRecord.keyId||current?.salt!==old.cryptoRecord.salt||current?.passwordWrap?.iv!==old.cryptoRecord.passwordWrap.iv||current?.passwordWrap?.ciphertext!==old.cryptoRecord.passwordWrap.ciphertext)throw new Error('O cofre mudou em outro aparelho. Recarregue.');tx.update(ref(),{cryptoRecord});});
  };
  const lock=async()=>{await draftStorage?.flush();await deviceClientRef.current?.forget();draftStorage?.clearMemory();sessionRef.current=null;setDraftStorage(null);setPrepared(null);setPanel(false);setDevicesPanel(false);setStatus(recordRef.current?'locked':'unconfigured');};
  const cancelPreparation=()=>{setPrepared(null);setPanel(false);};
  const revokeDevice=async targetId=>{if(!deviceClientRef.current)throw new Error('Confirme este aparelho novamente.');await deviceClientRef.current.revoke(targetId);};
  return {status:VAULT_ENABLED?(status==='ready'&&!draftStorage?'checking':status):'disabled',error,record,draftStorage,prepared,panel,setPanel,gateway,prepare,activate,migrate,unlock,changePassword,lock,cancelPreparation,devices,devicesPanel,setDevicesPanel,revokeDevice,
    canRead:!VAULT_ENABLED || status==='unconfigured' || (status==='ready'&&!!draftStorage),encrypted:VAULT_ENABLED && status==='ready'&&!!draftStorage};
}
