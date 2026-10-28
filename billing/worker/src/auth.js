const encoder = new TextEncoder();
const decoder = new TextDecoder();
const jwksCache = new Map();
const oauthCache = new Map();
export class HttpError extends Error {
    constructor(status, message) { super(message); this.status = status; }
}
export const toBase64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
export const base64url = bytes => toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unbase64 = value => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const jwtPart = value => base64url(encoder.encode(JSON.stringify(value)));

export async function verifyFirebaseToken(token, projectId, fetcher = fetch, now = Date.now(), includeClaims = false) {
    try {
        if (typeof token !== 'string' || token.length > 12000) throw new Error();
        const parts = token.split('.');
        if (parts.length !== 3) throw new Error();
        const header = JSON.parse(decoder.decode(unbase64(parts[0])));
        const payload = JSON.parse(decoder.decode(unbase64(parts[1])));
        const seconds = now / 1000;
        if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid ||
            payload.aud !== projectId || payload.iss !== 'https://securetoken.google.com/' + projectId ||
            typeof payload.sub !== 'string' || !payload.sub.length || payload.sub.length > 128 || payload.sub.includes('/') || payload.firebase?.sign_in_provider === 'anonymous' ||
            !Number.isFinite(payload.exp) || payload.exp <= seconds ||
            !Number.isFinite(payload.iat) || payload.iat > seconds + 60 ||
            !Number.isFinite(payload.auth_time) || payload.auth_time > seconds + 60) throw new Error();
        const url = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
        let cached = jwksCache.get(url);
        if (!cached || cached.expires <= now) {
            const response = await fetcher(url);
            if (!response.ok) throw new HttpError(503, 'Não foi possível verificar a sessão. Tente novamente.');
            const data = await response.json();
            const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get('cache-control') || '')?.[1] || 3600);
            cached = {keys:data.keys || [], expires:now + Math.min(maxAge, 21600) * 1000};
            jwksCache.set(url, cached);
        }
        const jwk = cached.keys.find(key => key.kid === header.kid && key.kty === 'RSA');
        if (!jwk) { jwksCache.delete(url); throw new Error(); }
        const key = await crypto.subtle.importKey('jwk', jwk,
            {name:'RSASSA-PKCS1-v1_5', hash:'SHA-256'}, false, ['verify']);
        if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, unbase64(parts[2]),
            encoder.encode(parts[0] + '.' + parts[1]))) throw new Error();
        return includeClaims ? {...payload,uid:payload.sub} : {uid:payload.sub};
    } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(401, 'Entre novamente na sua conta.');
    }
}

async function signingKey(env) {
    let pem = (env.FIREBASE_PRIVATE_KEY || '').trim().replace(/,\s*$/, '');
    if (pem.startsWith('"')) pem = JSON.parse(pem);
    pem = pem.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
    return crypto.subtle.importKey('pkcs8', unbase64(pem.replace(/-----[^-]+-----|\s/g, '')),
        {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
}

export async function createDeviceToken(env, uid, deviceId, now = Date.now()) {
    const seconds = Math.floor(now / 1000);
    const input = jwtPart({alg:'RS256',typ:'JWT'}) + '.' + jwtPart({
        iss:env.FIREBASE_CLIENT_EMAIL,sub:env.FIREBASE_CLIENT_EMAIL,
        aud:'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
        iat:seconds,exp:seconds+300,uid,claims:{deviceId}
    });
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5',await signingKey(env),encoder.encode(input));
    return input + '.' + base64url(signature);
}

// End-user lookup checks the current account without expanding server IAM access.
export async function verifyDeviceUser(token, env, fetcher = fetch, now = Date.now()) {
    const user = await verifyFirebaseToken(token,env.FIREBASE_PROJECT_ID,fetcher,now,true);
    if (!env.FIREBASE_WEB_API_KEY) throw new HttpError(503,'Verificação da conta não configurada.');
    const response = await fetcher('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+encodeURIComponent(env.FIREBASE_WEB_API_KEY),{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token})
    });
    if (!response.ok) throw new HttpError(response.status>=500?503:401,'Entre novamente na sua conta.');
    const account = (await response.json()).users?.find(account=>account.localId===user.uid);
    if (!account || account.disabled || !Number.isFinite(Number(account.validSince)) || user.auth_time < Number(account.validSince))
        throw new HttpError(401,'Entre novamente na sua conta.');
    return user;
}

export async function googleAccessToken(env, fetcher = fetch, now = Date.now()) {
    const cacheKey = env.FIREBASE_PROJECT_ID + ':' + env.FIREBASE_CLIENT_EMAIL;
    const cached = oauthCache.get(cacheKey);
    if (cached && cached.expires > now + 60000) return cached.token;
    let key;
    try {
        let pem = (env.FIREBASE_PRIVATE_KEY || '').trim().replace(/,\s*$/, '');
        // Accept a JSON string copied from the downloaded key file, including its quotes.
        if (pem.startsWith('"')) pem = JSON.parse(pem);
        pem = pem.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
        if (!/^-----BEGIN PRIVATE KEY-----\s+[A-Za-z0-9+/=\s]+\s+-----END PRIVATE KEY-----\s*$/.test(pem)) throw new Error();
        const bytes = unbase64(pem.replace(/-----[^-]+-----|\s/g, ''));
        key = await crypto.subtle.importKey('pkcs8', bytes,
            {name:'RSASSA-PKCS1-v1_5', hash:'SHA-256'}, false, ['sign']);
    } catch {
        throw new HttpError(503,'Chave do Firebase inválida. Confira o Secret FIREBASE_PRIVATE_KEY no Cloudflare.');
    }
    const seconds = Math.floor(now / 1000);
    const input = jwtPart({alg:'RS256', typ:'JWT'}) + '.' + jwtPart({
        iss:env.FIREBASE_CLIENT_EMAIL, scope:'https://www.googleapis.com/auth/datastore',
        aud:'https://oauth2.googleapis.com/token', iat:seconds, exp:seconds + 3600
    });
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(input));
    const response = await fetcher('https://oauth2.googleapis.com/token', {
        method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion:input + '.' + base64url(signature)})
    });
    if (!response.ok) throw new HttpError(503, 'O Google recusou a conta de serviço. Confira os Secrets FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY.');
    const data = await response.json();
    if (!data.access_token || !Number.isFinite(data.expires_in)) throw new HttpError(503, 'Resposta de autenticação inválida.');
    oauthCache.set(cacheKey, {token:data.access_token, expires:now + data.expires_in * 1000});
    return data.access_token;
}

export async function verifyMercadoPagoSignature(request, id, secret, now = Date.now()) {
    const parts = Object.fromEntries((request.headers.get('x-signature') || '').split(',')
        .map(part => part.trim().split('=')).filter(part => part.length === 2));
    const requestId = request.headers.get('x-request-id');
    if (!secret || !/^\d{1,25}$/.test(id || '') || !/^\d{10,13}$/.test(parts.ts || '') ||
        !/^[a-fA-F0-9]{64}$/.test(parts.v1 || '') || !requestId || requestId.length > 200) {
        throw new HttpError(401, 'Notificação inválida.');
    }
    const milliseconds = Number(parts.ts) * (parts.ts.length <= 10 ? 1000 : 1);
    if (Math.abs(now - milliseconds) > 600000) throw new HttpError(401, 'Notificação expirada.');
    const manifest = `id:${id};request-id:${requestId};ts:${parts.ts};`;
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), {name:'HMAC', hash:'SHA-256'}, false, ['verify']);
    const signature = Uint8Array.from(parts.v1.match(/../g), pair => parseInt(pair, 16));
    if (!await crypto.subtle.verify('HMAC', key, signature, encoder.encode(manifest))) {
        throw new HttpError(401, 'Notificação inválida.');
    }
}
