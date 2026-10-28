# Criptografia de ponta a ponta — implementação experimental

Branch: `codex/end-to-end-encryption`, baseada na correção de segurança publicada.
Integração funcional para teste local. Não publicar regras nem migrar contas reais
sem uma revisão de liberação específica. Não houve ativação em produção.

## Implementado neste incremento

`src/utils/notebookCrypto.js` usa Web Crypto, sem implementar primitivas próprias:

- Chave de dados aleatória AES-256-GCM. A chave de sessão importada é não exportável.
- Nonce aleatório de 96 bits em cada gravação e tag de autenticação de 128 bits.
- Conteúdo do caderno inteiro, incluindo títulos e assuntos, dentro do ciphertext.
- Dados autenticados vinculam versão, app, UID, identificador da chave, finalidade
  e documento. Trocar ciphertext entre contas/documentos não produz uma leitura válida.
- Senha do cofre separada do login, com mínimo de 16 caracteres. PBKDF2-SHA-256,
  600.000 iterações e salt aleatório de 128 bits protegem uma cópia da chave de dados.
- Chave de recuperação aleatória de 256 bits protege uma segunda cópia independente.
- Somente envelopes cifrados e metadados não secretos são retornados no registro
  persistível. Senha, chave de recuperação e chave aberta não integram esse registro.
- Falhas interrompem o desbloqueio; não existe fallback para texto aberto.
- Limite conservador de 700 KB de plaintext por envelope neste protótipo, para
  deixar margem à expansão de base64 e ao limite de documento do Firestore.
  A futura migração deve identificar cadernos maiores antes de qualquer gravação.

O App agora usa uma camada centralizada de leitura e transações criptografadas
quando o cofre é ativado. Contas sem cofre preservam o funcionamento legado.
Chamadores persistem somente `record`, nunca o resultado inteiro de `createVault`.

## Integração concluída na branch

- Configuração opcional do cofre, confirmação da recuperação, bloqueio na estante
  e na folha, desbloqueio por senha ou recuperação e troca da senha do cofre.
- Registro por UID em `users/{uid}/security/vault`, com regras de propriedade,
  esquema estrito, chave imutável e bloqueio de downgrade da fase ativa.
- Camada central para cifrar os cadernos inteiros e decifrar as transações atuais.
  Estado e referências da chave são descartados ao bloquear/sair/trocar de conta.
- Rascunhos persistidos cifrados; leitura em memória somente após desbloqueio.
  A fila preserva a ordem e a falha de persistência bloqueia o fechamento do cofre.
  O navegador avisa ao fechar enquanto há gravações locais pendentes/falhas.
- Backup cifrado baixado antes da conversão; migração por transações, verificação
  round-trip, retomada após interrupção e preservação de cadernos já convertidos.
  Regras proíbem novas gravações em texto aberto assim que o cofre é registrado.
- Gate de segurança: somente `import.meta.env.DEV` com ambas as flags
  `VITE_USE_FIREBASE_EMULATORS=true` e `VITE_E2EE_ENABLED=true`. Builds de produção
  não oferecem ativação. Firebase Auth/Firestore usam localhost nesse modo.

## Validação realizada

- 98 testes passaram, incluindo criptografia, recuperação, troca de senha, rascunhos
  corrompidos, falta de espaço, autosave, cores, código e pagamentos simulados.
- Lint e build passaram; permanece somente o aviso conhecido de tamanho do bundle.
- 45 verificações das regras existentes e 19 verificações de criptografia/regras
  passaram no emulador, incluindo transações concorrentes sem perda de atualização.
- Navegador real: criação do cofre, interrupção/retomada da migração, senha errada,
  senha correta, recuperação, troca de senha, nova anotação, colagem de código e
  reabertura em outra aba com chave independente na memória.
- Layouts 1440×900 e 390×844 conferidos; a página mobile não apresentou overflow
  horizontal no cenário testado. Cores, quebras e código permaneceram legíveis.
- Inspeção REST do banco emulado após salvar pela interface: somente campos
  `ownerUid` e `encrypted`, sem título ou conteúdo legível; cofre na fase `active`.
- Todos esses dados são fictícios. Nenhuma regra foi enviada ao Firebase real.

## Como reproduzir localmente

Use Java 21 e inicie:

```powershell
$env:JAVA_TOOL_OPTIONS='-Duser.language=en -Duser.country=US'
npx --yes firebase-tools@15 emulators:start --only firestore,auth --project demo-caderno-billing --config firebase.encryption-test.json
```

Em outro terminal:

```powershell
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8089'
npm run test:encryption
npm run seed:encryption
$env:VITE_USE_FIREBASE_EMULATORS='true'
$env:VITE_E2EE_ENABLED='true'
$env:VITE_FIREBASE_PROJECT_ID='demo-caderno-billing'
$env:VITE_FIREBASE_API_KEY='demo-key'
$env:VITE_FIREBASE_AUTH_DOMAIN='localhost'
$env:VITE_BILLING_ENABLED='false'
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

A conta fictícia fica em `billing/private/encryption-test-account.json`; o seed
preserva um cofre que já exista. O teste de criptografia usa um projeto emulado
distinto (`demo-caderno-encryption-tests`) para não apagar a demonstração.
`test:rules` limpa o projeto `demo-caderno-billing`: execute antes de preparar a
demonstração. Em CI, ambos os testes de regras são executados antes de qualquer UI.

## Requisitos antes de produção

Revisão de segurança e usabilidade, desempenho em aparelhos reais, plano de rollout
e compatibilidade com clientes antigos, tratamento de cadernos acima de 700 KB,
restauração assistida de backup e política de retenção das cópias antigas. O código
de migração deve permanecer inacessível a contas reais até essa decisão. O backup
baixado pode ser decifrado com a recuperação, mas não há importação de backup na UI.

## Limites de privacidade que precisam ser comunicados

- IDs, quantidade/tamanho dos documentos, horários e dados de conta/pagamento
  continuam observáveis. Pagamento e autenticação não são escondidos pela criptografia.
- Cópias antigas, backups e rascunhos em texto aberto não desaparecem ao cifrar
  o documento atual. Seu tratamento exige política explícita, sem apagar backups
  ou dados privados automaticamente.
- A proteção depende de senha forte, segredo da recuperação e integridade do
  aparelho/browser. Não protege um dispositivo já comprometido ou uma sessão aberta.
- Aplicações web recebem código do servidor: uma atualização maliciosa pode
  capturar dados após o desbloqueio. E2EE não elimina a confiança na distribuição
  do aplicativo e não justifica afirmar que nenhum administrador jamais poderá ler.
- Sem senha e sem recuperação, o conteúdo não poderá ser recuperado pelo suporte.
- Não registrar senhas, chaves ou plaintext em logs, métricas, crash reports ou URLs.

Referências utilizadas:
- https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams
