let meuGrafico = null;

// DASHBOARD ATUALIZADO (SEPARANDO CAPITAL, LUCRO DO EMPRÉSTIMO, ATRASOS E ABERTO)
export async function atualizarDashboard(clientes,formatarMoeda) {
    let totalClientes = clientes.length;
    let emprestado = 0;
    let recebido = 0;
    let aberto = 0;
    let totalLucroEmprestimo = 0; // Lucro contratual (juros do empréstimo)
    let totalJurosAtraso = 0;     // Juros/multas por atraso

    clientes.forEach(cliente => {
        let v = Number(cliente.valor) || 0; // Capital inicial emprestado
        let p = Number(cliente.valorParcela || cliente.parcela || 0); // Valor da parcela base
        let pagas = Number(cliente.pagas) || 0;
        let totalP = Number(cliente.totalParcelas) || (cliente.tipoEmprestimo === 'diario' ? 24 : 1);
        let valorTot = Number(cliente.valorTotal || (p * totalP)); // Valor total do contrato

        // 1. Calcular o lucro/juros contratual deste empréstimo (Valor Total - Valor Emprestado)
        let lucroContrato = valorTot - v;
        if (lucroContrato < 0) lucroContrato = 0;
        totalLucroEmprestimo += lucroContrato;

        // 2. Somar as multas/juros de atraso deste cliente
        let multas = cliente.multasPorParcela || {};
        let multasCliente = Object.values(multas).reduce((acc, val) => acc + Number(val || 0), 0);
        totalJurosAtraso += multasCliente;

        // 3. Cálculos financeiros gerais
        let valorJaPago = p * pagas;
        let valorTotComJuros = valorTot + multasCliente;
        let saldoAberto = valorTotComJuros - valorJaPago;
        if (saldoAberto < 0) saldoAberto = 0;

        emprestado += v;
        recebido += valorJaPago;
        aberto += saldoAberto;
    });

    // 4. Atualizar elementos padrão do HTML
    const elTotal = document.getElementById("totalClientes");
    const elEmp = document.getElementById("totalEmprestado");
    const elRec = document.getElementById("totalRecebido");
    const elAbe = document.getElementById("totalAberto");
    const elLucro = document.getElementById("totalLucroEmprestimo"); // Novo elemento de Lucro
    const elJurosAtraso = document.getElementById("totalJurosAtraso"); // Elemento de Atraso

    if (elTotal) elTotal.innerText = totalClientes;
    if (elEmp) elEmp.innerText = formatarMoeda(emprestado);
    if (elRec) elRec.innerText = formatarMoeda(recebido);
    if (elAbe) elAbe.innerText = formatarMoeda(aberto);
    if (elLucro) elLucro.innerText = formatarMoeda(totalLucroEmprestimo);
    if (elJurosAtraso) elJurosAtraso.innerText = formatarMoeda(totalJurosAtraso);

    // 5. Atualizar Gráfico (com todas as fatias detalhadas)
    const ctx = document.getElementById('graficoDashboard');
    if (ctx && window.Chart) {
        if (meuGrafico) {
            meuGrafico.destroy();
        }

        meuGrafico = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Recebido', 'Em Aberto', 'Lucro Contrato', 'Juros de Atraso'],
                datasets: [{
                    data: [recebido, aberto, totalLucroEmprestimo, totalJurosAtraso],
                    backgroundColor: ['#27ae60', '#f39c12', '#2980b9', '#c0392b'],
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
