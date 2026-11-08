"""PDV: venda de produtos do estoque de venda. Cada venda baixa o estoque e
registra a saída no histórico do produto. Administrador e barbeiros podem vender;
só o administrador cancela."""
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..deps import exigir_perfil
from ..models import ItemVenda, Produto, Usuario, Venda
from ..schemas import ProdutoOut, VendaCriar, VendaOut, VendaResultado, VendasDoDia
from ..servicos.estoque import EstoqueInsuficiente, movimentar, verificar_saida
from ..utils import agora

router = APIRouter(prefix="/vendas", tags=["PDV"])

vendedor = exigir_perfil("admin", "barbeiro")
CENTAVO = Decimal("0.01")


def _consulta():
    return select(Venda).options(selectinload(Venda.itens), selectinload(Venda.vendedor))


@router.get("/catalogo", response_model=list[ProdutoOut])
def catalogo(db: Session = Depends(get_db), _u: Usuario = Depends(vendedor)):
    """Produtos do estoque de venda, para a tela do PDV."""
    return db.scalars(
        select(Produto).where(Produto.tipo == "venda", Produto.ativo.is_(True)).order_by(Produto.nome)
    ).all()


@router.post("", response_model=VendaResultado, status_code=status.HTTP_201_CREATED)
def vender(dados: VendaCriar, db: Session = Depends(get_db), usuario: Usuario = Depends(vendedor)):
    ids = sorted(i.produto_id for i in dados.itens)
    # Trava os produtos (PostgreSQL) em ordem de id para duas vendas ao mesmo
    # tempo não venderem a mesma última unidade.
    produtos = {
        p.id: p
        for p in db.scalars(select(Produto).where(Produto.id.in_(ids)).order_by(Produto.id).with_for_update())
    }

    subtotal = Decimal("0")
    itens: list[ItemVenda] = []
    for item in dados.itens:
        produto = produtos.get(item.produto_id)
        if produto is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Produto não encontrado.")
        if not produto.ativo:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{produto.nome} foi arquivado e não está mais à venda.")
        if produto.tipo != "venda" or produto.preco_venda is None:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, f"{produto.nome} é de uso interno e não pode ser vendido."
            )
        try:
            verificar_saida(produto, item.quantidade)
        except EstoqueInsuficiente as erro:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, str(erro))
        valor = (produto.preco_venda * item.quantidade).quantize(CENTAVO)
        subtotal += valor
        itens.append(
            ItemVenda(
                produto_id=produto.id,
                nome_produto=produto.nome,
                quantidade=item.quantidade,
                preco_unitario=produto.preco_venda,
                subtotal=valor,
            )
        )

    desconto = dados.desconto.quantize(CENTAVO)
    if desconto > subtotal:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "O desconto não pode ser maior que o valor da venda.")
    total = subtotal - desconto

    troco = None
    valor_recebido = None
    if dados.forma_pagamento == "dinheiro" and dados.valor_recebido is not None:
        valor_recebido = dados.valor_recebido.quantize(CENTAVO)
        if valor_recebido < total:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "O valor recebido é menor que o total da venda.")
        troco = valor_recebido - total

    venda = Venda(
        vendedor_id=usuario.id,
        cliente_nome=dados.cliente_nome or None,
        forma_pagamento=dados.forma_pagamento,
        subtotal=subtotal,
        desconto=desconto,
        total=total,
        valor_recebido=valor_recebido,
        troco=troco,
        itens=itens,
    )
    db.add(venda)
    db.flush()

    alertas = []
    for item in itens:
        produto = produtos[item.produto_id]
        movimentar(db, produto, "saida", item.quantidade, usuario.id, f"Venda #{venda.id}")
        if produto.estoque_baixo:
            alertas.append(f"Estoque baixo: {produto.nome} ficou com {produto.quantidade} unidade(s).")

    db.commit()
    return VendaResultado(venda=db.scalar(_consulta().where(Venda.id == venda.id)), alertas=alertas)


@router.get("", response_model=VendasDoDia)
def vendas_do_dia(
    data: date | None = None,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(vendedor),
):
    dia = data or agora().date()
    inicio = datetime.combine(dia, time.min)
    consulta = (
        _consulta()
        .where(Venda.criado_em >= inicio, Venda.criado_em < inicio + timedelta(days=1))
        .order_by(Venda.criado_em.desc())
    )
    if usuario.perfil == "barbeiro":
        consulta = consulta.where(Venda.vendedor_id == usuario.id)
    vendas = db.scalars(consulta).all()

    concluidas = [v for v in vendas if v.status == "concluida"]
    por_forma: dict[str, Decimal] = {}
    for v in concluidas:
        por_forma[v.forma_pagamento] = por_forma.get(v.forma_pagamento, Decimal("0")) + v.total
    return VendasDoDia(
        data=dia,
        quantidade_vendas=len(concluidas),
        total=sum((v.total for v in concluidas), Decimal("0")),
        por_forma=por_forma,
        vendas=vendas,
    )


@router.post("/{venda_id}/cancelar", response_model=VendaOut)
def cancelar(venda_id: int, db: Session = Depends(get_db), admin: Usuario = Depends(exigir_perfil("admin"))):
    venda = db.scalar(_consulta().where(Venda.id == venda_id))
    if venda is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Venda não encontrada.")
    if venda.status == "cancelada":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Esta venda já foi cancelada.")

    # Devolve os produtos ao estoque.
    for item in venda.itens:
        produto = db.scalar(select(Produto).where(Produto.id == item.produto_id).with_for_update())
        movimentar(db, produto, "entrada", item.quantidade, admin.id, f"Cancelamento da venda #{venda.id}")
    venda.status = "cancelada"
    db.commit()
    return db.scalar(_consulta().where(Venda.id == venda.id))
