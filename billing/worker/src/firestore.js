import {googleAccessToken, HttpError} from './auth.js';

export function encodeValue(value) {
    if (value === null) return {nullValue:null};
    if (value instanceof Date) return {timestampValue:value.toISOString()};
    if (typeof value === 'boolean') return {booleanValue:value};
    if (typeof value === 'string') return {stringValue:value};
    if (typeof value === 'number' && Number.isFinite(value)) return Number.isInteger(value)
        ? {integerValue:String(value)} : {doubleValue:value};
    if (Array.isArray(value)) return {arrayValue:{values:value.map(encodeValue)}};
    if (typeof value === 'object' && value) return {mapValue:{fields:encodeFields(value)}};
    throw new Error('Unsupported Firestore value');
}
export const encodeFields = data => Object.fromEntries(Object.entries(data).map(([key,value]) => [key,encodeValue(value)]));
export function decodeValue(value) {
    if ('nullValue' in value) return null;
    if ('timestampValue' in value) return new Date(value.timestampValue);
    if ('stringValue' in value) return value.stringValue;
    if ('booleanValue' in value) return value.booleanValue;
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return value.doubleValue;
    if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue);
    if ('mapValue' in value) return decodeFields(value.mapValue.fields || {});
    throw new Error('Unsupported Firestore value');
}
export const decodeFields = fields => Object.fromEntries(Object.entries(fields).map(([key,value]) => [key,decodeValue(value)]));

export class Firestore {
    constructor(env, fetcher = fetch) {
        this.env = env;
        // Native Workers fetch must not receive this Firestore instance as `this`.
        this.fetcher = (...args) => fetcher(...args);
        this.prefix = env.APP_ID ? `artifacts/${env.APP_ID}/` : '';
        this.name = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
        this.base = 'https://firestore.googleapis.com/v1/' + this.name;
    }
    async call(suffix, options = {}) {
        const token = await googleAccessToken(this.env, this.fetcher);
        const response = await this.fetcher(this.base + suffix, {
            ...options, headers:{Authorization:'Bearer ' + token, 'Content-Type':'application/json'}
        });
        if (response.status === 404) return null;
        if (!response.ok) {
            if (response.status === 403) throw new HttpError(503,'A conta de serviço não tem acesso ao Firestore. Confira o papel Cloud Datastore User no projeto correto.');
            const error = new HttpError(response.status === 409 ? 409 : 503, 'Não foi possível sincronizar o acesso.');
            throw error;
        }
        return response.json();
    }
    async get(path, transaction) {
        const safe = (this.prefix + path).split('/').map(encodeURIComponent).join('/');
        const document = await this.call('/' + safe + (transaction ? '?transaction=' + encodeURIComponent(transaction) : ''));
        return document ? {data:decodeFields(document.fields || {}), updateTime:document.updateTime} : null;
    }
    async getMany(paths,transaction) {
        const names=paths.map(path=>this.name+'/'+this.prefix+path);
        const result=await this.call(':batchGet',{method:'POST',body:JSON.stringify({documents:names,...(transaction?{transaction}:{})})});
        return this.decodeBatch(names,result);
    }
    decodeBatch(names,result) {
        if(!Array.isArray(result))throw new HttpError(503,'Resposta de sincronização inválida.');
        const docs=new Map(result.filter(entry=>entry.found).map(entry=>[entry.found.name,{data:decodeFields(entry.found.fields||{}),updateTime:entry.found.updateTime}]));
        const returned=new Set(result.map(entry=>entry.found?.name||entry.missing));
        if(names.some(name=>!returned.has(name)))throw new HttpError(503,'Resposta de sincronização incompleta.');
        return names.map(name=>docs.get(name)||null);
    }
    async atomic(action,readPaths) {
        for (let attempt = 0; attempt < 3; attempt++) {
            let transaction;
            const writes = [];
            try {
            let initial;
            if(readPaths){
                const names=readPaths.map(path=>this.name+'/'+this.prefix+path);
                const batch=await this.call(':batchGet',{method:'POST',body:JSON.stringify({documents:names,newTransaction:{readWrite:{}}})});
                transaction=Array.isArray(batch)?batch.find(entry=>entry.transaction)?.transaction:null;
                if(typeof transaction!=='string'||!transaction)throw new HttpError(503,'Transação de sincronização inválida.');
                const documents=this.decodeBatch(names,batch);
                initial=new Map(readPaths.map((path,index)=>[path,documents[index]]));
            }else transaction=(await this.call(':beginTransaction', {method:'POST', body:JSON.stringify({options:{readWrite:{}}})})).transaction;
            const tx = {
                get:path => initial?.has(path)?Promise.resolve(initial.get(path)):this.get(path, transaction),
                getMany:paths => initial&&paths.every(path=>initial.has(path))?Promise.resolve(paths.map(path=>initial.get(path))):this.getMany(paths,transaction),
                put:(path, data, previous) => writes.push({
                    update:{name:this.name + '/' + this.prefix + path, fields:encodeFields(data)},
                    currentDocument:previous ? {updateTime:previous.updateTime} : {exists:false}
                }),
                delete:(path, previous) => { if(previous) writes.push({delete:this.name+'/'+this.prefix+path,currentDocument:{updateTime:previous.updateTime}}); }
            };
                const result = await action(tx);
                if (writes.length) await this.call(':commit', {method:'POST', body:JSON.stringify({transaction,writes})});
                else await this.call(':rollback', {method:'POST', body:JSON.stringify({transaction})});
                return result;
            } catch (error) {
                try { if(transaction)await this.call(':rollback', {method:'POST', body:JSON.stringify({transaction})}); } catch { /* A falha principal permanece visível ao chamador. */ }
                if (error.status !== 409 || attempt === 2) throw error;
            }
        }
    }
}
