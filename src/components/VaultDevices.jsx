import {useState,useEffect} from 'react';
export default function VaultDevices({vault}){
 const [busy,setBusy]=useState(''),[error,setError]=useState('');
 const [clock,setClock]=useState(()=>Date.now());
 useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),60000);return()=>clearInterval(timer);},[]);
 const revoke=async id=>{setBusy(id);setError('');try{await vault.revokeDevice(id);}catch(e){setError(e.message||'Não foi possível desconectar.');}finally{setBusy('');}};
 return <div className='min-h-screen bg-[#efebe1] p-4 sm:p-10 text-slate-800'><main className='max-w-2xl mx-auto bg-white rounded-2xl p-5 sm:p-8 shadow space-y-5'>
  <button className='text-sm underline' onClick={()=>vault.setDevicesPanel(false)}>Voltar aos cadernos</button>
  <h1 className='text-2xl font-serif font-bold'>Meus dispositivos</h1>
  <p className='text-sm'>Desconectar bloqueia novas leituras e gravações naquele aparelho. Não apaga conteúdo já baixado nem cópias offline. Para reconectar, será necessário entrar novamente.</p>
  <ul className='space-y-3'>{vault.devices.map(device=><li key={device.id} className='border rounded-xl p-4 space-y-2'>
   <div className='font-semibold break-words'>{device.label}{device.current&&<span className='text-xs text-teal-700 ml-2'>Este aparelho</span>}</div>
   <p className='text-xs text-slate-600'>Último acesso: {new Date(device.lastSeen).toLocaleString('pt-BR')}</p>
   <p className='text-sm'>{!device.active?'Desconectado':device.trusted&&device.trustedUntil>clock?'Confiável até '+new Date(device.trustedUntil).toLocaleDateString('pt-BR'):'Autorizado · cofre protegido por senha'}</p>
   {device.active&&<button disabled={!!busy} className='text-sm max-w-full text-left border border-red-200 text-red-700 rounded px-3 py-2 disabled:opacity-50' style={{overflowWrap:'anywhere'}} onClick={()=>revoke(device.id)}>{busy===device.id?'Desconectando…':'Desconectar '+(device.current?'este aparelho':device.label)}</button>}
  </li>)}</ul>
  {!vault.devices.length&&<p>Carregando dispositivos…</p>}{error&&<p role='alert' className='text-red-700'>{error}</p>}
 </main></div>;
}
