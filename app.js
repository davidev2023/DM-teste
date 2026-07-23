import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getFirestore,
    collection,
    addDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    doc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// CONFIGURAÇÃO DO FIREBASE
const firebaseConfig = {
    apiKey: "AIzaSyC4NYw4bewHQ4M_TctHVQzq1BkJFWJb9W4",
    authDomain: "dm-financeira.firebaseapp.com",
    projectId: "dm-financeira",
    storageBucket: "dm-financeira.firebasestorage.app",
    messagingSenderId: "167583421460",
    appId: "1:167583421460:web:1a34d6d2b8f90973ae8301",
    measurementId: "G-Q4NEDP6435"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let clientes = [];
let solicitacoes = [];
let meuGrafico = null;
let deferredPrompt = null;
const FOTO_PADRAO = "https://cdn-icons-png.flaticon.com/512/149/149071.png";

// SUPORTE PARA INSTALAÇÃO PWA
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const btnPwa = document.getElementById('btnInstalarPwa');
    if (btnPwa) btnPwa.style.display = 'inline-flex';
});

window.instalarPWA = function() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('Usuário aceitou a instalação do PWA');
            }
            deferredPrompt = null;
            const btnPwa = document.getElementById('btnInstalarPwa');
            if (btnPwa) btnPwa.style.display = 'none';
        });
    } else {
        alert('A instalação direta não está pronta no navegador.\n\n' + 
              '• Se você já instalou o app, ele já está na sua tela inicial.\n' +
              '• Se estiver no iOS (Safari), clique em "Compartilhar" > "Adicionar à Tela de Início".');
    }
};

// FUNÇÃO PARA VERIFICAR E RECARREGAR ATUALIZAÇÕES
window.verificarAtualizacao = function() {
    mostrarLoading("Verificando atualizações...");
    setTimeout(() => {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(registrations => {
                for (let registration of registrations) {
                    registration.update();
                }
            });
        }
        window.location.reload(true);
    }, 1000);
};

// INDICADOR DE CARREGAMENTO (LOADING)
function mostrarLoading(mensagem = "Carregando dados...") {
    const overlay = document.getElementById("loadingOverlay");
    if (overlay) {
        const txt = overlay.querySelector("p");
        if (txt) txt.innerText = mensagem;
        overlay.classList.add("ativo");
    }
}

function esconderLoading() {
    const overlay = document.getElementById("loadingOverlay");
    if (overlay) {
        overlay.classList.remove("ativo");
    }
}

// FORMATAR MOEDA
function formatarMoeda(valor) {
    return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// VISUALIZADOR DE IMAGEM EM TELA CHEIA
window.abrirModalImagem = function(src) {
    if (!src) return;
    const modal = document.getElementById("modalImagem");
    const imgModal = document.getElementById("imgModalExpandida");
    if (modal && imgModal) {
        imgModal.src = src;
        modal.classList.add("ativo");
    }
};

window.fecharModalImagem = function() {
    const modal = document.getElementById("modalImagem");
    if (modal) {
        modal.classList.remove("ativo");
    }
};

// CONVERTER E COMPACTAR IMAGEM PARA BASE64
function converterImagemParaBase64(file) {
    return new Promise((resolve, reject) => {
        if (!file) {
            resolve("");
            return;
        }
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 800;
                let width = img.width;
                let height = img.height;

                if (width > MAX_WIDTH) {
                    height = Math.round((height * MAX_WIDTH) / width);
                    width = MAX_WIDTH;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, width, height);

                resolve(canvas.toDataURL("image/jpeg", 0.6));
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (error) => reject(error);
    });
}

// CALCULAR ATRASO E DIÁRIAS ESPERADAS
function calcularAtraso(cliente) {
    if (!cliente.data) return { atraso: 0, esperadas: 0, status: 'verde' };

    const [ano, mes, dia] = cliente.data.split('-').map(Number);
    let dataInicio = new Date(ano, mes - 1, dia);

    dataInicio.setDate(dataInicio.getDate() + 1);

    if (dataInicio.getDay() === 0) {
        dataInicio.setDate(dataInicio.getDate() + 1);
    }

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    if (hoje < dataInicio) {
        return { atraso: 0, esperadas: 0, status: 'verde' };
    }

    let esperadasAteHoje = 0;
    let dataAtual = new Date(dataInicio);

    while (dataAtual <= hoje) {
        if (dataAtual.getDay() !== 0) {
            esperadasAteHoje++;
        }
        dataAtual.setDate(dataAtual.getDate() + 1);
    }

    const pagas = Number(cliente.pagas) || 0;
    let esperadasAteOntem = esperadasAteHoje - 1;
    if (esperadasAteOntem < 0) esperadasAteOntem = 0;

    let atraso = esperadasAteOntem - pagas;
    if (atraso < 0) atraso = 0;

    let status = 'verde';
    if (atraso > 0) {
        status = 'vermelho';
    } else if (pagas < esperadasAteHoje) {
        status = 'amarelo';
    } else {
        status = 'verde';
    }

    return { atraso, esperadas: esperadasAteHoje, status };
}

// NAVEGAÇÃO ENTRE TELAS
function abrirTela(idTela) {
    document.querySelectorAll('.tela').forEach(tela => {
        tela.classList.remove('ativa');
    });

    const telaAlvo = document.getElementById(idTela);
    if (telaAlvo) {
        telaAlvo.classList.add('ativa');
    }
}

// CADASTRAR CLIENTE DIRETO
async function salvarCliente() {
    try {
        let nome = document.getElementById("nome")?.value.trim() || "";
        let cpf = document.getElementById("cpf")?.value.trim() || "";
        let telefone = document.getElementById("telefone")?.value.trim() || "";
        let chavePix = document.getElementById("chavePix")?.value.trim() || "";
        let endereco = document.getElementById("endereco")?.value.trim() || "";
        let linkLocalizacao = document.getElementById("linkLocalizacao")?.value.trim() || "";
        let placaVeiculo = document.getElementById("placaVeiculo")?.value.trim() || "";
        let valor = Number(document.getElementById("valor")?.value || 0);
        let data = document.getElementById("data")?.value || "";
        
        let ref1 = document.getElementById("ref1")?.value.trim() || "";
        let ref2 = document.getElementById("ref2")?.value.trim() || "";
        let ref3 = document.getElementById("ref3")?.value.trim() || "";

        let fotoPerfilFile = document.getElementById("fotoCliente")?.files[0];
        let docFrenteVersoFile = document.getElementById("docFrenteVerso")?.files[0];
        let fotoResidenciaFile = document.getElementById("fotoResidencia")?.files[0];
        let printGanhosFile = document.getElementById("printGanhos")?.files[0];

        if (nome === "" || telefone === "" || data === "") {
            alert("Preencha Nome, Telefone e Data do Empréstimo!");
            return;
        }

        mostrarLoading("Salvando novo cliente...");

        let fotoBase64 = await converterImagemParaBase64(fotoPerfilFile);
        let docBase64 = await converterImagemParaBase64(docFrenteVersoFile);
        let resBase64 = await converterImagemParaBase64(fotoResidenciaFile);
        let printBase64 = await converterImagemParaBase64(printGanhosFile);

        const tabelaParcelas = {
            300: 17, 400: 22, 500: 28, 600: 33, 700: 39, 800: 44, 900: 50, 1000: 56
        };

        let parcela = tabelaParcelas[valor] || Math.round((valor * 1.35) / 24);

        await addDoc(collection(db, "clientes"), {
            nome, cpf, telefone, chavePix, endereco, linkLocalizacao, placaVeiculo,
            referencias: [ref1, ref2, ref3].filter(r => r !== ""),
            valor, parcela, totalParcelas: 24, pagas: 0, data,
            multasPorParcela: {},
            foto: fotoBase64, docFoto: docBase64, resFoto: resBase64, printFoto: printBase64
        });

        limpar();
        await mostrarClientes();
        abrirTela('clientes');
        alert("Empréstimo cadastrado com sucesso!");

    } catch (error) {
        console.error("Erro ao salvar:", error);
        alert("Erro ao salvar: " + error.message);
    } finally {
        esconderLoading();
    }
}

// LISTAR CLIENTES E SOLICITAÇÕES
async function mostrarClientes() {
    mostrarLoading("Buscando informações...");
    try {
        clientes = [];
        solicitacoes = [];

        const querySnapshot = await getDocs(collection(db, "clientes"));
        querySnapshot.forEach((documento) => {
            clientes.push({ id: documento.id, ...documento.data() });
        });

        const querySol = await getDocs(collection(db, "solicitacoes_pendentes"));
        querySol.forEach((documento) => {
            solicitacoes.push({ id: documento.id, ...documento.data() });
        });

        atualizarDashboard();

        let listaSol = document.getElementById("listaSolicitacoes");
        if (listaSol) {
            listaSol.innerHTML = "";
            if (solicitacoes.length === 0) {
                listaSol.innerHTML = "<p style='color:#888; padding:10px;'>Nenhuma solicitação pendente no momento.</p>";
            } else {
                solicitacoes.forEach(sol => {
                    let urlFoto = sol.foto || sol.fotoCliente || FOTO_PADRAO;
                    listaSol.innerHTML += `
                        <div class="cliente" style="border-left: 4px solid #f39c12;">
                            <div class="cliente-header" onclick="abrirSolicitacao('${sol.id}')">
                                <img src="${urlFoto}" class="avatar-cliente" alt="Foto">
                                <div>
                                    <h3>⏳ ${sol.nome}</h3>
                                    <p>CPF: ${sol.cpf || 'N/A'}</p>
                                    <p>📞 ${sol.telefone || 'N/A'}</p>
                                    <p>💰 Solicitado: <strong>${formatarMoeda(sol.valor)}</strong></p>
                                </div>
                            </div>
                            <div style="display:flex; gap:10px; margin-top:10px;">
                                <button onclick="aprovarSolicitacao('${sol.id}')" style="background:#27ae60; flex:1;">✅ Aprovar</button>
                                <button onclick="recusarSolicitacao('${sol.id}')" style="background:#c0392b; flex:1;">❌ Recusar</button>
                            </div>
                        </div>
                    `;
                });
            }
        }

        let lista = document.getElementById("listaClientes");
        if (!lista) return;
        lista.innerHTML = "";

        if (clientes.length === 0) {
            lista.innerHTML = "<p style='padding:10px;'>Nenhum cliente cadastrado.</p>";
            return;
        }

        clientes.forEach(cliente => {
            const { atraso, status } = calcularAtraso(cliente);
            let iconeStatus = '🟢';
            let textoAtraso = 'Em dia';

            if (status === 'vermelho') {
                iconeStatus = '🔴';
                textoAtraso = `<strong style="color: #ff5555;">${atraso} parcelas em atraso</strong>`;
            } else if (status === 'amarelo') {
                iconeStatus = '🟡';
                textoAtraso = 'Em aberto (Hoje)';
            }

            let urlFoto = cliente.foto || cliente.fotoCliente || FOTO_PADRAO;

            lista.innerHTML += `
                <div class="cliente" onclick="abrirCliente('${cliente.id}')">
                    <div class="cliente-header">
                        <img src="${urlFoto}" class="avatar-cliente" alt="Foto">
                        <div>
                            <h3>${iconeStatus} ${cliente.nome}</h3>
                            <p>CPF: ${cliente.cpf || 'Não informado'}</p>
                            <p>🚘 Placa: ${cliente.placaVeiculo || 'N/A'}</p>
                        </div>
                    </div>
                    <p>💰 Empréstimo: ${formatarMoeda(cliente.valor)}</p>
                    <p>🗓️ ${cliente.pagas}/${cliente.totalParcelas} pagas | Status: ${textoAtraso}</p>
                </div>
            `;
        });

    } catch (error) {
        console.error("Erro ao buscar dados:", error);
    } finally {
        esconderLoading();
    }
}

// DETALHES DA SOLICITAÇÃO PENDENTE
function abrirSolicitacao(id) {
    let sol = solicitacoes.find(s => s.id === id);
    if (!sol) return;

    let detalhes = document.getElementById("detalhes");
    if (!detalhes) return;

    let urlFoto = sol.foto || sol.fotoCliente || FOTO_PADRAO;
    let refsHtml = (sol.referencias || []).filter(r => r).map(r => `<li>${r}</li>`).join('') || '<li>Nenhuma referência</li>';

    let linkLocHtml = sol.linkLocalizacao 
        ? `<p style="text-align: left;">📍 <strong>Localização:</strong> <a href="${sol.linkLocalizacao}" target="_blank" style="color: #ffcc00;">Abrir no Google Maps</a></p>`
        : '<p style="text-align: left;">📍 <strong>Localização:</strong> Não informada</p>';

    let docImg = (sol.docFoto || sol.docFrenteVerso) ? `<div style="margin-top:10px;"><p><strong>Documento (RG/CNH):</strong></p><img src="${sol.docFoto || sol.docFrenteVerso}" class="img-anexo" onclick="abrirModalImagem('${sol.docFoto || sol.docFrenteVerso}')"></div>` : '<p style="color:#aaa;">📑 Documento não enviado</p>';
    let resImg = (sol.resFoto || sol.fotoResidencia) ? `<div style="margin-top:10px;"><p><strong>Comprovante de Residência:</strong></p><img src="${sol.resFoto || sol.fotoResidencia}" class="img-anexo" onclick="abrirModalImagem('${sol.resFoto || sol.fotoResidencia}')"></div>` : '<p style="color:#aaa;">🏠 Residência não enviada</p>';
    let printImg = (sol.printFoto || sol.printGanhos) ? `<div style="margin-top:10px;"><p><strong>Comprovante de Renda / App:</strong></p><img src="${sol.printFoto || sol.printGanhos}" class="img-anexo" onclick="abrirModalImagem('${sol.printFoto || sol.printGanhos}')"></div>` : '<p style="color:#aaa;">📊 Print de Ganhos não enviado</p>';

    detalhes.innerHTML = `
    <div class="card" style="text-align: center;">
        <img src="${urlFoto}" class="avatar-detalhe" alt="Foto Perfil" onclick="abrirModalImagem('${urlFoto}')">
        <h2>⏳ Solicitação: ${sol.nome}</h2>
        <p style="text-align: left;"><strong>CPF:</strong> ${sol.cpf || 'Não informado'}</p>
        <p style="text-align: left;"><strong>Telefone:</strong> ${sol.telefone || 'Não informado'}</p>
        <p style="text-align: left;"><strong>Chave PIX:</strong> ${sol.chavePix || 'Não informada'}</p>
        <p style="text-align: left;"><strong>Endereço:</strong> ${sol.endereco || 'Não informado'}</p>
        ${linkLocHtml}
        <p style="text-align: left;">🚘 <strong>Placa do Veículo:</strong> ${sol.placaVeiculo || 'Não informada'}</p>
        
        <hr style="margin: 10px 0; border-color: #333;">
        
        <p style="text-align: left;">📞 <strong>Contatos de Referência:</strong></p>
        <ul style="text-align: left; margin-left: 20px; font-size: 13px; color: #ccc;">
            ${refsHtml}
        </ul>

        <hr style="margin: 10px 0; border-color: #333;">

        <p style="text-align: left;">💰 <strong>Valor Pedido:</strong> ${formatarMoeda(sol.valor)}</p>
        <p style="text-align: left;">💵 <strong>Parcela Diária Estimada:</strong> ${formatarMoeda(sol.parcela)}/dia</p>

        <h3 style="color:#ffcc00; margin-top:15px; text-align:left;">📁 Documentos Anexados (Clique para ampliar):</h3>
        <div style="text-align: left; margin-top: 10px;">
            ${docImg}
            ${resImg}
            ${printImg}
        </div>
        
        <div style="display:flex; gap:10px; margin-top:15px;">
            <button onclick="aprovarSolicitacao('${sol.id}')" style="background:#27ae60; flex:1;">✅ Aprovar Solicitação</button>
            <button onclick="recusarSolicitacao('${sol.id}')" style="background:#c0392b; flex:1;">❌ Recusar</button>
        </div>

        <button onclick="abrirTela('solicitacoes')" style="margin-top:15px; background:#333;">⬅ Voltar para Solicitações</button>
    </div>
    `;

    abrirTela('detalhesCliente');
}

// APROVAR SOLICITAÇÃO
async function aprovarSolicitacao(id) {
    let sol = solicitacoes.find(s => s.id === id);
    if (!sol) return;

    let dataHoje = new Date().toISOString().split('T')[0];

    if (!confirm(`Aprovar empréstimo para ${sol.nome}?`)) return;

    try {
        mostrarLoading("Aprovando solicitação...");
        await addDoc(collection(db, "clientes"), {
            nome: sol.nome || "",
            cpf: sol.cpf || "",
            telefone: sol.telefone || "",
            chavePix: sol.chavePix || "",
            endereco: sol.endereco || "",
            linkLocalizacao: sol.linkLocalizacao || "",
            placaVeiculo: sol.placaVeiculo || "",
            referencias: sol.referencias || [],
            valor: Number(sol.valor || 0),
            parcela: Number(sol.parcela || 0),
            totalParcelas: Number(sol.totalParcelas || 24),
            pagas: 0,
            data: dataHoje,
            multasPorParcela: {},
            foto: sol.foto || sol.fotoCliente || "",
            docFoto: sol.docFoto || sol.docFrenteVerso || "",
            resFoto: sol.resFoto || sol.fotoResidencia || "",
            printFoto: sol.printFoto || sol.printGanhos || ""
        });

        await deleteDoc(doc(db, "solicitacoes_pendentes", id));

        alert("Solicitação Aprovada!");
        await mostrarClientes();
        abrirTela('clientes');
    } catch (error) {
        console.error("Erro ao aprovar:", error);
        alert("Erro ao aprovar solicitação.");
    } finally {
        esconderLoading();
    }
}

// RECUSAR SOLICITAÇÃO
async function recusarSolicitacao(id) {
    if (!confirm("Deseja recusar e excluir esta solicitação?")) return;

    try {
        mostrarLoading("Removendo solicitação...");
        await deleteDoc(doc(db, "solicitacoes_pendentes", id));
        alert("Solicitação removida.");
        await mostrarClientes();
        abrirTela('solicitacoes');
    } catch (error) {
        console.error("Erro ao recusar:", error);
    } finally {
        esconderLoading();
    }
}

// DETALHES DO CLIENTE ATIVO
function abrirCliente(id) {
    let cliente = clientes.find(c => c.id === id);
    if (!cliente) return;

    const { atraso, esperadas, status } = calcularAtraso(cliente);
    let detalhes = document.getElementById("detalhes");
    if (!detalhes) return;

    let textoStatus = '🟢 Em Dia';
    if (status === 'vermelho') textoStatus = `🔴 ATRASADO (${atraso} diária(s) pendentes)`;
    if (status === 'amarelo') textoStatus = '🟡 Em aberto hoje';

    let urlFoto = cliente.foto || cliente.fotoCliente || FOTO_PADRAO;

    let refsHtml = (cliente.referencias || []).filter(r => r).map(r => `<li>${r}</li>`).join('') || '<li>Nenhuma referência</li>';
    let linkLocHtml = cliente.linkLocalizacao 
        ? `<p style="text-align: left;">📍 <strong>Localização:</strong> <a href="${cliente.linkLocalizacao}" target="_blank" style="color: #ffcc00;">Abrir no Maps</a></p>`
        : '<p style="text-align: left;">📍 <strong>Localização:</strong> Não informada</p>';

    let docImg = (cliente.docFoto || cliente.docFrenteVerso) ? `<div style="margin-top:8px;"><p><strong>Documento:</strong></p><img src="${cliente.docFoto || cliente.docFrenteVerso}" class="img-anexo" onclick="abrirModalImagem('${cliente.docFoto || cliente.docFrenteVerso}')"></div>` : '';
    let resImg = (cliente.resFoto || cliente.fotoResidencia) ? `<div style="margin-top:8px;"><p><strong>Comprovante Residência:</strong></p><img src="${cliente.resFoto || cliente.fotoResidencia}" class="img-anexo" onclick="abrirModalImagem('${cliente.resFoto || cliente.fotoResidencia}')"></div>` : '';
    let printImg = (cliente.printFoto || cliente.printGanhos) ? `<div style="margin-top:8px;"><p><strong>Print Ganhos:</strong></p><img src="${cliente.printFoto || cliente.printGanhos}" class="img-anexo" onclick="abrirModalImagem('${cliente.printFoto || cliente.printGanhos}')"></div>` : '';

    let parcelasHtml = '';
    let dataAtual = new Date();
    if (cliente.data) {
        const [ano, mes, dia] = cliente.data.split('-').map(Number);
        dataAtual = new Date(ano, mes - 1, dia);
        dataAtual.setDate(dataAtual.getDate() + 1);
    }

    let multas = cliente.multasPorParcela || {};
    let valorBaseDiaria = Number(cliente.parcela) || 0;

    for (let i = 1; i <= cliente.totalParcelas; i++) {
        if (dataAtual.getDay() === 0) {
            dataAtual.setDate(dataAtual.getDate() + 1);
        }

        let diaFmt = String(dataAtual.getDate()).padStart(2, '0');
        let mesFmt = String(dataAtual.getMonth() + 1).padStart(2, '0');
        let dataTexto = `${diaFmt}/${mesFmt}`;

        let classeStatus = 'pendente';
        let statusTxt = '⏳ Pendente';

        if (i <= cliente.pagas) {
            classeStatus = 'paga';
            statusTxt = '✅ Paga';
        } else if (i < esperadas) {
            classeStatus = 'atrasada';
            statusTxt = '🔴 Atrasada';
        } else if (i === esperadas) {
            classeStatus = 'pendente';
            statusTxt = '🟡 Em Aberto (Hoje)';
        }

        let multaIndividual = multas[i] || 0;
        let valorFinalDiaria = valorBaseDiaria + multaIndividual;

        parcelasHtml += `
            <div class="item-parcela ${classeStatus}">
                <div>
                    <strong>Diária ${i} (${dataTexto})</strong> - ${formatarMoeda(valorFinalDiaria)}
                    <span style="font-size: 11px; display: block; color: #aaa;">${statusTxt}</span>
                </div>
                <input type="checkbox" class="chk-parcela" data-num="${i}" data-data="${dataTexto}" data-status="${classeStatus}" data-valor="${valorFinalDiaria}">
            </div>
        `;

        dataAtual.setDate(dataAtual.getDate() + 1);
    }

    detalhes.innerHTML = `
    <div class="card" style="text-align: center;">
        <img src="${urlFoto}" class="avatar-detalhe" alt="Foto Perfil" onclick="abrirModalImagem('${urlFoto}')">
        <h2>${cliente.nome}</h2>
        <p style="text-align: left;"><strong>Status:</strong> ${textoStatus}</p>
        <p style="text-align: left;"><strong>CPF:</strong> ${cliente.cpf || 'Não informado'}</p>
        <p style="text-align: left;"><strong>Telefone:</strong> ${cliente.telefone || 'Não informado'}</p>
        <p style="text-align: left;"><strong>Chave PIX:</strong> ${cliente.chavePix || 'Não informada'}</p>
        <p style="text-align: left;"><strong>Endereço:</strong> ${cliente.endereco || 'Não informado'}</p>
        ${linkLocHtml}
        <p style="text-align: left;">🚘 <strong>Placa do Veículo:</strong> ${cliente.placaVeiculo || 'Não informada'}</p>
        
        <hr style="margin: 10px 0; border-color: #333;">
        
        <p style="text-align: left;">📞 <strong>Contatos de Referência:</strong></p>
        <ul style="text-align: left; margin-left: 20px; font-size: 13px; color: #ccc;">
            ${refsHtml}
        </ul>

        <hr style="margin: 10px 0; border-color: #333;">

        <p style="text-align: left;">💰 <strong>Valor Diário Base:</strong> ${formatarMoeda(cliente.parcela)}/dia</p>
        <p style="text-align: left;">🗓️ <strong>Data Empréstimo:</strong> ${cliente.data ? cliente.data.split('-').reverse().join('/') : 'N/A'}</p>
        <p style="text-align: left;">🗓️ <strong>Progresso:</strong> ${cliente.pagas}/${cliente.totalParcelas} pagas</p>
        
        <div style="text-align: left; margin-top: 10px;">
            <h3 style="color: #ffcc00; font-size: 0.95rem; margin-bottom: 5px;">📅 Selecionar Parcelas:</h3>
            <div class="container-parcelas">
                ${parcelasHtml}
            </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 12px;">
            <button onclick="baixarParcelasSelecionadas('${cliente.id}')" style="background: #27ae60;">✅ Dar Baixa nas Parcelas Selecionadas</button>
            <button onclick="aplicarJurosSelecionadas('${cliente.id}')" style="background: #d35400;">⚡ Adicionar Juros (R$ 1,50) APENAS na Selecionada</button>
            <button onclick="enviarComprovanteSelecionado('${cliente.id}')" style="background: #8e44ad;">📄 Enviar Comprovante em PDF no WhatsApp</button>
            <button onclick="whatsapp('${cliente.id}')" style="background: #2980b9;">📲 Cobrar no WhatsApp</button>
            <button onclick="abrirModalEditar('${cliente.id}')" style="background: #e67e22;">✏️ Editar Dados do Cliente</button>
        </div>

        <div style="text-align: left; margin-top: 15px;">
            ${docImg}
            ${resImg}
            ${printImg}
        </div>

        <button onclick="excluirCliente('${cliente.id}')" style="margin-top:15px; background:#c0392b; width: 100%;">🗑️ Excluir Cliente</button>
        <button onclick="abrirTela('clientes')" style="margin-top:10px; background:#333; width: 100%;">⬅ Voltar para Clientes</button>
    </div>
    `;

    abrirTela('detalhesCliente');
}

// ABRIR EDIÇÃO
function abrirModalEditar(id) {
    let cliente = clientes.find(c => c.id === id);
    if (!cliente) return;

    let detalhes = document.getElementById("detalhes");
    if (!detalhes) return;

    let ref1 = (cliente.referencias && cliente.referencias[0]) ? cliente.referencias[0] : "";
    let ref2 = (cliente.referencias && cliente.referencias[1]) ? cliente.referencias[1] : "";
    let ref3 = (cliente.referencias && cliente.referencias[2]) ? cliente.referencias[2] : "";

    detalhes.innerHTML = `
    <div class="card">
        <h2 style="color:#ffcc00; text-align:center; margin-bottom:15px;">✏️ Editar Cliente</h2>
        
        <label>Nome:</label>
        <input type="text" id="editNome" value="${cliente.nome || ''}">

        <label>CPF:</label>
        <input type="text" id="editCpf" value="${cliente.cpf || ''}">

        <label>Telefone:</label>
        <input type="text" id="editTelefone" value="${cliente.telefone || ''}">

        <label>Chave PIX:</label>
        <input type="text" id="editChavePix" value="${cliente.chavePix || ''}">

        <label>Endereço:</label>
        <input type="text" id="editEndereco" value="${cliente.endereco || ''}">

        <label>Link Localização (Maps):</label>
        <input type="text" id="editLinkLocalizacao" value="${cliente.linkLocalizacao || ''}">

        <label>Placa do Veículo:</label>
        <input type="text" id="editPlacaVeiculo" value="${cliente.placaVeiculo || ''}">

        <label>Valor Diário (R$):</label>
        <input type="number" id="editParcela" value="${cliente.parcela || 0}">

        <label>Data do Empréstimo:</label>
        <input type="date" id="editData" value="${cliente.data || ''}">

        <label>Referências:</label>
        <input type="text" id="editRef1" value="${ref1}" placeholder="Ref 1">
        <input type="text" id="editRef2" value="${ref2}" placeholder="Ref 2">
        <input type="text" id="editRef3" value="${ref3}" placeholder="Ref 3">

        <hr style="margin: 15px 0; border-color: #444;">
        <h3 style="color:#ffcc00; font-size:0.95rem; margin-bottom:10px;">📸 Atualizar Imagens (Opcional):</h3>

        <label>Trocar Foto de Perfil:</label>
        <input type="file" id="editFotoPerfil" accept="image/*">

        <label>Trocar Documento (RG/CNH):</label>
        <input type="file" id="editDocFoto" accept="image/*">

        <label>Trocar Comprovante de Residência:</label>
        <input type="file" id="editResFoto" accept="image/*">

        <label>Trocar Print de Ganhos / App:</label>
        <input type="file" id="editPrintFoto" accept="image/*">

        <button onclick="salvarEdicaoCliente('${cliente.id}')" style="background:#27ae60; margin-top:15px;">💾 Salvar Alterações</button>
        <button onclick="abrirCliente('${cliente.id}')" style="background:#333; margin-top:5px;">❌ Cancelar</button>
    </div>
    `;
}

// SALVAR EDIÇÃO
async function salvarEdicaoCliente(id) {
    try {
        let clienteAntigo = clientes.find(c => c.id === id);
        if (!clienteAntigo) return;

        mostrarLoading("Atualizando cliente...");

        let nome = document.getElementById("editNome").value.trim();
        let cpf = document.getElementById("editCpf").value.trim();
        let telefone = document.getElementById("editTelefone").value.trim();
        let chavePix = document.getElementById("editChavePix").value.trim();
        let endereco = document.getElementById("editEndereco").value.trim();
        let linkLocalizacao = document.getElementById("editLinkLocalizacao").value.trim();
        let placaVeiculo = document.getElementById("editPlacaVeiculo").value.trim();
        let parcela = Number(document.getElementById("editParcela").value || 0);
        let data = document.getElementById("editData").value;

        let ref1 = document.getElementById("editRef1").value.trim();
        let ref2 = document.getElementById("editRef2").value.trim();
        let ref3 = document.getElementById("editRef3").value.trim();

        let filePerfil = document.getElementById("editFotoPerfil")?.files[0];
        let fileDoc = document.getElementById("editDocFoto")?.files[0];
        let fileRes = document.getElementById("editResFoto")?.files[0];
        let filePrint = document.getElementById("editPrintFoto")?.files[0];

        let foto = filePerfil ? await converterImagemParaBase64(filePerfil) : (clienteAntigo.foto || clienteAntigo.fotoCliente || "");
        let docFoto = fileDoc ? await converterImagemParaBase64(fileDoc) : (clienteAntigo.docFoto || clienteAntigo.docFrenteVerso || "");
        let resFoto = fileRes ? await converterImagemParaBase64(fileRes) : (clienteAntigo.resFoto || clienteAntigo.fotoResidencia || "");
        let printFoto = filePrint ? await converterImagemParaBase64(filePrint) : (clienteAntigo.printFoto || clienteAntigo.printGanhos || "");

        await updateDoc(doc(db, "clientes", id), {
            nome, cpf, telefone, chavePix, endereco, linkLocalizacao, placaVeiculo, parcela, data,
            referencias: [ref1, ref2, ref3].filter(r => r !== ""),
            foto, docFoto, resFoto, printFoto
        });

        alert("Dados atualizados com sucesso!");
        await mostrarClientes();
        abrirCliente(id);
    } catch (e) {
        console.error(e);
        alert("Erro ao atualizar dados.");
    } finally {
        esconderLoading();
    }
}

// DAR BAIXA NAS PARCELAS
async function baixarParcelasSelecionadas(id) {
    let cliente = clientes.find(c => c.id === id);
    if (!cliente) return;

    let selecionadas = Array.from(document.querySelectorAll('.chk-parcela:checked')).map(el => Number(el.dataset.num));

    if (selecionadas.length === 0) {
        alert("Selecione pelo menos uma parcela para dar baixa!");
        return;
    }

    let maiorNum = Math.max(...selecionadas);

    if (confirm(`Confirmar pagamento até a diária Nº ${maiorNum}?`)) {
        try {
            mostrarLoading("Registrando baixa...");
            await updateDoc(doc(db, "clientes", id), { pagas: maiorNum });
            cliente.pagas = maiorNum;
            alert("Pagamento registrado!");
            await mostrarClientes();
            abrirCliente(id);
        } catch (e) {
            alert("Erro ao registrar pagamento.");
        } finally {
            esconderLoading();
        }
    }
}

// APLICAR JUROS SELECIONADAS
async function aplicarJurosSelecionadas(id) {
    let cliente = clientes.find(c => c.id === id);
    if (!cliente) return;

    let selecionadas = Array.from(document.querySelectorAll('.chk-parcela:checked')).map(el => Number(el.dataset.num));

    if (selecionadas.length === 0) {
        alert("Selecione as parcelas em atraso que deseja cobrar juros!");
        return;
    }

    let multasAtuais = cliente.multasPorParcela || {};

    if (confirm(`Adicionar R$ 1,50 de juros APENAS nas parcelas selecionadas (${selecionadas.join(', ')})?`)) {
        try {
            mostrarLoading("Aplicando juros...");
            selecionadas.forEach(num => {
                multasAtuais[num] = (multasAtuais[num] || 0) + 1.50;
            });

            await updateDoc(doc(db, "clientes", id), { multasPorParcela: multasAtuais });
            cliente.multasPorParcela = multasAtuais;

            alert("Juros adicionados apenas nas parcelas selecionadas!");
            await mostrarClientes();
            abrirCliente(id);
        } catch (e) {
            console.error(e);
            alert("Erro ao aplicar juros na parcela.");
        } finally {
            esconderLoading();
        }
    }
}

// COMPROVANTE PDF
async function enviarComprovanteSelecionado(id) {
    let cliente = clientes.find(c => c.id === id);
    if (!cliente) return;

    let multas = cliente.multasPorParcela || {};
    let valorBase = Number(cliente.parcela) || 0;

    let valorTotal = 0;
    let selecionadas = Array.from(document.querySelectorAll('.chk-parcela:checked')).map(el => {
        let num = Number(el.dataset.num);
        let valorDiaria = Number(el.dataset.valor) || (valorBase + (multas[num] || 0));
        valorTotal += valorDiaria;
        return {
            num: num,
            data: el.dataset.data,
            valor: valorDiaria
        };
    });

    if (selecionadas.length === 0) {
        alert("Selecione as parcelas para gerar o comprovante!");
        return;
    }

    let maiorNum = Math.max(...selecionadas.map(s => s.num));
    if (maiorNum > (cliente.pagas || 0)) {
        try {
            mostrarLoading("Gerando comprovante...");
            await updateDoc(doc(db, "clientes", id), { pagas: maiorNum });
            cliente.pagas = maiorNum;
        } catch (e) {
            console.error("Erro ao registrar baixa automática:", e);
        } finally {
            esconderLoading();
        }
    }

    let numLimpo = (cliente.telefone || '').replace(/\D/g, '');
    let detalheDiarias = selecionadas.map(s => `Nº ${s.num} (${s.data})`).join(', ');
    let qtdDiarias = selecionadas.length;
    let dataHoje = new Date().toLocaleDateString('pt-BR');

    if (!window.jspdf) {
        alert("Biblioteca jsPDF não carregada.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const docPdf = new jsPDF({
        unit: "mm",
        format: [80, 160]
    });

    docPdf.setFillColor(20, 20, 20);
    docPdf.rect(0, 0, 80, 22, "F");

    docPdf.setTextColor(255, 204, 0);
    docPdf.setFont("helvetica", "bold");
    docPdf.setFontSize(14);
    docPdf.text("DM FINANCEIRA", 40, 10, { align: "center" });

    docPdf.setTextColor(255, 255, 255);
    docPdf.setFontSize(8);
    docPdf.setFont("helvetica", "normal");
    docPdf.text("Comprovante de Pagamento", 40, 16, { align: "center" });

    docPdf.setTextColor(0, 0, 0);
    docPdf.setFontSize(9);

    let y = 30;
    docPdf.setFont("helvetica", "bold");
    docPdf.text("Data Emissão:", 8, y);
    docPdf.setFont("helvetica", "normal");
    docPdf.text(dataHoje, 32, y);

    y += 6;
    docPdf.setFont("helvetica", "bold");
    docPdf.text("Cliente:", 8, y);
    docPdf.setFont("helvetica", "normal");
    docPdf.text(cliente.nome || "Não informado", 32, y);

    y += 6;
    docPdf.setFont("helvetica", "bold");
    docPdf.text("CPF:", 8, y);
    docPdf.setFont("helvetica", "normal");
    docPdf.text(cliente.cpf || "Não informado", 32, y);

    y += 5;
    docPdf.setDrawColor(200, 200, 200);
    docPdf.line(8, y, 72, y);

    y += 7;
    docPdf.setFont("helvetica", "bold");
    docPdf.text("Diárias Pagas:", 8, y);
    docPdf.setFont("helvetica", "normal");
    docPdf.text(detalheDiarias, 32, y, { maxWidth: 40 });

    y += 10;
    docPdf.setFont("helvetica", "bold");
    docPdf.text("Qtd. Diárias:", 8, y);
    docPdf.setFont("helvetica", "normal");
    docPdf.text(`${qtdDiarias}x`, 32, y);

    y += 5;
    docPdf.line(8, y, 72, y);

    y += 8;
    docPdf.setFontSize(11);
    docPdf.setFont("helvetica", "bold");
    docPdf.text("TOTAL PAGO:", 8, y);
    docPdf.text(formatarMoeda(valorTotal), 72, y, { align: "right" });

    y += 15;
    docPdf.setFontSize(7);
    docPdf.setFont("helvetica", "italic");
    docPdf.setTextColor(120, 120, 120);
    docPdf.text("Obrigado pelo pagamento!", 40, y, { align: "center" });
    docPdf.text("DM Financeira - Todos os direitos reservados.", 40, y + 4, { align: "center" });

    let nomeLimpo = cliente.nome ? cliente.nome.replace(/\s+/g, '_') : 'Cliente';
    let numsStr = selecionadas.map(s => s.num).join('_');
    let nomeArquivo = `Comprovante_${nomeLimpo}_Diaria_${numsStr}.pdf`;
    docPdf.save(nomeArquivo);

    await mostrarClientes();
    abrirCliente(id);

    let mensagem = `📄 *COMPROVANTE DE PAGAMENTO*

🏦 *DM Financeira*

👤 *Cliente:* ${cliente.nome}
🗓️ *Diária(s) Pagas:* ${detalheDiarias} (${qtdDiarias}x)
💰 *Valor Pago:* ${formatarMoeda(valorTotal)}

O seu comprovante em PDF foi gerado e baixado. Anexando a seguir! 👍`;

    let url = `https://wa.me/55${numLimpo}?text=${encodeURIComponent(mensagem)}`;
    
    setTimeout(() => {
        window.open(url, "_blank");
    }, 800);
}

// WHATSAPP
function whatsapp(id) {
    let cliente = clientes.find(c => c.id === id);
    if (!cliente) return;

    let numLimpo = (cliente.telefone || '').replace(/\D/g, '');
    if (!numLimpo) {
        alert("Cliente não possui número de telefone cadastrado!");
        return;
    }

    const { atraso } = calcularAtraso(cliente);
    let multas = cliente.multasPorParcela || {};
    let valorBase = Number(cliente.parcela) || 0;

    let selecionadas = Array.from(document.querySelectorAll('.chk-parcela:checked'));
    
    let totalCobrar = 0;
    let detalhesLista = [];

    if (selecionadas.length > 0) {
        selecionadas.forEach(el => {
            let num = Number(el.dataset.num);
            let val = Number(el.dataset.valor) || (valorBase + (multas[num] || 0));
            totalCobrar += val;
            detalhesLista.push(`• Diária ${num} (${el.dataset.data}): ${formatarMoeda(val)}`);
        });
    } else {
        if (atraso > 0) {
            let inicio = (cliente.pagas || 0) + 1;
            let fim = (cliente.pagas || 0) + atraso;
            for (let i = inicio; i <= fim; i++) {
                let val = valorBase + (multas[i] || 0);
                totalCobrar += val;
                detalhesLista.push(`• Diária ${i}: ${formatarMoeda(val)}`);
            }
        }
    }

    let mensagem = `Olá *${cliente.nome}*, passando para lembrar dos seus pagamentos da *DM Financeira*:\n`;

    if (detalhesLista.length > 0) {
        mensagem += `\n🔴 *Diárias a Pagar / Atrasadas:*\n` + detalhesLista.join('\n');
        mensagem += `\n\n✅ *TOTAL A PAGAR:* *${formatarMoeda(totalCobrar)}*`;
    } else {
        mensagem += `\n🟢 *Diária de Hoje:* ${formatarMoeda(valorBase)}`;
        mensagem += `\n\n✅ *TOTAL:* *${formatarMoeda(valorBase)}*`;
    }

    mensagem += `\n\n⏰ *Lembrete:* Os pagamentos devem ser realizados até às 18h.`;

    let url = `https://wa.me/55${numLimpo}?text=${encodeURIComponent(mensagem)}`;
    window.open(url, "_blank");
}

// EXCLUIR CLIENTE
async function excluirCliente(id) {
    if (!confirm("Deseja realmente excluir este cliente?")) return;

    try {
        mostrarLoading("Excluindo cliente...");
        await deleteDoc(doc(db, "clientes", id));
        alert("Cliente excluído!");
        await mostrarClientes();
        abrirTela('clientes');
    } catch (error) {
        alert("Erro ao excluir cliente.");
    } finally {
        esconderLoading();
    }
}

// LIMPAR FORMULÁRIO
function limpar() {
    const ids = ["nome", "cpf", "telefone", "chavePix", "endereco", "linkLocalizacao", "placaVeiculo", "data", "ref1", "ref2", "ref3", "fotoCliente", "docFrenteVerso", "fotoResidencia", "printGanhos"];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });

    const valorEl = document.getElementById("valor");
    if (valorEl) valorEl.value = "300";
}

// DASHBOARD
function atualizarDashboard() {
    let totalClientes = clientes.length;
    let emprestado = 0;
    let recebido = 0;
    let aberto = 0;

    clientes.forEach(cliente => {
        let v = Number(cliente.valor) || 0;
        let p = Number(cliente.parcela) || 0;
        let pagas = Number(cliente.pagas) || 0;
        let totalP = Number(cliente.totalParcelas) || 24;

        emprestado += v;
        recebido += p * pagas;
        aberto += (p * totalP) - (p * pagas);
    });

    const elTotal = document.getElementById("totalClientes");
    const elEmp = document.getElementById("totalEmprestado");
    const elRec = document.getElementById("totalRecebido");
    const elAbe = document.getElementById("totalAberto");

    if (elTotal) elTotal.innerText = totalClientes;
    if (elEmp) elEmp.innerText = formatarMoeda(emprestado);
    if (elRec) elRec.innerText = formatarMoeda(recebido);
    if (elAbe) elAbe.innerText = formatarMoeda(aberto);

    const ctx = document.getElementById('graficoDashboard');
    if (ctx && window.Chart) {
        if (meuGrafico) {
            meuGrafico.destroy();
        }

        meuGrafico = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Recebido', 'Em Aberto'],
                datasets: [{
                    data: [recebido, aberto],
                    backgroundColor: ['#27ae60', '#f39c12'],
                    borderColor: '#181818',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#ffffff',
                            font: { size: 12 }
                        }
                    }
                }
            }
        });
    }
}

// EXPOSIÇÃO GLOBAL DE FUNÇÕES (Módulo ES6)
window.salvarCliente = salvarCliente;
window.baixarParcelasSelecionadas = baixarParcelasSelecionadas;
window.aplicarJurosSelecionadas = aplicarJurosSelecionadas;
window.enviarComprovanteSelecionado = enviarComprovanteSelecionado;
window.whatsapp = whatsapp;
window.excluirCliente = excluirCliente;
window.mostrarClientes = mostrarClientes;
window.abrirCliente = abrirCliente;
window.abrirSolicitacao = abrirSolicitacao;
window.aprovarSolicitacao = aprovarSolicitacao;
window.recusarSolicitacao = recusarSolicitacao;
window.abrirModalEditar = abrirModalEditar;
window.salvarEdicaoCliente = salvarEdicaoCliente;
window.abrirTela = abrirTela;

// INICIALIZAÇÃO DA BUSCA
mostrarClientes();
