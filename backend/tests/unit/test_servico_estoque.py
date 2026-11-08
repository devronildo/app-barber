"""Testes unitários do serviço de estoque (sem banco: o db é um objeto falso)."""
import pytest

from app.models import Produto
from app.servicos.estoque import EstoqueInsuficiente, mensagem_alerta, movimentar


class _BancoFalso:
    def __init__(self):
        self.adicionados = []

    def add(self, obj):
        self.adicionados.append(obj)


def _produto(quantidade=10, minimo=3):
    return Produto(id=1, nome="Pomada", categoria="Barba", tipo="venda", quantidade=quantidade, quantidade_minima=minimo)


def test_entrada_soma_e_registra_no_historico():
    db, produto = _BancoFalso(), _produto(10)
    mov = movimentar(db, produto, "entrada", 5, usuario_id=7, observacao="Compra")
    assert produto.quantidade == 15
    assert (mov.tipo, mov.quantidade, mov.saldo_apos, mov.usuario_id) == ("entrada", 5, 15, 7)
    assert db.adicionados == [mov]


def test_saida_subtrai():
    db, produto = _BancoFalso(), _produto(10)
    mov = movimentar(db, produto, "saida", 4, usuario_id=7)
    assert produto.quantidade == 6 and mov.saldo_apos == 6 and mov.observacao is None


def test_saida_maior_que_o_saldo_nao_altera_nada():
    db, produto = _BancoFalso(), _produto(2)
    with pytest.raises(EstoqueInsuficiente, match="Disponível: 2"):
        movimentar(db, produto, "saida", 3, usuario_id=7)
    assert produto.quantidade == 2 and db.adicionados == []


@pytest.mark.parametrize("tipo, quantidade", [("ajuste", 1), ("entrada", 0), ("saida", -1)])
def test_tipo_ou_quantidade_invalidos_sao_recusados(tipo, quantidade):
    with pytest.raises(ValueError):
        movimentar(_BancoFalso(), _produto(), tipo, quantidade, usuario_id=7)


def test_alerta_so_aparece_no_minimo_ou_abaixo():
    assert mensagem_alerta(_produto(4, 3)) is None
    assert "Estoque baixo" in mensagem_alerta(_produto(3, 3))
