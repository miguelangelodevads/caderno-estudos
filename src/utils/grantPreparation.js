// One in-flight online authorization per opening. Nothing is persisted here.
// Consuming still requires the current vault key ID; clear invalidates late replies.
export function createGrantPreparation(loadStored,requestGrant,{now=Date.now,maxAge=5000}={}) {
  let pending=null,generation=0;
  const prepare=()=>{
    if(!pending)pending=(async()=>{
      const stored=await loadStored();
      return stored?.key?{stored,grant:await requestGrant(),completedAt:now()}:null;
    })();
    return pending;
  };
  return {
    prefetch:()=>prepare().then(()=>undefined),
    async take(keyId){
      const current=generation,task=prepare();
      try{
        const result=await task;
        if(current!==generation)throw new Error('A autorização deste aparelho mudou.');
        if(!result||result.stored.keyId!==keyId)return null;
        if(now()-result.completedAt>maxAge){if(pending===task)pending=null;return this.take(keyId);}
        // Another tab can explicitly remove/replace trust while metadata loads.
        const stored=await loadStored();
        if(current!==generation)throw new Error('A autorização deste aparelho mudou.');
        return stored?.key&&stored.keyId===keyId?{stored,grant:result.grant}:null;
      }finally{if(pending===task)pending=null;}
    },
    clear(){generation++;pending=null;}
  };
}
