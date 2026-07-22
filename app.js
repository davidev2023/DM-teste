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

// FORMATAR MOEDA (R$ 0,00)
function formatarMoeda(valor) {
    return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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

// CADASTRAR CLIENTE
async function salvarCliente() {
    try {
        let nome = document.getElementById("nome").value;
        let cpf = document.getElementById("cpf").value;
        let telefone = document.getElementById("telefone").value;
        let endereco = document.getElementById("endereco").value;
        let valor = Number(document.getElementById("valor").value);
        let data = document.getElementById("data").value;

        if (nome === "" || telefone === "") {
            alert("Preencha nome e telefone!");
            return;
        }

        // Tabela Oficial DM Financeira
        const tabelaParcelas = {
            300: 17,
            400: 22,
            500: 28,
            600: 33,
            700: 39,
            800: 44,
            900: 50,
            1000: 56
        };

        let parcela = tabelaParcelas[valor] || Math.round((valor * 1.35) / 24);

        await addDoc(collection(db, "clientes"), {
            nome,
            cpf,
            telefone,
            endereco,
            valor,
            parcela,
            totalParcelas: 24, // 24 dias úteis
            pagas: 0,
            data
        });

        limpar();
        await mostrarClientes();
        abrirTela('clientes');
        alert("Empréstimo cadastrado com sucesso!");

    } catch (error) {
        console.error("Erro ao salvar:", error);
        alert("Erro ao salvar no Firebase: " + error.message);
    }
}

// LISTAR CLIENTES
async function mostrarClientes() {
    try {
        clientes = [];
        const querySnapshot = await getDocs(collection(db, "clientes"));

        querySnapshot.forEach((documento) => {
            clientes.push({
                id: documento.id,
                ...documento.data()
            });
        });

        atualizarDashboard();

        let lista = document.getElementById("listaClientes");
        lista.innerHTML = "";

        if (clientes.length === 0) {
            lista.innerHTML = "<p>Nenhum cliente cadastrado.</p>";
            return;
        }

        clientes.forEach(cliente => {
            lista.innerHTML += `
                <div class="cliente" onclick="abrirCliente('${cliente.id}')">
                    <h3>👤 ${cliente.nome}</h3>
                    <p>CPF: ${cliente.cpf || 'Não informado'}</p>
                    <p>💰 Empréstimo: ${formatarMoeda(cliente.valor)}</p>
                    <p>🗓️ ${cliente.pagas}/${cliente.totalParcelas} diárias pagas</p>
                </div>
            `;
        });

    } catch (error) {
        console.error("Erro ao buscar clientes:", error);
    }
}

// DETALHES DO CLIENTE
function abrirCliente(id) {
    let cliente = clientes.find(c => c.id === id);
    if (!cliente) return;

    let detalhes = document.getElementById("detalhes");

    detalhes.innerHTML = `
    <div class="card">
        <h2>👤 ${cliente.nome}</h2>
        <p><strong>CPF:</strong> ${cliente.cpf || 'Não informado'}</p>
        <p><strong>Telefone:</strong> ${cliente.telefone}</p>
        <p><strong>Endereço:</strong> ${cliente.endereco || 'Não informado'}</p>
        <hr>
        <p>💰 <strong>Empréstimo:</strong> ${formatarMoeda(cliente.valor)}</p>
        <p>💵 <strong>Valor Diário:</strong> ${formatarMoeda(cliente.parcela)}/dia</p>
        <p>🗓️ <strong>Progresso:</strong> ${cliente.pagas}/${cliente.totalParcelas} dias pagos</p>

        <button onclick="pagar('${cliente.id}')">Registrar Pagamento Diário</button>
        <button onclick="whatsapp('${cliente.telefone}','${cliente.nome}','${cliente.parcela}')">Cobrar WhatsApp</button>
        <button onclick="comprovante('${cliente.id}')">📄 Comprovante</button>
        <button onclick="excluirCliente('${cliente.id}')">🗑️ Excluir</button>
        <button onclick="abrirTela('clientes')">⬅ Voltar</button>
    </div>
    `;

    abrirTela('detalhesCliente');
}

// REGISTRAR PAGAMENTO
async function pagar(id) {
    try {
        let cliente = clientes.find(c => c.id === id);
        if (!cliente) return;

        if (cliente.pagas >= cliente.totalParcelas) {
            alert("Este contrato já foi quitado!");
            return;
        }

        let novasPagas = cliente.pagas + 1;

        await updateDoc(doc(db, "clientes", id), {
            pagas: novasPagas
        });

        cliente.pagas = novasPagas;
        atualizarDashboard();
        abrirCliente(id);
    } catch (error) {
        console.error("Erro pagamento:", error);
        alert("Erro ao processar pagamento.");
    }
}

// COBRANÇA WHATSAPP
function whatsapp(numero, nome, valorDiaria) {
    let numLimpo = numero.replace(/\D/g, '');
    let mensagem = `Olá ${nome}, passando para lembrar da sua diária de ${formatarMoeda(valorDiaria)} da DM Financeira.\n\n⏰ *Lembrete:* Os pagamentos devem ser realizados até às 18h.`;
    let url = `https://wa.me/55${numLimpo}?text=${encodeURIComponent(mensagem)}`;
    window.open(url, "_blank");
}

// COMPROVANTE WHATSAPP
function comprovante(id) {
    let cliente = clientes.find(c => c.id === id);
    if (!cliente) {
        alert("Cliente não encontrado");
        return;
    }

    let numLimpo = cliente.telefone.replace(/\D/g, '');
    let restantes = cliente.totalParcelas - cliente.pagas;

    let mensagem = `📄 *COMPROVANTE DE PAGAMENTO DIÁRIO*

🏦 *DM Financeira*
_Crédito rápido, solução na hora._

👤 *Cliente:* ${cliente.nome}
💰 *Empréstimo:* ${formatarMoeda(cliente.valor)}
💵 *Valor por dia:* ${formatarMoeda(cliente.parcela)}
🗓️ *Dias pagos:* ${cliente.pagas}/${cliente.totalParcelas} dias
⌛ *Dias restantes:* ${restantes} dias

Obrigado por manter seus pagamentos em dia!

⚠️ *Horário de pagamento:* Todos os pagamentos devem ser realizados até às 18h.`;

    let url = `https://wa.me/55${numLimpo}?text=${encodeURIComponent(mensagem)}`;
    window.open(url, "_blank");
}

// EXCLUIR CLIENTE
async function excluirCliente(id) {
    if (!confirm("Deseja realmente excluir este cliente?")) return;

    try {
        await deleteDoc(doc(db, "clientes", id));
        alert("Cliente excluído com sucesso!");
        await mostrarClientes();
        abrirTela('clientes');
    } catch (error) {
        console.error(error);
        alert("Erro ao excluir cliente.");
    }
}

// LIMPAR FORMULÁRIO
function limpar() {
    document.getElementById("nome").value = "";
    document.getElementById("cpf").value = "";
    document.getElementById("telefone").value = "";
    document.getElementById("endereco").value = "";
    document.getElementById("valor").value = "300";
    document.getElementById("data").value = "";
}

// ATUALIZAR DASHBOARD
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

    document.getElementById("totalClientes").innerText = totalClientes;
    document.getElementById("totalEmprestado").innerText = formatarMoeda(emprestado);
    document.getElementById("totalRecebido").innerText = formatarMoeda(recebido);
    document.getElementById("totalAberto").innerText = formatarMoeda(aberto);
}

// EXPOSIÇÃO GLOBAL
window.salvarCliente = salvarCliente;
window.pagar = pagar;
window.whatsapp = whatsapp;
window.comprovante = comprovante;
window.excluirCliente = excluirCliente;
window.mostrarClientes = mostrarClientes;
window.abrirCliente = abrirCliente;
window.abrirTela = abrirTela;

// CARREGAR INICIAL
mostrarClientes();

// LOGICA INSTALAÇÃO PWA
let eventoInstalacao = null;

window.addEventListener("beforeinstallprompt", (evento) => {
    evento.preventDefault();
    eventoInstalacao = evento;
    console.log("Evento PWA capturado com sucesso!");
});

document.getElementById("btnInstalar")?.addEventListener("click", async () => {
    if (eventoInstalacao) {
        eventoInstalacao.prompt();
        let escolha = await eventoInstalacao.userChoice;
        if (escolha.outcome === "accepted") {
            console.log("PWA Instalado!");
        }
        eventoInstalacao = null;
    } else {
        alert("Para instalar, acesse este site no navegador do seu celular (Chrome/Safari) e selecione 'Adicionar à tela inicial'.");
    }
});

// REGISTRO DO SERVICE WORKER (Essencial para PWA)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker Registrado!', reg))
            .catch(err => console.error('Erro no Service Worker:', err));
    });
}
