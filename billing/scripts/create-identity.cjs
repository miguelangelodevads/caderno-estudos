const { session } = require('./firebase-session.cjs');

async function main() {
  const project = 'caderno-estudos-7adbd';
  const accountId = 'caderno-payments';
  const email = `${accountId}@${project}.iam.gserviceaccount.com`;
  const client = await session(project);
  const iam = client('https://iam.googleapis.com');
  let account;
  try { account = (await iam.get(`/projects/${project}/serviceAccounts/${email}`)).body; }
  catch (error) { if (error.status !== 404) throw error; }
  if (!account) account = (await iam.post(`/projects/${project}/serviceAccounts`, {
    accountId,
    serviceAccount: { displayName: 'Caderno de Estudos — pagamentos', description: 'Backend exclusivo de pagamentos. Sem acesso administrativo ao Authentication.' },
  })).body;
  const resource = client('https://cloudresourcemanager.googleapis.com');
  const policy = (await resource.post(`/projects/${project}:getIamPolicy`, { options: { requestedPolicyVersion: 3 } })).body;
  const member = 'serviceAccount:' + email;
  policy.bindings ||= [];
  let binding = policy.bindings.find(item => item.role === 'roles/datastore.user' && !item.condition);
  if (!binding) { binding = { role: 'roles/datastore.user', members: [] }; policy.bindings.push(binding); }
  if (!binding.members.includes(member)) {
    binding.members.push(member);
    await resource.post(`/projects/${project}:setIamPolicy`, { policy });
  }
  console.log(JSON.stringify({ project, email: account.email, role: 'roles/datastore.user', privateKeyCreated: false }, null, 2));
}
main().catch(error => { console.error('Configuração da identidade interrompida.', { status: error.status || error.code || 'FAILED' }); process.exitCode = 1; });
