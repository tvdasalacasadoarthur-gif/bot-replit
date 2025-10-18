const moment = require("moment-timezone");
const axios = require("axios");

let filaDeEspera = [];
let lavagemAtiva = null;

function formatarHorario(momentObj) {
  return momentObj.tz("America/Sao_Paulo").format("DD/MM/YYYY HH:mm:ss");
}

function obterSaudacao() {
  const hora = moment.tz("America/Sao_Paulo").hour();
  if (hora >= 6 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}

function obterMenuLavanderia() {
  return `🧺 *MENU LAVANDERIA UNIVERSITÁRIA*

1️⃣ Dicas de uso 🧼
2️⃣ Info Lavadora ⚙️
3️⃣ Iniciar Lavagem 🚿
4️⃣ Finalizar Lavagem ✅
5️⃣ Entrar na Fila ⏳
6️⃣ Sair da Fila 🚶‍♂️
7️⃣ Sortear Roupas 🎲
8️⃣ Horário de Funcionamento ⏰
9️⃣ Previsão do Tempo 🌦️
🔟 Coleta de Lixo 🗑️

Digite o número da opção desejada ou use os comandos:
• *!ping* - Verificar status do bot
• *!ajuda* ou *menu* - Ver este menu
• *!info* - Informações do grupo
• *!todos* - Mencionar todos os membros`;
}

async function enviarBoasVindas(sock, grupoId, participante) {
  try {
    const numero = participante.split("@")[0];
    const saudacao = obterSaudacao();
    const metadata = await sock.groupMetadata(grupoId);
    const mensagem = `👋 ${saudacao}, @${numero}!

Seja muito bem-vindo(a) ao grupo *${metadata.subject}* 🧺

Aqui você pode gerenciar o uso das máquinas de lavar e ver horários disponíveis.

Digite *menu* para ver todas as opções disponíveis.`;

    await sock.sendMessage(grupoId, {
      text: mensagem,
      mentions: [participante],
    });

    console.log(`✅ Boas-vindas enviadas para @${numero}`);
  } catch (err) {
    console.error("❌ Erro ao enviar boas-vindas:", err.message);
  }
}

async function tratarMensagemLavanderia(sock, msg) {
  const grupoId = msg.key.remoteJid;
  const remetente = msg.key.participant || msg.key.remoteJid;
  const numero = remetente.split("@")[0];
  const texto = (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    ""
  ).trim().toLowerCase();

  console.log(`🧺 [LAVANDERIA] Mensagem de @${numero}: ${texto}`);

  try {
    // menu
    if (texto === "menu" || texto === "!ajuda") {
      await sock.sendMessage(grupoId, { text: obterMenuLavanderia() });
      return;
    }

    // opção 2
    if (texto === "2") {
      await sock.sendMessage(grupoId, {
        text: "🧾 *Informações da Lavadora*\nElectrolux 8,5Kg LT09E\nConsumo: 112L / 0,25kWh por ciclo\nVelocidade: 660 rpm\nTensão: 220V\nEficiência: A",
      });
      return;
    }

    // opção 3 - iniciar lavagem
    if (texto === "3" || texto.includes("iniciar")) {
      if (lavagemAtiva) {
        await sock.sendMessage(grupoId, {
          text: `⚠️ A máquina já está em uso por @${lavagemAtiva.usuario}!\n\nDigite *5* para entrar na fila.`,
          mentions: [lavagemAtiva.jid],
        });
        return;
      }

      const saudacao = obterSaudacao();
      const inicio = moment.tz("America/Sao_Paulo");
      const fim = inicio.clone().add(2, "hours");
      const tempoAvisoAntesDoFim = 10; // minutos antes de avisar

      lavagemAtiva = {
        usuario: numero,
        jid: remetente,
        inicio,
        fim,
      };

      await sock.sendMessage(grupoId, {
        text: `${saudacao}, @${numero}! 🧺 Sua lavagem foi iniciada às ${formatarHorario(inicio)}.\n⏱️ Término previsto para ${formatarHorario(fim)}.`,
        mentions: [remetente],
      });

      // ⏳ aviso 10 minutos antes do fim
      setTimeout(async () => {
        await sock.sendMessage(grupoId, {
          text: `🔔 @${numero}, sua lavagem vai finalizar em ${tempoAvisoAntesDoFim} minutos.`,
          mentions: [remetente],
        });
      }, (120 - tempoAvisoAntesDoFim) * 60 * 1000);

      // 🧼 aviso automático quando termina
      setTimeout(async () => {
        await sock.sendMessage(grupoId, {
          text: `✅ @${numero}, sua lavagem terminou!\n🧺 A máquina agora está livre.`,
          mentions: [remetente],
        });

        // libera a máquina automaticamente
        lavagemAtiva = null;

        // se houver fila, avisa o próximo
        if (filaDeEspera.length > 0) {
          const proximo = filaDeEspera.shift();
          await sock.sendMessage(grupoId, {
            text: `🚨 @${proximo.usuario}, chegou a sua vez de usar a máquina!`,
            mentions: [proximo.jid],
          });
        }
      }, 120 * 60 * 1000); // 2 horas

      return;
    }

    // opção 4 - finalizar lavagem manualmente
    if (texto === "4" || texto.includes("finalizar")) {
      if (!lavagemAtiva) {
        await sock.sendMessage(grupoId, {
          text: "ℹ️ Nenhuma lavagem está ativa no momento.",
        });
        return;
      }

      if (lavagemAtiva.jid !== remetente) {
        await sock.sendMessage(grupoId, {
          text: `⚠️ Apenas @${lavagemAtiva.usuario} pode finalizar esta lavagem.`,
          mentions: [lavagemAtiva.jid],
        });
        return;
      }

      const fim = moment.tz("America/Sao_Paulo");
      const duracao = moment.duration(fim.diff(lavagemAtiva.inicio));
      const minutos = Math.floor(duracao.asMinutes());

      await sock.sendMessage(grupoId, {
        text: `✅ *LAVAGEM FINALIZADA*\n\n@${numero} terminou de usar a lavadora!\n⏱️ Duração: ${minutos} minutos\n\n${filaDeEspera.length > 0 ? `Próximo da fila: @${filaDeEspera[0].usuario}` : "🟢 Máquina disponível!"}`,
        mentions: filaDeEspera.length > 0 ? [remetente, filaDeEspera[0].jid] : [remetente],
      });

      lavagemAtiva = null;
      if (filaDeEspera.length > 0) filaDeEspera.shift();
      return;
    }

  } catch (err) {
    console.error("❌ Erro ao processar mensagem da lavanderia:", err.message);
    await sock.sendMessage(grupoId, {
      text: "❌ Ocorreu um erro ao processar seu comando. Tente novamente.",
    });
  }
}

module.exports = {
  tratarMensagemLavanderia,
  enviarBoasVindas,
};


    // Opção 5: Entrar na Fila
    if (texto === "5" || texto.includes("entrar na fila")) {
      if (!lavagemAtiva) {
        await sock.sendMessage(grupoId, {
          text: "🟢 A máquina está disponível! Use a opção *3* para iniciar.",
        });
        return;
      }

      const jaEstaFila = filaDeEspera.find((p) => p.jid === remetente);
      if (jaEstaFila) {
        await sock.sendMessage(grupoId, {
          text: `ℹ️ Você já está na fila, @${numero}!`,
          mentions: [remetente],
        });
        return;
      }

      filaDeEspera.push({ usuario: numero, jid: remetente });
      
      await sock.sendMessage(grupoId, {
        text: `⏳ @${numero} entrou na fila!\n📊 Posição: ${filaDeEspera.length}º\n\n*Fila atual:*\n${filaDeEspera.map((p, i) => `${i + 1}. @${p.usuario}`).join("\n")}`,
        mentions: [remetente],
      });
      return;
    }

    // Opção 6: Sair da Fila
    if (texto === "6" || texto.includes("sair da fila")) {
      const index = filaDeEspera.findIndex((p) => p.jid === remetente);
      
      if (index === -1) {
        await sock.sendMessage(grupoId, {
          text: "ℹ️ Você não está na fila.",
        });
        return;
      }

      filaDeEspera.splice(index, 1);
      
      await sock.sendMessage(grupoId, {
        text: `🚶‍♂️ @${numero} saiu da fila!`,
        mentions: [remetente],
      });
      return;
    }

    // Opção 7: Sortear Roupas
if (texto === "7" || texto.includes("sortear")) {
  const roupas = [
    "👕 Camiseta",
    "👖 Calça",
    "🧦 Meias",
    "👔 Camisa",
    "🩳 Shorts",
    "👗 Vestido",
    "🩱 Roupa íntima",
    "👚 Blusa",
    "👕 Regata",
    "👖 Legging",
    "🧤 Luvas",
    "🧣 Cachecol",
    "🩲 Cueca",
    "🩱 Sutiã",
    "🛏️ Lençol",
    "🛏️ Fronha",
    "🧺 Toalha de rosto",
    "🧼 Toalha de banho",
    "👕 Pijama"
  ];

  const sorteada = roupas[Math.floor(Math.random() * roupas.length)];

  await sock.sendMessage(grupoId, {
    text: `🎲 *SORTEIO DE ROUPAS*\n\n@${numero} tirou: ${sorteada}!\n\n😄 Boa sorte na lavagem!`,
    mentions: [remetente],
  });
  return;
}


    // Opção 8: Horário de Funcionamento
if (texto === "8" || texto.includes("horário") || texto.includes("horario")) {
  const horarios = `⏰ *HORÁRIO DE FUNCIONAMENTO*

🗓️ Todos os dias: 07:00 - 20:00

⚠️ *Aviso Importante:*
A *última lavagem deve começar até as 20h* para que seja *finalizada até as 22h*, respeitando o horário de silêncio do condomínio. 🕊️

🔕 Evite usar as máquinas após as 22h, em qualquer dia.`;

  await sock.sendMessage(grupoId, { text: horarios });
  return;
}


    // Opção 9: Previsão do Tempo
if (texto === "9" || texto.includes("previsão") || texto.includes("previsao") || texto.includes("tempo")) {
  try {
    const { data } = await axios.get(
      "https://api.hgbrasil.com/weather?key=31f0dad0&city_name=Viamão,RS"
    );

    const info = data.results;

    // Normaliza a descrição para facilitar a análise
    const condicao = info.description.toLowerCase();

    // Define dica personalizada
    let dica = "🧺 Aproveite o dia para lavar suas roupas!";
    if (condicao.includes("chuva") || condicao.includes("tempestade")) {
      dica = "🌧️ Vai chover! Evite estender roupas ao ar livre e use o varal interno.";
    } else if (condicao.includes("nublado")) {
      dica = "⛅ Dia nublado. Pode lavar, mas prefira secar em local coberto.";
    } else if (condicao.includes("sol")) {
      dica = "☀️ Sol forte! Ótimo dia para secar roupas rapidamente.";
    } else if (condicao.includes("neblina")) {
      dica = "🌫️ Neblina presente. O tempo úmido pode atrasar a secagem.";
    }

    const mensagem = `🌦️ *PREVISÃO DO TEMPO - ${info.city}*  
📅 ${info.date}  
🌡️ Temperatura: ${info.temp}°C  
🌤️ Condição: ${info.description}  
💨 Vento: ${info.wind_speedy}  
💧 Umidade: ${info.humidity}%  
🌅 Nascer do Sol: ${info.sunrise}  
🌇 Pôr do Sol: ${info.sunset}  

💡 *Dica:* ${dica}

📍 *Atualizado automaticamente via HGBrasil API*`;

    await sock.sendMessage(grupoId, { text: mensagem });
  } catch (err) {
    console.error("❌ Erro ao obter previsão do tempo:", err.message);
    await sock.sendMessage(grupoId, {
      text: "⚠️ Não foi possível obter a previsão do tempo no momento. Tente novamente mais tarde.",
    });
  }
  return;
}


  // Opção 10: Coleta de Lixo
if (texto === "10" || texto.includes("lixo") || texto.includes("coleta")) {
  const hoje = moment.tz("America/Sao_Paulo").format("dddd"); // Dia atual
  const coleta = `🗑️ *COLETA DE LIXO*

📅 Hoje é *${hoje}*

♻️ *Lixo Reciclável:* Terça, Quinta e Sábado  
🗑️ *Lixo Orgânico e Comum:* Segunda, Quarta e Sexta  

⏰ *Horário:* Deixar o lixo até às 19h na área designada.

🔹 *Orientações importantes:*
- Separe o lixo *reciclável* (papel, plástico, vidro, metal) do *orgânico* (restos de alimentos, cascas, etc.).  
- Mantenha uma *sacola separada apenas para recicláveis*, facilitando o trabalho dos catadores.  
- Sempre *amarre bem as sacolas* antes de colocar para fora.  
- Use preferencialmente:
  🟦 *Sacos azuis* ou *sacolas brancas de supermercado* → para recicláveis  
  ⬛ *Sacos pretos* → para lixo comum e orgânico  

🚮 *Importante:*  
Caso os sacos de lixo estejam na *calçada*, o descarte será feito junto com os demais moradores,  
pois a coleta ocorre *a cada 2 dias*. Dessa forma, evitamos acúmulo e mantemos o local limpo e organizado.  

💚 *Separar e descartar corretamente ajuda o meio ambiente e facilita o trabalho dos catadores!*`;

  await sock.sendMessage(grupoId, { text: coleta });
  return;
}
