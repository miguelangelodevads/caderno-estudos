# Correções de segurança em branch isolada

Branch: `codex/security-hardening`. Produção não foi publicada, as regras em produção
não foram alteradas e não houve migração de anotações nesta etapa.

## Alterações

- DOMPurify atualizado para pelo menos 3.4.17.
- gRPC interno do Firebase fixado em uma versão 1.x corrigida por override. O Firebase
  permanece em 12.x; a sugestão automática de downgrade para 9.x não foi aplicada.
- Dependências transitivas atualizadas com `npm audit fix`, sem `--force`.
- HTML armazenado passa a aceitar somente cor sólida em estilos inline. Imagens de
  rastreamento em CSS e estilos que cobrem a interface são removidos na renderização.
- Links com nova aba recebem `noopener noreferrer`.
- Cabeçalhos do Pages incluem CSP, bloqueio de enquadramento, nosniff e restrições
  de câmera, microfone e geolocalização. Sua aplicação no CDN exige validação em
  uma implantação de homologação; Vite dev não aplica o arquivo `_headers`.
- Testes com DOM real simulado verificam conteúdo malicioso, links, cores e código.
- Testes de regras ampliados para listagem e alteração por outra conta.

## Validação local em 28/10/2026

- `npm test`: 87 testes passaram, incluindo autosave, detecção/formatação de código,
  preservação de cores, assinatura de notificações, autenticação e pagamento simulado.
- `npm run lint`: passou.
- `npm run build`: passou, inclusive geração do service worker; permanece o aviso
  de tamanho de bundle já existente.
- `npm run test:rules`: 45 verificações passaram no projeto fictício
  `demo-caderno-billing`, sem acesso ao Firestore de produção.
- `npm audit --omit=dev`: zero alertas conhecidos na consulta realizada.
- Navegador real, com o componente NoteEditor original em uma página local sem
  Firebase: texto, quebra de linha, cor azul, colagem automática de JavaScript,
  destaque de sintaxe e confirmação de autosave funcionaram. A inspeção do DOM
  encontrou um bloco de código, quatro elementos de destaque e nenhum elemento
  script/iframe/svg. O salvamento nessa página foi simulado e não gravou dados reais.
- Auditoria incluindo ferramentas: quatro alertas baixos derivados de `deepmerge`
  na cadeia de geração do PWA. Não foi aplicado o downgrade incompatível sugerido
  para vite-plugin-pwa. Reavaliar a atualização upstream antes da liberação.

Para executar as regras localmente, o emulador atual exige Java 21. Neste ambiente,
foi necessário iniciar o Java com `-Duser.language=en -Duser.country=US` para evitar
uma falha de recursos de tradução do próprio emulador. Isso não altera o app.

## Limites e decisão de liberação

Os testes justificam continuar para homologação, mas não são prova de ausência de
vulnerabilidades ou de vazamento. Antes de produção, validar no navegador desktop e
mobile, com contas de teste, login/logout, autosave e recuperação após falha, cores,
colagem de código, acesso antigo/novo e checkout em ambiente de teste. Conferir no
CDN as violações da CSP e ajustar apenas destinos necessários. Não realizar cobrança
real como parte dessa validação.

Rascunhos ainda não sincronizados continuam no armazenamento local existente para
evitar perda de conteúdo. Não foram apagados nem criptografados. Acesso administrativo
ao Firebase continua permitindo a leitura; estas correções não implementam criptografia
de ponta a ponta. Ela exige projeto separado de chaves, recuperação, migração e backup.
Nenhuma proteção absoluta de privacidade deve ser anunciada com base nesta branch.
