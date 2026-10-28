import test from 'node:test';
import assert from 'node:assert/strict';
import {observeInstallation} from '../src/utils/installPrompt.js';

function browser({standalone=false,ios=false}={}){
 const win=new EventTarget(),media=new EventTarget();
 media.matches=standalone;
 win.matchMedia=()=>media;win.navigator={userAgent:ios?'iPhone':'Chrome',maxTouchPoints:0};
 const states=[];const controller=observeInstallation(win,state=>states.push(state));
 return {win,media,controller,state:()=>states.at(-1)};
}
function installEvent(outcome='accepted'){
 const event=new Event('beforeinstallprompt',{cancelable:true});let calls=0;
 event.prompt=async()=>{calls++;};event.userChoice=Promise.resolve({outcome});
 return {event,calls:()=>calls};
}
test('install promotion works before login and disappears after installation',async()=>{
 const b=browser();assert.equal(b.state().visible,false);
 const native=installEvent();b.win.dispatchEvent(native.event);
 assert.equal(native.event.defaultPrevented,true);assert.equal(b.state().visible,true);
 await b.controller.install();assert.equal(native.calls(),1);assert.equal(b.state().visible,false);
 await b.controller.install();assert.equal(native.calls(),1);
 b.win.dispatchEvent(new Event('appinstalled'));assert.equal(b.state().visible,false);b.controller.dispose();
});
test('dismissed native prompts are consumed and never prompted a second time',async()=>{
 const b=browser(),native=installEvent('dismissed');b.win.dispatchEvent(native.event);
 await b.controller.install();await b.controller.install();
 assert.equal(native.calls(),1);assert.equal(b.state().visible,false);b.controller.dispose();
});
test('installed apps hide promotion; iOS has dismissible manual instructions',()=>{
 const installed=browser({standalone:true,ios:true});installed.win.dispatchEvent(installEvent().event);assert.equal(installed.state().visible,false);installed.controller.dispose();
 const ios=browser({ios:true});assert.equal(ios.state().visible,true);assert.equal(ios.state().manual,true);
 ios.controller.dismiss();assert.equal(ios.state().visible,false);ios.controller.dispose();
});
test('display changes and installation in the browser hide the promotion immediately',()=>{
 for(const event of ['display','installed']){
  const b=browser();b.win.dispatchEvent(installEvent().event);assert.equal(b.state().visible,true);
  if(event==='display'){b.media.matches=true;b.media.dispatchEvent(new Event('change'));}else b.win.dispatchEvent(new Event('appinstalled'));
  assert.equal(b.state().visible,false);b.controller.dispose();
 }
});
test('unmount removes all listeners so old screens cannot show a stale invitation',()=>{
 const b=browser();b.controller.dispose();b.win.dispatchEvent(installEvent().event);
 assert.equal(b.state().visible,false);
});
