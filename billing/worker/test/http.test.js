import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,collectorConfiguration} from '../src/index.js';
import {Firestore} from '../src/firestore.js';
import {HttpError,toBase64} from '../src/auth.js';
import {MemoryStore,env,order,orderId,payment,signature} from './helpers.js';

test('conta antiga consulta acesso mesmo com cobrança desligada e Mercado Pago sem configuração', async () => {
    const store = new MemoryStore([['access/user-a', { active: true, legacy: { permanent: true } }]]);
    const handler = createHandler({ store, verifyToken: async () => ({ uid: 'user-a' }), fetcher: () => { throw new Error('Não deve consultar o Mercado Pago'); } });
    const response = await handler(new Request('https://payments.example.com/access'), { ...env, CHECKOUT_ENABLED: 'false', MP_ACCESS_TOKEN: '', MP_WEBHOOK_SECRET: '', MP_COLLECTOR_ID: '' });
    assert.equal(response.status, 200); assert.equal((await response.json()).active, true);
});

test('notificação assinada com JSON sem objeto falha sem consultar o provedor', async () => {
    const ts = String(Date.now()), id = String(payment.id), requestId = 'malformed-body';
    const signed = await signature(env.MP_WEBHOOK_SECRET, id, requestId, ts);
    const handler = createHandler({ store: new MemoryStore(), fetcher: () => { throw new Error('Não deve consultar'); } });
    const response = await handler(new Request('https://payments.example.com/webhooks/mercadopago?data.id=' + id, { method: 'POST', headers: { 'x-signature': `ts=${ts},v1=${signed}`, 'x-request-id': requestId }, body: 'null' }), env);
    assert.equal(response.status, 400);
});

test('Pages migration accepts only the two configured origins and preserves each checkout return URL',async()=>{
    const migrated={...env,APP_URL:'https://caderno-estudos.pages.dev/',LEGACY_APP_URL:'https://example.com/caderno-estudos/'};
    for(const origin of ['https://caderno-estudos.pages.dev','https://example.com']) {
        const store=new MemoryStore();let preference;
        const handler=createHandler({store,verifyToken:async()=>({uid:'user-a'}),fetcher:async(url,options)=>{
            assert.equal(url,'https://api.mercadopago.com/checkout/preferences');preference=JSON.parse(options.body);
            return new Response(JSON.stringify({id:'pref',init_point:'https://www.mercadopago.com.br/checkout/v1/test'}));
        }});
        const preflight=await handler(new Request('https://payments.example.com/checkout',{method:'OPTIONS',headers:{Origin:origin}}),migrated);
        assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),origin);
        const response=await handler(new Request('https://payments.example.com/checkout',{method:'POST',headers:{Origin:origin}}),migrated);
        assert.equal(response.status,200);
        assert.equal(preference.back_urls.success,origin+(origin==='https://example.com'?'/caderno-estudos/':'/')+'?billing=return');
    }
    const handler=createHandler();
    for(const origin of ['https://evil.pages.dev','https://caderno-estudos.pages.dev.evil.example','https://preview.caderno-estudos.pages.dev']) {
        const response=await handler(new Request('https://payments.example.com/checkout',{method:'OPTIONS',headers:{Origin:origin}}),migrated);
        assert.equal(response.status,403);assert.equal(response.headers.get('access-control-allow-origin'),null);
    }
});

test('Firestore transport preserves native Workers fetch receiver requirements',async()=>{
    const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
    const pem='-----BEGIN PRIVATE KEY-----\n'+toBase64(await crypto.subtle.exportKey('pkcs8',pair.privateKey))+'\n-----END PRIVATE KEY-----';
    const calls=[];
    const nativeLikeFetch=async function(url,options) {
        // Workers native fetch rejects a Firestore instance as its receiver.
        if (this !== undefined) throw new TypeError('Illegal invocation');
        calls.push(url);
        if(url==='https://oauth2.googleapis.com/token') return new Response(JSON.stringify({access_token:'transport-test-token',expires_in:3600}));
        assert.equal(options.headers.Authorization,'Bearer transport-test-token');
        if(url.endsWith(':beginTransaction')) return new Response(JSON.stringify({transaction:'t1'}));
        if(url.endsWith(':commit')) {
            assert(JSON.parse(options.body).writes.every(write => write.update.name.includes('/documents/artifacts/caderno-estudos/')));
            return new Response(JSON.stringify({writeResults:[]}));
        }
        if(url.includes('/documents/artifacts/caderno-estudos/access/')) return new Response(JSON.stringify({fields:{active:{booleanValue:true}},updateTime:'v1'}));
        throw Error('Unexpected provider URL');
    };
    const store=new Firestore({...env,FIREBASE_PROJECT_ID:'transport-test',FIREBASE_PRIVATE_KEY:pem},nativeLikeFetch);
    await store.atomic(async tx=>{const old=await tx.get('access/user-a');assert.equal(old.data.active,true);tx.put('access/user-a',{active:true,expiresAt:null},old)});
    assert.equal(calls.length,4);assert(calls.at(-1).endsWith('/documents:commit'));
});

test('unexpected checkout failures identify stage without exposing exception credentials',async()=>{
    const store=new MemoryStore();store.atomic=async()=>{throw new TypeError('private-token-value')};
    const handler=createHandler({store,verifyToken:async()=>({uid:'user-a'})});
    const response=await handler(new Request('https://payments.example.com/checkout',{method:'POST'}),env);
    const body=await response.json();assert.equal(response.status,500);assert.equal(body.code,'FIREBASE_CHECKOUT:TypeError');
    assert(!JSON.stringify(body).includes('private-token-value'));
});

test('automatic collector uses authenticated provider account and rejects invalid identity',async()=>{
    const automatic={...env,MP_COLLECTOR_ID:'auto'};
    const resolved=await collectorConfiguration(automatic,async path=>{assert.equal(path,'/users/me');return {id:123}});
    assert.equal(resolved.MP_COLLECTOR_ID,'123');assert.equal(automatic.MP_COLLECTOR_ID,'auto');
    for(const id of [undefined,'','invalid','123/456',1.5]) await assert.rejects(collectorConfiguration(automatic,async()=>({id})),{status:503});
    assert.equal(await collectorConfiguration(env,()=>{throw Error('unexpected')}),env);
});
test('automatic collector webhook still rejects payments to another receiver',async()=>{
    for(const collector of [123,299]) {
        const store=new MemoryStore([['billingOrders/'+orderId,order]]);const paths=[];
        const handler=createHandler({store,fetcher:async(url,options)=>{
            assert.equal(options.headers.Authorization,'Bearer '+env.MP_ACCESS_TOKEN);paths.push(url);
            return new Response(JSON.stringify(url.endsWith('/users/me')?{id:123}:{...payment,collector_id:collector}));
        }});
        const ts=String(Date.now());const hash=await signature(env.MP_WEBHOOK_SECRET,'123456','req',ts);
        const response=await handler(new Request('https://payments.example.com/webhooks/mercadopago?data.id=123456',{
            method:'POST',headers:{'x-signature':`ts=${ts},v1=${hash}`,'x-request-id':'req'},body:JSON.stringify({type:'payment',data:{id:123456}})
        }),{...env,MP_COLLECTOR_ID:'auto'});
        assert.deepEqual(paths,['https://api.mercadopago.com/v1/payments/123456','https://api.mercadopago.com/users/me']);
        assert.equal(response.status,collector===123?200:422);
        assert.equal((await store.get('access/user-a'))?.data.active,collector===123?true:undefined);
    }
});
test('automatic collector lookup is protected by authentication and disabled checkout',async()=>{
    let calls=0;const fetcher=async()=>{calls++;throw Error('must not call')};
    const denied=createHandler({store:new MemoryStore(),fetcher,verifyToken:async()=>{throw new HttpError(401,'Entre novamente.')}});
    const request=()=>new Request('https://payments.example.com/checkout',{method:'POST'});
    assert.equal((await denied(request(),{...env,MP_COLLECTOR_ID:'auto'})).status,401);
    const disabled=createHandler({store:new MemoryStore(),fetcher,verifyToken:async()=>({uid:'user-a'})});
    assert.equal((await disabled(request(),{...env,MP_COLLECTOR_ID:'auto',CHECKOUT_ENABLED:'false'})).status,503);
    assert.equal(calls,0);
});

test('forged webhook is rejected before any API call or entitlement write',async()=>{
    const store=new MemoryStore([['billingOrders/'+orderId,order]]);let calls=0;
    const handler=createHandler({store,fetcher:async()=>{calls++;throw new Error('must not call')}});
    const response=await handler(new Request('https://payments.example.com/webhooks/mercadopago?data.id=123456',{method:'POST',body:JSON.stringify({type:'payment',data:{id:123456}})}),env);
    assert.equal(response.status,401);assert.equal(calls,0);assert.equal(await store.get('access/user-a'),null);
});
test('signed webhook queries authoritative provider status; body claiming approval is ignored',async()=>{
    const store=new MemoryStore([['billingOrders/'+orderId,order]]);let calls=0;
    const handler=createHandler({store,fetcher:async(url,options)=>{calls++;assert.equal(url,'https://api.mercadopago.com/v1/payments/123456');assert.equal(options.headers.Authorization,'Bearer '+env.MP_ACCESS_TOKEN);return new Response(JSON.stringify({...payment,status:'pending'}));}});
    const ts=String(Date.now());const hash=await signature(env.MP_WEBHOOK_SECRET,'123456','req',ts);
    const response=await handler(new Request('https://payments.example.com/webhooks/mercadopago?data.id=123456',{method:'POST',headers:{'x-signature':`ts=${ts},v1=${hash}`,'x-request-id':'req'},body:JSON.stringify({type:'payment',status:'approved',uid:'victim',data:{id:123456}})}),env);
    assert.equal(response.status,200);assert.equal(calls,1);assert.equal((await store.get('access/user-a')).data.active,false);assert.equal(await store.get('access/victim'),null);
});
test('webhook body and signed URL ID must agree; oversized requests are rejected',async()=>{
    const ts=String(Date.now());const hash=await signature(env.MP_WEBHOOK_SECRET,'123456','req',ts);
    const headers={'x-signature':`ts=${ts},v1=${hash}`,'x-request-id':'req'};
    const handler=createHandler({store:new MemoryStore(),fetcher:()=>{throw new Error('must not call')}});
    const mismatch=await handler(new Request('https://payments.example.com/webhooks/mercadopago?data.id=123456',{method:'POST',headers,body:JSON.stringify({type:'payment',data:{id:654321}})}),env);
    assert.equal(mismatch.status,400);
    const large=await handler(new Request('https://payments.example.com/webhooks/mercadopago?data.id=123456',{method:'POST',headers,body:'x'.repeat(17000)}),env);
    assert.equal(large.status,413);
});
test('access is determined by verified UID, never query parameters or payment-return flags',async()=>{
    const store=new MemoryStore([['access/victim',{active:true,expiresAt:null}]]);
    const handler=createHandler({store,verifyToken:async token=>{assert.equal(token,'signed-token');return {uid:'user-a'}}});
    const response=await handler(new Request('https://payments.example.com/access?uid=victim&status=approved',{headers:{Authorization:'Bearer signed-token',Origin:'https://example.com'}}),env);
    assert.deepEqual(await response.json(),{active:false,testApproved:false});
    assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('access-control-allow-origin'),'https://example.com');
    const denied=createHandler({store,verifyToken:async()=>{throw new HttpError(401,'Entre novamente.')}});
    assert.equal((await denied(new Request('https://payments.example.com/access'),env)).status,401);
});
test('untrusted origin, wrong method and unconfigured service fail closed',async()=>{
    const handler=createHandler();
    const cors=await handler(new Request('https://payments.example.com/plan',{headers:{Origin:'https://evil.example'}}),env);assert.equal(cors.status,403);assert.equal(cors.headers.get('access-control-allow-origin'),null);
    const unset=await handler(new Request('https://payments.example.com/access'),{APP_URL:env.APP_URL});assert.equal(unset.status,503);
    const text=await unset.text();assert(!text.includes('not-a-real-token'));assert(!text.includes('PRIVATE_KEY'));
    const preflight=await handler(new Request('https://payments.example.com/checkout',{method:'OPTIONS',headers:{Origin:'https://example.com'}}),env);assert.equal(preflight.status,204);
});
test('Firestore atomic commit retries a conflict and includes read-version preconditions',async()=>{
    const store=new Firestore(env);let begins=0,commits=0,rollbacks=0;
    store.get=async()=>({data:{count:1},updateTime:'version-1'});
    store.call=async(path,options)=>{
        if(path===':beginTransaction'){begins++;return {transaction:'t'+begins}}
        if(path===':rollback'){rollbacks++;return {}}
        if(path===':commit'){
            commits++;const body=JSON.parse(options.body);assert.equal(body.writes[0].currentDocument.updateTime,'version-1');
            if(commits===1)throw new HttpError(409,'Conflict');return {};
        }
        throw new Error('Unexpected path');
    };
    await store.atomic(async tx=>{const old=await tx.get('access/user-a');tx.put('access/user-a',{active:true},old)});
    assert.equal(begins,2);assert.equal(commits,2);assert.equal(rollbacks,1);
});
