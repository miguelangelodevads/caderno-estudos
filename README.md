# 📚 Caderno de Estudos

### Organização de assuntos, aulas e anotações

Aplicação web para organizar estudos em uma interface inspirada
em um caderno, com edição de conteúdo e integração com Firebase.

## Funcionalidades

- Criação de assuntos identificados por cores.
- Inclusão, edição e exclusão de anotações.
- Reordenação das aulas dentro de cada assunto.
- Edição de conteúdo com salvamento automático.
- Sanitização do HTML das anotações.
- Interface adaptada para celular e computador.
- Orientações de instalação como aplicativo.

## Tecnologias

| Tecnologia | Aplicação |
| --- | --- |
| React | Interface e gerenciamento de estado |
| Firebase | Serviços de autenticação e dados |
| DOMPurify | Sanitização de conteúdo HTML |
| React ContentEditable | Edição das anotações |
| Tailwind CSS | Estilização |
| Vite | Desenvolvimento e build |
| Vite PWA Plugin | Configuração de PWA |
| Lucide React | Ícones |

## Executar localmente

Com Node.js e npm instalados:

```sh
git clone https://github.com/miguelangelodevads/caderno-estudos.git
cd caderno-estudos
npm install
npm run dev
```

Os recursos integrados ao Firebase dependem da configuração
do ambiente e dos serviços correspondentes.

## Comandos

| Comando | Finalidade |
| --- | --- |
| `npm run dev` | Iniciar o desenvolvimento |
| `npm run lint` | Executar análise estática |
| `npm run build` | Gerar a versão de produção |
| `npm run preview` | Visualizar o build localmente |

## Acesso e pagamento manual

O fluxo documentado neste repositório libera o primeiro acesso
gratuitamente. No login seguinte, apresenta um link fixo do
Mercado Pago para pagamento único de R$ 2,99.

Configure no `.env.local`:

- `VITE_MERCADO_PAGO_PAYMENT_URL`: link de pagamento.
- `VITE_PAYMENT_SUPPORT_EMAIL`: e-mail para comprovantes.
- `VITE_PAYMENT_SUPPORT_WHATSAPP`: WhatsApp com país e DDD.

Após confirmar o pagamento no painel do Mercado Pago,
o responsável atualiza o perfil no Firestore com
`lifetimeAccess: true`. O usuário deve entrar novamente.

O Access Token do Mercado Pago não é necessário nesse
fluxo manual e não deve ser colocado em variáveis `VITE_*`.

## Estado do projeto

Projeto de portfólio em evolução. A disponibilidade dos
recursos depende da configuração dos serviços externos.

## Autor

**Miguel Angelo — desenvolvedor de software júnior.**

[Conheça meu portfólio](https://miguel-angelo-portifolio.vercel.app/)
