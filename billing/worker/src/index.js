import {HttpError, verifyFirebaseToken, verifyMercadoPagoSignature} from './auth.js';
import {Firestore} from './firestore.js';
import {createCheckout, applyPayment, reconcileAccess, planFromEnv, isAccessActive} from './payments.js';
import {publicDefaults} from './config.js';

async function boundedJSON(request) {
    if (Number(request.headers.get('content-length') || 0) > 16384) throw new HttpError(413,'Notificação muito grande.');
    const reader = request.body?.getReader();
    if (!reader) throw new HttpError(400,'Notificação vazia.');
    const chunks = []; let length = 0;
    while (true) {
        const {done,value} = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 16384) { await reader.cancel(); throw new HttpError(413,'Notificação muito grande.'); }
        chunks.push(value);
    }
    const bytes = new Uint8Array(length);let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk,offset);offset += chunk.length; }
    try { return JSON.parse(new TextDecoder().decode(bytes)); }
    catch { throw new HttpError(400,'Notificação inválida.'); }
}

function requiredConfiguration(env, payments = true) {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(env.APP_ID || "")) throw new HttpError(503, "Aplicativo não configurado.");
    for (const name of ['FIREBASE_PROJECT_ID','FIREBASE_CLIENT_EMAIL','FIREBASE_PRIVATE_KEY','APP_URL','WORKER_URL', ...(payments ? ['MP_ACCESS_TOKEN','MP_WEBHOOK_SECRET','MP_COLLECTOR_ID'] : [])]) {
        if (!env[name]) throw new HttpError(503,'A integração de pagamento ainda não está configurada.');
    }
    for (const name of ['APP_URL','WORKER_URL']) {
        try { const url = new URL(env[name]); if (url.protocol !== 'https:' || url.hostname.endsWith('.invalid')) throw new Error(); }
        catch { throw new HttpError(503,'Endereço da integração inválido.'); }
    }
}

// Resolve from the authenticated provider account, never from client input or webhook data.
export async function collectorConfiguration(env, mpRequest) {
    if (env.MP_COLLECTOR_ID !== 'auto') return env;
    const account = await mpRequest('/users/me');
    const id = String(account.id || '');
    if (!/^\d{1,25}$/.test(id)) throw new HttpError(503,'Não foi possível identificar a conta recebedora.');
    return {...env,MP_COLLECTOR_ID:id};
}

export function createHandler(dependencies = {}) {
    const fetcher = dependencies.fetcher || fetch;
    return async (request,env) => {
        let stage = 'CONFIGURATION';
        let appOrigin = '', legacyOrigin = '';
        try { appOrigin = new URL(env.APP_URL).origin; } catch { /* A falha principal permanece visível ao chamador. */ }
        try {
            const legacy = new URL(env.LEGACY_APP_URL);
            if (legacy.protocol === 'https:' && !legacy.username && !legacy.password && !legacy.search && !legacy.hash) legacyOrigin = legacy.origin;
        } catch { /* A falha principal permanece visível ao chamador. */ }
        const origin = request.headers.get('Origin');
        const allowedOrigin = !!origin && (origin === appOrigin || origin === legacyOrigin);
        const headers = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'};
        if (allowedOrigin) {
            headers['Access-Control-Allow-Origin'] = origin;
            headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
            headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
        }
        const reply = (data,status=200) => new Response(JSON.stringify(data),{status,headers});
        try {
            const url = new URL(request.url);
            if (request.method === 'OPTIONS') return allowedOrigin
                ? new Response(null,{status:204,headers}) : reply({error:'Origem não permitida.'},403);
            if (origin && !allowedOrigin) throw new HttpError(403,'Origem não permitida.');
            if (url.pathname === '/health' && request.method === 'GET') return reply({service:'caderno-estudos-payments',version:'billing-v1',environment:env.MP_ENVIRONMENT || 'unconfigured'});
            if (url.pathname === '/plan' && request.method === 'GET') return reply({...planFromEnv(env),enabled:env.CHECKOUT_ENABLED === 'true'});
            if (!['/checkout','/access','/reconcile','/webhooks/mercadopago'].includes(url.pathname)) return reply({error:'Não encontrado.'},404);
            requiredConfiguration(env, url.pathname !== '/access');
            const store = dependencies.store || new Firestore(env,fetcher);
            const mpRequest = async (path,options={}) => {
                stage = path === '/users/me' ? 'MP_ACCOUNT' : path === '/checkout/preferences' ? 'MP_CHECKOUT' : 'MP_PAYMENT';
                const response = await fetcher('https://api.mercadopago.com' + path, {
                    ...options, headers:{...options.headers,Authorization:'Bearer ' + env.MP_ACCESS_TOKEN,'Content-Type':'application/json'}
                });
                if (!response.ok) throw new HttpError(503,'Não foi possível consultar o Mercado Pago. Tente novamente.');
                return response.json();
            };
            if (url.pathname === '/webhooks/mercadopago') {
                if (request.method !== 'POST') throw new HttpError(405,'Método não permitido.');
                const id = url.searchParams.get('data.id');
                await verifyMercadoPagoSignature(request,id,env.MP_WEBHOOK_SECRET);
                const body = await boundedJSON(request);
                if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400,'Notificação inválida.');
                if (body.type !== 'payment') return reply({ignored:true});
                if (String(body.data?.id) !== id) throw new HttpError(400,'Identificador de pagamento divergente.');
                const payment = await mpRequest('/v1/payments/' + id);
                if (String(payment.id) !== id) throw new HttpError(422,'Identificador de pagamento divergente.');
                return reply(await applyPayment(payment,await collectorConfiguration(env,mpRequest),store));
            }
            const token = /^Bearer (\S+)$/.exec(request.headers.get('Authorization') || '')?.[1];
            stage = 'SESSION';
            const user = await (dependencies.verifyToken || verifyFirebaseToken)(token,env.FIREBASE_PROJECT_ID,fetcher);
            if (url.pathname === '/reconcile' && request.method === 'POST') {
                const resolved = await collectorConfiguration(env,mpRequest);
                stage = 'PAYMENT_RECONCILIATION';
                await reconcileAccess(user.uid,resolved,store,mpRequest);
                const access = await store.get('access/' + user.uid);
                return reply({active:isAccessActive(access?.data),testApproved:access?.data.testApproved === true});
            }
            if (url.pathname === '/access' && request.method === 'GET') {
                stage = 'FIREBASE_ACCESS';
                const access = await store.get('access/' + user.uid);
                return reply({active:isAccessActive(access?.data),testApproved:access?.data.testApproved === true});
            }
            if (url.pathname === '/checkout' && request.method === 'POST') {
                if (env.CHECKOUT_ENABLED !== 'true') throw new HttpError(503,'O pagamento ainda está em configuração.');
                const returnEnv = origin && origin === legacyOrigin ? {...env,APP_URL:env.LEGACY_APP_URL} : env;
                const resolved = await collectorConfiguration(returnEnv,mpRequest);
                stage = 'FIREBASE_CHECKOUT';
                return reply(await createCheckout(user.uid,resolved,store,mpRequest));
            }
            throw new HttpError(405,'Método não permitido.');
        } catch (error) {
            const known = error instanceof HttpError;
            // Never log provider bodies, headers, tokens, keys or arbitrary exception messages.
            const kind = ['TypeError','SyntaxError','DataError','OperationError','InvalidCharacterError'].includes(error?.name) ? error.name : 'Error';
            const code = `${stage}:${kind}`;
            console.error('billing_request_failed', {stage,kind,status:known ? error.status : 500});
            return reply({error:known ? error.message : `Não foi possível concluir. Código: ${code}.`,code}, known ? error.status : 500);
        }
    };
}
const handler = createHandler();
export default {fetch:(request, env) => handler(request, {...publicDefaults, ...env})};
