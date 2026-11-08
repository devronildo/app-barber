"""Testes dos ajustes pedidos nas rodadas de validação:
- Marcos (administrador): desativar barbeiro e excluir produto.
- Bruno (barbeiro): marcar no balcão, remarcar, cancelar e ver o próprio faturamento.
"""
from datetime import timedelta

from sqlalchemy import select

from app.models import Agendamento, Produto, Usuario
from app.utils import agora

from ..conftest import SENHA, login


def _amanha(hora: int = 10) -> str:
    dia = agora().date() + timedelta(days=1)
    return f"{dia.isoformat()}T{hora:02d}:00"


def _balcao(client, headers, dados_base, hora=10, **extra):
    corpo = {"servico_id": dados_base["servico_id"], "inicio": _amanha(hora),
             "cliente_nome": "Carlos Balcão", "cliente_telefone": "(11) 95555-0000", **extra}
    return client.post("/agendamentos/balcao", headers=headers, json=corpo)


# ---------- Barbeiro: agendamento no balcão ----------

def test_barbeiro_marca_cliente_sem_conta_na_propria_agenda(client, dados_base):
    h, _ = login(client, "rafael@example.com")
    r = _balcao(client, h, dados_base)
    assert r.status_code == 201, r.text
    ag = r.json()
    assert ag["cliente"] is None
    assert ag["cliente_nome"] == "Carlos Balcão" and ag["cliente_telefone"] == "11955550000"
    assert ag["barbeiro"]["id"] == dados_base["barbeiro_id"]
    assert len(client.get("/agendamentos", headers=h).json()) == 1


def test_balcao_respeita_conflito_de_horario(client, dados_base):
    h, _ = login(client, "rafael@example.com")
    assert _balcao(client, h, dados_base).status_code == 201
    assert _balcao(client, h, dados_base, cliente_nome="Outro").status_code == 409


def test_cliente_nao_usa_o_balcao(client, dados_base):
    h, _ = login(client, "a@example.com")
    assert _balcao(client, h, dados_base).status_code == 403


def test_admin_precisa_escolher_o_barbeiro_no_balcao(client, dados_base):
    h, _ = login(client, "admin@example.com")
    assert _balcao(client, h, dados_base).status_code == 400
    assert _balcao(client, h, dados_base, barbeiro_id=dados_base["barbeiro_id"]).status_code == 201


# ---------- Barbeiro: remarcar e cancelar ----------

def test_barbeiro_remarca_para_horario_livre(client, dados_base):
    h, _ = login(client, "rafael@example.com")
    ag = _balcao(client, h, dados_base, hora=10).json()
    r = client.post(f"/agendamentos/{ag['id']}/remarcar", headers=h, json={"inicio": _amanha(15)})
    assert r.status_code == 200, r.text
    assert r.json()["inicio"].endswith("15:00:00")
    # o horário antigo ficou livre
    assert _balcao(client, h, dados_base, hora=10, cliente_nome="Novo").status_code == 201


def test_remarcar_no_mesmo_horario_nao_conflita_com_ele_mesmo(client, dados_base):
    h, _ = login(client, "rafael@example.com")
    ag = _balcao(client, h, dados_base, hora=10).json()
    r = client.post(f"/agendamentos/{ag['id']}/remarcar", headers=h, json={"inicio": _amanha(10)})
    assert r.status_code == 200


def test_remarcar_para_horario_ocupado_e_recusado(client, dados_base):
    h, _ = login(client, "rafael@example.com")
    ag = _balcao(client, h, dados_base, hora=10).json()
    _balcao(client, h, dados_base, hora=14, cliente_nome="Outro")
    r = client.post(f"/agendamentos/{ag['id']}/remarcar", headers=h, json={"inicio": _amanha(14)})
    assert r.status_code == 409


def test_cliente_nao_remarca(client, dados_base):
    h_cli, _ = login(client, "a@example.com")
    ag = client.post("/agendamentos", headers=h_cli, json={**dados_base, "inicio": _amanha(10)}).json()
    r = client.post(f"/agendamentos/{ag['id']}/remarcar", headers=h_cli, json={"inicio": _amanha(15)})
    assert r.status_code == 403


def test_barbeiro_cancela_horario_da_propria_agenda(client, dados_base):
    h_cli, _ = login(client, "a@example.com")
    ag = client.post("/agendamentos", headers=h_cli, json={**dados_base, "inicio": _amanha(10)}).json()
    h_barb, _ = login(client, "rafael@example.com")
    r = client.post(f"/agendamentos/{ag['id']}/cancelar", headers=h_barb)
    assert r.status_code == 200 and r.json()["status"] == "cancelado"


# ---------- Barbeiro: faturamento ----------

def test_faturamento_conta_so_servicos_ja_realizados(client, dados_base, db, monkeypatch):
    from datetime import datetime, time

    from app.routers import agendamentos as rotas

    # Relógio fixo ao meio-dia: o teste não depende da hora em que roda.
    momento = datetime.combine(agora().date(), time(12, 0))
    monkeypatch.setattr(rotas, "agora", lambda: momento)
    barbeiro_user = db.scalar(select(Usuario).where(Usuario.email == "rafael@example.com"))
    cliente = db.scalar(select(Usuario).where(Usuario.email == "a@example.com"))
    passado = momento - timedelta(minutes=5)  # já realizado
    futuro = momento + timedelta(hours=3)     # ainda não aconteceu
    for inicio, status in [(passado, "confirmado"), (passado - timedelta(minutes=1), "cancelado"), (futuro, "confirmado")]:
        db.add(Agendamento(cliente_id=cliente.id, barbeiro_id=dados_base["barbeiro_id"],
                           servico_id=dados_base["servico_id"], inicio=inicio, fim=inicio + timedelta(hours=1),
                           status=status))
    db.commit()
    h, _ = login(client, "rafael@example.com")
    r = client.get("/agendamentos/meu-faturamento", headers=h)
    assert r.status_code == 200, r.text
    dados = r.json()
    assert dados["hoje"] == "45.00"  # só o confirmado que já passou (serviço de R$ 45)
    assert dados["atendimentos_hoje"] == 1
    assert dados["mes"] == "45.00"
    assert barbeiro_user.perfil == "barbeiro"


def test_faturamento_e_exclusivo_do_barbeiro(client, dados_base):
    h, _ = login(client, "a@example.com")
    assert client.get("/agendamentos/meu-faturamento", headers=h).status_code == 403


# ---------- Admin: desativar barbeiro ----------

def test_desativar_barbeiro_com_horarios_marcados_e_bloqueado(client, dados_base):
    h_cli, _ = login(client, "a@example.com")
    client.post("/agendamentos", headers=h_cli, json={**dados_base, "inicio": _amanha(10)})
    h, _ = login(client, "admin@example.com")
    r = client.delete(f"/barbeiros/{dados_base['barbeiro_id']}", headers=h)
    assert r.status_code == 409 and "agendamento" in r.json()["detail"]


def test_desativar_barbeiro_tira_da_lista_e_bloqueia_o_acesso(client, dados_base):
    h_barb, _ = login(client, "rafael@example.com")
    h, _ = login(client, "admin@example.com")
    assert client.delete(f"/barbeiros/{dados_base['barbeiro_id']}", headers=h).status_code == 204
    assert client.get("/barbeiros").json() == []
    assert client.get("/auth/me", headers=h_barb).status_code == 401
    assert client.post("/auth/login", json={"email": "rafael@example.com", "senha": SENHA}).status_code == 401


def test_barbeiro_nao_desativa_ninguem(client, dados_base):
    h, _ = login(client, "rafael@example.com")
    assert client.delete(f"/barbeiros/{dados_base['barbeiro_id']}", headers=h).status_code == 403


# ---------- Admin: excluir ou arquivar produto ----------

def _criar_produto(client, h, **extra):
    corpo = {"nome": "Pomada", "categoria": "Finalização", "quantidade": 0, "quantidade_minima": 2,
             "tipo": "venda", "preco_venda": "45.00", **extra}
    return client.post("/produtos", headers=h, json=corpo).json()


def test_produto_sem_historico_e_excluido_de_vez(client, dados_base, db):
    h, _ = login(client, "admin@example.com")
    p = _criar_produto(client, h)
    r = client.delete(f"/produtos/{p['id']}", headers=h)
    assert r.status_code == 200 and r.json()["acao"] == "excluido"
    assert db.get(Produto, p["id"]) is None


def test_produto_com_historico_e_arquivado_e_some_do_pdv(client, dados_base):
    h, _ = login(client, "admin@example.com")
    p = _criar_produto(client, h, quantidade=5)  # a quantidade inicial gera histórico
    r = client.delete(f"/produtos/{p['id']}", headers=h)
    assert r.status_code == 200 and r.json()["acao"] == "arquivado"
    assert client.get("/produtos", headers=h).json() == []
    assert client.get("/vendas/catalogo", headers=h).json() == []
    venda = client.post("/vendas", headers=h, json={"itens": [{"produto_id": p["id"], "quantidade": 1}], "forma_pagamento": "pix"})
    assert venda.status_code == 400 and "arquivado" in venda.json()["detail"]
    assert client.delete(f"/produtos/{p['id']}", headers=h).status_code == 404
