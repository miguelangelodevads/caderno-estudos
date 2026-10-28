export class MemoryStore {
    constructor(entries = []) { this.docs = new Map(entries); this.version = 0; }
    async get(path) {
        const data = this.docs.get(path);
        return data ? {data:structuredClone(data),updateTime:String(this.version)} : null;
    }
    async atomic(action) {
        const writes = [];
        const result = await action({get:path => this.get(path),put:(path,data) => writes.push([path,structuredClone(data)])});
        for (const [path,data] of writes) this.docs.set(path,data);
        if (writes.length) this.version++;
        return result;
    }
}
export const env = {
    APP_URL:'https://example.com/caderno-estudos/', WORKER_URL:'https://payments.example.com',
    APP_ID:'caderno-estudos',FIREBASE_PROJECT_ID:'test-project',FIREBASE_CLIENT_EMAIL:'private@example.invalid',FIREBASE_PRIVATE_KEY:'not-used-in-mocked-store',
    MP_ACCESS_TOKEN:'not-a-real-token',MP_WEBHOOK_SECRET:'test-secret-only',MP_COLLECTOR_ID:'123',
    CHECKOUT_ENABLED:'true',MP_ENVIRONMENT:'production',PLAN_ID:'caderno-estudos-unico-299-v1',PLAN_TITLE:'Caderno de Estudos',PLAN_AMOUNT_CENTS:'299'
};
export const orderId = 'ce_12345678-1234-1234-1234-123456789012';
export const order = {uid:'user-a',planId:env.PLAN_ID,amountCents:299,currency:'BRL',environment:'production',type:'one_time'};
export const payment = {
    id:123456,external_reference:orderId,collector_id:123,live_mode:true,currency_id:'BRL',transaction_amount:2.99,
    status:'approved',date_last_updated:'2026-10-21T00:00:00.000Z',transaction_amount_refunded:0
};
export async function signature(secret,id,requestId,ts) {
    const bytes = new TextEncoder();
    const key = await crypto.subtle.importKey('raw',bytes.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const signed = await crypto.subtle.sign('HMAC',key,bytes.encode(`id:${id};request-id:${requestId};ts:${ts};`));
    return Array.from(new Uint8Array(signed),byte => byte.toString(16).padStart(2,'0')).join('');
}
