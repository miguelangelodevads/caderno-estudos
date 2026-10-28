import {HttpError} from './auth.js';

export function planFromEnv(env) {
    const cents = Number(env.PLAN_AMOUNT_CENTS);
    if (!/^\d+$/.test(env.PLAN_AMOUNT_CENTS || '') || !Number.isSafeInteger(cents) || cents < 1 || cents > 10000000 ||
        !/^[a-zA-Z0-9_-]{1,80}$/.test(env.PLAN_ID || '') || !env.PLAN_TITLE || env.PLAN_TITLE.length > 200 ||
        !['sandbox','production'].includes(env.MP_ENVIRONMENT)) throw new HttpError(503, 'Pagamento ainda não configurado.');
    return {id:env.PLAN_ID, title:env.PLAN_TITLE, amountCents:cents, currency:'BRL', type:'one_time'};
}
export function isAccessActive(data, now = Date.now()) {
    return data?.active === true && (!data.expiresAt || data.expiresAt.getTime() > now);
}
export function safeCheckoutUrl(value, environment) {
    try {
        const url = new URL(value);
        const host = environment === 'sandbox' ? 'sandbox.mercadopago.com.br' : 'www.mercadopago.com.br';
        if (url.protocol === 'https:' && !url.username && !url.password && !url.port && url.hostname === host && url.pathname.startsWith('/checkout/')) return url.href;
    } catch { /* A falha principal permanece visível ao chamador. */ }
    throw new HttpError(503, 'Link de pagamento inválido.');
}
const orderPath = id => 'billingOrders/' + id;
const checkoutPath = uid => 'billingCheckouts/' + uid;
const accessPath = uid => 'access/' + uid;

export async function createCheckout(uid, env, store, mpRequest, now = Date.now()) {
    if (env.CHECKOUT_ENABLED !== 'true') throw new HttpError(503, 'O pagamento ainda está em configuração.');
    const plan = planFromEnv(env);
    const candidateId = 'ce_' + crypto.randomUUID();
    const reservation = await store.atomic(async tx => {
        const access = await tx.get(accessPath(uid));
        const current = await tx.get(checkoutPath(uid));
        if (isAccessActive(access?.data, now)) throw new HttpError(409, 'Seu acesso já está liberado.');
        const samePlan = current?.data.planId === plan.id && current.data.amountCents === plan.amountCents && current.data.environment === env.MP_ENVIRONMENT;
        if (samePlan && current.data.state === 'ready' && current.data.validUntil?.getTime() > now) return {checkoutUrl:safeCheckoutUrl(current.data.checkoutUrl, env.MP_ENVIRONMENT)};
        if (current?.data.lockUntil?.getTime() > now && current.data.state === 'creating') throw new HttpError(409, 'Seu pagamento está sendo preparado. Aguarde alguns segundos.');
        const retry = samePlan && ['failed','creating'].includes(current.data.state) && current.data.retryUntil?.getTime() > now;
        const previous = retry ? await tx.get(orderPath(current.data.orderId)) : null;
        const canRetry = previous?.data.uid === uid && previous.data.environment === env.MP_ENVIRONMENT;
        const id = canRetry ? current.data.orderId : candidateId;
        const returnUrl = new URL(env.APP_URL);
        returnUrl.searchParams.set('billing','return');
        const data = canRetry ? previous.data : {
            uid, planId:plan.id, title:plan.title, amountCents:plan.amountCents, currency:plan.currency,
            environment:env.MP_ENVIRONMENT, createdAt:new Date(now), type:'one_time',
            returnUrl:returnUrl.href, notificationUrl:new URL('/webhooks/mercadopago',env.WORKER_URL).href,
            preferenceExpiresAt:new Date(now + 3600000)
        };
        if (!canRetry) tx.put(orderPath(id), data, null);
        tx.put(checkoutPath(uid), {
            orderId:id, state:'creating', lockUntil:new Date(now + 120000), retryUntil:data.preferenceExpiresAt,
            planId:plan.id, amountCents:plan.amountCents, environment:env.MP_ENVIRONMENT
        }, current);
        return {orderId:id, data};
    });
    if (reservation.checkoutUrl) return reservation;
    const {orderId, data} = reservation;
    try {
        const preference = await mpRequest('/checkout/preferences', {
            method:'POST', headers:{'X-Idempotency-Key':orderId},
            body:JSON.stringify({
                items:[{id:data.planId, title:data.title, quantity:1, currency_id:data.currency, unit_price:data.amountCents / 100}],
                external_reference:orderId, notification_url:data.notificationUrl,
                back_urls:{success:data.returnUrl, pending:data.returnUrl, failure:data.returnUrl},
                auto_return:'approved', expires:true, expiration_date_to:data.preferenceExpiresAt.toISOString()
            })
        });
        const checkoutUrl = safeCheckoutUrl(env.MP_ENVIRONMENT === 'sandbox' ? preference.sandbox_init_point : preference.init_point, env.MP_ENVIRONMENT);
        await store.atomic(async tx => {
            const current = await tx.get(checkoutPath(uid));
            if (current?.data.orderId !== orderId) throw new HttpError(409, 'Tente abrir o pagamento novamente.');
            tx.put(checkoutPath(uid), {...current.data,state:'ready',checkoutUrl,preferenceId:String(preference.id),validUntil:data.preferenceExpiresAt,lockUntil:new Date(0)},current);
        });
        return {checkoutUrl};
    } catch (error) {
        try {
            await store.atomic(async tx => {
                const current = await tx.get(checkoutPath(uid));
                if (current?.data.orderId === orderId) tx.put(checkoutPath(uid),{...current.data,state:'failed',lockUntil:new Date(0)},current);
            });
        } catch { /* O mesmo pedido permanece recuperável após o lock expirar. */ }
        throw error;
    }
}

function paymentCents(amount) {
    const text = String(amount);
    if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return -1;
    return Math.round(Number(text) * 100);
}

// Recover a missed webhook from the authenticated user's server-created order.
// Neither payment IDs nor ownership are accepted from the browser.
export async function reconcileAccess(uid, env, store, mpRequest, now = Date.now()) {
    const orderId = await store.atomic(async tx => {
        const access = await tx.get(accessPath(uid));
        const checkout = await tx.get(checkoutPath(uid));
        if (isAccessActive(access?.data,now) || !checkout) return null;
        const id = checkout.data.orderId;
        if (!/^ce_[a-f0-9-]{36}$/.test(id || '')) return null;
        const order = await tx.get(orderPath(id));
        if (!order || order.data.uid !== uid || order.data.environment !== env.MP_ENVIRONMENT) return null;
        if (checkout.data.lastCheckedAt?.getTime() > now - 15000) return null;
        tx.put(checkoutPath(uid),{...checkout.data,lastCheckedAt:new Date(now)},checkout);
        return id;
    });
    if (!orderId) return;
    const search = await mpRequest('/v1/payments/search?' + new URLSearchParams({external_reference:orderId,sort:'date_last_updated',criteria:'desc',limit:'5'}));
    if (!Array.isArray(search.results)) throw new HttpError(503,'Não foi possível verificar seu pagamento. Tente novamente.');
    for (const result of search.results.slice(0,5)) {
        const id = String(result.id || '');
        if (!/^\d{1,25}$/.test(id)) continue;
        const payment = await mpRequest('/v1/payments/' + id);
        if (String(payment.id) !== id || payment.external_reference !== orderId) continue;
        await applyPayment(payment,env,store,now);
    }
}

export async function applyPayment(payment, env, store, now = Date.now()) {
    const id = String(payment.id || '');
    const orderId = payment.external_reference;
    if (!/^\d{1,25}$/.test(id) || typeof orderId !== 'string' || !/^ce_[a-f0-9-]{36}$/.test(orderId)) {
        return {ignored:true};
    }
    if (String(payment.collector_id) !== String(env.MP_COLLECTOR_ID) ||
        typeof payment.live_mode !== 'boolean' || payment.live_mode !== (env.MP_ENVIRONMENT === 'production')) {
        throw new HttpError(422, 'Pagamento não corresponde a esta integração.');
    }
    const providerUpdatedAt = new Date(payment.date_last_updated);
    if (!Number.isFinite(providerUpdatedAt.getTime())) throw new HttpError(422, 'Data de pagamento inválida.');
    return store.atomic(async tx => {
        const order = await tx.get(orderPath(orderId));
        if (!order) return {ignored:true};
        const uid = order.data.uid;
        if (typeof uid !== 'string' || !uid || uid.includes('/')) throw new HttpError(422, 'Conta de pagamento inválida.');
        if (order.data.environment !== env.MP_ENVIRONMENT || order.data.type !== 'one_time' ||
            payment.currency_id !== order.data.currency || paymentCents(payment.transaction_amount) !== order.data.amountCents) {
            throw new HttpError(422, 'Valor ou moeda do pagamento não corresponde ao pedido.');
        }
        const receiptPath = 'billingPayments/' + id;
        const receipt = await tx.get(receiptPath);
        const access = await tx.get(accessPath(uid));
        if (receipt && (receipt.data.uid !== uid || receipt.data.orderId !== orderId)) throw new HttpError(422, 'Pagamento já associado a outro pedido.');
        if (receipt && (receipt.data.providerUpdatedAt.getTime() > providerUpdatedAt.getTime() ||
            (receipt.data.providerUpdatedAt.getTime() === providerUpdatedAt.getTime() && receipt.data.status === payment.status))) {
            return {duplicate:true};
        }
        if (receipt && ['refunded', 'charged_back', 'cancelled'].includes(receipt.data.status) && payment.status === 'approved') return {ignored:true};
        const grants = {...(access?.data.grants || {})};
        // Test approvals never grant production access, even if production is activated later.
        const refunded = receipt?.data.refunded === true || Number(payment.transaction_amount_refunded || 0) > 0 || ['refunded','charged_back'].includes(payment.status);
        if (payment.status === 'approved' && !refunded) grants[id] = {environment:env.MP_ENVIRONMENT};
        else delete grants[id];
        const manual = access?.data.admin === true;
        const legacy = access?.data.legacy?.permanent === true;
        const paid = Object.values(grants).some(grant => grant.environment === 'production');
        const active = manual || legacy || paid;
        tx.put(receiptPath, {
            uid, orderId, status:String(payment.status), refunded, providerUpdatedAt,
            amountCents:order.data.amountCents, currency:order.data.currency,
            environment:env.MP_ENVIRONMENT, updatedAt:new Date(now)
        }, receipt);
        tx.put(accessPath(uid), {
            ...(access?.data || {}), active, expiresAt:null, admin:manual, grants, updatedAt:new Date(now),
            testApproved:env.MP_ENVIRONMENT === 'sandbox' && payment.status === 'approved'
        }, access);
        return {processed:true};
    });
}
