"""Dashboard do administrador: faturamento de serviços e de vendas no período."""
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import exigir_perfil
from ..models import Agendamento, Barbeiro, ItemVenda, Produto, Servico, Usuario, Venda
from ..schemas import Dashboard, ItemRanking, PontoDia
from ..utils import agora

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

ZERO = Decimal("0")


def _intervalo(periodo: str, hoje: date) -> tuple[date, date]:
    if periodo == "hoje":
        return hoje, hoje
    if periodo == "7d":
        return hoje - timedelta(days=6), hoje
    if periodo == "mes":
        return hoje.replace(day=1), hoje
    return hoje - timedelta(days=29), hoje


def _faturamento(db: Session, inicio: date, fim: date, momento: datetime):
    """Atendimentos realizados (confirmados e já ocorridos) e vendas concluídas no intervalo."""
    de = datetime.combine(inicio, time.min)
    ate = min(datetime.combine(fim + timedelta(days=1), time.min), momento)
    atendimentos = db.execute(
        select(Agendamento.inicio, Servico.nome, Servico.preco, Barbeiro.nome)
        .join(Servico, Agendamento.servico_id == Servico.id)
        .join(Barbeiro, Agendamento.barbeiro_id == Barbeiro.id)
        .where(Agendamento.status == "confirmado", Agendamento.inicio >= de, Agendamento.inicio < ate)
    ).all()
    vendas = db.scalars(
        select(Venda).where(
            Venda.status == "concluida",
            Venda.criado_em >= de,
            Venda.criado_em < datetime.combine(fim + timedelta(days=1), time.min),
        )
    ).all()
    return atendimentos, vendas


@router.get("", response_model=Dashboard)
def dashboard(
    periodo: Literal["hoje", "7d", "30d", "mes"] = Query("30d"),
    db: Session = Depends(get_db),
    _admin: Usuario = Depends(exigir_perfil("admin")),
):
    momento = agora()
    hoje = momento.date()
    inicio, fim = _intervalo(periodo, hoje)
    atendimentos, vendas = _faturamento(db, inicio, fim, momento)

    total_servicos = sum((a[2] for a in atendimentos), ZERO)
    total_vendas = sum((v.total for v in vendas), ZERO)
    total = total_servicos + total_vendas

    # Mesmo tamanho de período, imediatamente antes, para comparar.
    dias = (fim - inicio).days + 1
    ant_inicio, ant_fim = inicio - timedelta(days=dias), inicio - timedelta(days=1)
    ant_atend, ant_vendas = _faturamento(db, ant_inicio, ant_fim, momento)
    total_anterior = sum((a[2] for a in ant_atend), ZERO) + sum((v.total for v in ant_vendas), ZERO)
    # Só compara se o sistema já tinha registros desde o início do período anterior;
    # senão a porcentagem sai enorme e engana.
    primeiros = [
        d for d in (db.scalar(select(func.min(Agendamento.inicio))), db.scalar(select(func.min(Venda.criado_em)))) if d
    ]
    tem_historico = bool(primeiros) and min(primeiros).date() <= ant_inicio
    variacao = (
        float((total - total_anterior) / total_anterior * 100) if total_anterior and tem_historico else None
    )

    # Série diária
    por_dia = {inicio + timedelta(days=i): [ZERO, ZERO] for i in range(dias)}
    for quando, _nome, preco, _barbeiro in atendimentos:
        por_dia[quando.date()][0] += preco
    for v in vendas:
        por_dia[v.criado_em.date()][1] += v.total

    # Rankings
    servicos: dict[str, list] = defaultdict(lambda: [0, ZERO])
    barbeiros: dict[str, list] = defaultdict(lambda: [0, ZERO])
    for _quando, nome, preco, barbeiro in atendimentos:
        servicos[nome][0] += 1
        servicos[nome][1] += preco
        barbeiros[barbeiro][0] += 1
        barbeiros[barbeiro][1] += preco

    produtos: dict[str, list] = defaultdict(lambda: [0, ZERO])
    formas: dict[str, Decimal] = defaultdict(lambda: ZERO)
    ids_vendas = [v.id for v in vendas]
    if ids_vendas:
        for nome, qtd, valor in db.execute(
            select(ItemVenda.nome_produto, func.sum(ItemVenda.quantidade), func.sum(ItemVenda.subtotal))
            .where(ItemVenda.venda_id.in_(ids_vendas))
            .group_by(ItemVenda.nome_produto)
        ):
            produtos[nome] = [int(qtd), Decimal(valor)]
    for v in vendas:
        formas[v.forma_pagamento] += v.total

    def ranking(dados: dict, limite: int = 5) -> list[ItemRanking]:
        ordenado = sorted(dados.items(), key=lambda kv: kv[1][1], reverse=True)[:limite]
        return [ItemRanking(nome=n, quantidade=q, valor=val) for n, (q, val) in ordenado]

    de = datetime.combine(inicio, time.min)
    ate = datetime.combine(fim + timedelta(days=1), time.min)
    cancelamentos = db.scalar(
        select(func.count(Agendamento.id)).where(
            Agendamento.status == "cancelado", Agendamento.inicio >= de, Agendamento.inicio < ate
        )
    )
    hoje_ini = datetime.combine(hoje, time.min)
    agendados_hoje = db.scalar(
        select(func.count(Agendamento.id)).where(
            Agendamento.status == "confirmado",
            Agendamento.inicio >= hoje_ini,
            Agendamento.inicio < hoje_ini + timedelta(days=1),
        )
    )
    estoque_baixo = db.scalar(
        select(func.count(Produto.id)).where(Produto.quantidade <= Produto.quantidade_minima)
    )

    n_atend = len(atendimentos)
    return Dashboard(
        inicio=inicio,
        fim=fim,
        faturamento_total=total,
        faturamento_servicos=total_servicos,
        faturamento_vendas=total_vendas,
        atendimentos=n_atend,
        cancelamentos=cancelamentos or 0,
        vendas=len(vendas),
        ticket_medio_atendimento=(total_servicos / n_atend).quantize(Decimal("0.01")) if n_atend else ZERO,
        ticket_medio_venda=(total_vendas / len(vendas)).quantize(Decimal("0.01")) if vendas else ZERO,
        variacao_percentual=round(variacao, 1) if variacao is not None else None,
        por_dia=[PontoDia(data=d, servicos=s, vendas=v) for d, (s, v) in por_dia.items()],
        servicos_mais_feitos=ranking(servicos),
        produtos_mais_vendidos=ranking(produtos),
        por_barbeiro=ranking(barbeiros, 10),
        por_forma_pagamento=dict(formas),
        agendados_hoje=agendados_hoje or 0,
        estoque_baixo=estoque_baixo or 0,
    )
