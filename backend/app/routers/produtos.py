"""RF05 (cadastro de produtos), RF06 (entradas e saídas) e RF07 (alerta de estoque baixo).
Todas as rotas são exclusivas do administrador."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import exigir_perfil
from ..models import MovimentacaoEstoque, Produto, Usuario
from ..servicos.estoque import EstoqueInsuficiente, mensagem_alerta, movimentar as aplicar_movimentacao
from ..schemas import (
    MovimentacaoCriar,
    MovimentacaoOut,
    MovimentacaoResultado,
    ProdutoAtualizar,
    ProdutoCriar,
    ProdutoOut,
)

router = APIRouter(prefix="/produtos", tags=["Estoque"])

somente_admin = exigir_perfil("admin")


@router.get("", response_model=list[ProdutoOut])
def listar(
    baixo: bool = False,
    busca: str | None = Query(None, max_length=50),
    tipo: str | None = Query(None, pattern="^(consumo|venda)$"),
    db: Session = Depends(get_db),
    _admin: Usuario = Depends(somente_admin),
):
    consulta = select(Produto).order_by(Produto.nome)
    if tipo:
        consulta = consulta.where(Produto.tipo == tipo)
    if baixo:
        consulta = consulta.where(Produto.quantidade <= Produto.quantidade_minima)
    if busca:
        # O ORM envia o texto como parâmetro: não há SQL montado com o que o usuário digitou.
        consulta = consulta.where(Produto.nome.ilike(f"%{busca}%"))
    return db.scalars(consulta).all()


@router.get("/alertas", response_model=list[ProdutoOut])
def alertas(db: Session = Depends(get_db), _admin: Usuario = Depends(somente_admin)):
    return db.scalars(
        select(Produto)
        .where(Produto.quantidade <= Produto.quantidade_minima)
        .order_by(Produto.quantidade)
    ).all()


@router.post("", response_model=ProdutoOut, status_code=status.HTTP_201_CREATED)
def criar(dados: ProdutoCriar, db: Session = Depends(get_db), admin: Usuario = Depends(somente_admin)):
    if db.scalar(select(Produto.id).where(Produto.nome == dados.nome)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Já existe um produto com esse nome.")
    produto = Produto(**dados.model_dump(exclude={"quantidade"}), quantidade=0)
    db.add(produto)
    db.flush()
    if dados.quantidade > 0:
        aplicar_movimentacao(db, produto, "entrada", dados.quantidade, admin.id, "Quantidade inicial")
    db.commit()
    db.refresh(produto)
    return produto


@router.put("/{produto_id}", response_model=ProdutoOut)
def atualizar(
    produto_id: int,
    dados: ProdutoAtualizar,
    db: Session = Depends(get_db),
    _admin: Usuario = Depends(somente_admin),
):
    produto = db.get(Produto, produto_id)
    if produto is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Produto não encontrado.")
    if db.scalar(select(Produto.id).where(Produto.nome == dados.nome, Produto.id != produto_id)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Já existe um produto com esse nome.")
    for campo, valor in dados.model_dump().items():
        setattr(produto, campo, valor)
    db.commit()
    db.refresh(produto)
    return produto


@router.post("/{produto_id}/movimentacoes", response_model=MovimentacaoResultado, status_code=status.HTTP_201_CREATED)
def movimentar(
    produto_id: int,
    dados: MovimentacaoCriar,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(somente_admin),
):
    # with_for_update trava o produto no PostgreSQL para duas saídas simultâneas
    # não deixarem o saldo negativo.
    produto = db.scalar(select(Produto).where(Produto.id == produto_id).with_for_update())
    if produto is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Produto não encontrado.")
    try:
        movimentacao = aplicar_movimentacao(
            db, produto, dados.tipo, dados.quantidade, admin.id, dados.observacao
        )
    except EstoqueInsuficiente:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Saída maior que o estoque. Disponível: {produto.quantidade} unidade(s).",
        )
    db.commit()
    db.refresh(produto)
    db.refresh(movimentacao)
    return MovimentacaoResultado(
        movimentacao=MovimentacaoOut.model_validate(movimentacao),
        produto=ProdutoOut.model_validate(produto),
        alerta=mensagem_alerta(produto),
    )


@router.get("/{produto_id}/movimentacoes", response_model=list[MovimentacaoOut])
def historico(
    produto_id: int,
    limite: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _admin: Usuario = Depends(somente_admin),
):
    if db.get(Produto, produto_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Produto não encontrado.")
    return db.scalars(
        select(MovimentacaoEstoque)
        .where(MovimentacaoEstoque.produto_id == produto_id)
        .order_by(MovimentacaoEstoque.criado_em.desc(), MovimentacaoEstoque.id.desc())
        .limit(limite)
    ).all()
