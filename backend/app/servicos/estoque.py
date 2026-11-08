"""Regras de movimentação do estoque, num lugar só.

Antes, a mesma lógica (validar saldo, somar/subtrair e gravar o histórico)
estava repetida no cadastro de produto, na movimentação manual, na venda do
PDV e no cancelamento de venda. Agora todas as rotas usam estas funções, então
a regra "o saldo nunca fica negativo e toda mudança vai para o histórico"
é garantida em um único ponto.
"""
from sqlalchemy.orm import Session

from ..models import MovimentacaoEstoque, Produto


class EstoqueInsuficiente(Exception):
    def __init__(self, produto: Produto, pedido: int) -> None:
        self.produto = produto
        self.pedido = pedido
        super().__init__(
            f"Estoque insuficiente de {produto.nome}. Disponível: {produto.quantidade} unidade(s)."
        )


def verificar_saida(produto: Produto, quantidade: int) -> None:
    """Lança EstoqueInsuficiente se não houver saldo para a saída."""
    if quantidade > produto.quantidade:
        raise EstoqueInsuficiente(produto, quantidade)


def movimentar(
    db: Session,
    produto: Produto,
    tipo: str,
    quantidade: int,
    usuario_id: int,
    observacao: str | None = None,
) -> MovimentacaoEstoque:
    """Aplica uma entrada ou saída e registra no histórico (sem dar commit:
    quem chama decide a transação, para a venda e as baixas serem atômicas)."""
    if tipo not in ("entrada", "saida"):
        raise ValueError(f"Tipo de movimentação inválido: {tipo}")
    if quantidade <= 0:
        raise ValueError("A quantidade precisa ser maior que zero.")
    if tipo == "saida":
        verificar_saida(produto, quantidade)
        produto.quantidade -= quantidade
    else:
        produto.quantidade += quantidade

    movimentacao = MovimentacaoEstoque(
        produto_id=produto.id,
        usuario_id=usuario_id,
        tipo=tipo,
        quantidade=quantidade,
        saldo_apos=produto.quantidade,
        observacao=observacao or None,
    )
    db.add(movimentacao)
    return movimentacao


def mensagem_alerta(produto: Produto) -> str | None:
    if not produto.estoque_baixo:
        return None
    return (
        f"Estoque baixo: {produto.nome} está com {produto.quantidade} "
        f"unidade(s) (mínimo {produto.quantidade_minima})."
    )
