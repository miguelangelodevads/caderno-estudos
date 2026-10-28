import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, collection, getDocs, Timestamp, serverTimestamp } from 'firebase/firestore';

if (!/^127\.0\.0\.1:|^localhost:/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw new Error('Execute somente no emulador local.');
const projectId = 'demo-caderno-rules-tests';
let checks = 0;
const pass = async (promise) => { await assertSucceeds(promise); checks++; };
const fail = async (promise) => { await assertFails(promise); checks++; };
for (const filename of ['firestore.setup.rules', 'firestore.rules']) {
  const paid = filename === 'firestore.rules';
  const environment = await initializeTestEnvironment({ projectId, firestore: { rules: await readFile(new URL(filename, import.meta.url), 'utf8') } });
  try {
    await environment.clearFirestore();
    const base = 'artifacts/caderno-estudos';
    const owner = environment.authenticatedContext('old').firestore();
    const stranger = environment.authenticatedContext('stranger').firestore();
    const pending = environment.authenticatedContext('new', { email: 'test@example.invalid' }).firestore();
    const anonymous = environment.unauthenticatedContext().firestore();
    const notebook = `${base}/users/old/notebooks/n1`;
    await environment.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(doc(db, notebook), { title: 'Preservado', topics: [] });
      await setDoc(doc(db, `${base}/users/old`), { lifetimeAccess: true, accessCount: 1 });
      await setDoc(doc(db, `${base}/access/old`), { active: true, expiresAt: null, legacy: { permanent: true } });
      await setDoc(doc(db, `${base}/billingOrders/order1`), { uid: 'old', amountCents: 299 });
    });
    await pass(getDoc(doc(owner, notebook)));
    assert.equal((await getDoc(doc(owner, notebook))).data().title, 'Preservado');
    await pass(getDocs(collection(owner, `${base}/users/old/notebooks`)));
    await pass(updateDoc(doc(owner, notebook), { title: 'Atualizado' }));
    await pass(updateDoc(doc(owner, `${base}/users/old`), { accessCount: 2 }));
    await pass(getDoc(doc(owner, `${base}/access/old`)));
    await fail(getDoc(doc(anonymous, notebook)));
    await fail(getDoc(doc(stranger, notebook)));
    await fail(getDocs(collection(stranger, `${base}/users/old/notebooks`)));
    await fail(getDocs(collection(anonymous, `${base}/users/old/notebooks`)));
    await fail(updateDoc(doc(stranger, notebook), { title: 'Ataque' }));
    await fail(setDoc(doc(stranger, notebook), { title: 'Ataque' }));
    await fail(updateDoc(doc(owner, notebook), { ownerUid: 'stranger' }));
    await fail(setDoc(doc(pending, `${base}/access/new`), { active: true }));
    await fail(updateDoc(doc(owner, `${base}/users/old`), { lifetimeAccess: false }));
    await fail(getDoc(doc(owner, `${base}/billingOrders/order1`)));
    await fail(getDocs(collection(owner, `${base}/access`)));
    await fail(getDoc(doc(anonymous, `${base}/users/old`)));
    await pass(setDoc(doc(pending, `${base}/users/new`), { email: 'test@example.invalid', createdAt: Timestamp.now(), lifetimeAccess: false, accessCount: 1 }));
    await pass(setDoc(doc(pending, `${base}/users/new`), { email: 'test@example.invalid', createdAt: serverTimestamp(), lifetimeAccess: false, accessCount: 1 }));
    await fail(updateDoc(doc(pending, `${base}/users/new`), { lifetimeAccess: true }));
    const create = setDoc(doc(pending, `${base}/users/new/notebooks/n1`), { ownerUid: 'new', title: 'Novo', topics: [] });
    if (paid) await fail(create); else await pass(create);
    if (paid) {
      await fail(getDocs(collection(pending, `${base}/users/new/notebooks`)));
      await environment.withSecurityRulesDisabled(async context => {
        await setDoc(doc(context.firestore(), `${base}/access/new`), { active: true, expiresAt: Timestamp.fromMillis(1) });
      });
      await fail(getDocs(collection(pending, `${base}/users/new/notebooks`)));
      await environment.withSecurityRulesDisabled(async context => {
        await setDoc(doc(context.firestore(), `${base}/access/new`), { active: true, expiresAt: null });
      });
      await pass(setDoc(doc(pending, `${base}/users/new/notebooks/n1`), { ownerUid: 'new', title: 'Liberado após pagamento', topics: [] }));
    }
  } finally { await environment.cleanup(); }
}
console.log(`Regras validadas no emulador: ${checks} verificações passaram.`);
