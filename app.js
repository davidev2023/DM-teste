// No topo do app.js
import {atualizarDashboard} from './dashboard.js';
import {calcularAtraso} from './utils.js'

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getFirestore,
    collection,
    addDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    doc,
    getDoc,
    setDoc,
    enableIndexedDbPersistence,
    CACHE_SIZE_UNLIMITED
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

// ATIVAR PERSISTÊNCIA OFFLINE DO FIRESTORE
enableIndexedDbPersistence(db, { cacheSizeBytes: CACHE_SIZE_UNLIMITED }).catch((err) => {
    if (err.code == 'failed-precondition') {
        console.warn('Persistência offline falhou: Múltiplas abas abertas ao mesmo tempo.');
    } else if (err.code == 'unimplemented') {
        console.warn('O navegador não suporta persistência offline.');
    }
});

let clientes = [];
let solicitacoes = [];
let meuGrafico = null;
let deferredPrompt = null;
const FOTO_PADRAO = "https://cdn-icons-png.flaticon.com/512/149/149071.png";

// TABELA DE PARCELAS DIÁRIAS PADRÃO
const TABELA_PARCELAS_DIARIAS = {
    300: 17, 400: 22, 500: 28, 600: 33, 700: 39, 800: 44, 900: 50, 1000: 56
};

// FUNÇÃO INTELIGENTE DE TIMEOUT (Com fallback seguro para Cache Offline)
async function buscarComTimeout(queryRef, tempoMs = 2500) {
    try {
        // Tenta buscar do servidor com limite de tempo
        const promessaServidor = getDocs(queryRef);
        const resultado = await Promise.race([
            promessaServidor,
            new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT_OFFLINE")), tempoMs))
        ]);
        return resultado;
    } catch (e) {
        console.log("Sem conexão ou timeout atingido. Buscando do cache local do dispositivo...");
        // Se falhar ou expirar o tempo, força a leitura do cache local IndexedDB
        return await getDocs(queryRef, { source: 'cache' });
    }
}

function comTimeout(promessa, tempoMs = 2000) {
    return Promise.race([
        promessa,
        new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT_OFFLINE")), tempoMs))
    ]);
}

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

window.calcularValoresFormulario = function() {
    const tipo = document.getElementById("tipoEmprestimo")?.value || "diario";
    const valorEmprestadoInput = document.getElementById("valor");
    const qtdInput = document.getElementById("qtdParcelas");
    const totalInput = document.getElementById("valorTotal");
    const parcelaInput = document.getElementById("valorParcela");

    if (!valorEmprestadoInput || !qtdInput || !totalInput || !parcelaInput) return;

    const valorEmprestado = Number(valorEmprestadoInput.value || 0);

    if (tipo === "diario") {
        if (valorEmprestado > 0) {
            let valorParcelaCalculado = 0;
            if (TABELA_PARCELAS_DIARIAS[valorEmprestado]) {
                valorParcelaCalculado = TABELA_PARCELAS_DIARIAS[valorEmprestado];
            } else {
                valorParcelaCalculado = Math.round((valorEmprestado * 1.36) / 24);
            }
            
            const totalCalculado = valorParcelaCalculado * 24;
            
            totalInput.value = totalCalculado;
            parcelaInput.value = valorParcelaCalculado;
        } else {
            totalInput.value = "";
            parcelaInput.value = "";
        }
    } else {
        const valorTotal = Number(totalInput.value || 0);
        const qtdParcelas = Number(qtdInput.value || 1);

        if (valorTotal > 0 && qtdParcelas > 0) {
            const valorParcelaCalculado = (valorTotal / qtdParcelas).toFixed(2);
            parcelaInput.value = valorParcelaCalculado;
        } else {
            parcelaInput.value = "";
        }
    }
};

window.atualizarOpcoesParcelas = function() {
    const tipo = document.getElementById("tipoEmprestimo")?.value;
    const inputQtd = document.getElementById("qtdParcelas");
    const inputTotal = document.getElementById("valorTotal");

    if (inputQtd) {
        if (tipo === "diario") {
            inputQtd.value = "24";
        } else if (tipo === "semanal") {
            inputQtd.value = "4";
        } else if (tipo === "mensal") {
            inputQtd.value = "1";
        }
    }

    if (tipo !== "diario" && inputTotal) {
        inputTotal.value = "";
    }

    window.calcularValoresFormulario();
};

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

function formatarMoeda(valor) {
    return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

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

function abrirTela(idTela) {
    document.querySelectorAll('.tela').forEach(tela => {
        tela.classList.remove('ativa');
    });

    const telaAlvo = document.getElementById(idTela);
    if (telaAlvo) {
        telaAlvo.classList.add('ativa');
    }
}

async function notificarAlteracaoGlobal() {
    try {
        const refDoc = doc(db, "controle", "sistema");
        await comTimeout(setDoc(refDoc, { versao: Date.now(), ultimaModificacao: new Date().toISOString() }), 1500);
    } catch (e) {
        console.log("Alteração registrada offline.");
    }
}

async function salvarCliente() {
    let nome = document.getElementById("nome")?.value.trim() || "";
    let cpf = document.getElementById("cpf")?.value.trim() || "";
    let telefone = document.getElementById("telefone")?.value.trim() || "";
    let chavePix = document.getElementById("chavePix")?.value.trim() || "";
    let endereco = document.getElementById("endereco")?.value.trim() || "";
    let linkLocalizacao = document.getElementById("linkLocalizacao")?.value.trim() || "";
    let placaVeiculo = document.getElementById("placaVeiculo")?.value.trim() || "";
    let valor = Number(document.getElementById("valor")?.value || 0);
    let data = document.getElementById("data")?.value || "";

    let tipoEmprestimo = document.getElementById("tipoEmprestimo")?.value || "diario";
    let totalParcelas = Number(document.getElementById("qtdParcelas")?.value || (tipoEmprestimo === "diario" ? 24 : 1));

    let valorTotal = Number(document.getElementById("valorTotal")?.value || 0);
    let valorParcela = Number(document.getElementById("valorParcela")?.value || 0);

    let ref1 = document.getElementById("ref1")?.value.trim() || "";
    let ref2 = document.getElementById("ref2")?.value.trim() || "";
    let ref3 = document.getElementById("ref3")?.value.trim() || "";

    let fotoPerfilFile = document.getElementById("fotoCliente")?.files[0];
    let docFrenteVersoFile = document.getElementById("docFrenteVerso")?.files[0];
    let fotoResidenciaFile = document.getElementById("fotoResidencia")?.files[0];
    let printGanhosFile = document.getElementById("printGanhos")?.files[0];

    if (nome === "" || telefone === "" || data === "" || valorTotal === 0 || valorParcela === 0) {
        alert("Preencha todos os campos obrigatórios, incluindo os valores!");
        return;
    }

    try {
        mostrarLoading("Salvando novo cliente...");

        let fotoBase64 = await converterImagemParaBase64(fotoPerfilFile);
        let docBase64 = await converterImagemParaBase64(docFrenteVersoFile);
        let resBase64 = await converterImagemParaBase64(fotoResidenciaFile);
        let printBase64 = await converterImagemParaBase64(printGanhosFile);

        await comTimeout(addDoc(collection(db, "clientes"), {
            nome, cpf, telefone, chavePix, endereco, linkLocalizacao, placaVeiculo,
            referencias: [ref1, ref2, ref3].filter(r => r !== ""),
            valor, valorTotal, valorParcela, parcela: valorParcela,
            tipoEmprestimo, totalParcelas, pagas: 0, data,
            multasPorParcela: {},
            foto: fotoBase64, docFoto: docBase64, resFoto: resBase64, printFoto: printBase64
        }), 2000);

        await notificarAlteracaoGlobal();

        limpar();
        await mostrarClientes();
        abrirTela('clientes');
        alert("Empréstimo cadastrado com sucesso!");

    } catch (error) {
        console.log("Salvo offline (timeout atingido).");
        limpar();
        await mostrarClientes();
        abrirTela('clientes');
        alert("Salvo offline no dispositivo!");
    } finally {
        esconderLoading();
    }
}

async function mostrarClientes() {
    mostrarLoading("Buscando informações...");
    try {
        clientes = [];
        solicitacoes = [];

        // Busca com inteligência de cache local
        const querySnapshot = await buscarComTimeout(collection(db, "clientes"), 2000);
        querySnapshot.forEach((documento) => {
            clientes.push({ id: documento.id, ...documento.data() });
        });

        try {
            const querySol = await buscarComTimeout(collection(db, "solicitacoes_pendentes"), 1500);
            querySol.forEach((documento) => {
                solicitacoes.push({ id: documento.id, ...documento.data() });
            });
        } catch (err) {
            console.log("Solicitações buscadas do cache local.");
        }

        atualizarDashboard(clientes, formatarMoeda);

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
                textoAtraso = `<strong style="color: #ff5555;">${atraso} parcela(s) em atraso</strong>`;
            } else if (status === 'amarelo') {
                iconeStatus = '🟡';
                textoAtraso = 'Em aberto (Hoje)';
            }

            let urlFoto = cliente.foto || cliente.fotoCliente || FOTO_PADRAO;
            let tipoTxt = cliente.tipoEmprestimo ? cliente.tipoEmprestimo.toUpperCase() : 'DIÁRIO';

            lista.innerHTML += `
                <div class="cliente" onclick="abrirCliente('${cliente.id}')">
                    <div class="cliente-header">
                        <img src="${urlFoto}" class="avatar-cliente" alt="Foto">
                        <div>
                            <h3>${iconeStatus} ${cliente.nome}</h3>
                            <p>CPF: ${cliente.cpf || 'Não informado'} | <span style="color:#ffcc00; font-weight:bold;">${tipoTxt}</span></p>
                            <p>🚘 Placa: ${cliente.placaVeiculo || 'N/A'}</p>
                        </div>
                    </div>
                    <p>💰 Empréstimo: ${formatarMoeda(cliente.valor)}</p>
                    <p>🗓️ ${cliente.pagas}/${cliente.totalParcelas || 24} pagas | Status: ${textoAtraso}</p>
                </div>
            `;
        });

    } catch (error) {
        console.error("Erro ao buscar dados:", error);
    } finally {
        esconderLoading();
    }
}

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

    let valorP = sol.valorParcela || sol.parcela || 0;

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
        <p style="text-align: left;">💵 <strong>Parcela Estimada:</strong> ${formatarMoeda(valorP)}</p>

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

async function aprovarSolicitacao(id) {
    let sol = solicitacoes.find(s => s.id === id);
    if (!sol) return;

    let dataHoje = new Date().toISOString().split('T')[0];

    if (!confirm(`Aprovar empréstimo para ${sol.nome}?`)) return;

    try {
        mostrarLoading("Aprovando solicitação...");
        
        let valorP = Number(sol.valorParcela || sol.parcela || 0);
        let totP = Number(sol.totalParcelas || 24);
        let valTot = Number(sol.valorTotal || (valorP * totP));

        await comTimeout(addDoc(collection(db, "clientes"), {
            nome: sol.nome || "",
            cpf: sol.cpf || "",
            telefone: sol.telefone || "",
            chavePix: sol.chavePix || "",
            endereco: sol.endereco || "",
            linkLocalizacao: sol.linkLocalizacao || "",
            placaVeiculo: sol.placaVeiculo || "",
            referencias: sol.referencias || [],
            valor: Number(sol.valor || 0),
            valorTotal: valTot,
            valorParcela: valorP,
            parcela: valorP,
            tipoEmprestimo: sol.tipoEmprestimo || "diario",
            totalParcelas: totP,
            pagas: 0,
            data: dataHoje,
            multasPorParcela: {},
            foto: sol.foto || sol.fotoCliente || "",
            docFoto: sol.docFoto || sol.docFrenteVerso || "",
            resFoto: sol.resFoto || sol.fotoResidencia || "",
            printFoto: sol.printFoto || sol.printGanhos || ""
        }), 2000);

        await comTimeout(deleteDoc(doc(db, "solicitacoes_pendentes", id)), 2000);
        await notificarAlteracaoGlobal();

        alert("Solicitação Aprovada!");
        await mostrarClientes();
        abrirTela('clientes');
    } catch (error) {
        console.log("Aprovado no modo offline.");
        alert("Solicitação processada no modo offline.");
        await mostrarClientes();
        abrirTela('clientes');
    } finally {
        esconderLoading();
    }
}

async function recusarSolicitacao(id) {
    if (!confirm("Deseja recusar e excluir esta solicitação?")) return;

    try {
        mostrarLoading("Removendo solicitação...");
        await comTimeout(deleteDoc(doc(db, "solicitacoes_pendentes", id)), 2000);
        await notificarAlteracaoGlobal();
        alert("Solicitação removida.");
        await mostrarClientes();
        abrirTela('solicitacoes');
    } catch (error) {
        console.log("Processado offline.");
        alert("Processado offline.");
        await mostrarClientes();
        abrirTela('solicitacoes');
    } finally {
        esconderLoading();
    }
}

function abrirCliente(id) {
    let cliente = clientes.find(c => c.id === id);
    if (!cliente) return;

    const { atraso, status } = calcularAtraso(cliente);
    let detalhes = document.getElementById("detalhes");
    if (!detalhes) return;

    let textoStatus = '🟢 Em Dia';
    if (status === 'vermelho') textoStatus = `🔴 ATRASADO (${atraso} parcela(s) pendentes)`;
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
    }

    let tipo = cliente.tipoEmprestimo || 'diario';
    let totalP = Number(cliente.totalParcelas) || (tipo === 'diario' ? 24 : 1);
    let multas = cliente.multasPorParcela || {};
    let valorBaseParcela = Number(cliente.valorParcela || cliente.parcela || 0);

    for (let i = 1; i <= totalP; i++) {
        if (tipo === 'diario') {
            dataAtual.setDate(dataAtual.getDate() + 1);
            if (dataAtual.getDay() === 0) dataAtual.setDate(dataAtual.getDate() + 1);
        } else if (tipo === 'semanal') {
            dataAtual.setDate(dataAtual.getDate() + 7);
        } else if (tipo === 'mensal') {
            dataAtual.setMonth(dataAtual.getMonth() + 1);
        }

        let diaFmt = String(dataAtual.getDate()).padStart(2, '0');
        let mesFmt = String(dataAtual.getMonth() + 1).padStart(2, '0');
        let dataTexto = `${diaFmt}/${mesFmt}`;

        const hojeSemHora = new Date();
        hojeSemHora.setHours(0, 0, 0, 0);

        const dataParcelaSemHora = new Date(dataAtual);
        dataParcelaSemHora.setHours(0, 0, 0, 0);

        let classeStatus = 'pendente';
        let statusTxt = '⏳ Pendente';

        if (i <= cliente.pagas) {
            classeStatus = "paga";
            statusTxt = "✅ Paga";
        } else if (dataParcelaSemHora < hojeSemHora) {
            classeStatus = "atrasada";
            statusTxt = "🔴 Atrasada";
        } else if (dataParcelaSemHora.getTime() === hojeSemHora.getTime()) {
            classeStatus = "pendente";
            statusTxt = "🟡 Em Aberto (Hoje)";
        } else {
            classeStatus = "pendente";
            statusTxt = "⏳ Pendente";
        }

        let multaIndividual = multas[i] || 0;
        let valorFinalDiaria = valorBaseParcela + multaIndividual;
        let rotuloPeriodo = tipo === 'diario' ? 'Diária' : (tipo === 'semanal' ? 'Semana' : 'Parcela');

        parcelasHtml += `
            <div class="item-parcela ${classeStatus}">
                <div>
                    <strong>${rotuloPeriodo} ${i} (${dataTexto})</strong> - ${formatarMoeda(valorFinalDiaria)}
                    <span style="font-size: 11px; display: block; color: #aaa;">${statusTxt}</span>
                </div>
                <input type="checkbox" class="chk-parcela" data-num="${i}" data-data="${dataTexto}" data-status="${classeStatus}" data-valor="${valorFinalDiaria}">
            </div>
        `;
    }

    let rotuloValor = tipo === 'diario' ? 'Diário' : (tipo === 'semanal' ? 'Semanal' : 'Mensal');

    detalhes.innerHTML = `
    <div class="card" style="text-align: center;">
        <img src="${urlFoto}" class="avatar-detalhe" alt="Foto Perfil" onclick="abrirModalImagem('${urlFoto}')">
        <h2>${cliente.nome}</h2>
        <p style="text-align: left;"><strong>Tipo:</strong> <span style="color:#ffcc00; font-weight:bold;">${tipo.toUpperCase()}</span></p>
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

        <p style="text-align: left;">💰 <strong>Valor ${rotuloValor} Base:</strong> ${formatarMoeda(valorBaseParcela)}</p>
        <p style="text-align: left;">🗓️ <strong>Data Empréstimo:</strong> ${cliente.data ? cliente.data.split('-').reverse().join('/') : 'N/A'}</p>
        <p style="text-align: left;">🗓️ <strong>Progresso:</strong> ${cliente.pagas}/${totalP} pagas</p>
        
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
            <button onclick="abrirModalNovoEmprestimo('${cliente.id}')" style="background: #27ae60;">➕ Criar Novo Empréstimo para este Cliente</button>
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

function abrirModalEditar(id) {
    let cliente = clientes.find(c => c.id === id);
    if (!cliente) return;

    let detalhes = document.getElementById("detalhes");
    if (!detalhes) return;

    let ref1 = (cliente.referencias && cliente.referencias[0]) ? cliente.referencias[0] : "";
    let ref2 = (cliente.referencias && cliente.referencias[1]) ? cliente.referencias[1] : "";
    let ref3 = (cliente.referencias && cliente.referencias[2]) ? cliente.referencias[2] : "";

    let tipo = cliente.tipoEmprestimo || "diario";
    let valorP = cliente.valorParcela || cliente.parcela || 0;
    let valorTot = cliente.valorTotal || (valorP * (cliente.totalParcelas || 24));

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

        <label>Tipo de Empréstimo:</label>
        <select id="editTipoEmprestimo">
            <option value="diario" ${tipo === 'diario' ? 'selected' : ''}>Diário</option>
            <option value="semanal" ${tipo === 'semanal' ? 'selected' : ''}>Semanal</option>
            <option value="mensal" ${tipo === 'mensal' ? 'selected' : ''}>Mensal</option>
        </select>

        <label>Quantidade de Parcelas:</label>
        <input type="number" id="editTotalParcelas" value="${cliente.totalParcelas || 24}">

        <label>Valor Total a Receber (R$):</label>
        <input type="number" id="editValorTotal" value="${valorTot}">

        <label>Valor da Parcela (R$):</label>
        <input type="number" id="editParcela" value="${valorP}">

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
        let tipoEmprestimo = document.getElementById("editTipoEmprestimo").value;
        let totalParcelas = Number(document.getElementById("editTotalParcelas").value || 24);
        let valorTotal = Number(document.getElementById("editValorTotal").value || 0);
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

        await comTimeout(updateDoc(doc(db, "clientes", id), {
            nome, cpf, telefone, chavePix, endereco, linkLocalizacao, placaVeiculo,
            tipoEmprestimo, totalParcelas, valorTotal,
            valorParcela: parcela, parcela, data,
            referencias: [ref1, ref2, ref3].filter(r => r !== ""),
            foto, docFoto, resFoto, printFoto
        }), 2000);

        await notificarAlteracaoGlobal();

        alert("Dados atualizados com sucesso!");
        await mostrarClientes();
        abrirCliente(id);
    } catch (e) {
        console.log("Atualizado offline no dispositivo.");
        alert("Atualizado no dispositivo (offline).");
        await mostrarClientes();
        abrirCliente(id);
    } finally {
        esconderLoading();
    }
}

async function baixarParcelasSelecionadas(id) {
    let cliente = clientes.find(c => c.id === id);
    if (!cliente) return;

    let selecionadas = Array.from(document.querySelectorAll('.chk-parcela:checked')).map(el => Number(el.dataset.num));

    if (selecionadas.length === 0) {
        alert("Selecione pelo menos uma parcela para dar baixa!");
        return;
    }

    let maiorNum = Math.max(...selecionadas);

    if (confirm(`Confirmar pagamento até a parcela Nº ${maiorNum}?`)) {
        try {
            mostrarLoading("Registrando baixa...");
            await comTimeout(updateDoc(doc(db, "clientes", id), { pagas: maiorNum }), 2000);
            await notificarAlteracaoGlobal();
            cliente.pagas = maiorNum;
            alert("Pagamento registrado!");
            await mostrarClientes();
            abrirCliente(id);
        } catch (e) {
            console.log("Baixa registrada offline.");
            cliente.pagas = maiorNum;
            alert("Baixa registrada no dispositivo (offline).");
            await mostrarClientes();
            abrirCliente(id);
        } finally {
            esconderLoading();
        }
    }
}

async function aplicarJurosSelecionadas(id) {
    let cliente = clientes.find(c => c.id === id);
    if (!cliente) return;

    let selecionadas = Array.from(document.querySelectorAll(".chk-parcela:checked"))
        .map(el => Number(el.dataset.num));

    if (selecionadas.length === 0) {
        alert("Selecione as parcelas que deseja calcular os juros!");
        return;
    }

    let multasAtuais = cliente.multasPorParcela || {};

    const tipo = cliente.tipoEmprestimo || "diario";
    const [ano, mes, dia] = cliente.data.split("-").map(Number);
    const dataInicio = new Date(ano, mes - 1, dia);

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    selecionadas.forEach(numeroParcela => {
        let vencimento = new Date(dataInicio);
        for (let i = 1; i <= numeroParcela; i++) {
            if (tipo === "diario") {
                vencimento.setDate(vencimento.getDate() + 1);
                if (vencimento.getDay() === 0) vencimento.setDate(vencimento.getDate() + 1);
            } else if (tipo === "semanal") {
                vencimento.setDate(vencimento.getDate() + 7);
            } else {
                vencimento.setMonth(vencimento.getMonth() + 1);
            }
        }

        let diasAtraso = Math.floor((hoje - vencimento) / (1000 * 60 * 60 * 24));
        if (diasAtraso <= 0) {
            multasAtuais[numeroParcela] = 0;
        } else {
            multasAtuais[numeroParcela] = Number((diasAtraso * 1.50).toFixed(2));
        }
    });

    try {
        mostrarLoading("Calculando juros...");
        await comTimeout(updateDoc(doc(db, "clientes", id), { multasPorParcela: multasAtuais }), 2000);
        await notificarAlteracaoGlobal();
        cliente.multasPorParcela = multasAtuais;
        alert("Juros calculados com sucesso!");
        await mostrarClientes();
        abrirCliente(id);
    } catch (e) {
        console.log("Juros calculados offline.");
        cliente.multasPorParcela = multasAtuais;
        alert("Juros calculados no dispositivo (offline).");
        await mostrarClientes();
        abrirCliente(id);
    } finally {
        esconderLoading();
    }
}

async function enviarComprovanteSelecionado(id) {
    let cliente = clientes.find(c => c.id === id);
    if (!cliente) return;

    let multas = cliente.multasPorParcela || {};
    let valorBase = Number(cliente.valorParcela || cliente.parcela || 0);

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
            await comTimeout(updateDoc(doc(db, "clientes", id), { pagas: maiorNum }), 2000);
            await notificarAlteracaoGlobal();
            cliente.pagas = maiorNum;
        } catch (e) {
            cliente.pagas = maiorNum;
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
    const docPdf = new jsPDF({ unit: "mm", format: [80, 160] });

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
    docPdf.text("Parcela(s):", 8, y);
    docPdf.setFont("helvetica", "normal");
    docPdf.text(detalheDiarias, 32, y, { maxWidth: 40 });

    y += 10;
    docPdf.setFont("helvetica", "bold");
    docPdf.text("Qtd. Parcelas:", 8, y);
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
    let nomeArquivo = `Comprovante_${nomeLimpo}_Parcela_${numsStr}.pdf`;
    docPdf.save(nomeArquivo);

    await mostrarClientes();
    abrirCliente(id);

    let mensagem = `📄 *COMPROVANTE DE PAGAMENTO*\n\n🏦 *DM Financeira*\n\n👤 *Cliente:* ${cliente.nome}\n🗓️ *Parcela(s) Pagas:* ${detalheDiarias} (${qtdDiarias}x)\n💰 *Valor Pago:* ${formatarMoeda(valorTotal)}\n\nO seu comprovante em PDF foi gerado e baixado. Anexando a seguir! 👍`;

    let url = `https://wa.me/55${numLimpo}?text=${encodeURIComponent(mensagem)}`;
    setTimeout(() => {
        window.open(url, "_blank");
    }, 800);
}

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
    let valorBase = Number(cliente.valorParcela || cliente.parcela || 0);

    let selecionadas = Array.from(document.querySelectorAll('.chk-parcela:checked'));
    
    let totalCobrar = 0;
    let detalhesLista = [];

    if (selecionadas.length > 0) {
        selecionadas.forEach(el => {
            let num = Number(el.dataset.num);
            let val = Number(el.dataset.valor) || (valorBase + (multas[num] || 0));
            totalCobrar += val;
            detalhesLista.push(`• Parcela ${num} (${el.dataset.data}): ${formatarMoeda(val)}`);
        });
    } else {
        if (atraso > 0) {
            let inicio = (cliente.pagas || 0) + 1;
            let fim = (cliente.pagas || 0) + atraso;
            for (let i = inicio; i <= fim; i++) {
                let val = valorBase + (multas[i] || 0);
                totalCobrar += val;
                detalhesLista.push(`• Parcela ${i}: ${formatarMoeda(val)}`);
            }
        }
    }

    let mensagem = `Olá *${cliente.nome}*, passando para lembrar dos seus pagamentos da *DM Financeira*:\n`;

    if (detalhesLista.length > 0) {
        mensagem += `\n🔴 *Parcelas a Pagar / Atrasadas:*\n` + detalhesLista.join('\n');
        mensagem += `\n\n✅ *TOTAL A PAGAR:* *${formatarMoeda(totalCobrar)}*`;
    } else {
        mensagem += `\n🟢 *Parcela de Hoje:* ${formatarMoeda(valorBase)}`;
        mensagem += `\n\n✅ *TOTAL:* *${formatarMoeda(valorBase)}*`;
    }

    mensagem += `\n\n⏰ *Lembrete:* Os pagamentos devem ser realizados até às 18h.`;

    let url = `https://wa.me/55${numLimpo}?text=${encodeURIComponent(mensagem)}`;
    window.open(url, "_blank");
}

async function excluirCliente(id) {
    if (!confirm("Deseja realmente excluir este cliente?")) return;

    try {
        mostrarLoading("Excluindo cliente...");
        await comTimeout(deleteDoc(doc(db, "clientes", id)), 2000);
        await notificarAlteracaoGlobal();
        alert("Cliente excluído!");
        await mostrarClientes();
        abrirTela('clientes');
    } catch (error) {
        console.log("Removido offline.");
        alert("Removido no dispositivo (offline).");
        await mostrarClientes();
        abrirTela('clientes');
    } finally {
        esconderLoading();
    }
}

function limpar() {
    const ids = ["nome", "cpf", "telefone", "chavePix", "endereco", "linkLocalizacao", "placaVeiculo", "data", "ref1", "ref2", "ref3", "fotoCliente", "docFrenteVerso", "fotoResidencia", "printGanhos", "valorTotal", "valorParcela"];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });

    const valorEl = document.getElementById("valor");
    if (valorEl) valorEl.value = "";

    const tipoEl = document.getElementById("tipoEmprestimo");
    if (tipoEl) tipoEl.value = "diario";

    const qtdEl = document.getElementById("qtdParcelas");
    if (qtdEl) qtdEl.value = "24";
}

function abrirModalNovoEmprestimo(id) {
    let cliente = clientes.find(c => c.id === id);
    if (!cliente) return;

    let detalhes = document.getElementById("detalhes");
    if (!detalhes) return;

    let dataHoje = new Date().toISOString().split('T')[0];

    detalhes.innerHTML = `
    <div class="card">
        <h2 style="color:#ffcc00; text-align:center; margin-bottom:15px;">➕ Novo Empréstimo</h2>
        <p style="text-align:center; color:#fff; font-weight:bold;">Cliente: ${cliente.nome}</p>
        
        <label>Tipo de Empréstimo:</label>
        <select id="novoTipoEmprestimo" onchange="atualizarOpcoesNovoEmprestimo()">
            <option value="diario">Diário</option>
            <option value="semanal">Semanal</option>
            <option value="mensal">Mensal</option>
        </select>

        <label>Valor Solicitado (R$):</label>
        <input type="number" id="novoValor" placeholder="Ex: 500" oninput="calcularValoresNovoEmprestimo()">

        <label>Quantidade de Parcelas:</label>
        <input type="number" id="novoQtdParcelas" value="24" oninput="calcularValoresNovoEmprestimo()">

        <label>Valor Total a Receber (R$):</label>
        <input type="number" id="novoValorTotal" placeholder="Ex: 672" oninput="calcularValoresNovoEmprestimo()">

        <label>Valor da Parcela (R$):</label>
        <input type="number" id="novoValorParcela" placeholder="Ex: 28">

        <label>Data do Empréstimo:</label>
        <input type="date" id="novoData" value="${dataHoje}">

        <button onclick="salvarNovoEmprestimo('${cliente.id}')" style="background:#27ae60; margin-top:15px;">💾 Confirmar Novo Empréstimo</button>
        <button onclick="abrirCliente('${cliente.id}')" style="background:#333; margin-top:5px;">❌ Cancelar</button>
    </div>
    `;
}

window.atualizarOpcoesNovoEmprestimo = function() {
    const tipo = document.getElementById("novoTipoEmprestimo")?.value;
    const inputQtd = document.getElementById("novoQtdParcelas");
    const inputTotal = document.getElementById("novoValorTotal");

    if (inputQtd) {
        if (tipo === "diario") inputQtd.value = "24";
        else if (tipo === "semanal") inputQtd.value = "4";
        else if (tipo === "mensal") inputQtd.value = "1";
    }

    if (tipo !== "diario" && inputTotal) inputTotal.value = "";
    window.calcularValoresNovoEmprestimo();
};

window.calcularValoresNovoEmprestimo = function() {
    const tipo = document.getElementById("novoTipoEmprestimo")?.value || "diario";
    const valorEmprestado = Number(document.getElementById("novoValor")?.value || 0);
    const qtdInput = document.getElementById("novoQtdParcelas");
    const totalInput = document.getElementById("novoValorTotal");
    const parcelaInput = document.getElementById("novoValorParcela");

    if (!totalInput || !parcelaInput) return;

    if (tipo === "diario") {
        if (valorEmprestado > 0) {
            let valorParcelaCalculado = TABELA_PARCELAS_DIARIAS[valorEmprestado] 
                || Math.round((valorEmprestado * 1.36) / 24);
            
            totalInput.value = valorParcelaCalculado * 24;
            parcelaInput.value = valorParcelaCalculado;
        } else {
            totalInput.value = "";
            parcelaInput.value = "";
        }
    } else {
        const valorTotal = Number(totalInput.value || 0);
        const qtdParcelas = Number(qtdInput?.value || 1);

        if (valorTotal > 0 && qtdParcelas > 0) {
            parcelaInput.value = (valorTotal / qtdParcelas).toFixed(2);
        } else {
            parcelaInput.value = "";
        }
    }
};

async function salvarNovoEmprestimo(id) {
    let clienteAntigo = clientes.find(c => c.id === id);
    if (!clienteAntigo) return;

    let valor = Number(document.getElementById("novoValor")?.value || 0);
    let valorTotal = Number(document.getElementById("novoValorTotal")?.value || 0);
    let valorParcela = Number(document.getElementById("novoValorParcela")?.value || 0);
    let tipoEmprestimo = document.getElementById("novoTipoEmprestimo")?.value || "diario";
    let totalParcelas = Number(document.getElementById("novoQtdParcelas")?.value || 24);
    let data = document.getElementById("novoData")?.value || "";

    if (valorTotal === 0 || valorParcela === 0 || data === "") {
        alert("Preencha todos os campos do novo empréstimo!");
        return;
    }

    try {
        mostrarLoading("Criando novo empréstimo...");

        await comTimeout(addDoc(collection(db, "clientes"), {
            nome: clienteAntigo.nome || "",
            cpf: clienteAntigo.cpf || "",
            telefone: clienteAntigo.telefone || "",
            chavePix: clienteAntigo.chavePix || "",
            endereco: clienteAntigo.endereco || "",
            linkLocalizacao: clienteAntigo.linkLocalizacao || "",
            placaVeiculo: clienteAntigo.placaVeiculo || "",
            referencias: clienteAntigo.referencias || [],
            foto: clienteAntigo.foto || "",
            docFoto: clienteAntigo.docFoto || "",
            resFoto: clienteAntigo.resFoto || "",
            printFoto: clienteAntigo.printFoto || "",
            valor, valorTotal, valorParcela, parcela: valorParcela,
            tipoEmprestimo, totalParcelas, pagas: 0, data,
            multasPorParcela: {}
        }), 2000);

        await notificarAlteracaoGlobal();

        alert("Novo empréstimo criado com sucesso!");
        await mostrarClientes();
        abrirTela('clientes');

    } catch (e) {
        console.log("Criado emprestimo offline.");
        alert("Novo empréstimo salvo no dispositivo (offline).");
        await mostrarClientes();
        abrirTela('clientes');
    } finally {
        esconderLoading();
    }
}

// EXPOSIÇÃO GLOBAL DE FUNÇÕES
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
window.abrirModalNovoEmprestimo = abrirModalNovoEmprestimo;
window.salvarNovoEmprestimo = salvarNovoEmprestimo;

// INICIALIZAÇÃO DA BUSCA
mostrarClientes();
