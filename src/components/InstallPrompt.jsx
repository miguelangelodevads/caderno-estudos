import {useEffect,useRef,useState} from 'react';
import {BookOpen,X} from 'lucide-react';
import {observeInstallation} from '../utils/installPrompt.js';

export default function InstallPrompt(){
  const [state,setState]=useState({visible:false,manual:false,busy:false});
  const controller=useRef(null);
  useEffect(()=>{
    let alive=true;
    const current=observeInstallation(window,next=>queueMicrotask(()=>{if(alive)setState(next);}));
    controller.current=current;
    return()=>{alive=false;current.dispose();controller.current=null;};
  },[]);
  if(!state.visible)return null;
  return <aside aria-label='Instalar Caderno de Estudos' className='app-install-prompt fixed bottom-0 inset-x-0 p-3 sm:p-5 z-100 flex justify-center' style={{paddingBottom:'max(12px, env(safe-area-inset-bottom))'}}>
    <div className='relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl p-4 pr-10 flex flex-wrap items-center gap-3 text-slate-800'>
      <BookOpen aria-hidden='true' className='w-7 h-7 text-blue-600 shrink-0'/>
      <div className='flex-1 min-w-0'>
        <h2 className='font-bold text-base'>Instalar Caderno de Estudos</h2>
        <p className='text-sm text-slate-600 mt-1'>{state.manual?'No Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”.':'Tenha um atalho para seus cadernos no celular ou computador.'}</p>
      </div>
      <button aria-label='Fechar convite de instalação' onClick={()=>controller.current?.dismiss()} className='absolute top-2 right-2 p-2 rounded-lg text-slate-500 hover:bg-slate-100'><X className='h-4 w-4'/></button>
      {!state.manual&&<div className='flex w-full sm:w-auto gap-2 justify-end'>
        <button onClick={()=>controller.current?.dismiss()} className='px-3 py-2 text-sm rounded-lg hover:bg-slate-100'>Agora não</button>
        <button disabled={state.busy} onClick={()=>controller.current?.install().catch(()=>{})} className='px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50'>Instalar</button>
      </div>}
    </div>
  </aside>;
}
