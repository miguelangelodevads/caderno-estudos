# Criptografia de ponta a ponta — implementação experimental

Branch: `codex/end-to-end-encryption`, baseada na correção de segurança publicada.
Não publicar, ativar ou migrar contas a partir deste primeiro incremento.

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

O módulo ainda não é importado pelo App. Não muda leitura, escrita, regras,
pagamento, login, rascunhos, dados atuais ou produção. Chamadores devem persistir
somente `record`, nunca o resultado inteiro de `createVault`.

## Próximas etapas obrigatórias

1. Criar fluxo opcional de configuração/desbloqueio, confirmação de que o usuário
   guardou a recuperação e bloqueio explícito. Chave aberta somente em memória;
   limpar referências no logout, troca de conta e bloqueio. JavaScript não garante
   apagar todas as cópias de strings/chaves da memória: não prometer isso.
2. Persistir e validar envelopes de chave por UID, com regras exclusivas e testes.
   Definir limites, concorrência, proteção contra substituição e mudança de senha.
3. Implementar recuperação e troca da senha do cofre preservando a chave de dados.
   Reset da senha Firebase não deve destruir nem substituir o cofre existente.
4. Centralizar todas as leituras e transações de cadernos para cifrar/decifrar.
   Impedir gravações pelo modo bloqueado ou por respostas assíncronas de outra conta.
5. Trocar rascunhos locais por envelopes cifrados e impedir sobrescrever conteúdo
   ainda não sincronizado. Cobrir falhas de conexão, autosave, fechar aba e dois aparelhos.
6. Migração explícita e retomável: inventariar tamanhos, garantir cópia recuperável,
   cifrar no aparelho, verificar round-trip, usar precondição de versão e só então
   substituir o documento. Interromper em conflito ou erro; nunca apagar dados
   para "tentar novamente". Não aceitar dados abertos em contas já migradas.
7. Testar desktop e mobile com contas fictícias, senha incorreta, perda de acesso,
   recuperação em outro aparelho, código/cores, concorrência e corrupção de envelopes.
8. Revisão de segurança e de performance antes de cogitar ativação em produção.

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
