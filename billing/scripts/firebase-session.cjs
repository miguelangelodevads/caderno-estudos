// Ferramenta administrativa local. Reutiliza a sessão oficial do Firebase CLI,
// sem copiar, imprimir ou persistir tokens de autenticação.
const path = require('node:path');
const { createRequire } = require('node:module');

exports.session = async function session(project) {
  const root = process.env.FIREBASE_TOOLS_DIR || (process.env.APPDATA
    ? path.join(process.env.APPDATA, 'npm', 'node_modules', 'firebase-tools') : null);
  const cli = root ? createRequire(path.join(root, 'package.json')) : require;
  const load = (file) => cli(root ? './lib/' + file : 'firebase-tools/lib/' + file);
  const auth = load('auth.js');
  const options = { project, nonInteractive: true };
  const account = auth.getProjectDefaultAccount(process.cwd());
  if (account) auth.setActiveAccount(options, account);
  await load('requireAuth.js').requireAuth(options);
  const { Client } = load('apiv2.js');
  return (origin, apiVersion = 'v1') => new Client({ urlPrefix: origin, apiVersion });
};
