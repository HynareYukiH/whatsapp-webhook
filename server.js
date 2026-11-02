const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const STORE_PATH = path.join(__dirname, 'messages.json');

if (!VERIFY_TOKEN || !ADMIN_TOKEN) {
  console.error('Faltam variáveis de ambiente: VERIFY_TOKEN e ADMIN_TOKEN são obrigatórias.');
  process.exit(1);
}

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  } catch (e) {
    return [];
  }
}

function writeStore(messages) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(messages, null, 2));
}

const RAW_LOG_PATH = path.join(__dirname, 'raw-log.json');

function appendRawLog(entry) {
  let log = [];
  try { log = JSON.parse(fs.readFileSync(RAW_LOG_PATH, 'utf8')); } catch (e) { log = []; }
  log.push(entry);
  if (log.length > 50) log = log.slice(-50); // guarda só os últimos 50
  fs.writeFileSync(RAW_LOG_PATH, JSON.stringify(log, null, 2));
}

// Loga toda requisição que chega — útil pra depurar se a Meta está batendo aqui.
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// 1) Verificação do webhook — a Meta chama isso uma vez ao configurar.
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// 2) Mensagens novas chegam aqui via POST, em tempo real.
app.post('/webhook', (req, res) => {
  appendRawLog({ recebidoEm: new Date().toISOString(), body: req.body });

  const entry = req.body.entry && req.body.entry[0];
  const change = entry && entry.changes && entry.changes[0];
  const value = change && change.value;
  const messages = value && value.messages;

  console.log('POST /webhook recebido:', JSON.stringify(req.body));

  if (messages && messages.length > 0) {
    const contacts = value.contacts || [];
    const stored = readStore();

    messages.forEach((msg) => {
      const contact = contacts.find((c) => c.wa_id === msg.from) || {};
      stored.push({
        id: msg.id,
        de: msg.from,
        nome: (contact.profile && contact.profile.name) || msg.from,
        texto: (msg.text && msg.text.body) || '[mensagem sem texto — áudio/imagem/outro tipo]',
        recebidoEm: new Date().toISOString(),
      });
    });

    writeStore(stored);
    console.log(`${messages.length} mensagem(ns) nova(s) guardada(s).`);
  }

  // A Meta exige resposta 200 rápida, senão reenvia o webhook.
  res.sendStatus(200);
});

// 3) Eu (ou qualquer automação autorizada) leio as mensagens pendentes por aqui.
//    Protegido por ADMIN_TOKEN — nunca deixe esse endpoint sem token.
app.get('/pending', (req, res) => {
  const token = req.query.token;
  if (token !== ADMIN_TOKEN) return res.sendStatus(401);

  const stored = readStore();
  res.json(stored);
});

// 4) Depois de processar, limpa a fila (evita duplicar no Painel).
app.post('/clear', (req, res) => {
  const token = req.query.token;
  if (token !== ADMIN_TOKEN) return res.sendStatus(401);

  writeStore([]);
  res.sendStatus(200);
});

app.get('/', (req, res) => {
  res.send('Webhook do WhatsApp da gráfica está no ar.');
});

// 6) Envia mensagem de resposta via WhatsApp Cloud API.
//    Chamado pela tarefa agendada depois que a Helena decide o que responder.
app.post('/send', async (req, res) => {
  const token = req.query.token;
  if (token !== ADMIN_TOKEN) return res.sendStatus(401);

  const { to, text } = req.body || {};
  if (!to || !text) return res.status(400).json({ error: 'Faltam "to" e "text" no corpo.' });

  const waToken = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.PHONE_NUMBER_ID;
  if (!waToken || !phoneNumberId) {
    return res.status(500).json({ error: 'WHATSAPP_TOKEN ou PHONE_NUMBER_ID não configurados no servidor.' });
  }

  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${waToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      console.error('Falha ao enviar:', JSON.stringify(data));
      return res.status(r.status).json(data);
    }
    console.log(`Mensagem enviada para ${to}: "${text}"`);
    res.json(data);
  } catch (e) {
    console.error('Erro ao enviar:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// 5) Histórico cru de tudo que chegou em /webhook — para depuração.
app.get('/debug', (req, res) => {
  const token = req.query.token;
  if (token !== ADMIN_TOKEN) return res.sendStatus(401);
  try {
    res.json(JSON.parse(fs.readFileSync(RAW_LOG_PATH, 'utf8')));
  } catch (e) {
    res.json([]);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
