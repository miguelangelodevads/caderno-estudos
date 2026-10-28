const fs = require('node:fs/promises');
const path = require('node:path');
const { session } = require('./firebase-session.cjs');

async function main() {
  const project = 'caderno-estudos-7adbd';
  const email = `caderno-payments@${project}.iam.gserviceaccount.com`;
  const directory = path.resolve('billing/private');
  const file = path.join(directory, 'worker-key-transfer.json');
  await fs.mkdir(directory, { recursive: true });
  // Reserva exclusiva: nunca cria outra chave por repetição acidental do comando.
  const reservation = await fs.open(file, 'wx', 0o600);
  await reservation.close();
  let iam, key;
  try {
    iam = (await session(project))('https://iam.googleapis.com');
    key = (await iam.post(`/projects/${project}/serviceAccounts/${email}/keys`, { privateKeyType: 'TYPE_GOOGLE_CREDENTIALS_FILE', keyAlgorithm: 'KEY_ALG_RSA_2048' })).body;
    const bytes = Buffer.from(key.privateKeyData, 'base64');
    const credentials = JSON.parse(bytes.toString('utf8'));
    if (credentials.project_id !== project || credentials.client_email !== email || !credentials.private_key) throw new Error('IDENTITY_MISMATCH');
    await fs.writeFile(file, bytes, { mode: 0o600 });
    await fs.writeFile(path.join(directory, 'worker-key-metadata.json'), JSON.stringify({ project, email, keyName: key.name, createdAt: new Date().toISOString() }));
    console.log(JSON.stringify({ project, email, temporaryFile: file, privateKeyPrinted: false }));
  } catch (error) {
    // Uma chave que não pôde ser transferida não deve ficar ativa sem controle.
    if (key?.name) await iam.delete('/' + key.name);
    await fs.unlink(file);
    throw error;
  }
}
main().catch(error => { console.error('Preparação da credencial interrompida.', { status: error.status || error.code || 'FAILED' }); process.exitCode = 1; });
