# Webhook do WhatsApp — Gráfica

Recebe mensagens novas da Cloud API do WhatsApp Business e guarda numa fila
simples, para a equipe de Atendimento (Painel Interno) ler depois.

## O que este servidor faz

1. `GET /webhook` — responde à verificação que a Meta faz ao configurar o webhook.
2. `POST /webhook` — recebe cada mensagem nova em tempo real e guarda em `messages.json`.
3. `GET /pending?token=SEU_ADMIN_TOKEN` — lista as mensagens pendentes (é isso que eu leio pra alimentar o Painel).
4. `POST /clear?token=SEU_ADMIN_TOKEN` — limpa a fila depois de processada.
5. `POST /send?token=SEU_ADMIN_TOKEN` — manda uma resposta de verdade pro cliente (corpo: `{"to":"5511...", "text":"..."}`). É isso que a Helena usa pra responder.

**Limitação importante:** no plano gratuito da maioria dos provedores, o arquivo
`messages.json` pode ser perdido se o servidor reiniciar ou for reimplantado.
Pra uso real/sério depois, trocamos isso por um banco de dados de verdade
(ex: um Postgres gratuito no próprio Render ou Supabase). Pra começar e testar,
este arquivo já funciona.

## Passo a passo para subir no Render (gratuito)

1. Crie uma conta em [render.com](https://render.com).
2. "New +" → "Web Service".
3. Suba esta pasta (`whatsapp-webhook`) — pelo GitHub (crie um repositório e
   suba os arquivos) ou arraste os arquivos direto se o Render oferecer essa opção.
4. Configurações:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
5. Em "Environment Variables", adicione:
   - `VERIFY_TOKEN` → invente uma string qualquer (ex: `graficainovax2026`). Você vai usar esse mesmo valor na configuração do webhook na Meta.
   - `ADMIN_TOKEN` → invente outra string, mais longa e difícil (ex: gere uma em https://1password.com/password-generator). Guarde ela — é a senha que protege sua fila de mensagens.
   - `WHATSAPP_TOKEN` → o token **permanente** gerado no Meta Business Suite (System User → Admin → Gerar token, expiração "Nunca"). Nunca compartilhe esse token em chat — só cole direto aqui no Render.
   - `PHONE_NUMBER_ID` → `1334839923056970` (o phone_number_id do seu número de teste, visto no payload do webhook).
6. Deploy. Ao terminar, o Render te dá uma URL pública, tipo `https://grafica-whatsapp.onrender.com`.

## Configurando na Meta for Developers

1. No seu App → produto WhatsApp → Configuration.
2. Em "Webhook", cole a URL: `https://SEU-APP.onrender.com/webhook`.
3. Em "Verify token", cole o mesmo valor que você colocou em `VERIFY_TOKEN`.
4. Clique em "Verify and save" — se dar certo, a Meta confirma.
5. Em "Webhook fields", marque `messages`.

## Testando

Depois de configurado, mande uma mensagem de teste pro número conectado à API.
Confira se chegou visitando (no navegador, ou me avisando pra eu checar):

```
https://SEU-APP.onrender.com/pending?token=SEU_ADMIN_TOKEN
```

Se aparecer a mensagem em JSON, está funcionando. O próximo passo é eu ler
esse endpoint periodicamente e criar os registros de "Atendimento" no Painel
automaticamente.
