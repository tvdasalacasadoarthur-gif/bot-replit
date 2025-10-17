const axios = require("axios");

const URL_SHEETDB_ENCOMENDAS = "https://sheetdb.io/api/v1/g6f3ljg6px6yr";
const URL_SHEETDB_HISTORICO = "https://sheetdb.io/api/v1/7x1nynb2lzcw6";
const URL_SHEETDB_LOG = "https://sheetdb.io/api/v1/g30g3cmw5o8tu"; // planilha de log

let estadosUsuarios = {};
let timeoutUsuarios = {};
const TEMPO_EXPIRACAO_MS = 10 * 60 * 1000;

function iniciarTimeout(idSessao) {
  if (timeoutUsuarios[idSessao]) clearTimeout(timeoutUsuarios[idSessao]);
  timeoutUsuarios[idSessao] = setTimeout(() => {
    console.log(`⌛ Sessão expirada: ${idSessao}`);
    delete estadosUsuarios[idSessao];
    delete timeoutUsuarios[idSessao];
  }, TEMPO_EXPIRACAO_MS);
}

async function tratarMensagemEncomendas(sock, msg) {
  try {
    if (!msg.message || msg.messageStubType) return;

    const remetente = msg.key.remoteJid;
    const textoUsuario = msg.message.conversation?.trim() || "";
    const idSessao = remetente + "_" + (msg.key.participant || "");
    const usuario = msg.pushName || "Desconhecido";
    const dataHora = new Date().toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
    });

    // --- LOG de mensagem recebida ---
    if (!msg.key.fromMe && textoUsuario) {
      try {
        await axios.post(URL_SHEETDB_LOG, [
          { usuario, mensagem: textoUsuario, origem: "usuário", dataHora },
        ]);
      } catch (err) {
        console.error("⚠️ Falha ao salvar log do usuário:", err.message);
      }
    }

    // --- Função de envio segura ---
    const enviar = async (mensagem) => {
      const conteudo =
        typeof mensagem === "string" ? { text: mensagem } : mensagem;
      try {
        if (!sock || !sock.user) {
          console.warn(
            "⚠️ Sessão WhatsApp inativa — mensagem não enviada:",
            conteudo.text || ""
          );
          return;
        }

        console.log("📦 Enviando (Encomendas):", conteudo.text || conteudo);
        await sock.sendMessage(remetente, conteudo);

        // loga mensagem do BOT
        await axios.post(URL_SHEETDB_LOG, [
          {
            usuario: "BOT",
            mensagem: conteudo.text || JSON.stringify(conteudo),
            origem: "bot",
            dataHora,
          },
        ]);
      } catch (err) {
        console.error("❌ Erro ao enviar mensagem (Encomendas):", err.message);
      }
    };

    // --- Controle de sessão ---
    const escolha = parseInt(textoUsuario.toLowerCase(), 10);
    const sessaoAtiva = estadosUsuarios[idSessao];

    if (!sessaoAtiva && textoUsuario !== "0") return;

    // --- Início do módulo ---
    if (textoUsuario === "0") {
      estadosUsuarios[idSessao] = { etapa: "menu" };
      iniciarTimeout(idSessao);
      await enviar("🔐 Iniciando módulo de encomendas...");
      await enviar(
        "Escolha uma opção:\n1️⃣ Registrar Encomenda\n2️⃣ Ver Encomendas\n3️⃣ Confirmar Recebimento\n4️⃣ Ver Histórico"
      );
      estadosUsuarios[idSessao].etapa = "aguardandoEscolha";
      return;
    }

    iniciarTimeout(idSessao);
    const estado = estadosUsuarios[idSessao];

    switch (estado.etapa) {
      case "aguardandoEscolha":
        if (escolha === 1) {
          estado.etapa = "obterNome";
          await enviar("👤 Qual o seu nome?");
        } else if (escolha === 2) {
          const { data } = await axios.get(URL_SHEETDB_ENCOMENDAS);
          if (!data.length) {
            await enviar("📭 Nenhuma encomenda registrada ainda.");
            delete estadosUsuarios[idSessao];
            return;
          }

          const agrupado = {};
          data.forEach((e) => {
            const nome = e.nome?.toLowerCase().trim() || "desconhecido";
            if (!agrupado[nome]) agrupado[nome] = [];
            agrupado[nome].push(e);
          });

          let resposta = "📦 *Encomendas registradas:*\n\n";
          for (const [nome, encomendas] of Object.entries(agrupado)) {
            resposta += `👤 ${nome}\n`;
            encomendas.forEach((e) => {
              resposta += `🆔 ${e.id} 🛒 ${e.local} — ${e.data}\n📍 Status: ${e.status}`;
              if (e.recebido_por)
                resposta += `\n📬 Recebido por: ${e.recebido_por}`;
              resposta += "\n\n";
            });
          }

          await enviar(resposta.trim());
          delete estadosUsuarios[idSessao];
        } else if (escolha === 3) {
          estado.etapa = "informarID";
          await enviar("📦 Informe o *ID da encomenda* que deseja confirmar:");
        } else if (escolha === 4) {
          const { data: historico } = await axios.get(URL_SHEETDB_HISTORICO);
          const preenchidos = historico.filter((l) =>
            Object.values(l).some((v) => v?.toString().trim() !== "")
          );

          if (!preenchidos.length) {
            await enviar("📭 O histórico está vazio.");
            delete estadosUsuarios[idSessao];
            return;
          }

          for (let i = 0; i < preenchidos.length; i += 5) {
            const bloco = preenchidos.slice(i, i + 5);
            let mensagem = "📜 *Histórico de Encomendas:*\n\n";
            bloco.forEach((e) => {
              mensagem += `🆔 ${e.id} 🛒 ${e.local} — ${e.data}\n👤 ${e.nome}\n📍 ${e.status}`;
              if (e.recebido_por)
                mensagem += `\n📬 Recebido por: ${e.recebido_por}`;
              mensagem += "\n\n";
            });
            await enviar(mensagem.trim());
          }
          delete estadosUsuarios[idSessao];
        } else {
          await enviar("⚠️ Opção inválida. Digite 1, 2, 3 ou 4.");
        }
        break;

      case "obterNome":
        estado.nome = textoUsuario.toLowerCase();
        estado.etapa = "obterData";
        await enviar("📅 Qual a data estimada de entrega? (Ex: 10/10/2025)");
        break;

      case "obterData": {
        const partes = textoUsuario.split(/[./-]/);
        if (partes.length !== 3)
          return await enviar("⚠️ Formato inválido. Use dia/mês/ano.");

        let [dia, mes, ano] = partes.map((p) => parseInt(p, 10));
        if (ano < 100) ano += 2000;
        const dataObj = new Date(ano, mes - 1, dia);
        if (dataObj.getDate() !== dia || dataObj.getMonth() !== mes - 1)
          return await enviar("⚠️ Data inválida.");

        estado.data = `${String(dia).padStart(2, "0")}/${String(mes).padStart(
          2,
          "0"
        )}/${ano}`;
        estado.etapa = "obterLocal";
        await enviar("🏬 Onde a compra foi feita? (Ex: Shopee, Mercado Livre)");
        break;
      }

      case "obterLocal": {
        estado.local = textoUsuario;
        const { data: todas } = await axios.get(URL_SHEETDB_ENCOMENDAS);
        const ids = todas
          .map((e) => parseInt(e.id, 10))
          .filter((i) => !isNaN(i));
        const proximoId = (Math.max(0, ...ids) + 1).toString();

        await axios.post(URL_SHEETDB_ENCOMENDAS, [
          {
            id: proximoId,
            nome: estado.nome,
            data: estado.data,
            local: estado.local,
            status: "Aguardando Recebimento",
          },
        ]);

        await enviar(
          `✅ Encomenda registrada para ${estado.nome}!\n🆔 ID: ${proximoId}\n🗓️ Data: ${estado.data}\n🛒 Loja: ${estado.local}`
        );
        delete estadosUsuarios[idSessao];
        break;
      }

      case "informarID": {
        estado.idConfirmar = textoUsuario;
        const { data } = await axios.get(URL_SHEETDB_ENCOMENDAS);
        const encomenda = data.find((e) => e.id === estado.idConfirmar);

        if (!encomenda || encomenda.status !== "Aguardando Recebimento") {
          await enviar(
            "❌ ID inválido ou já recebido. Envie 0 para recomeçar."
          );
          delete estadosUsuarios[idSessao];
          return;
        }

        estado.encomendaSelecionada = encomenda;
        estado.etapa = "confirmarRecebedor";
        await enviar("✋ Quem está recebendo essa encomenda?");
        break;
      }

      case "confirmarRecebedor": {
        const recebidoPor = textoUsuario;
        const enc = estado.encomendaSelecionada;

        await axios.patch(`${URL_SHEETDB_ENCOMENDAS}/id/${enc.id}`, {
          status: "Recebida",
          recebido_por: recebidoPor,
        });

        await enviar(
          `✅ Recebimento confirmado!\n📦 ${enc.nome} — ${enc.local}\n📬 Recebido por: ${recebidoPor}`
        );
        delete estadosUsuarios[idSessao];
        break;
      }

      default:
        await enviar("⚠️ Algo deu errado. Envie '0' para recomeçar.");
        delete estadosUsuarios[idSessao];
    }
  } catch (error) {
    console.error("❌ Erro no tratarMensagemEncomendas:", error.message);
  }
}

module.exports = { tratarMensagemEncomendas };
