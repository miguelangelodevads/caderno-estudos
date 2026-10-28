export function isStandalone(win) {
  return win.matchMedia('(display-mode: standalone)').matches || win.navigator.standalone===true;
}

export function observeInstallation(win,notify) {
  let prompt=null,dismissed=false,installed=isStandalone(win),busy=false;
  const media=win.matchMedia('(display-mode: standalone)');
  const ios=/iPad|iPhone|iPod/.test(win.navigator.userAgent)
    || (/Macintosh/.test(win.navigator.userAgent)&&win.navigator.maxTouchPoints>1);
  const emit=()=>notify({visible:!installed&&!dismissed&&(!!prompt||ios),manual:!prompt, busy});
  const beforeInstall=event=>{event.preventDefault();if(installed)return;prompt=event;emit();};
  const appInstalled=()=>{installed=true;prompt=null;emit();};
  const displayChanged=()=>{installed=isStandalone(win);emit();};
  win.addEventListener('beforeinstallprompt',beforeInstall);
  win.addEventListener('appinstalled',appInstalled);
  media.addEventListener('change',displayChanged);
  emit();
  return {
    dismiss(){dismissed=true;emit();},
    async install(){
      if(!prompt||busy||installed)return;
      const event=prompt;prompt=null;busy=true;emit();
      try{await event.prompt();const choice=await event.userChoice;if(choice.outcome==='accepted')installed=true;}
      finally{busy=false;dismissed=true;emit();}
    },
    dispose(){win.removeEventListener('beforeinstallprompt',beforeInstall);win.removeEventListener('appinstalled',appInstalled);media.removeEventListener('change',displayChanged);prompt=null;}
  };
}
