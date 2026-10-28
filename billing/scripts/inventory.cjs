const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { session } = require('./firebase-session.cjs');

// Leitura apenas. Arquivos privados permanecem fora do Git e do build público.
async function main() {
  const project = 'caderno-estudos-7adbd';
  const appId = 'caderno-estudos';
  const client = await session(project);
  const directory = path.resolve('billing/private', new Date().toISOString().replace(/[:.]/g, '-'));
  await fs.mkdir(directory, { recursive: true });
  const auth = client('https://identitytoolkit.googleapis.com');
  const users = [];
  let nextPageToken;
  do {
    const response = await auth.get(`/projects/${project}/accounts:batchGet`, { queryParams: { maxResults: 1000, ...(nextPageToken ? { nextPageToken } : {}) } });
    users.push(...(response.body.users || []));
    nextPageToken = response.body.nextPageToken;
  } while (nextPageToken);
  // Exportação administrativa integral: inclui material sensível de autenticação.
  // Nunca imprimir estes registros, enviar ao Git ou à hospedagem.
  await fs.writeFile(path.join(directory, 'auth.json'), JSON.stringify({ users }), { mode: 0o600 });
  const configuration = await client('https://identitytoolkit.googleapis.com', 'admin/v2').get(`/projects/${project}/config`);
  await fs.writeFile(path.join(directory, 'auth-config.json'), JSON.stringify(configuration.body), { mode: 0o600 });
  const firestore = client('https://firestore.googleapis.com');
  const base = `/projects/${project}/databases/(default)/documents`;
  const documents = [];
  async function walk(parent) {
    let pageToken;
    const collections = [];
    do {
      const response = await firestore.post(`${base}/${parent}:listCollectionIds`, { pageSize: 100, ...(pageToken ? { pageToken } : {}) });
      collections.push(...(response.body.collectionIds || []));
      pageToken = response.body.nextPageToken;
    } while (pageToken);
    for (const collection of collections) {
      let token;
      do {
        const response = await firestore.get(`${base}/${parent}/${collection}`, { queryParams: { pageSize: 100, showMissing: true, ...(token ? { pageToken: token } : {}) } });
        for (const document of response.body.documents || []) {
          if (document.updateTime) documents.push(document);
          await walk(document.name.split('/documents/')[1]);
        }
        token = response.body.nextPageToken;
      } while (token);
    }
  }
  try {
    const parent = await firestore.get(`${base}/artifacts/${appId}`);
    if (parent.body.updateTime) documents.push(parent.body);
  } catch (error) { if (error.status !== 404 && error.context?.response?.statusCode !== 404 && error.context?.response?.status !== 404) throw error; }
  await walk(`artifacts/${appId}`);
  const rulesClient = client('https://firebaserules.googleapis.com');
  const release = await rulesClient.get(`/projects/${project}/releases/cloud.firestore`);
  const ruleset = await rulesClient.get('/' + release.body.rulesetName);
  await fs.writeFile(path.join(directory, 'rules.json'), JSON.stringify(ruleset.body, null, 2), { mode: 0o600 });
  const data = JSON.stringify({ project, appId, capturedAt: new Date().toISOString(), users, documents });
  await fs.writeFile(path.join(directory, 'inventory.json'), data, { mode: 0o600 });
  const summary = {
    project, appId, users: users.length,
    profiles: documents.filter(d => /^artifacts\/[^/]+\/users\/[^/]+$/.test(d.name.split('/documents/')[1])).length,
    notebooks: documents.filter(d => /\/notebooks\/[^/]+$/.test(d.name)).length,
    documents: documents.length,
    sha256: createHash('sha256').update(data).digest('hex'), directory,
  };
  await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}
main().catch(error => { console.error('Inventário interrompido. Nenhuma gravação foi feita no Firebase.', { status: error.status || error.code || 'FAILED' }); process.exitCode = 1; });
