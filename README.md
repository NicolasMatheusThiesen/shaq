# Shaq o Betta

App pessoal (PWA para iPhone) para cuidar do aquário do Shaq: refeições, troca de água, temperatura, humor, luz e notificações.

- **Stack:** Node.js 22 + Express + PostgreSQL. Só 3 dependências (`express`, `pg`, `web-push`). Frontend em HTML/CSS/JS puro, sem build.
- **Usuário único**, login com senha, sem cadastro público.

## Rodar no seu computador

Requisitos: Node 22+ e um PostgreSQL.

```bash
npm install
cp .env.example .env          # preencha DATABASE_URL (e, se quiser testar notificações, as chaves VAPID)
npm run criar-usuario         # pergunta login e senha (mínimo 12 caracteres)
npm run dev                   # abre em http://localhost:3000
```

As tabelas são criadas sozinhas na primeira execução (`migrations/`).

## Testes

```bash
TEST_DATABASE_URL=postgres://usuario:senha@127.0.0.1:5432/shaq_teste npm test
```

Atenção: o banco de teste é **apagado e recriado** a cada execução. Use um banco só para isso, nunca o de verdade. Sem `TEST_DATABASE_URL`, os testes de API são pulados e rodam só os de regras, validação, segurança e notificações.

## Colocar no ar (iPhone precisa de HTTPS)

1. **Banco:** crie um PostgreSQL gerenciado (Neon, Supabase ou o do próprio host) e copie a connection string.
2. **Repositório:** suba o código para um repositório **privado** no GitHub. O `.gitignore` já bloqueia `.env`, chaves e certificados. Confira com `git status` antes do primeiro commit.
3. **Hospedagem:** crie um serviço web a partir do repositório (Render, Railway ou Fly.io; todos entendem o `Dockerfile`). Configure as variáveis de ambiente **no painel do host**, nunca no código:

   | Variável | Valor |
   | --- | --- |
   | `DATABASE_URL` | connection string do banco |
   | `NODE_ENV` | `production` |
   | `TRUST_PROXY` | `1` |
   | `APP_URL` | o endereço final, ex.: `https://shaq.onrender.com` |
   | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | de `npm run gerar-vapid` (veja abaixo) |

4. **Criar seu usuário no servidor:** no seu computador, com a connection string só naquele comando (sem salvar em arquivo):

   ```bash
   DATABASE_URL='cole-a-connection-string' npm run criar-usuario
   ```

5. **Notificações:** rode `npm run gerar-vapid` uma vez e copie as três linhas para as variáveis do host. A chave privada é segredo; se vazar, gere outro par.

### Atenção com planos gratuitos

Muitos planos gratuitos "dormem" sem uso. Enquanto dorme, o servidor não calcula nem envia notificações, e a primeira abertura do dia demora. Para os avisos chegarem no horário, use um plano que fique sempre ligado (confira o preço atual no provedor).

## Instalar no iPhone

1. Abra o endereço do app no **Safari** e entre com seu login.
2. Toque em **Compartilhar** e depois em **Adicionar à Tela de Início**.
3. Abra pelo novo ícone e entre de novo (o app instalado guarda a própria sessão).
4. Em **Ajustes**, toque em **Ativar neste iPhone** e aceite as notificações. Use **Enviar teste** para conferir.

Notificações no iPhone exigem iOS 16.4 ou mais novo e só funcionam com o app instalado na Tela de Início. O iOS pode atrasar a entrega, e o modo Foco silencia os avisos.

## O que o app faz

- **Refeições:** horários e bolinhas configuráveis (padrão: 08:00 e 20:00, 4 bolinhas). Avisa a hora de comer e pede confirmação se passar do total do dia.
- **Troca de água:** próxima data pelo intervalo configurado (padrão: 7 dias), parcial ou total.
- **Temperatura:** abaixo de 22°, "Peixe congelando"; de 22° a menos de 27°, "Peixe saudável"; a partir de 27°, "Peixe frito". Os limites são configuráveis.
- **Humor:** Ativo, Calmo, Bravo, Apático, Se escondendo. Apático e se escondendo geram aviso.
- **Luz:** acende 06:00, apaga 20:00 (configurável). Você marca o estado da luz e o app avisa quando estiver diferente do esperado.
- **Histórico** dos últimos 30 dias, com opção de apagar um registro feito por engano.

Todas as contas de "hoje" usam o fuso configurado (padrão `America/Sao_Paulo`), não o do servidor.

## Segurança

- **Segredos só em variáveis de ambiente.** Nada no código, no repositório ou no navegador.
- Senha com hash **scrypt** (nativo do Node). Sessão por cookie `HttpOnly`, `SameSite=Strict` e, em produção, `Secure` com prefixo `__Host-`. No banco fica só o **hash** do token da sessão. Sessão de 90 dias, renovada a cada dia de uso.
- Login com limite de **5 tentativas por minuto** por IP e de 20 falhas por 15 minutos no total; mesma mensagem e mesmo tempo para usuário inexistente e senha errada.
- Todas as rotas da API, exceto login e `/api/saude`, exigem login.
- Proteção contra CSRF: cookie `SameSite=Strict`, verificação de `Origin` e só aceita `application/json`.
- Consultas ao banco sempre **parametrizadas**; entradas validadas no servidor (faixas, formatos, datas).
- Cabeçalhos: CSP restrita à própria origem (sem scripts ou estilos inline), HSTS em produção, `nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`.
- O service worker **nunca** guarda respostas de `/api` em cache.
- Notificações: o servidor só aceita inscrições de serviços de push conhecidos (Apple, Google, Mozilla, Microsoft), para não ser usado como ponte para outros endereços. As chaves da inscrição nunca aparecem em respostas nem em logs.
- Banco fora da sua máquina: conexão com TLS e verificação de certificado obrigatórias.
- Trocar a senha desconecta os outros aparelhos.

## Manutenção mensal (15 minutos)

- [ ] `npm audit` e `npm outdated`; atualize o que tiver correção de segurança e rode `npm test`.
- [ ] Faça um backup (`pg_dump`) e guarde fora do servidor; teste a restauração de vez em quando.
- [ ] Confira se o backup automático do banco está ativo no provedor.
- [ ] Troque a senha se houver qualquer suspeita de vazamento (`npm run criar-usuario` redefine e derruba todas as sessões).

## Estrutura

```
src/dominio.js        regras de negócio puras (próxima refeição, troca, temperatura, luz, alertas)
src/validacao.js      validação de tudo que entra
src/seguranca.js      senha, sessão, limite de tentativas, cabeçalhos
src/rotas/            API (auth, registros, configuração, push)
src/avisos.js         agendador que envia as notificações (1 vez por aviso)
migrations/           esquema do banco
public/               o app (HTML, CSS, JS, ícones, manifest, service worker)
test/                 testes
```
