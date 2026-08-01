// CALCULAR ATRASO E PARCELAS ESPERADAS (CORRIGIDO)
export function calcularAtraso(cliente) {
    if (!cliente.data) return { atraso: 0, esperadas: 0, status: 'verde' };

    const tipo = cliente.tipoEmprestimo || 'diario';
    const totalParcelas = Number(cliente.totalParcelas) || (tipo === 'diario' ? 24 : 1);
    const [ano, mes, dia] = cliente.data.split('-').map(Number);
    let dataInicio = new Date(ano, mes - 1, dia);

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    let esperadasVencidas = 0; // Quantas já venceram ANTES de hoje
    let venceHoje = false;     // Se tem alguma vencendo HOJE
    let dataAtual = new Date(dataInicio);

    for (let i = 1; i <= totalParcelas; i++) {
        // 1. Avança primeiro a data
        if (tipo === 'diario') {
            dataAtual.setDate(dataAtual.getDate() + 1);
            if (dataAtual.getDay() === 0) dataAtual.setDate(dataAtual.getDate() + 1); // Pula domingo
        } else if (tipo === 'semanal') {
            dataAtual.setDate(dataAtual.getDate() + 7);
        } else if (tipo === 'mensal') {
            dataAtual.setMonth(dataAtual.getMonth() + 1);
        }

        // 2. Compara com 'hoje' zerado
        const dataComparar = new Date(dataAtual);
        dataComparar.setHours(0, 0, 0, 0);

        if (dataComparar < hoje) {
            esperadasVencidas++;
        } else if (dataComparar.getTime() === hoje.getTime()) {
            venceHoje = true;
        } else {
            break; // Datas futuras
        }
    }

    const pagas = Number(cliente.pagas) || 0;

    // Atrasadas são as que venceram até ontem e ainda não foram pagas
    let atraso = esperadasVencidas - pagas;
    if (atraso < 0) atraso = 0;

    let status = "verde";

    if (atraso > 0) {
        // Tem pelo menos 1 parcela de dias anteriores pendente -> Vermelho
        status = "vermelho";
    } else if (venceHoje && pagas === esperadasVencidas) {
        // Ta em dia com os dias anteriores, mas tem a parcela de HOJE pra pagar -> Amarelo
        status = "amarelo";
    }

    return {
        atraso,
        esperadas: esperadasVencidas + (venceHoje ? 1 : 0),
        status
    };
}