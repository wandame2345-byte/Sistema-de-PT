# WE PROFIT — PTs, Discord, Neon e Render

Projeto completo para continuar no Codex e publicar no Render. O banco PostgreSQL e as imagens ficam no Neon. Esta versão é independente do site de demonstração hospedado no ChatGPT; ela começa com dados iniciais e não importa automaticamente dados desse outro site.

## O que está incluído

- Painel compacto de PTs com 9 posições de equipamento: AR, MS, CA, PE, BO, CP, CO, PO, MO.
- Vaga disponível em verde e indisponível quando preenchida.
- Convocação com nome no jogo, main role, role secundária e role fill.
- Login OAuth2 do Discord, sem solicitar senha do Discord no sistema.
- Exigência de pertencer ao servidor e ter o cargo Membro exato por ID. Pessoas pendentes na triagem do servidor não entram.
- Administração do dono identificado por `OWNER_DISCORD_ID`. Staff por ID de conta, com permissão opcional de editar builds e imagens.
- Apenas o dono distribui, remove, renomeia e move jogadores entre vagas. Destinos ocupados não são substituídos.
- Edição de todas as builds, funções, PTs, cores, textos, avisos, logo, imagens e instruções de sets.
- Persistência de dados, sessões e imagens em PostgreSQL. Nenhum upload depende do disco temporário do Render.
- Imagens reduzidas no navegador para até 384 px, convertidas para PNG e deduplicadas no banco. GIF vira imagem estática. Entrada até 5 MB, upload resultante até 1 MB, limite global de imagens de 100 MB nesta versão.
- Tokens OAuth criptografados com AES-256-GCM. Sessões com cookie HttpOnly e Secure em produção. Escritas exigem origem do próprio sistema.
- Verificação do cargo no login e novamente na próxima requisição protegida após 60 segundos. Se o Discord falhar durante a verificação, o acesso aos dados é temporariamente negado. A revogação não apaga dados que alguém já tenha visualizado.

## 1. Colocar no GitHub

1. Descompacte o ZIP no computador.
2. Em https://github.com/new, crie um repositório **privado** chamado `we-profit-pt`.
3. Use **Add file → Upload files**.
4. Envie o CONTEÚDO da pasta `we-profit-render`. `package.json`, `server.mjs` e `README.md` devem ficar na raiz, junto das pastas `src`, `lib`, `scripts` e `tests`.
5. Inclua `package-lock.json`, `schema.sql`, `security.mjs`, `vite.config.ts`, `tsconfig.json`, `index.html`, `render.yaml`, `.gitignore` e `.env.example`.
6. Não envie `node_modules`, `dist`, `dist-server` nem um `.env` com valores reais.
7. Confirme em **Commit changes**. Não envie somente o ZIP: o Render precisa dos arquivos extraídos.

## 2. Abrir o projeto no Codex

- No Codex da web, inicie uma tarefa e selecione **Work in → Cloud → Select environment → Create environment** (os nomes podem aparecer traduzidos).
- Conecte seu GitHub e selecione `we-profit-pt`.
- Use **Get started** para preparar o projeto, revise a configuração e publique o ambiente quando estiver pronto.
- Para instalação e validação, use `npm ci`, `npm test` e `npm run build`. Os testes e o build não precisam das credenciais reais de Discord/Neon.
- No Codex instalado no computador, você também pode abrir a pasta extraída como projeto.

Mensagem sugerida para sua primeira tarefa:

> Este é o sistema WE PROFIT. Leia README.md. Preserve o painel compacto e as regras de acesso. Rode npm ci, npm test e npm run build. Ajude-me a publicar no Render com Neon e Discord. Não substitua por login do ChatGPT, não remova a validação do cargo Membro e não coloque segredos no código. Dono e staff são identificados pelo ID do Discord. Somente o dono pode distribuir jogadores nas vagas.

## 3. Criar o banco Neon

1. Acesse https://console.neon.tech e crie um **novo projeto Free** para esta guild, separado do seu Agenda Pro.
2. Escolha uma região próxima da região que usará no Render.
3. Abra **Connect** no projeto.
4. Escolha o banco e o usuário do banco, habilite **Connection pooling** e copie a URL PostgreSQL.
5. Guarde essa URL para a variável `DATABASE_URL` no Render. A URL contém senha: não publique no repositório ou no chat.
6. Não é necessário copiar tabelas manualmente: o servidor cria as quatro tabelas de `schema.sql` na primeira inicialização, sem apagar tabelas existentes.

## 4. Criar o aplicativo do Discord

1. Acesse https://discord.com/developers/applications.
2. Clique em **New Application** e use o nome `WE PROFIT PT`.
3. Copie o **Application ID / Client ID** para `DISCORD_CLIENT_ID`.
4. Em **OAuth2**, obtenha o **Client Secret** e guarde-o para a variável `DISCORD_CLIENT_SECRET` no Render.
5. Não precisa criar ou instalar um bot para este fluxo. O aplicativo usa os escopos `identify` e `guilds.members.read`.
6. Deixe a configuração do **Redirect URI** para depois de receber o link do Render (passo 6).

IDs necessários — ative **Configurações do usuário → Avançado → Modo desenvolvedor** no Discord:

- `DISCORD_GUILD_ID`: clique com o botão direito no ícone do servidor e copie o ID.
- `DISCORD_MEMBER_ROLE_ID`: nas configurações de cargos do servidor, copie o ID do cargo **Membro**.
- `OWNER_DISCORD_ID`: copie o ID da SUA conta, que será o dono do sistema.

Use sempre IDs, não nomes ou links de convite. O próprio dono também deve estar no servidor e possuir o cargo Membro; o cargo de administrador do Discord não substitui essa exigência.

## 5. Criar o Web Service gratuito no Render

1. Acesse https://dashboard.render.com.
2. Clique em **New → Web Service** e conecte o repositório `we-profit-pt`.
3. Configure:

| Campo | Valor |
|---|---|
| Runtime | Node |
| Root Directory | deixe vazio se os arquivos estão na raiz |
| Build Command | `npm ci --include=dev && npm run build` |
| Start Command | `npm start` |
| Instance Type | Free |
| Health Check Path | `/health` |

4. Adicione as variáveis abaixo. Não crie um Render Postgres: o banco deste projeto é o Neon.

| Variável | O que colocar |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | URL PostgreSQL copiada no Neon |
| `APP_URL` | Link HTTPS real do serviço Render, sem barra final |
| `DISCORD_CLIENT_ID` | ID do aplicativo Discord |
| `DISCORD_CLIENT_SECRET` | Chave secreta do aplicativo Discord |
| `DISCORD_GUILD_ID` | ID do servidor da guild |
| `DISCORD_MEMBER_ROLE_ID` | ID do cargo Membro |
| `OWNER_DISCORD_ID` | ID da sua conta Discord |
| `SESSION_SECRET` | Valor aleatório longo, gerado com o comando abaixo |

Para gerar `SESSION_SECRET`, rode no terminal local ou no terminal do Codex e copie o resultado apenas para o campo secreto do Render:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Não troque esse segredo em cada deploy. Alterá-lo invalida as sessões existentes; os usuários precisarão entrar novamente.

Se o Render só mostrar o endereço definitivo após criar o serviço, crie-o, copie o endereço, ajuste `APP_URL` em **Environment** e faça novo deploy. O aplicativo recusa iniciar se variáveis obrigatórias estiverem vazias; isso é esperado até concluir a configuração. Não invente credenciais para tentar entrar.

Alternativa: o `render.yaml` permite criar por **Blueprint** e preencher as mesmas variáveis. Para começar, o fluxo Web Service manual acima é mais direto.

## 6. Registrar o retorno no Discord

Com o link real do Render em mãos, por exemplo:

```
https://NOME-REAL-DO-SEU-SERVICO.onrender.com
```

cadastre em **Discord Developer Portal → OAuth2 → Redirects**:

```
https://NOME-REAL-DO-SEU-SERVICO.onrender.com/auth/discord/callback
```

Troque o nome de exemplo pelo link verdadeiro. Precisa coincidir exatamente com `APP_URL` + `/auth/discord/callback`. Salve a configuração.

## 7. Ativar e testar

1. Abra o link do Render e clique em **Entrar com Discord**.
2. Autorize o aplicativo usando a conta definida em `OWNER_DISCORD_ID`.
3. A conta deve estar no servidor e ter o cargo Membro.
4. Clique em **Ativar minha administração**. Serão criadas as builds iniciais e os exemplos Player 1 e Player 2.
5. Na administração, edite as builds, envie as imagens, altere textos e distribua players.
6. Recarregue o navegador para confirmar que dados e imagens permaneceram salvos.
7. Teste com uma segunda conta que tenha o cargo Membro: ela deve conseguir inscrever-se, mas não distribuir players ou editar builds.
8. Teste sem o cargo: deve mostrar acesso negado. Remova o cargo de uma sessão de teste, espere mais de 60 segundos e atualize; a API deverá bloquear o acesso.
9. Clique em **Copiar link da convocação**. O endereço para os players será `https://SEU-LINK.onrender.com/?view=signup`.
10. Remova os players de exemplo antes da convocação real.

## Limites e funcionamento gratuito

- O Render fornece um subdomínio `onrender.com` com HTTPS. O plano Free pode suspender o serviço após 15 minutos sem tráfego; o primeiro acesso seguinte pode demorar para acordar.
- Neon Free tem limites de armazenamento, processamento e transferência. Confira os limites atuais no painel do seu plano; gratuidade não significa uso ilimitado.
- O sistema não usa artifícios para manter os planos gratuitos acordados. O painel é atualizado pelo botão Atualizar; alterações na administração são buscadas após cada salvamento.
- Imagens sem referência no sistema são limpas quando têm mais de um dia. Sessões expiradas e estados de login são limpos na inicialização e diariamente enquanto o serviço está em execução.
- Um código de usuário que mudou de nome no Discord mantém a mesma identidade. Staff é autorizada por ID, não por apelido.

## Arquivos principais

| Arquivo | Responsabilidade |
|---|---|
| `src/App.tsx` | Interface dos players e administração |
| `src/style.css` | Aparência compacta |
| `lib/guild.ts` | Regras de permissão e operações sobre PTs |
| `server.mjs` | Discord, sessões, Neon, API e arquivos estáticos |
| `security.mjs` | Criptografia dos tokens e verificação do cargo |
| `schema.sql` | Tabelas iniciais sem apagar dados |
| `tests/guild.test.mjs` | Testes de permissões e operações |
| `.env.example` | Modelo sem segredos reais |
| `render.yaml` | Configuração opcional de Blueprint |

## Desenvolvimento local

Use Node.js 22.14+ ou 24. Instale e compile:

```bash
npm ci
npm test
npm run build
```

Copie `.env.example` para `.env`, coloque credenciais de um aplicativo Discord de desenvolvimento e banco Neon de teste. Use `NODE_ENV=development` e `APP_URL=http://localhost:3000`, cadastre esse callback de teste no Discord e rode `npm start`. Abra `http://localhost:3000`.

`npm run dev` serve a interface Vite em outra porta para edição, mas o callback e a verificação de origem dependem do endereço configurado. Para testar OAuth de ponta a ponta, use a interface compilada em `APP_URL`.

## Problemas comuns

- **redirect_uri inválida:** compare o endereço cadastrado no Discord com `APP_URL` + `/auth/discord/callback`.
- **Acesso negado mesmo sendo administrador:** confirme servidor e ID do cargo; ser administrador não dispensa o cargo Membro.
- **Dono não aparece:** confira `OWNER_DISCORD_ID`, que é o ID do usuário, não o ID do aplicativo.
- **Não inicia no Render:** abra Logs e confira variáveis obrigatórias e `DATABASE_URL`. Nunca envie a URL completa do banco num print.
- **Conflito de edição:** outra alteração foi salva; atualize a página e repita a ação desejada.
- **Falha ao verificar cargo:** aguarde o Discord voltar ou a limitação temporária passar. O sistema não libera dados sem conseguir verificar o acesso.

## Fontes oficiais

- https://render.com/docs/free
- https://render.com/docs/web-services
- https://neon.com/docs/connect/connect-from-any-app
- https://neon.com/docs/connect/connection-pooling
- https://discord.com/developers/docs/topics/oauth2
- https://discord.com/developers/docs/resources/user
- https://developers.openai.com/codex/environments/cloud-environments

## Estado da entrega

O projeto precisa ser publicado no SEU Render e conectado ao SEU Neon e aplicativo Discord. Nenhuma dessas credenciais está incluída. Os testes automatizados verificam regras e criptografia; login real, conexão real ao Neon e concessão/remoção de cargo devem ser validados após preencher os IDs e as chaves.
