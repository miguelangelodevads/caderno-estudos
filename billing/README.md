# Pagamento automático do Caderno de Estudos

Implementação: Checkout Pro Preferences/Payments, pagamento único de **R$ 2,99**.
O frontend acompanha o próprio documento de acesso no Firebase; somente o servidor
concede acesso. O código base de verificação JWT/HMAC e transporte REST foi adaptado
da integração do Setlist Pro, do mesmo proprietário. O Setlist não foi alterado.

## Estado atual e ativação

A publicação do código não ativa cobrança: `VITE_BILLING_ENABLED=false` por padrão,
`CHECKOUT_ENABLED=false` e ambiente sandbox no Worker. Não habilitar esses controles
antes de validar toda a configuração e executar o corte final dos usuários antigos.

Em 28/10/2026 foram inventariadas 15 contas e 17 cadernos. As 15 contas receberam
isenção permanente. Uma comparação posterior confirmou os mesmos UIDs, IDs e conteúdos
dos 17 cadernos. Os backups e relatórios com dados pessoais estão em `billing/private/`,
ignorados pelo Git e excluídos dos artefatos públicos. Não enviar essa pasta ao suporte
ou à hospedagem. Novos cadastros anteriores à ativação final também devem receber
isenção na última reconciliação; o primeiro inventário não substitui o corte final.

As regras de preparação foram publicadas no projeto `caderno-estudos-7adbd`: acesso
somente aos próprios dados, sem ainda exigir compra. As regras anteriores eram públicas.
As regras finais com exigência de acesso aprovado ainda não devem ser ativadas.

## Estrutura

- Site Vite/React: `src/components/PagamentoAcesso.jsx`, `src/hooks/useBillingAccess.js`.
- Worker: `billing/worker/src/` e `billing/worker/wrangler.toml`.
- Isenções e recibos: `artifacts/caderno-estudos/access/{uid}` e coleções `billing*`
  no mesmo namespace. Os cadernos não mudam de lugar.
- Regras de preparação: `billing/firestore.setup.rules`, configuração `firebase.setup.json`.
- Regras finais: `billing/firestore.rules`, configuração `firebase.billing.json`.
- Inventário local: `node billing/scripts/inventory.cjs` (apenas leitura remota).
- Migração: `node billing/scripts/migrate.cjs --inventory DIRETORIO_PRIVADO` (simulação).
  Aplicação exige `--apply --confirm-project caderno-estudos-7adbd` e backup com hash válido.

A ferramenta administrativa reutiliza a sessão do Firebase CLI instalado. No Windows,
localiza a instalação padrão em `%APPDATA%/npm/node_modules/firebase-tools`; em outra
instalação informar `FIREBASE_TOOLS_DIR`. Tokens não são impressos nem copiados.
Os backups de Authentication incluem campos sensíveis e configuração de autenticação.
A recuperação desses backups deve ser feita administrativamente; não há botão de
restauração automática nem rotina de apagar/substituir cadernos.

## Configuração do Worker — somente do Caderno

A identidade `caderno-payments@caderno-estudos-7adbd.iam.gserviceaccount.com` foi
criada e recebeu apenas `roles/datastore.user` no projeto do Caderno, com autorização
expressa do proprietário. A chave foi validada e armazenada como Secret criptografado
no Worker; a cópia temporária local foi removida. Os dois Secrets Firebase estão
configurados. A assinatura Webhook Mercado Pago foi gerada na aplicação exclusiva
`3813018558783294` e armazenada como Secret; notificações de pagamentos foram salvas
para o endpoint do Worker nos ambientes de teste e produção. A tentativa inicial com
credencial de Checkout Transparente falhou; a configuração seguinte é descrita abaixo.
Checkout Pro/Preferences foi confirmado no painel. As credenciais corretas de teste
foram ativadas com autorização do proprietário; o servidor criou um checkout sandbox
de R$ 2,99 e a página do Mercado Pago exibiu o plano esperado. Nenhum pagamento foi
executado pelo agente. Depois, a credencial de produção foi armazenada como Secret,
`MP_ENVIRONMENT=production` foi configurado e a consulta autenticada `/reconcile`
respondeu 200. Um checkout produtivo de R$ 2,99 foi criado para a conta técnica;
o pagamento foi entregue ao proprietário para validação. A confirmação real e a
ativação do frontend/regras finais continuam pendentes.

Durante os testes, o painel recebeu `APP_URL` do Pages, `LEGACY_APP_URL` da Vercel,
`MP_COLLECTOR_ID=115256254` (ID exibido pela aplicação) e `CHECKOUT_ENABLED=true`
inicialmente com `MP_ENVIRONMENT=sandbox`; o painel agora usa `production` e checkout
habilitado para a validação do proprietário. O frontend continua com cobrança desligada.
Os defaults versionados mantêm o bloqueio preventivo para uma nova publicação.
Uma conta Firebase identificada como `caderno-billing-test-…@example.invalid` foi
criada exclusivamente para testar autenticação e checkout; não contém cadernos.
Sua sessão permanece no diretório privado ignorado. A integração ainda estava
classificada como Checkout Transparente; a alteração para Checkout Pro/Preferences
foi confirmada após a reautenticação solicitada pelo Mercado Pago.
Rotina administrativa repetível: `node billing/scripts/create-identity.cjs`.

Worker publicado: `https://caderno-estudos-payments.migueltiojhoe.workers.dev`,
separado de `setlist-pro-payments`, com cobrança desligada e ambiente sandbox.
`/health` e `/plan` foram verificados; `/access` exige autenticação.
Root do projeto Cloudflare: `billing/worker`. Build de frontend não é necessário.
Deploy pelo Wrangler 4: `npx wrangler@4 deploy`. O toml tem cobrança desabilitada.
Atualizar `WORKER_URL` para a URL HTTPS realmente atribuída antes da validação integrada.

Variáveis públicas do Worker:

```text
FIREBASE_PROJECT_ID=caderno-estudos-7adbd
APP_ID=caderno-estudos
APP_URL=https://caderno-estudos-alpha.vercel.app/
MP_ENVIRONMENT=sandbox
CHECKOUT_ENABLED=false
PLAN_AMOUNT_CENTS=299
PLAN_ID=caderno-vitalicio-299-v1
PLAN_TITLE=Caderno de Estudos — acesso vitalício
MP_COLLECTOR_ID=auto
```

Secrets, inseridos diretamente no painel/cofre, nunca no chat/Git:

- `FIREBASE_CLIENT_EMAIL` e `FIREBASE_PRIVATE_KEY`: conta de serviço dedicada ao projeto
  do Caderno, com papel Cloud Datastore User, sem Owner/Editor. O runtime usa REST/Web Crypto.
- `MP_ACCESS_TOKEN` e `MP_WEBHOOK_SECRET`: aplicação Mercado Pago própria do Caderno,
  no ambiente correto. Não substituir nem expor os Secrets do Setlist.

Configurar evento Pagamentos no Mercado Pago para
`https://URL-REAL-DO-WORKER/webhooks/mercadopago`. O Worker verifica HMAC, consulta a
API oficial e compara pedido, recebedor, moeda, preço e ambiente antes de liberar.

Endpoints públicos: GET `/health`, GET `/plan`. Não confirmam que secrets/Firebase
estão corretos. GET `/access`, POST `/checkout`, POST `/reconcile` exigem ID token
Firebase verificado; a conta vem do token, não de parâmetros do navegador.
`/access` pode operar sem Mercado Pago disponível. Reconciliação tem limite por
checkout de 15 segundos e consulta somente o pedido do usuário autenticado.
Falha durante criação de checkout reutiliza o mesmo pedido/chave na tentativa seguinte.
Sandbox não libera acesso real. Estornos nunca retiram a isenção dos usuários antigos.

## Testes

```text
npm ci
npm run lint
npm test
npm run build
```

Emulador exige Java 21+. Usar exclusivamente o projeto de demonstração:

```text
firebase emulators:exec --only firestore --project demo-caderno-billing --config firebase.billing.json "node billing/test-rules.mjs"
```

Os testes cobrem tokens assinados, webhook forjado, valor/ambiente/conta divergentes,
repetição, estorno, isenções, migração repetível, falhas de checkout e isolamento por
usuário. APIs de pagamento são simuladas nesses testes. Um teste real de sandbox e
uma compra de produção feita pelo proprietário ainda são necessários.

## Virada para cobrança

1. Verificar secrets, recebedor, webhook e fluxo real no sandbox, sem habilitar produção.
2. Executar inventário final; sincronizar rascunhos e conceder isenção a todos os UIDs
   anteriores ao instante de corte. Coordenar cadastros durante a captura final.
3. Conferir a correspondência completa entre contas antigas e isenções, incluindo
   contas sem perfil. Preservar o campo antigo `lifetimeAccess` para compatibilidade.
4. Trocar secrets/ambiente do Worker para produção e testar identificação do recebedor.
5. Coordenar frontend (`VITE_BILLING_ENABLED=true`, `VITE_BILLING_API_URL=URL_REAL`),
   regras finais e `CHECKOUT_ENABLED=true`. As regras de preparação não impõem pagamento;
   não basta ativar a tela de cobrança. Enquanto as configurações forem preparadas,
   não anunciar a virada como concluída. Minimizar a janela de troca, validando um
   candidato antes de promoção e sem bloquear contas antigas já isentas.
6. Validar conta antiga, novo cadastro, pagamento, confirmação e retorno no PWA.

Não habilitar apenas uma parte e presumir que a cobrança está protegida. Clientes
antigos podem oferecer uso grátis pela interface, mas as regras finais devem negar
operações de cadernos a qualquer conta nova ainda não aprovada.

## Cloudflare Pages

Candidato publicado em `https://caderno-estudos-6ux.pages.dev/`, com cobrança desligada.
O domínio foi autorizado no Firebase preservando os domínios anteriores. A tela de
login carregou; o login de uma conta real neste domínio ainda precisa ser validado.
A integração GitHub conserva Setlist Pro e inclui somente o Caderno adicionalmente.

Usar o repositório `miguelangelodevads/caderno-estudos`, branch `main`, root `/`,
build `npm ci && npm run build`, output `dist`. Publicar apenas `dist`, nunca a raiz.
Copiar as variáveis públicas Firebase `VITE_FIREBASE_*` do projeto atual; não criar
outro Firebase ou mudar o namespace. Configurar `VITE_BILLING_*` conforme a etapa.

Adicionar o domínio Pages realmente criado aos domínios autorizados do Firebase.
No Worker, usar `APP_URL` para o novo domínio e `LEGACY_APP_URL` para a Vercel,
mantendo só essas origens explícitas e retornos corretos. Evitar previews públicos
com credenciais de produção. A integração GitHub deve acessar somente os repositórios
autorizados; não selecionar todos por conveniência.

Sessões e rascunhos locais não atravessam domínios. Manter a Vercel durante a transição,
confirmar sincronização e orientar eventual novo login/instalação do PWA. Não limpar
armazenamento local automaticamente e não desativar a Vercel nesta preparação.

## Rollback

Preservar isenções já concedidas. Antes da cobrança, rollback de frontend mantém o
comportamento anterior com perfis antigos aprovados. Depois da virada, recuar a
cobrança exige restaurar regras de preparação e frontend compatível em conjunto.
Nunca restaurar a regra antiga `allow read, write: if true` nem apagar os grants
de usuários antigos. Backups e recibos permanecem preservados.
