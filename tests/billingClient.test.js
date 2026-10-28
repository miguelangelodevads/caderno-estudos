import test from 'node:test';
import assert from 'node:assert/strict';
import { billingRequest, billingEndpoint, checkoutDestination } from '../src/utils/billingClient.js';

test('checkout aceita somente destino HTTPS real do Mercado Pago', () => {
  assert.equal(checkoutDestination('https://www.mercadopago.com.br/checkout/v1/test'), 'https://www.mercadopago.com.br/checkout/v1/test');
  for (const url of ['https://mercadopago.com.br.evil/checkout/', 'javascript:alert(1)', 'https://user:pass@www.mercadopago.com.br/checkout/', 'https://www.mercadopago.com.br/other', 'http://www.mercadopago.com.br/checkout/']) assert.throws(() => checkoutDestination(url));
});
test('backend exige URL explícita, sem credenciais ou parâmetros herdados', () => {
  assert.equal(billingEndpoint('https://payments.example/', '/access'), 'https://payments.example/access');
  for (const base of ['', 'http://localhost/', 'https://user:pass@payments.example/', 'https://payments.example/?token=secret', 'https://payments.example/path']) assert.throws(() => billingEndpoint(base, '/access'));
  assert.throws(() => billingEndpoint('https://payments.example/', 'https://evil.example/checkout'));
});
test('consulta vincula sessão ao token Firebase e ignora o retorno approved como prova', async () => {
  let call;
  const data = await billingRequest({ uid: 'owner', getIdToken: async () => 'firebase-id-token' }, '/access', { base: 'https://payments.example/', fetcher: async (url, options) => { call = { url, options }; return new Response(JSON.stringify({ active: false })); } });
  assert.equal(data.active, false); assert.equal(call.options.headers.Authorization, 'Bearer firebase-id-token');
  assert.equal(call.options.cache, 'no-store');
  await assert.rejects(billingRequest(null, '/checkout', { base: 'https://payments.example/', fetcher: () => { throw Error('Não deve consultar'); } }));
});
