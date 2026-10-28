import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyPayment,reconcileAccess,createCheckout,planFromEnv,isAccessActive,safeCheckoutUrl} from '../src/payments.js';
import {MemoryStore,env,order,orderId,payment} from './helpers.js';

test('timeout de checkout reutiliza o mesmo pedido e a mesma chave em nova tentativa', async () => {
    const store = new MemoryStore();
    const attempts = [];
    const now = Date.now();
    const provider = async (path, options) => {
        attempts.push({ path, key: options.headers['X-Idempotency-Key'], body: options.body });
        if (attempts.length === 1) throw new Error('Timeout simulado');
        return { id: 'pref-1', init_point: 'https://www.mercadopago.com.br/checkout/v1/test' };
    };
    await assert.rejects(createCheckout('user-a', env, store, provider, now));
    await createCheckout('user-a', env, store, provider, now + 1000);
    assert.deepEqual(attempts[0], attempts[1]);
    assert.equal([...store.docs.keys()].filter(path => path.startsWith('billingOrders/')).length, 1);
});

test('missed webhook is recovered from authoritative payment for the signed-in users stored order',async()=>{
    const store=new MemoryStore([['billingOrders/'+orderId,order],['billingCheckouts/user-a',{orderId,state:'ready'}]]);
    const calls=[];const mp=async path=>{
        calls.push(path);
        if(path.startsWith('/v1/payments/search?')) {assert.equal(new URLSearchParams(path.split('?')[1]).get('external_reference'),orderId);return {results:[{id:123456,status:'approved'}]}}
        assert.equal(path,'/v1/payments/123456');return payment;
    };
    await reconcileAccess('user-a',env,store,mp);
    assert.equal((await store.get('access/user-a')).data.active,true);assert.equal(calls.length,2);
    await reconcileAccess('user-a',env,store,mp);assert.equal(calls.length,2);
});
test('reconciliation cannot claim another users order or grant from untrusted search summaries',async()=>{
    const stolen=new MemoryStore([['billingOrders/'+orderId,order],['billingCheckouts/victim',{orderId}]]);
    await reconcileAccess('victim',env,stolen,()=>{throw Error('must not query provider')});
    assert.equal(await stolen.get('access/victim'),null);
    for(const supplied of [{...payment,status:'pending'},{...payment,external_reference:'unrelated'}]) {
        const store=new MemoryStore([['billingOrders/'+orderId,order],['billingCheckouts/user-a',{orderId}]]);
        let calls=0;const mp=async path=>{calls++;return path.includes('/search?')?{results:[{id:123456,status:'approved'}]}:supplied};
        const now=Date.now();await reconcileAccess('user-a',env,store,mp,now);
        assert.notEqual((await store.get('access/user-a'))?.data.active,true);
        await reconcileAccess('user-a',env,store,mp,now+1000);assert.equal(calls,2);
    }
});
test('reconciliation retains amount, collector, environment and sandbox restrictions',async()=>{
    for(const overrides of [{transaction_amount:1},{collector_id:299},{live_mode:false}]) {
        const store=new MemoryStore([['billingOrders/'+orderId,order],['billingCheckouts/user-a',{orderId}]]);
        await assert.rejects(reconcileAccess('user-a',env,store,async path=>path.includes('/search?')?{results:[{id:123456}]}:{...payment,...overrides}),{status:422});
        assert.equal(await store.get('access/user-a'),null);
    }
    const store=new MemoryStore([['billingOrders/'+orderId,{...order,environment:'sandbox'}],['billingCheckouts/user-a',{orderId}]]);
    await reconcileAccess('user-a',{...env,MP_ENVIRONMENT:'sandbox'},store,async path=>path.includes('/search?')?{results:[{id:123456}]}:{...payment,live_mode:false});
    assert.equal((await store.get('access/user-a')).data.active,false);
});

test('R$2.99 one-time plan is configured in cents; invalid pricing fails closed',()=>{
    assert.equal(planFromEnv(env).amountCents,299);
    assert.equal(planFromEnv(env).type,'one_time');
    for (const amount of ['0','2.99','-1','NaN','299299299299299299']) assert.throws(()=>planFromEnv({...env,PLAN_AMOUNT_CENTS:amount}));
});
test('approved payment grants only the order owner and duplicate callbacks do not write again',async()=>{
    const store=new MemoryStore([['billingOrders/'+orderId,order]]);
    await applyPayment(payment,env,store);
    assert.equal((await store.get('access/user-a')).data.active,true);
    assert.equal(await store.get('access/user-b'),null);
    const version=store.version;
    assert.equal((await applyPayment(payment,env,store)).duplicate,true);
    assert.equal(store.version,version);
});
test('pending and rejected payments do not grant access',async()=>{
    for(const status of ['pending','rejected','in_process','cancelled']) {
        const store=new MemoryStore([['billingOrders/'+orderId,order]]);
        await applyPayment({...payment,status},env,store);
        assert.equal((await store.get('access/user-a')).data.active,false);
    }
});
test('wrong amount, currency, merchant or environment never grants access',async()=>{
    for(const mismatch of [{transaction_amount:0.99},{transaction_amount:9.299},{currency_id:'USD'},{collector_id:456},{live_mode:false}]) {
        const store=new MemoryStore([['billingOrders/'+orderId,order]]);
        await assert.rejects(applyPayment({...payment,...mismatch},env,store),{status:422});
        assert.equal(await store.get('access/user-a'),null);
    }
});
test('unknown external reference and missing order cannot grant a purchase',async()=>{
    const store=new MemoryStore();
    assert.equal((await applyPayment({...payment,external_reference:'user-a'},env,store)).ignored,true);
    assert.equal((await applyPayment(payment,env,store)).ignored,true);
    assert.equal(store.docs.size,0);
});
test('refund and chargeback revoke access; stale approval cannot restore it',async()=>{
    for(const status of ['refunded','charged_back']) {
        const store=new MemoryStore([['billingOrders/'+orderId,order]]);
        await applyPayment(payment,env,store);
        await applyPayment({...payment,status,date_last_updated:'2026-10-22T00:00:00Z'},env,store);
        assert.equal((await store.get('access/user-a')).data.active,false);
        await applyPayment(payment,env,store);
        assert.equal((await store.get('access/user-a')).data.active,false);
    }
});
test('refund cannot remove another valid purchase or the owner administrative exemption',async()=>{
    const store=new MemoryStore([['billingOrders/'+orderId,order]]);
    await applyPayment(payment,env,store);
    await applyPayment({...payment,id:987654},env,store);
    await applyPayment({...payment,status:'refunded',date_last_updated:'2026-10-22T00:00:00Z'},env,store);
    assert.equal((await store.get('access/user-a')).data.active,true);
    const admin=new MemoryStore([['billingOrders/'+orderId,order],['access/user-a',{admin:true,active:true,expiresAt:null}]]);
    await applyPayment({...payment,status:'refunded'},env,admin);
    assert.equal((await admin.get('access/user-a')).data.active,true);
});
test('partial refund revokes its grant and sandbox approval never enables production access',async()=>{
    const store=new MemoryStore([['billingOrders/'+orderId,order]]);
    await applyPayment({...payment,transaction_amount_refunded:1},env,store);
    assert.equal((await store.get('access/user-a')).data.active,false);
    const sandbox=new MemoryStore([['billingOrders/'+orderId,{...order,environment:'sandbox'}]]);
    await applyPayment({...payment,live_mode:false},{...env,MP_ENVIRONMENT:'sandbox'},sandbox);
    const access=(await sandbox.get('access/user-a')).data;
    assert.equal(access.active,false);assert.equal(access.testApproved,true);
});
test('checkout uses server plan, binds UID, reuses pending checkout and blocks paid users',async()=>{
    const store=new MemoryStore();let calls=0,body;
    const mp=async(path,options)=>{calls++;body=JSON.parse(options.body);return {id:'pref',init_point:'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=123'}};
    const result=await createCheckout('user-a',env,store,mp);
    assert.equal(body.items[0].unit_price,2.99);
    assert.equal(body.items[0].quantity,1);
    assert.equal(body.back_urls.success,'https://example.com/caderno-estudos/?billing=return');
    assert.equal(body.notification_url,'https://payments.example.com/webhooks/mercadopago');
    assert.equal((await store.get('billingOrders/'+body.external_reference)).data.uid,'user-a');
    assert.deepEqual(await createCheckout('user-a',env,store,mp),result);assert.equal(calls,1);
    store.docs.set('access/user-a',{active:true,expiresAt:null});
    await assert.rejects(createCheckout('user-a',env,store,mp),{status:409});assert.equal(calls,1);
});
test('disabled checkout and an in-flight checkout cannot create a new charge preference',async()=>{
    const store=new MemoryStore();const mp=()=>{throw new Error('must not call')};
    await assert.rejects(createCheckout('user-a',{...env,CHECKOUT_ENABLED:'false'},store,mp),{status:503});
    store.docs.set('billingCheckouts/user-a',{state:'creating',lockUntil:new Date(Date.now()+60000)});
    await assert.rejects(createCheckout('user-a',env,store,mp),{status:409});
});
test('checkout never redirects to arbitrary domains or the wrong environment',()=>{
    for(const url of ['https://evil.example/checkout/','javascript:alert(1)','https://www.mercadopago.com.br.evil.example/checkout/','https://sandbox.mercadopago.com.br/checkout/v1/']) {
        assert.throws(()=>safeCheckoutUrl(url,'production'));
    }
    assert.equal(isAccessActive({active:true,expiresAt:new Date(0)}),false);
});
