"""Validação no servidor (Pydantic). Vale mesmo se alguém chamar a API sem passar pelo React."""
import re
from datetime import date, datetime, time
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

_HTML = re.compile(r"[<>]")


def _sem_html(valor: str | None) -> str | None:
    if valor is not None and _HTML.search(valor):
        raise ValueError("Não use os caracteres < ou >.")
    return valor


def _telefone(valor: str) -> str:
    digitos = re.sub(r"\D", "", valor)
    if len(digitos) not in (10, 11):
        raise ValueError("Informe o telefone com DDD, por exemplo (11) 91234-5678.")
    return digitos


Nome = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=2, max_length=100), AfterValidator(_sem_html)
]
TextoCurto = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=2, max_length=50), AfterValidator(_sem_html)
]
Observacao = Annotated[
    str | None, StringConstraints(strip_whitespace=True, max_length=200), AfterValidator(_sem_html)
]
Telefone = Annotated[str, StringConstraints(max_length=20), AfterValidator(_telefone)]

SENHAS_COMUNS = {
    "12345678", "123456789", "1234567890", "password", "senha123", "senha1234",
    "qwerty123", "abc12345", "11111111", "00000000", "87654321", "iloveyou",
    "barbearia", "barbearia123", "admin123", "mudar123",
}


def validar_senha_forte(senha: str, email: str, nome: str) -> None:
    """Regras do RNF01: mínimo 8 caracteres, não comum, não parecida com e-mail ou nome."""
    if len(senha) < 8:
        raise ValueError("A senha precisa ter pelo menos 8 caracteres.")
    if len(senha.encode("utf-8")) > 72:
        raise ValueError("A senha pode ter no máximo 72 caracteres.")
    baixa = senha.lower()
    if baixa in SENHAS_COMUNS or baixa.isdigit():
        raise ValueError("Essa senha é muito comum. Use letras e números.")
    usuario_email = email.split("@")[0].lower()
    partes_nome = [p.lower() for p in nome.split() if len(p) >= 3]
    if (len(usuario_email) >= 3 and usuario_email in baixa) or any(p in baixa for p in partes_nome):
        raise ValueError("A senha não pode conter seu nome ou seu e-mail.")


# ---------- Usuários e autenticação ----------

class CadastroCliente(BaseModel):
    nome: Nome
    email: EmailStr
    telefone: Telefone
    senha: str = Field(max_length=128)

    @field_validator("email")
    @classmethod
    def email_minusculo(cls, v: str) -> str:
        return v.lower()

    @model_validator(mode="after")
    def senha_valida(self):
        validar_senha_forte(self.senha, self.email, self.nome)
        return self


class Login(BaseModel):
    email: EmailStr
    senha: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def email_minusculo(cls, v: str) -> str:
        return v.lower()


class RefreshIn(BaseModel):
    refresh_token: str = Field(min_length=10, max_length=2000)


class UsuarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
    email: str
    telefone: str
    perfil: str
    trocar_senha: bool = False


class EsqueciSenha(BaseModel):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def email_minusculo(cls, v: str) -> str:
        return v.lower()


class EsqueciSenhaResposta(BaseModel):
    mensagem: str
    link_dev: str | None = None  # só em desenvolvimento, sem SMTP configurado


class RedefinirSenha(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    nova_senha: str = Field(min_length=1, max_length=128)


class TrocarSenha(BaseModel):
    senha_atual: str = Field(min_length=1, max_length=128)
    nova_senha: str = Field(min_length=1, max_length=128)


class SenhaTemporariaOut(BaseModel):
    senha_temporaria: str
    mensagem: str


class TokensOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    usuario: UsuarioOut


# ---------- Barbeiros ----------

class HorarioIn(BaseModel):
    dia_semana: int = Field(ge=0, le=6, description="0 = segunda ... 6 = domingo")
    hora_inicio: time
    hora_fim: time

    @model_validator(mode="after")
    def intervalo(self):
        if self.hora_fim <= self.hora_inicio:
            raise ValueError("O horário final precisa ser depois do horário inicial.")
        return self


class HorarioOut(HorarioIn):
    model_config = ConfigDict(from_attributes=True)

    id: int


def _sem_sobreposicao(horarios: list[HorarioIn]) -> list[HorarioIn]:
    ordenados = sorted(horarios, key=lambda h: (h.dia_semana, h.hora_inicio))
    for anterior, atual in zip(ordenados, ordenados[1:]):
        if anterior.dia_semana == atual.dia_semana and atual.hora_inicio < anterior.hora_fim:
            raise ValueError("Há horários repetidos ou sobrepostos no mesmo dia.")
    return horarios


Horarios = Annotated[list[HorarioIn], Field(min_length=1, max_length=21), AfterValidator(_sem_sobreposicao)]


class BarbeiroCriar(BaseModel):
    nome: Nome
    email: EmailStr
    telefone: Telefone
    senha: str = Field(max_length=128)
    horarios: Horarios

    @field_validator("email")
    @classmethod
    def email_minusculo(cls, v: str) -> str:
        return v.lower()

    @model_validator(mode="after")
    def senha_valida(self):
        validar_senha_forte(self.senha, self.email, self.nome)
        return self


class BarbeiroHorarios(BaseModel):
    horarios: Horarios


class BarbeiroOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
    horarios: list[HorarioOut]


class BarbeiroResumo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str


# ---------- Serviços ----------

class ServicoCriar(BaseModel):
    nome: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=80), AfterValidator(_sem_html)]
    preco: Decimal = Field(gt=0, le=10000, max_digits=8, decimal_places=2)
    duracao_min: int = Field(ge=10, le=240)


class ServicoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
    preco: Decimal
    duracao_min: int


# ---------- Agendamentos ----------

class HorarioDisponivel(BaseModel):
    hora: str
    disponivel: bool


class DisponibilidadeOut(BaseModel):
    data: date
    barbeiro_id: int
    servico_id: int
    horarios: list[HorarioDisponivel]


class AgendamentoCriar(BaseModel):
    barbeiro_id: int = Field(gt=0)
    servico_id: int = Field(gt=0)
    inicio: datetime
    observacao: Observacao = None

    @field_validator("inicio")
    @classmethod
    def sem_fuso(cls, v: datetime) -> datetime:
        # O front envia a hora local da barbearia (ex.: 2026-12-15T11:00).
        return v.replace(tzinfo=None, second=0, microsecond=0)


class ClienteResumo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str


class AgendamentoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    inicio: datetime
    fim: datetime
    status: str
    observacao: str | None
    servico: ServicoOut
    barbeiro: BarbeiroResumo
    cliente: ClienteResumo


# ---------- Estoque ----------

Preco = Annotated[Decimal, Field(gt=0, le=100000, max_digits=8, decimal_places=2)]


class _DadosProduto(BaseModel):
    nome: Nome
    categoria: TextoCurto
    tipo: Literal["consumo", "venda"] = "consumo"
    preco_venda: Preco | None = None
    quantidade_minima: int = Field(ge=0, le=100000)

    @model_validator(mode="after")
    def preco_conforme_tipo(self):
        if self.tipo == "venda" and self.preco_venda is None:
            raise ValueError("Informe o preço de venda para produtos vendidos no PDV.")
        if self.tipo == "consumo":
            self.preco_venda = None
        return self


class ProdutoCriar(_DadosProduto):
    quantidade: int = Field(ge=0, le=100000)


class ProdutoAtualizar(_DadosProduto):
    """Edição de cadastro. A quantidade só muda por movimentação (fica no histórico)."""


class ProdutoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
    categoria: str
    tipo: str
    preco_venda: Decimal | None
    quantidade: int
    quantidade_minima: int
    estoque_baixo: bool


class MovimentacaoCriar(BaseModel):
    tipo: Literal["entrada", "saida"]
    quantidade: int = Field(gt=0, le=10000)
    observacao: Observacao = None


class MovimentacaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    produto_id: int
    tipo: str
    quantidade: int
    saldo_apos: int
    observacao: str | None
    criado_em: datetime


class MovimentacaoResultado(BaseModel):
    movimentacao: MovimentacaoOut
    produto: ProdutoOut
    alerta: str | None = None


# ---------- PDV (vendas) ----------

class ItemVendaIn(BaseModel):
    produto_id: int = Field(gt=0)
    quantidade: int = Field(gt=0, le=1000)


def _itens_unicos(itens: list[ItemVendaIn]) -> list[ItemVendaIn]:
    ids = [i.produto_id for i in itens]
    if len(ids) != len(set(ids)):
        raise ValueError("O mesmo produto aparece duas vezes. Ajuste a quantidade em um único item.")
    return itens


class VendaCriar(BaseModel):
    itens: Annotated[list[ItemVendaIn], Field(min_length=1, max_length=50), AfterValidator(_itens_unicos)]
    forma_pagamento: Literal["dinheiro", "pix", "debito", "credito"]
    desconto: Decimal = Field(default=Decimal("0"), ge=0, le=100000, max_digits=10, decimal_places=2)
    valor_recebido: Decimal | None = Field(default=None, ge=0, le=100000, max_digits=10, decimal_places=2)
    cliente_nome: Annotated[
        str | None, StringConstraints(strip_whitespace=True, max_length=100), AfterValidator(_sem_html)
    ] = None


class ItemVendaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    produto_id: int
    nome_produto: str
    quantidade: int
    preco_unitario: Decimal
    subtotal: Decimal


class VendaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    criado_em: datetime
    status: str
    forma_pagamento: str
    cliente_nome: str | None
    subtotal: Decimal
    desconto: Decimal
    total: Decimal
    valor_recebido: Decimal | None
    troco: Decimal | None
    vendedor: ClienteResumo
    itens: list[ItemVendaOut]


class VendaResultado(BaseModel):
    venda: VendaOut
    alertas: list[str] = []


class VendasDoDia(BaseModel):
    data: date
    quantidade_vendas: int
    total: Decimal
    por_forma: dict[str, Decimal]
    vendas: list[VendaOut]


# ---------- Dashboard ----------

class PontoDia(BaseModel):
    data: date
    servicos: Decimal
    vendas: Decimal


class ItemRanking(BaseModel):
    nome: str
    quantidade: int
    valor: Decimal


class Dashboard(BaseModel):
    inicio: date
    fim: date
    faturamento_total: Decimal
    faturamento_servicos: Decimal
    faturamento_vendas: Decimal
    atendimentos: int
    cancelamentos: int
    vendas: int
    ticket_medio_atendimento: Decimal
    ticket_medio_venda: Decimal
    variacao_percentual: float | None
    por_dia: list[PontoDia]
    servicos_mais_feitos: list[ItemRanking]
    produtos_mais_vendidos: list[ItemRanking]
    por_barbeiro: list[ItemRanking]
    por_forma_pagamento: dict[str, Decimal]
    agendados_hoje: int
    estoque_baixo: int
