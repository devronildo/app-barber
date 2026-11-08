"""Entidades: Usuario, Barbeiro, HorarioAtendimento, Servico, Agendamento,
Produto, MovimentacaoEstoque e TokenRevogado."""
from datetime import datetime, time
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Time,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base
from .utils import agora

PERFIS = ("cliente", "barbeiro", "admin")


class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    telefone: Mapped[str] = mapped_column(String(20))
    senha_hash: Mapped[str] = mapped_column(String(255))
    perfil: Mapped[str] = mapped_column(String(20), default="cliente")
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)
    # True depois que o administrador gera uma senha temporária: o usuário
    # precisa criar uma senha nova antes de usar o sistema.
    trocar_senha: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    # Sobe a cada troca/redefinição de senha; tokens com versão antiga deixam de valer.
    sessao_versao: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=agora)

    __table_args__ = (
        CheckConstraint("perfil IN ('cliente', 'barbeiro', 'admin')", name="ck_usuario_perfil"),
    )


class Barbeiro(Base):
    __tablename__ = "barbeiros"

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(String(100))
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), unique=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)

    usuario: Mapped[Usuario | None] = relationship()
    horarios: Mapped[list["HorarioAtendimento"]] = relationship(
        back_populates="barbeiro",
        cascade="all, delete-orphan",
        order_by="[HorarioAtendimento.dia_semana, HorarioAtendimento.hora_inicio]",
    )


class HorarioAtendimento(Base):
    """Dia da semana segue o Python: 0 = segunda ... 6 = domingo."""

    __tablename__ = "horarios_atendimento"

    id: Mapped[int] = mapped_column(primary_key=True)
    barbeiro_id: Mapped[int] = mapped_column(ForeignKey("barbeiros.id", ondelete="CASCADE"), index=True)
    dia_semana: Mapped[int] = mapped_column(Integer)
    hora_inicio: Mapped[time] = mapped_column(Time)
    hora_fim: Mapped[time] = mapped_column(Time)

    barbeiro: Mapped[Barbeiro] = relationship(back_populates="horarios")

    __table_args__ = (
        CheckConstraint("dia_semana BETWEEN 0 AND 6", name="ck_horario_dia"),
        CheckConstraint("hora_fim > hora_inicio", name="ck_horario_intervalo"),
    )


class Servico(Base):
    __tablename__ = "servicos"

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(String(80), unique=True)
    preco: Mapped[Decimal] = mapped_column(Numeric(8, 2))
    duracao_min: Mapped[int] = mapped_column(Integer)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)

    __table_args__ = (CheckConstraint("duracao_min > 0", name="ck_servico_duracao"),)


class Agendamento(Base):
    __tablename__ = "agendamentos"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Vazio quando o barbeiro marca para um cliente sem conta (telefone, WhatsApp, balcão).
    cliente_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), index=True)
    cliente_nome_avulso: Mapped[str | None] = mapped_column(String(100))
    cliente_telefone_avulso: Mapped[str | None] = mapped_column(String(20))
    barbeiro_id: Mapped[int] = mapped_column(ForeignKey("barbeiros.id"))
    servico_id: Mapped[int] = mapped_column(ForeignKey("servicos.id"))
    inicio: Mapped[datetime] = mapped_column(DateTime)
    fim: Mapped[datetime] = mapped_column(DateTime)
    status: Mapped[str] = mapped_column(String(20), default="confirmado")
    observacao: Mapped[str | None] = mapped_column(String(200))
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=agora)

    cliente: Mapped[Usuario | None] = relationship()
    barbeiro: Mapped[Barbeiro] = relationship()
    servico: Mapped[Servico] = relationship()

    @property
    def cliente_nome(self) -> str:
        return self.cliente.nome if self.cliente else (self.cliente_nome_avulso or "Cliente")

    @property
    def cliente_telefone(self) -> str | None:
        return self.cliente.telefone if self.cliente else self.cliente_telefone_avulso

    __table_args__ = (
        # Índice usado na busca de horários livres (RNF03).
        Index("ix_agendamentos_barbeiro_inicio", "barbeiro_id", "inicio"),
        CheckConstraint("status IN ('confirmado', 'cancelado')", name="ck_agendamento_status"),
        CheckConstraint("fim > inicio", name="ck_agendamento_intervalo"),
    )


class Produto(Base):
    """tipo = 'consumo' (usado nos atendimentos) ou 'venda' (vendido no PDV)."""

    __tablename__ = "produtos"

    id: Mapped[int] = mapped_column(primary_key=True)
    nome: Mapped[str] = mapped_column(String(100), unique=True)
    categoria: Mapped[str] = mapped_column(String(50))
    tipo: Mapped[str] = mapped_column(String(10), default="consumo", server_default="consumo")
    preco_venda: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    quantidade: Mapped[int] = mapped_column(Integer, default=0)
    quantidade_minima: Mapped[int] = mapped_column(Integer, default=0)
    # False = arquivado: some das listas e do PDV, mas o histórico continua.
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=agora)

    __table_args__ = (
        CheckConstraint("quantidade >= 0", name="ck_produto_quantidade"),
        CheckConstraint("quantidade_minima >= 0", name="ck_produto_minima"),
        CheckConstraint("tipo IN ('consumo', 'venda')", name="ck_produto_tipo"),
    )

    @property
    def estoque_baixo(self) -> bool:
        return self.quantidade <= self.quantidade_minima


class MovimentacaoEstoque(Base):
    __tablename__ = "movimentacoes_estoque"

    id: Mapped[int] = mapped_column(primary_key=True)
    produto_id: Mapped[int] = mapped_column(ForeignKey("produtos.id"), index=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"))
    tipo: Mapped[str] = mapped_column(String(10))
    quantidade: Mapped[int] = mapped_column(Integer)
    saldo_apos: Mapped[int] = mapped_column(Integer)
    observacao: Mapped[str | None] = mapped_column(String(200))
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=agora)

    produto: Mapped[Produto] = relationship()
    usuario: Mapped[Usuario] = relationship()

    __table_args__ = (
        CheckConstraint("tipo IN ('entrada', 'saida')", name="ck_mov_tipo"),
        CheckConstraint("quantidade > 0", name="ck_mov_quantidade"),
    )


FORMAS_PAGAMENTO = ("dinheiro", "pix", "debito", "credito")


class Venda(Base):
    __tablename__ = "vendas"

    id: Mapped[int] = mapped_column(primary_key=True)
    vendedor_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), index=True)
    cliente_nome: Mapped[str | None] = mapped_column(String(100))
    forma_pagamento: Mapped[str] = mapped_column(String(10))
    subtotal: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    desconto: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0)
    total: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    valor_recebido: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    troco: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    status: Mapped[str] = mapped_column(String(10), default="concluida")
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=agora, index=True)

    vendedor: Mapped[Usuario] = relationship()
    itens: Mapped[list["ItemVenda"]] = relationship(
        back_populates="venda", cascade="all, delete-orphan", order_by="ItemVenda.id"
    )

    __table_args__ = (
        CheckConstraint("forma_pagamento IN ('dinheiro', 'pix', 'debito', 'credito')", name="ck_venda_forma"),
        CheckConstraint("status IN ('concluida', 'cancelada')", name="ck_venda_status"),
        CheckConstraint("total >= 0", name="ck_venda_total"),
    )


class ItemVenda(Base):
    __tablename__ = "itens_venda"

    id: Mapped[int] = mapped_column(primary_key=True)
    venda_id: Mapped[int] = mapped_column(ForeignKey("vendas.id", ondelete="CASCADE"), index=True)
    produto_id: Mapped[int] = mapped_column(ForeignKey("produtos.id"))
    nome_produto: Mapped[str] = mapped_column(String(100))  # guarda o nome da época da venda
    quantidade: Mapped[int] = mapped_column(Integer)
    preco_unitario: Mapped[Decimal] = mapped_column(Numeric(8, 2))
    subtotal: Mapped[Decimal] = mapped_column(Numeric(10, 2))

    venda: Mapped[Venda] = relationship(back_populates="itens")

    __table_args__ = (CheckConstraint("quantidade > 0", name="ck_item_quantidade"),)


class TokenRedefinicao(Base):
    """Link de "esqueci minha senha". Guardamos só o hash do token (quem ler o
    banco não consegue usar o link), ele expira em 30 minutos e vale uma vez."""

    __tablename__ = "tokens_redefinicao"

    id: Mapped[int] = mapped_column(primary_key=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expira_em: Mapped[datetime] = mapped_column(DateTime)
    usado_em: Mapped[datetime | None] = mapped_column(DateTime)
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=agora)


class TokenRevogado(Base):
    """Tokens encerrados no logout (lista de bloqueio)."""

    __tablename__ = "tokens_revogados"

    id: Mapped[int] = mapped_column(primary_key=True)
    jti: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expira_em: Mapped[datetime] = mapped_column(DateTime)
