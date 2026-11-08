"""Testes unitários: regras isoladas, sem banco de dados e sem chamar a API."""
from datetime import date, datetime, time
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.database import normalizar_url
from app.routers import agendamentos
from app.routers.dashboard import _intervalo
from app.schemas import AgendamentoCriar, CadastroCliente, ProdutoCriar, VendaCriar, validar_senha_forte
from app.security import (
    ALFABETO_TEMPORARIA,
    LimiteTentativas,
    gerar_hash,
    gerar_senha_temporaria,
    verificar_senha,
)

# ---------- Grade de horários (RF03) ----------


class _BancoFalso:
    """Imita só o db.execute(...).all() usado para buscar os horários ocupados."""

    def __init__(self, ocupados):
        self._ocupados = ocupados

    def execute(self, _consulta):
        return SimpleNamespace(all=lambda: self._ocupados)


def _barbeiro(inicio=time(9), fim=time(12), dia_semana=2):
    janela = SimpleNamespace(dia_semana=dia_semana, hora_inicio=inicio, hora_fim=fim)
    return SimpleNamespace(id=1, horarios=[janela])


QUARTA = date(2030, 1, 2)  # 2 de janeiro de 2030 é uma quarta-feira (dia_semana=2)


@pytest.fixture()
def sem_relogio(monkeypatch):
    """Fixa o "agora" no passado para nenhum horário ser descartado."""
    monkeypatch.setattr(agendamentos, "agora", lambda: datetime(2029, 12, 31, 8, 0))


def test_grade_de_30_em_30_minutos_dentro_do_expediente(sem_relogio):
    servico = SimpleNamespace(duracao_min=30)
    grade = agendamentos.calcular_grade(_BancoFalso([]), _barbeiro(), servico, QUARTA)
    horas = [h.strftime("%H:%M") for h, _ in grade]
    assert horas == ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"]
    assert all(livre for _, livre in grade)


def test_servico_longo_nao_passa_do_fim_do_expediente(sem_relogio):
    servico = SimpleNamespace(duracao_min=60)
    grade = agendamentos.calcular_grade(_BancoFalso([]), _barbeiro(), servico, QUARTA)
    assert grade[-1][0].strftime("%H:%M") == "11:00"  # 11:00 + 1h = 12:00, último que cabe


def test_horario_que_cruza_outro_agendamento_fica_ocupado(sem_relogio):
    ocupado = [(datetime(2030, 1, 2, 10, 0), datetime(2030, 1, 2, 11, 0))]
    servico = SimpleNamespace(duracao_min=60)
    grade = dict(agendamentos.calcular_grade(_BancoFalso(ocupado), _barbeiro(), servico, QUARTA))
    assert grade[datetime(2030, 1, 2, 9, 0)] is True
    assert grade[datetime(2030, 1, 2, 9, 30)] is False  # 9:30–10:30 cruza 10:00–11:00
    assert grade[datetime(2030, 1, 2, 10, 30)] is False
    assert grade[datetime(2030, 1, 2, 11, 0)] is True


def test_dia_sem_expediente_nao_tem_horarios(sem_relogio):
    servico = SimpleNamespace(duracao_min=30)
    quinta = date(2030, 1, 3)
    assert agendamentos.calcular_grade(_BancoFalso([]), _barbeiro(), servico, quinta) == []


def test_horarios_que_ja_passaram_nao_aparecem(monkeypatch):
    monkeypatch.setattr(agendamentos, "agora", lambda: datetime(2030, 1, 2, 10, 15))
    servico = SimpleNamespace(duracao_min=30)
    grade = agendamentos.calcular_grade(_BancoFalso([]), _barbeiro(), servico, QUARTA)
    assert [h.strftime("%H:%M") for h, _ in grade] == ["10:30", "11:00", "11:30"]


# ---------- Senhas (RNF01) ----------


def test_hash_bcrypt_nao_guarda_a_senha_e_confere():
    senha_hash = gerar_hash("Navalha#Unit2030")
    assert senha_hash.startswith("$2b$") and "Navalha" not in senha_hash
    assert verificar_senha("Navalha#Unit2030", senha_hash) is True
    assert verificar_senha("outra-senha", senha_hash) is False


def test_mesma_senha_gera_hashes_diferentes_por_causa_do_salt():
    assert gerar_hash("Navalha#Unit2030") != gerar_hash("Navalha#Unit2030")


@pytest.mark.parametrize(
    "senha, motivo",
    [
        ("curta1", "8 caracteres"),
        ("12345678", "comum"),
        ("joaosilva2030", "nome ou seu e-mail"),
        ("xx-joao-xx99", "nome ou seu e-mail"),
    ],
)
def test_senha_fraca_e_recusada(senha, motivo):
    with pytest.raises(ValueError, match=motivo):
        validar_senha_forte(senha, "joao@example.com", "Joao Silva")


def test_senha_forte_e_aceita():
    validar_senha_forte("Tesoura#Forte2030", "joao@example.com", "Joao Silva")


def test_senha_temporaria_tem_formato_legivel_e_sem_letras_confusas():
    senha = gerar_senha_temporaria()
    blocos = senha.split("-")
    assert len(blocos) == 3 and all(len(b) == 4 for b in blocos)
    assert all(c in ALFABETO_TEMPORARIA for c in senha.replace("-", ""))
    assert not set("0O1lI") & set(senha)


def test_limite_de_tentativas_bloqueia_e_libera():
    limite = LimiteTentativas(maximo=3, janela_segundos=60)
    for _ in range(3):
        assert limite.bloqueado("a@example.com") is False
        limite.registrar_falha("a@example.com")
    assert limite.bloqueado("a@example.com") is True
    assert limite.bloqueado("b@example.com") is False  # outro e-mail não é afetado
    limite.limpar("a@example.com")
    assert limite.bloqueado("a@example.com") is False


# ---------- Validação de entradas (RNF02) ----------


def test_telefone_e_normalizado_para_digitos():
    dados = CadastroCliente(nome="Joao Silva", email="JOAO@Example.com", telefone="(11) 98765-4321", senha="Pente#Fino2030")
    assert dados.telefone == "11987654321"
    assert dados.email == "joao@example.com"


def test_texto_com_html_e_recusado():
    with pytest.raises(ValidationError):
        AgendamentoCriar(barbeiro_id=1, servico_id=1, inicio="2030-01-02T10:00", observacao="<script>x</script>")


def test_produto_de_venda_sem_preco_e_recusado():
    with pytest.raises(ValidationError, match="preço de venda"):
        ProdutoCriar(nome="Pomada", categoria="Barba", tipo="venda", quantidade=1, quantidade_minima=0)


def test_produto_de_consumo_ignora_preco():
    p = ProdutoCriar(nome="Lâmina", categoria="Barba", tipo="consumo", preco_venda="9.90", quantidade=1, quantidade_minima=0)
    assert p.preco_venda is None


def test_venda_nao_aceita_o_mesmo_produto_duas_vezes():
    with pytest.raises(ValidationError, match="duas vezes"):
        VendaCriar(itens=[{"produto_id": 1, "quantidade": 1}, {"produto_id": 1, "quantidade": 2}], forma_pagamento="pix")


# ---------- Utilitários ----------


@pytest.mark.parametrize(
    "periodo, esperado",
    [
        ("hoje", (date(2030, 1, 15), date(2030, 1, 15))),
        ("7d", (date(2030, 1, 9), date(2030, 1, 15))),
        ("mes", (date(2030, 1, 1), date(2030, 1, 15))),
        ("30d", (date(2029, 12, 17), date(2030, 1, 15))),
    ],
)
def test_intervalo_do_dashboard(periodo, esperado):
    assert _intervalo(periodo, date(2030, 1, 15)) == esperado


def test_url_do_postgres_do_render_e_convertida():
    assert normalizar_url("postgres://u:s@h/db") == "postgresql+psycopg://u:s@h/db"
    assert normalizar_url("postgresql://u:s@h/db") == "postgresql+psycopg://u:s@h/db"
    assert normalizar_url("sqlite:///x.db") == "sqlite:///x.db"
