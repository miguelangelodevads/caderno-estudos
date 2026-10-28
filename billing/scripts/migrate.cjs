const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { session } = require('./firebase-session.cjs');

async function main() {
  const args = process.argv.slice(2);
  const option = name => args[args.indexOf(name) + 1];
  const directory = args.includes('--inventory') ? path.resolve(option('--inventory')) : null;
  const apply = args.includes('--apply');
  if (!directory || (apply && option('--confirm-project') !== 'caderno-estudos-7adbd')) throw new Error('ARGS');
  const data = await fs.readFile(path.join(directory, 'inventory.json'), 'utf8');
  const inventory = JSON.parse(data);
  const manifest = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8'));
  const cutoff = args.includes('--cutoff') ? option('--cutoff') : inventory.capturedAt;
  if (manifest.sha256 !== createHash('sha256').update(data).digest('hex') || inventory.project !== 'caderno-estudos-7adbd' || inventory.appId !== 'caderno-estudos' ||
    !Number.isFinite(Date.parse(cutoff)) || Date.parse(cutoff) > Date.parse(inventory.capturedAt)) throw new Error('BACKUP');
  const { grantLegacyAccess } = await import('../worker/src/legacy.js');
  const { Firestore } = await import('../worker/src/firestore.js');
  const { HttpError } = await import('../worker/src/auth.js');
  const client = (await session(inventory.project))('https://firestore.googleapis.com');
  const base = `/projects/${inventory.project}/databases/(default)/documents`;
  const store = new Firestore({ FIREBASE_PROJECT_ID: inventory.project, APP_ID: inventory.appId });
  store.call = async (suffix, options = {}) => {
    try {
      const response = await client.request({ path: base + suffix, method: options.method || 'GET', ...(options.body ? { body: JSON.parse(options.body) } : {}) });
      return response.body;
    } catch (error) {
      if (error.status === 404) return null;
      if (error.status === 409) throw new HttpError(409, 'Conflito de gravação.');
      throw error;
    }
  };
  const migrationId = 'legacy-' + manifest.sha256.slice(0, 16);
  const report = await grantLegacyAccess(inventory.users, cutoff, migrationId, store, { dryRun: !apply });
  await fs.writeFile(path.join(directory, apply ? 'migration-applied.json' : 'migration-dry-run.json'), JSON.stringify({ ...report, migrationId, cutoff }, null, 2));
  console.log(JSON.stringify({ ...report, migrationId, cutoff }, null, 2));
}
main().catch(error => { console.error('Migração interrompida; preserve o backup e revise antes de repetir.', { status: error.status || error.code || 'FAILED' }); process.exitCode = 1; });
