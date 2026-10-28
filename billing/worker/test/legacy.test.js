import test from 'node:test';
import assert from 'node:assert/strict';
import { grantLegacyAccess, legacyUsers } from '../src/legacy.js';
import { applyPayment } from '../src/payments.js';
import { MemoryStore, env, order, orderId, payment } from './helpers.js';

const cutoff = '2026-10-28T06:00:00.000Z';
const users = [{ localId: 'old', createdAt: String(Date.parse(cutoff) - 1), email: 'old@example.invalid' }, { localId: 'new', createdAt: String(Date.parse(cutoff)) }];

test('corte usa criação do Authentication e inclui conta sem perfil, sem aprovar cadastros novos', async () => {
  const store = new MemoryStore();
  const report = await grantLegacyAccess(users, cutoff, 'migration-v1', store);
  assert.equal(report.eligible, 1); assert.equal(report.dryRun, true); assert.equal(store.docs.size, 0);
  await grantLegacyAccess(users, cutoff, 'migration-v1', store, { dryRun: false });
  assert.equal((await store.get('access/old')).data.legacy.permanent, true);
  assert.equal((await store.get('users/old')).data.lifetimeAccess, true);
  assert.equal(await store.get('access/new'), null);
});

test('migração preserva perfil, compras e cadernos e pode ser repetida sem substituir dados', async () => {
  const notebooks = { title: 'Meu caderno', topics: [{ notes: [{ content: 'Anotação importante' }] }] };
  const store = new MemoryStore([['users/old', { extra: 'preservado', email: 'original@example.invalid', accessCount: 12 }], ['users/old/notebooks/n1', notebooks], ['access/old', { grants: { p1: { environment: 'production' } }, admin: true }]]);
  await grantLegacyAccess(users, cutoff, 'migration-v1', store, { dryRun: false });
  const snapshot = structuredClone([...store.docs]);
  const repeat = await grantLegacyAccess(users, cutoff, 'migration-v2', store, { dryRun: false });
  assert.equal(repeat.alreadyGranted, 1); assert.equal(repeat.granted, 0);
  assert.deepEqual([...store.docs], snapshot);
  assert.deepEqual((await store.get('users/old/notebooks/n1')).data, notebooks);
  assert.equal((await store.get('users/old')).data.email, 'original@example.invalid');
  assert.equal((await store.get('users/old')).data.extra, 'preservado');
  assert.equal((await store.get('access/old')).data.grants.p1.environment, 'production');
});

test('inventário duplicado, UID inválido ou ausência de criação confiável interrompe a migração', () => {
  for (const supplied of [[users[0], users[0]], [{ localId: 'bad/id', createdAt: '1' }], [{ localId: 'old' }]]) assert.throws(() => legacyUsers(supplied, cutoff));
  assert.throws(() => legacyUsers(users, 'not-a-date'));
});

test('estorno nunca remove a isenção permanente das contas antigas', async () => {
  const store = new MemoryStore([['billingOrders/' + orderId, order], ['access/user-a', { active: true, legacy: { permanent: true, migrationId: 'v1' } }]]);
  await applyPayment(payment, env, store);
  await applyPayment({ ...payment, status: 'refunded', date_last_updated: '2026-10-22' }, env, store);
  const access = (await store.get('access/user-a')).data;
  assert.equal(access.active, true); assert.equal(access.legacy.migrationId, 'v1');
  await applyPayment({ ...payment, date_last_updated: '2026-10-23' }, env, store);
  assert.deepEqual((await store.get('access/user-a')).data.grants, {});
});

test('reembolso parcial não é revertido por aprovação posterior do mesmo pagamento', async () => {
  const store = new MemoryStore([['billingOrders/' + orderId, order]]);
  await applyPayment(payment, env, store);
  await applyPayment({ ...payment, transaction_amount_refunded: 1, date_last_updated: '2026-10-22' }, env, store);
  await applyPayment({ ...payment, date_last_updated: '2026-10-23' }, env, store);
  assert.equal((await store.get('access/user-a')).data.active, false);
  assert.deepEqual((await store.get('access/user-a')).data.grants, {});
});
