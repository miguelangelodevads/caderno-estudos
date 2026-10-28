import {useState} from 'react';

export default function NotebookVault({vault,onLogout,onClose}) {
  const [password,setPassword]=useState(''),[confirm,setConfirm]=useState('');
  const [recovery,setRecovery]=useState(''),[recovering,setRecovering]=useState(false);
  const [resetting,setResetting]=useState(false),[saved,setSaved]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [remember,setRemember]=useState(false),[deviceName,setDeviceName]=useState('');
  const run=async action=>{setBusy(true);setError('');setMessage('');try{await action();setPassword('');setConfirm('');setRecovery('');}catch(e){setError(e.message||'Não foi possível concluir.');}finally{setBusy(false);}};
  const setup=vault.status==='unconfigured';
  const changing=resetting && !!vault.record;
  const migrating=['migration','migrating'].includes(vault.status);
  const confirmPassword=()=>{if(password!==confirm)throw new Error('As senhas não coincidem.');};
  return <div className='min-h-screen bg-[#efebe1] text-slate-800 p-4 sm:p-10 flex items-center justify-center'>
    <section className='w-full max-w-xl bg-white rounded-2xl p-6 sm:p-8 shadow-lg space-y-5' aria-label='Cofre de anotações'>
      <p className='text-sm text-teal-700 font-bold'>{import.meta.env.DEV&&import.meta.env.VITE_USE_FIREBASE_EMULATORS==='true'?'Criptografia — ambiente de teste':'Proteção das suas anotações'}</p>
      <h1 className='font-serif text-2xl font-bold'>{setup?'Proteja suas anotações':migrating?'Concluir proteção dos cadernos':changing?'Trocar a senha do cofre':'Desbloquear suas anotações'}</h1>
      <p className='text-sm leading-6'>A senha do cofre é diferente da senha de login. Sem ela ou sem a chave de recuperação, o suporte não poderá recuperar seu conteúdo.</p>
      {vault.status==='checking' && <p role='status'>Consultando o cofre…</p>}
      {setup && !vault.prepared && <form className='space-y-4' onSubmit={e=>{e.preventDefault();run(async()=>{confirmPassword();await vault.prepare(password);});}}>
        <label className='block'>Senha do cofre<input className='block border rounded p-3 w-full' type='password' autoComplete='new-password' minLength={16} required value={password} onChange={e=>setPassword(e.target.value)}/></label>
        <label className='block'>Repita a senha<input className='block border rounded p-3 w-full' type='password' autoComplete='new-password' minLength={16} required value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>
        <button disabled={busy} className='bg-slate-800 text-white rounded px-4 py-3 disabled:opacity-50'>Gerar chave de recuperação</button>
      </form>}
      {setup && vault.prepared && <div className='space-y-4'>
        <p>Guarde esta chave em um lugar seguro, fora do aplicativo. Não a envie ao suporte.</p>
        <code className='block bg-slate-100 p-4 rounded break-all select-all' aria-label='Chave de recuperação'>{vault.prepared.recoveryKey}</code>
        <label className='flex gap-3'><input type='checkbox' checked={saved} onChange={e=>setSaved(e.target.checked)}/>Guardei a chave de recuperação.</label>
        <p className='text-sm'>Um backup criptografado será baixado antes da conversão. Deixe esta página aberta. Se houver falha, será possível retomar sem apagar os cadernos.</p>
        <button disabled={!saved||busy} className='bg-teal-700 text-white rounded p-3 disabled:opacity-50' onClick={()=>run(vault.activate)}>Preparar migração e baixar backup</button>
      </div>}
      {vault.status==='locked' && !changing && <form className='space-y-4' onSubmit={e=>{e.preventDefault();run(()=>vault.unlock(recovering?recovery:password,recovering,remember,deviceName));}}>
        {recovering?<label className='block'>Chave de recuperação<input className='block border rounded p-3 w-full' autoComplete='off' required value={recovery} onChange={e=>setRecovery(e.target.value)}/></label>:<label className='block'>Senha do cofre<input className='block border rounded p-3 w-full' type='password' autoComplete='current-password' required value={password} onChange={e=>setPassword(e.target.value)}/></label>}
        <label className='flex gap-3 text-sm'><input type='checkbox' checked={remember} onChange={e=>setRemember(e.target.checked)}/>Confiar neste aparelho até eu desativar</label>
        {remember&&<><label className='block text-sm'>Nome deste aparelho<input maxLength={80} className='block border rounded p-3 w-full' placeholder='Ex.: Meu notebook' value={deviceName} onChange={e=>setDeviceName(e.target.value)}/></label><p className='text-xs text-slate-600'>Use somente em um aparelho pessoal protegido. Ao reabrir, será necessária conexão para validar a autorização. Bloquear o cofre ou sair da conta remove a confiança neste navegador.</p></>}
        <button disabled={busy} className='bg-slate-800 text-white rounded px-4 py-3 disabled:opacity-50'>Desbloquear cofre</button>
        <button type='button' className='block text-sm underline' onClick={()=>{setRecovering(!recovering);setPassword('');setRecovery('');}}>{recovering?'Usar senha do cofre':'Usar chave de recuperação'}</button>
      </form>}
      {migrating && <div className='space-y-4'><p>A conversão pode ser retomada se a conexão cair. Os cadernos já convertidos são verificados e preservados.</p><button disabled={busy||vault.status==='migrating'} className='bg-teal-700 text-white rounded p-3 disabled:opacity-50' onClick={()=>run(vault.migrate)}>{busy||vault.status==='migrating'?'Protegendo cadernos…':'Continuar migração'}</button></div>}
      {!!vault.record && !migrating && <button className='text-sm underline block' onClick={()=>setResetting(!resetting)}>{changing?'Cancelar troca de senha':'Recuperar e trocar senha do cofre'}</button>}
      {changing && <form className='space-y-4' onSubmit={e=>{e.preventDefault();run(async()=>{confirmPassword();await vault.changePassword(recovery,password);setMessage('Senha do cofre atualizada. Você já pode desbloquear com a nova senha.');setResetting(false);});}}>
        <label className='block'>Chave de recuperação<input className='block border rounded p-3 w-full' autoComplete='off' required value={recovery} onChange={e=>setRecovery(e.target.value)}/></label>
        <label className='block'>Nova senha do cofre<input className='block border rounded p-3 w-full' type='password' autoComplete='new-password' minLength={16} required value={password} onChange={e=>setPassword(e.target.value)}/></label>
        <label className='block'>Repita a nova senha<input className='block border rounded p-3 w-full' type='password' autoComplete='new-password' minLength={16} required value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>
        <button disabled={busy} className='bg-slate-800 text-white rounded p-3'>Salvar nova senha</button>
      </form>}
      {(error||vault.error) && <p role='alert' className='text-red-700'>{error||vault.error}</p>}
      {message && <p role='status'>{message}</p>}
      <div className='flex gap-5 text-sm'>{setup&&onClose&&<button disabled={busy} onClick={onClose}>Agora não</button>}<button disabled={busy} onClick={()=>run(onLogout)}>Sair da conta</button></div>
    </section>
  </div>;
}
