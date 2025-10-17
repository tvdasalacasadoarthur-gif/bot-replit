const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} = require("@whiskeysockets/baileys");

const P = require("pino");
const fs = require("fs");
const express = require("express");
const axios = require("axios");
const QRCode = require("qrcode");

const { tratarMensagemLavanderia } = require("./lavanderia");
const { tratarMensagemEncomendas } = require("./encomendas");

let sock;
let grupos = { lavanderia: [], encomendas: [] };
const caminhoGrupos = "grupos.json";
let reconectando = false;
let qrCodeAtual = null;

// 🧱 Carrega grupos salvos
if (fs.existsSync(caminhoGrupos)) {
  grupos = JSON.parse(fs.readFileSync(caminhoGrupos, "utf-8"));
  console.log("✅ Grupos carregados:");
  console.log("🧺 Lavanderia:", grupos.lavanderia);
  console.log("📦 Encomendas:", grupos.encomendas);
}

// 🚀 Função principal
async function iniciar() {
  // 🔄 Limpa eventos antigos sem encerrar sessão
  if (sock?.ev) {
    try {
      sock.ev.removeAllListeners();
      console.log("♻️ Eventos antigos limpos.");
    } catch (e) {
      console.warn("⚠️ Falha ao limpar eventos:", e.message);
    }
  }

  const { state, saveCreds } = await useMultiFileAuthState("auth");
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    logger: P({ level: "silent" }),
    browser: ["JKBot", "Chrome", "120.0.0.0"],
  });

  sock.ev.on("creds.update", saveCreds);

  // 📩 Recebimento de mensagens
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    const remetente = msg.key.remoteJid;

    if (
      !msg.message ||
      msg.key.fromMe ||
      msg.message.protocolMessage ||
      msg.message.reactionMessage ||
      !remetente.endsWith("@g.us")
    )
      return;

    try {
      const metadata = await sock.groupMetadata(remetente);
      const nomeGrupo = metadata.subject.toLowerCase();

      if (
        nomeGrupo.includes("lavanderia") &&
        !grupos.lavanderia.includes(remetente)
      ) {
        grupos.lavanderia.push(remetente);
      } else if (
        nomeGrupo.includes("jk") &&
        !grupos.encomendas.includes(remetente)
      ) {
        grupos.encomendas.push(remetente);
      }

      fs.writeFileSync(caminhoGrupos, JSON.stringify(grupos, null, 2));
    } catch (e) {
      console.warn("❌ Erro ao obter metadados:", e.message);
    }

    console.log("🔔 Mensagem recebida de", remetente);

    try {
      if (grupos.lavanderia.includes(remetente)) {
        await tratarMensagemLavanderia(sock, msg);
      } else if (grupos.encomendas.includes(remetente)) {
        await tratarMensagemEncomendas(sock, msg);
      } else {
        console.log("🔍 Grupo não registrado:", remetente);
      }
    } catch (e) {
      console.error("❗ Erro ao tratar mensagem:", e.message);
    }
  });

  // 👋 Entrada e saída de participantes
  sock.ev.on("group-participants.update", async (update) => {
    try {
      const metadata = await sock.groupMetadata(update.id);
      for (let participante of update.participants) {
        const numero = participante.split("@")[0];
        const dataHora = new Date().toLocaleString("pt-BR", {
          timeZone: "America/Sao_Paulo",
        });

        if (update.action === "add") {
          await sock.sendMessage(update.id, {
            text: `👋 Olá @${numero}!\nBem-vindo(a) ao grupo *${metadata.subject}*! 🎉\nDigite *menu* para ver as opções.`,
            mentions: [participante],
          });

          await axios.post("https://sheetdb.io/api/v1/7x5ujfu3x3vyb", {
            data: [
              {
                usuario: `@${numero}`,
                mensagem: "Entrou no grupo",
                dataHora,
              },
            ],
          });
        } else if (update.action === "remove") {
          await sock.sendMessage(update.id, {
            text: `👋 @${numero} saiu do grupo *${metadata.subject}*`,
            mentions: [participante],
          });

          await axios.post("https://sheetdb.io/api/v1/7x5ujfu3x3vyb", {
            data: [
              {
                usuario: `@${numero}`,
                mensagem: "Saiu do grupo",
                dataHora,
              },
            ],
          });
        }

        // Log geral de entrada/saída
        await axios.post("https://sheetdb.io/api/v1/7x5ujfu3x3vyb", {
          data: [{ usuario: `@${numero}`, mensagem: update.action, dataHora }],
        });
      }
    } catch (err) {
      console.error("❌ Erro no evento de participante:", err.message);
    }
  });

  // 🔄 Reconexão
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        qrCodeAtual = await QRCode.toDataURL(qr);
        console.log("📱 QR Code disponível em /qr");
      } catch (err) {
        console.error("❌ Erro ao gerar QR:", err.message);
      }
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      console.log(`⚠️ Conexão encerrada: ${statusCode}`);

      if (!reconectando && statusCode !== DisconnectReason.loggedOut) {
        reconectando = true;
        console.log("🔄 Reconectando em 15s...");
        await new Promise((r) => setTimeout(r, 15000));
        await iniciar();
      } else {
        console.log("❌ Sessão encerrada. Escaneie o QR novamente.");
        qrCodeAtual = null;
      }
    } else if (connection === "open") {
      reconectando = false;
      qrCodeAtual = null;
      console.log("✅ Bot conectado ao WhatsApp!");
    }
  });
}

// ▶️ Inicializa
iniciar();

// 🌐 Servidor Express (necessário para o Render)
const app = express();

app.get("/", (req, res) => res.send("🤖 Bot JK rodando no Render!"));
app.get("/qr", (req, res) => {
  if (qrCodeAtual) {
    res.send(`<img src="${qrCodeAtual}" alt="QR Code" />`);
  } else {
    res.send("✅ Bot já conectado ou QR aguardando geração.");
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Servidor HTTP rodando na porta ${PORT}`);
});

// ♻️ Auto ping (mantém Render acordado)
setInterval(async () => {
  try {
    await axios.get(
      `https://${process.env.RENDER_EXTERNAL_URL || "seu-bot.onrender.com"}/`
    );
    console.log("💤 Keep-alive enviado!");
  } catch (err) {
    console.log("⚠️ Falha no keep-alive:", err.message);
  }
}, 1000 * 60 * 5); // a cada 5 minutos
