const moment = require("moment-timezone");
const axios = require("axios");

let filaDeEspera = [];
let lavagemAtiva = null;

function formatarHorario(momentObj) {
  return momentObj.format("HH:mm");
}

async function tratarMensagemLavanderia(sock, msg) {
  const remetente = msg.key.remoteJid;

  // --- Extrair texto ---
  let texto = "";
  if (msg.message?.conversation) {
    texto = msg.message.conversation;
  } else if (msg.message?.extendedTextMessage) {
    texto = msg.message.extendedTextMessage.text;
  } else if (msg.message?.imageMessage?.caption) {
    texto = msg.message.imageMessage.caption;
  }

  const textoLower = texto.toLowerCase().trim();
  const usuarioId = msg.key.participant || remetente;
  const nomeUsuario = "@" + usuarioId.split("@")[0];
  const agora = moment().tz("America/Sao_Paulo");

  // --- Registrar mensagem recebida ---
  console.log("📤 Recebido (Lavanderia):", {
    usuario: nomeUsuario,
    mensagem: texto,
    dataHora: agora.format("YYYY-MM-DD HH:mm:ss"),
  });

  try {
    await axios.post("https://sheetdb.io/api/v1/7x5ujfu3x3vyb", {
      data: [
        {
          usuario: nomeUsuario,
          mensagem: texto,
          dataHora: agora.format("YYYY-MM-DD HH:mm:ss"),
        },
      ],
    });
  } catch (err) {
    console.error("❌ Falha ao salvar mensagem no Sheets:", err.message);
  }

  // --- Função de envio segura ---
  const enviar = async (mensagem) => {
    try {
      if (!sock || !sock.user) {
        console.warn(
          "⚠️ Sessão WhatsApp inativa — mensagem não enviada:",
          mensagem.text || mensagem
        );
        return;
      }

      console.log("📨 Enviando (Lavanderia):", mensagem.text || mensagem);
      await sock.sendMessage(remetente, mensagem);

      const textoBot =
        typeof mensagem === "string" ? mensagem : mensagem.text || "";
      await axios.post("https://sheetdb.io/api/v1/7x5ujfu3x3vyb", {
        data: [
          {
            usuario: "BOT",
            mensagem: textoBot,
            dataHora: moment()
              .tz("America/Sao_Paulo")
              .format("YYYY-MM-DD HH:mm:ss"),
          },
        ],
      });
      console.log("✅ Resposta registrada:", textoBot);
    } catch (err) {
      console.error("❌ Erro ao enviar mensagem (Lavanderia):", err.message);
    }
  };

  // --- MENU PRINCIPAL ---
  if (textoLower === "menu" || textoLower === "iniciar") {
    await enviar({
      text: `📋 *Menu de Opções*:\n
1️⃣ Dicas 📝
2️⃣ Info Lavadora 🧺
3️⃣ Iniciar Lavagem 🧼
4️⃣ Finalizar Lavagem ✅
5️⃣ Entrar na Fila ⏳
6️⃣ Sair da Fila 🚶‍♂️
7️⃣ Sortear Roupas 🎲
8️⃣ Horário de Funcionamento ⏰
9️⃣ Previsão do Tempo 🌦️
🔟 Coleta de Lixo 🗑️

*Digite o número correspondente à opção desejada.*`,
    });
    return;
  }

  // --- OPÇÃO 1 ---
  if (texto === "1") {
    await enviar({ text: "🧼 Dicas de uso: https://youtu.be/2O_PWz-0qic" });
    return;
  }

  // --- OPÇÃO 2 ---
  if (texto === "2") {
    await enviar({
      text: "🧾 *Informações da Lavadora*\nElectrolux 8,5Kg LT09E\nConsumo: 112L / 0,25kWh por ciclo\nVelocidade: 660 rpm\nTensão: 220V\nEficiência: A",
    });
    return;
  }

  // --- OPÇÃO 3: INICIAR LAVAGEM ---
  if (texto === "3") {
    if (agora.hour() >= 20) {
      await enviar({
        text: `❌ ${nomeUsuario}, não é possível iniciar a lavagem após as 20h.\n🕗 Lavagens permitidas entre 07h e 20h.`,
      });
      return;
    }

    const tempoAvisoAntesDoFim = 10;
    const fim = agora.clone().add(2, "hours");
    const saudacao =
      agora.hour() < 12
        ? "Bom dia"
        : agora.hour() < 18
        ? "Boa tarde"
        : "Boa noite";

    lavagemAtiva = {
      usuario: nomeUsuario,
      numero: remetente,
      inicio: agora.toDate(),
      fim: fim.toDate(),
    };

    await enviar({
      text: `${saudacao} ${nomeUsuario}! 🧺 Lavagem iniciada às ${formatarHorario(
        agora
      )}.\n⏱️ Termina às ${formatarHorario(fim)}.`,
      mentions: [usuarioId],
    });

    setTimeout(async () => {
      await enviar({
        text: `🔔 ${nomeUsuario}, sua lavagem vai finalizar em ${tempoAvisoAntesDoFim} minutos.`,
        mentions: [usuarioId],
      });
    }, (120 - tempoAvisoAntesDoFim) * 60 * 1000);

    return;
  }

  // --- OPÇÃO 4: FINALIZAR ---
  if (texto === "4") {
    if (!lavagemAtiva || lavagemAtiva.numero !== remetente) {
      await enviar({ text: "⚠️ Nenhuma lavagem ativa para este grupo." });
      return;
    }

    const fimLavagem = moment.tz("America/Sao_Paulo");
    const duracao = moment.duration(
      fimLavagem.diff(moment(lavagemAtiva.inicio))
    );
    const duracaoStr = `${duracao.hours()}h ${duracao.minutes()}min`;

    let resposta = `✅ Lavagem finalizada!\n👤 ${nomeUsuario}\n🕒 Duração: ${duracaoStr}\n`;
    resposta +=
      duracao.asHours() > 2
        ? `⚠️ Tempo ultrapassado, ${nomeUsuario}!`
        : `🎉 Bom trabalho, ${nomeUsuario}!`;

    await enviar({ text: resposta, mentions: [usuarioId] });

    lavagemAtiva = null;

    if (filaDeEspera.length > 0) {
      const proximo = filaDeEspera.shift();
      await enviar({
        text: `🔔 @${
          proximo.split("@")[0]
        }, a máquina está livre!\n👉 Use *3* para iniciar sua lavagem.`,
        mentions: [proximo],
      });
    }
    return;
  }

  // --- OPÇÃO 5: ENTRAR NA FILA ---
  if (texto === "5") {
    if (filaDeEspera.includes(remetente)) {
      const posicao = filaDeEspera.indexOf(remetente) + 1;
      await enviar({
        text: `⏳ ${nomeUsuario}, você já está na fila (posição ${posicao}).`,
        mentions: [usuarioId],
      });
      return;
    }

    if (!lavagemAtiva) {
      await enviar({
        text: `✅ A máquina está livre!\n👉 Use *3* para iniciar sua lavagem.`,
      });
      return;
    }

    filaDeEspera.push(remetente);
    const posicao = filaDeEspera.indexOf(remetente) + 1;
    await enviar({
      text: `📝 ${nomeUsuario}, você entrou na fila!\n🔢 Posição: ${posicao}\n👥 Total: ${filaDeEspera.length}`,
      mentions: [usuarioId],
    });
    return;
  }

  // --- OPÇÃO 6: SAIR DA FILA ---
  if (texto === "6") {
    const indice = filaDeEspera.indexOf(remetente);
    if (indice === -1) {
      await enviar({ text: "❌ Você não está na fila." });
      return;
    }

    filaDeEspera.splice(indice, 1);
    await enviar({ text: "🚪 Você saiu da fila com sucesso." });

    if (filaDeEspera.length > 0) {
      const lista = filaDeEspera
        .map((num, idx) => `🔢 ${idx + 1} - @${num.split("@")[0]}`)
        .join("\n");
      await enviar({
        text: `📋 Fila atualizada:\n${lista}`,
        mentions: filaDeEspera,
      });
    } else {
      await enviar({ text: "🆓 Nenhum usuário na fila agora." });
    }
    return;
  }

  // --- OPÇÃO 7: SORTEAR ROUPAS ---
  if (texto === "7") {
    const roupas = [
      { nome: "Camiseta", peso: 0.2 },
      { nome: "Calça Jeans", peso: 0.6 },
      { nome: "Toalha", peso: 0.4 },
      { nome: "Moletom", peso: 0.8 },
      { nome: "Bermuda", peso: 0.3 },
      { nome: "Pijama", peso: 0.6 },
    ];

    const pesoMax = 8.0;
    let pesoAtual = 0;
    let selecionadas = [];

    while (pesoAtual < pesoMax) {
      const roupa = roupas[Math.floor(Math.random() * roupas.length)];
      if (pesoAtual + roupa.peso > pesoMax) break;
      selecionadas.push(roupa.nome);
      pesoAtual += roupa.peso;
    }

    const contagem = selecionadas.reduce(
      (a, n) => ((a[n] = (a[n] || 0) + 1), a),
      {}
    );
    const lista = Object.entries(contagem)
      .map(([nome, qtd]) => `- ${qtd}x ${nome}`)
      .join("\n");

    await enviar({
      text: `🧺 Lavagem sorteada (até 8kg):\n${lista}\n\nPeso total: ${pesoAtual.toFixed(
        2
      )}kg`,
    });
    return;
  }

  // --- OPÇÃO 8: HORÁRIOS ---
  if (texto === "8") {
    await enviar({
      text: "⏰ *Horário de Funcionamento*\n🗓️ Segunda a Domingo\n🕗 07h às 22h",
    });
    return;
  }

  // --- OPÇÃO 9: PREVISÃO DO TEMPO ---
  if (texto === "9") {
    try {
      const { data } = await axios.get(
        "https://api.hgbrasil.com/weather?key=31f0dad0&city_name=Viamão,RS"
      );
      const info = data.results;
      await enviar({
        text: `🌤️ *Previsão - ${info.city}*\n📅 ${info.date}\n🌡️ ${info.temp}°C\n☁️ ${info.description}\n💨 Vento: ${info.wind_speedy}\n🌅 Nascer: ${info.sunrise}\n🌇 Pôr: ${info.sunset}`,
      });
    } catch (err) {
      console.error("❌ Falha na API de tempo:", err.message);
      await enviar({ text: "⚠️ Erro ao obter previsão do tempo." });
    }
    return;
  }

  // --- OPÇÃO 10: COLETA DE LIXO ---
  if (texto === "10" || texto === "🔟") {
    await enviar({ text: "🗑️ *Coleta de Lixo:*\n🗓️ Terça, Quinta e Sábado" });
    return;
  }
}

module.exports = { tratarMensagemLavanderia };
