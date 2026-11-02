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
  const entry = req.body.entry && req.body.entry[0];
  const change = entry && entry.changes && entry.changes[0];
  const value = change && change.value;
  const messages = value && value.messages;

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
