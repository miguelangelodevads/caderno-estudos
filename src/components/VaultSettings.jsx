import {useState} from 'react';

export default function VaultSettings({vault}) {
  const [confirming,setConfirming]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const lock=async()=>{
    setBusy(true);setError('');
    try{await vault.lock();}catch{setError('Não foi possível bloquear. Aguarde o salvamento das anotações e tente novamente.');setBusy(false);}
  };
  return <div className='min-h-screen bg-[#efebe1] p-4 sm:p-10 flex items-center justify-center text-slate-800'>
    <section className='w-full max-w-xl bg-white rounded-2xl p-6 sm:p-8 shadow-lg space-y-5' aria-label='Configurações do cofre'>
      <button disabled={busy} className='text-sm underline' onClick={vault.cancelPreparation}>Voltar aos cadernos</button>
      <h1 className='font-serif text-2xl font-bold'>Cofre desbloqueado</h1>
      <p>Suas anotações estão disponíveis. Abrir estas configurações não bloqueia o cofre.</p>
      {!confirming?<div className='flex flex-col gap-3'>
        <button className='border rounded-lg p-3 text-left' onClick={()=>{vault.setPanel(false);vault.setDevicesPanel(true);}}>Meus dispositivos</button>
        <button className='border border-red-200 text-red-700 rounded-lg p-3 text-left' onClick={()=>setConfirming(true)}>Bloquear cofre</button>
      </div>:<section aria-label='Confirmar bloqueio' className='border border-amber-300 bg-amber-50 rounded-lg p-4 space-y-4'>
        <h2 className='font-semibold'>Deseja bloquear o cofre agora?</h2>
        <p className='text-sm'>Você precisará da senha para abrir novamente. A confiança neste aparelho também será removida.</p>
        <div className='flex flex-wrap gap-3'>
          <button autoFocus disabled={busy} className='border rounded-lg px-4 py-2 bg-white' onClick={()=>setConfirming(false)}>Cancelar</button>
          <button disabled={busy} className='bg-slate-800 text-white rounded-lg px-4 py-2 disabled:opacity-50' onClick={lock}>{busy?'Bloqueando…':'Sim, bloquear'}</button>
        </div>
      </section>}
      {error&&<p role='alert' className='text-red-700'>{error}</p>}
    </section>
  </div>;
}
