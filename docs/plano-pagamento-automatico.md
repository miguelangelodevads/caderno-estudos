# Plano de pagamento automático — Caderno de Estudos

Estado em 28/10/2026: cobrança automática ativa na Cloudflare e regras finais publicadas.
Pagamento real de R$ 2,99 aprovado e reconciliado; notificação assinada validada com 200 OK.
Todas as 17 contas anteriores ao corte de 09:06:05 de Brasília receberam isenção permanente.

## Execução já verificada

- Backup privado e inventário de 15 contas, 11 perfis originais e 17 cadernos.
- Isenção permanente aplicada às 15 contas, incluindo quatro sem perfil.
- Comparação posterior: mesmos UIDs e mesmos IDs/conteúdos dos 17 cadernos.
- Regras públicas substituídas por proteção de dados por usuário, sem ainda exigir compra.
- Conta antiga aberta no site publicado continuou acessando os próprios cadernos.
- Implementação e validações documentadas em `billing/README.md`.
- Repositório autorizado preservando Setlist Pro; site candidato publicado em
  `https://caderno-estudos-6ux.pages.dev/`, com cobrança ativa e domínio autorizado.
- Worker publicado em `https://caderno-estudos-payments.migueltiojhoe.workers.dev`,
  com identidade exclusiva de Firestore e Secrets Firebase configurados e validados.
- Checkout Pro/Preferences configurado exclusivamente para o Caderno. Pagamento real,
  consulta autenticada e assinatura Webhook confirmados; nenhuma chave no frontend/GitHub.
- Backup final com 17 contas e 17 cadernos; conta anterior entra, cadastro novo exibe
  cobrança e não consegue acessar cadernos ou aprovar a si mesmo no Firebase.

## Decisões confirmadas pelo proprietário

- Pagamento único de R$ 2,99, com acesso vitalício.
- Todas as contas anteriores à mudança ficam liberadas, inclusive as que não pagaram.
- Mesmos usuários, senhas, UIDs, projeto Firebase e documentos de cadernos.
- A nova exigência de pagamento vale apenas para cadastros posteriores à ativação.

## Diagnóstico verificado

`src/App.jsx` cria o perfil com `accessCount: 1` e `lifetimeAccess: false`. No login,
incrementa o contador e libera quem tem `lifetimeAccess` ou está no primeiro acesso.
Perfis sem `accessCount` recebem liberação por uma regra antiga no navegador.
`PagamentoAcesso.jsx` abre um link estático do Mercado Pago e solicita comprovante.
Não há backend de cobrança nem regras Firestore versionadas neste repositório.
Esse diagnóstico descreve a versão anterior; o inventário e as regras de preparação
aplicados estão registrados acima.

A versão atual do Setlist Pro no GitHub tem Pages para o site e um Worker de cobrança
separado. Foram consultados `CLOUDFLARE-PAGES.md` e `billing/README.md` na branch main.
A cópia local de Setlist Pro não contém essa implementação atual.

## Arquitetura recomendada

Adotar o mesmo arranjo do Setlist Pro:

- Cloudflare Pages: publicação do React/Vite e arquivos públicos do PWA.
- Cloudflare Worker próprio do Caderno: criação dos pedidos, consulta e webhook.
- Firebase Authentication existente: cadastro e login.
- Firestore existente: cadernos, permissões de acesso e registros mínimos de pagamento.
- Mercado Pago Checkout Pro: checkout associado a um pedido e à conta autenticada.

Não é necessário migrar o site para automatizar a cobrança. A implantação começa
com o site na Vercel e o Worker na Cloudflare. A transferência do site ocorre depois
de validar a automação. Isso separa a mudança de cobrança da mudança de endereço.
Também seria possível manter Vercel com backend próprio; a Cloudflare é recomendada
aqui pela integração existente no Setlist Pro e pela preferência do proprietário.

Reaproveitar o desenho e os testes do Setlist, adaptando namespace, produto e preço.
Não alterar o Worker, os pedidos, os secrets ou o projeto Firebase do Setlist Pro.
Não introduzir D1/KV ou outro banco sem uma necessidade comprovada.

## Experiência de cadastro

1. Pessoa cria sua conta no Firebase Authentication.
2. A conta nova fica pendente e vai diretamente à tela de R$ 2,99; não recebe um primeiro uso gratuito.
3. O Worker verifica o ID token Firebase e cria/reutiliza o pedido para aquele UID.
4. A pessoa paga no checkout Mercado Pago. Disponibilidade de Pix será verificada na conta e no checkout configurados.
5. O Mercado Pago envia a notificação ao Worker.
6. O Worker valida a origem, consulta o pagamento e grava a liberação no Firestore.
7. O app acompanha o próprio documento de acesso e abre os cadernos automaticamente.

Criar a identidade antes do checkout permite associar o pagamento à conta correta.
Uma pessoa que abandone o Pix pode entrar depois e continuar o pagamento sem se cadastrar novamente.
Pagamento pendente não libera o app; a tela informa a espera e permite verificar novamente.
Retornar do checkout não é prova de pagamento.

## Proteção das contas antigas

Antes da ativação:

1. Inventariar usuários do Authentication, perfis, aprovações e cadernos. Incluir contas
   sem perfil ou com documentos antigos: a ausência de `accessCount` não define a nova isenção.
2. Preparar backup recuperável do Firestore, exportação administrativa dos usuários
   e um inventário de contagens/IDs sem publicar dados pessoais ou hashes no Git.
3. Fixar um instante de corte, baseado no servidor, e a lista de UIDs anteriores.
   A data de criação do Authentication é a referência, não campos editáveis pelo cliente.
   Coordenar a captura final com a virada; se necessário, pausar brevemente somente
   novos cadastros para eliminar a janela de corrida. Usuários existentes continuam usando o app.
4. Executar migração administrativa com simulação, relatório e identificador de versão.
   Criar isenções permanentes `legacy` para todos os UIDs anteriores ao corte.
5. Fazer apenas merges dos campos de acesso. Não substituir perfis inteiros,
   documentos de cadernos ou arrays de anotações. Reexecutar a migração não duplica nem revoga isenções.
6. Preservar `lifetimeAccess: true` nos perfis antigos como compatibilidade com clientes
   anteriores, enquanto a nova versão passa a usar o documento de acesso protegido.
7. Comparar a lista de usuários antigos com as isenções e conferir que nenhum UID
   anterior ficou de fora antes de ativar o bloqueio para novos cadastros.

Os cadernos continuam no caminho existente:
`artifacts/caderno-estudos/users/{uid}/notebooks/{notebookId}`.
Preservar também o `appId` efetivamente utilizado em produção; não assumir outro namespace.

## Modelo de acesso e segurança

Proposta de coleções novas, isoladas pelo appId:

- `artifacts/{appId}/access/{uid}`: permissão efetiva, origem da isenção/compra e versão da migração.
- `artifacts/{appId}/billingOrders/{orderId}`: UID, produto, valor em centavos, moeda e checkout.
- `artifacts/{appId}/billingPayments/{paymentId}`: estado validado e vínculo com o pedido.
- `artifacts/{appId}/billingCheckouts/{uid}`: checkout pendente reutilizável.

Os nomes são proposta, não coleções já criadas. Preço do plano: 299 centavos, BRL,
definido no servidor e armazenado no pedido; mudanças futuras não alteram pedidos existentes.

O Worker deve verificar assinatura e claims do ID token Firebase, incluindo projeto,
emissor, UID e validade. O UID vem do token verificado, não de um campo livre do navegador.
Para acesso administrativo ao Firestore, adaptar o cliente REST/Web Crypto do Setlist;
credenciais em Secrets do Worker, com permissões mínimas e projeto correto.
O inventário de Authentication exige permissões administrativas de leitura próprias.

Somente servidor/admin pode conceder isenção, registrar pagamento ou ativar acesso.
O usuário pode ler seu status, mas não editá-lo. As coleções internas de cobrança
não ficam abertas ao cliente. Regras dos cadernos exigem dono e acesso válido.
Não basta esconder a tela do app.

A nova versão remove do navegador a concessão de `lifetimeAccess` e a dependência do
contador de logins. Regras de perfil e compatibilidade serão preparadas conjuntamente:
o cliente antigo não pode sobrescrever a aprovação, e um cliente antigo de conta nova
não ganha acesso por ainda oferecer o primeiro uso gratuito.

## Confirmação de pagamento

- Preferir Checkout Pro Preferences/Payments, como no Setlist, sem misturar contratos
  da integração Orders. Criar configuração própria do Caderno na conta Mercado Pago.
- Validar a assinatura do webhook e consultar o recurso na API do Mercado Pago.
- Conferir aprovação, valor do pedido, BRL, recebedor, ambiente de produção e referência
  de um pedido existente criado pelo servidor para o usuário correto.
- O pagamento não pode liberar duas contas nem ser reaproveitado de outro aplicativo.
- Tratar notificações repetidas, concorrentes e fora de ordem com operações atômicas
  e registros idempotentes. Não confirmar recebimento como concluído antes de persistir
  o efeito necessário; falhas precisam ser recuperáveis.
- Checkout repetido reutiliza pedido pendente apropriado; repetição da criação não
  deve provocar cobrança duplicada.
- Retorno do checkout e botão de nova verificação podem executar reconciliação
  autenticada e limitada por frequência, usando as mesmas validações do webhook.
- Pagamento de teste nunca concede acesso real de produção.
- Reembolsos/chargebacks atualizam apenas a concessão daquele pagamento, sem apagar
  cadernos nem remover uma isenção antiga. A política comercial de retirada de acesso
  por reembolso deve ficar explícita antes da ativação.
- Tokens Mercado Pago e chave privada Firebase nunca usam prefixo `VITE_` nem entram
  no bundle público, Git, prints ou logs. Dados de cartão ficam no checkout do provedor.

## Sequência de entrega

1. Levantamento e backup; conferir regras publicadas, contas e configuração atual.
2. Implementar migração de isenções e testes; entregar relatório de simulação.
3. Criar Worker do Caderno, sandbox e testes de token, assinatura e idempotência.
4. Implementar tela pendente, listener de acesso e recuperação do checkout no app.
5. Validar regras no emulador e integração sandbox; testar contas antigas e novas.
6. Coordenar corte, conceder isenções e publicar regras/frontend compatíveis na Vercel.
7. Ativar cobrança de produção após validar secrets, recebedor, webhook e isenções.
   Uma transação real controlada será realizada pelo proprietário para confirmar o fluxo ponta a ponta.
8. Publicar o frontend no Cloudflare Pages usando o mesmo Firebase, sem mudar o appId.
   Autorizar o novo domínio no Authentication e configurar origens/retornos aceitos pelo Worker.
9. Validar login, isenções, contas pagas, dados e checkout no novo endereço.
10. Avisar usuários e manter Vercel como endereço de transição. Só depois avaliar sua desativação.

Secrets e configuração são específicos do Caderno. Não solicitar valores secretos pelo chat.
Usar cofre/painel e entrada segura. A infraestrutura efetivamente disponível será
verificada na implantação; ainda não foram acessados Firebase, Mercado Pago ou Cloudflare de produção.

## PWA e mudança de endereço

Manter Firebase/UID preserva dados sincronizados e permissões. A sessão e o armazenamento
local pertencem à origem do site: outro domínio pode pedir login novamente e instalação
de outro atalho. O PWA instalado na Vercel não troca automaticamente sua origem para Pages.
Rascunhos locais ainda não sincronizados não migram sozinhos; conferir/sincronizar antes
da mudança. Não limpar localStorage, caches ou service workers automaticamente.
Manter o endereço antigo durante a transição protege instalações existentes e links.
Se houver domínio próprio estável, avaliar preservá-lo para reduzir esse impacto.

## Critérios de aceite

- Conta antiga paga ou não paga entra sem cobrança e vê os mesmos cadernos/anotações.
- Conta antiga sem perfil, com campos antigos ou com rascunho pendente tem caso de migração validado.
- Novo cadastro vai ao checkout; ainda pendente não lê nem grava cadernos protegidos.
- Aprovação válida libera automaticamente a conta correta sem intervenção manual.
- Fechar o checkout, voltar pelo PWA ou perder uma notificação não perde pagamento: reconciliação recupera o estado.
- Assinatura inválida, retorno forjado, outro UID, outro app, valor/recebedor/ambiente errado não liberam acesso.
- Notificações repetidas, concorrentes ou atrasadas não duplicam nem restauram compra estornada incorretamente.
- Editar campos de perfil pelo navegador não concede acesso.
- Regras passam no emulador e contas representativas são validadas antes da virada.
- Conferência antes/depois preserva UIDs, IDs e conteúdo dos cadernos.
- Rollback de frontend/regras é preparado com backup e grants preservados; não
  reativar o antigo contador que cobraria novamente contas antigas.

## Limites e custos

Não é necessário comprar um domínio nem contratar um segundo banco para este desenho.
Não há promessa de operação gratuita ilimitada: Cloudflare e Firebase têm cotas, e
o Mercado Pago tem tarifas por transação. Com ticket de R$ 2,99, conferir a tarifa
real configurada na conta antes da ativação. Nenhum plano pago será habilitado no planejamento.

## Referências

- Cloudflare Pages: https://developers.cloudflare.com/pages/
- Cloudflare Worker e assets: https://developers.cloudflare.com/workers/static-assets/
- Verificação de ID tokens Firebase: https://firebase.google.com/docs/auth/admin/verify-id-tokens
- Regras por campos Firestore: https://firebase.google.com/docs/firestore/security/rules-fields
- Firestore REST: https://firebase.google.com/docs/firestore/use-rest-api
- Mercado Pago Preferences: https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-pro-preferences/create-preference/post
- Mercado Pago Webhooks: https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/payment-notifications
- Referência privada do proprietário: https://github.com/miguelangelodevads/setlist-pro/blob/main/billing/README.md

O estado acima registra a execução. As seções de sequência e critérios permanecem como
referência operacional; evidências privadas e histórico estão em `billing/README.md`.
