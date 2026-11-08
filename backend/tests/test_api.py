"""Testes dos critérios de aceitação dos RFs e dos RNF01/RNF02."""
from datetime import timedelta

from sqlalchemy import select

from app.models import Agendamento, Usuario
from app.utils import agora

from .conftest import SENHA, login


def _proximo_horario(horas: int) -> str:
    alvo = agora() + timedelta(hours=horas)
    alvo = alvo.replace(minute=0 if alvo.minute < 30 else 30, second=0) + timedelta(minutes=30)
    return alvo.strftime("%Y-%m-%dT%H:%M")


# ---------- RF01 / RNF01 ----------

def test_cadastro_e_login(client, db):
    r = client.post("/auth/cadastro", json={
        "nome": "Joao Silva", "email": "Joao@Example.com", "telefone": "(11) 98765-4321",
        "senha": "Pente#Fino2026",
    })
    assert r.status_code == 201, r.text
    assert "senha" not in r.json()["usuario"] and "senha_hash" not in r.json()["usuario"]
    headers, _ = login(client, "joao@example.com", "Pente#Fino2026")
    assert client.get("/auth/me", headers=headers).json()["perfil"] == "cliente"


def test_senha_guardada_como_hash_bcrypt(client, db):
    client.post("/auth/cadastro", json={
        "nome": "Joao Silva", "email": "joao@example.com", "telefone": "11987654321",
        "senha": "Pente#Fino2026",
    })
    usuario = db.scalar(select(Usuario).where(Usuario.email == "joao@example.com"))
    assert usuario.senha_hash.startswith("$2b$")
    assert "Pente#Fino2026" not in usuario.senha_hash


def test_email_duplicado_recusado(client, dados_base):
    r = client.post("/auth/cadastro", json={
        "nome": "Outro", "email": "a@example.com", "telefone": "11987654321", "senha": "Pente#Fino2026",
    })
    assert r.status_code == 409


def test_senha_fraca_recusada(client, db):
    r = client.post("/auth/cadastro", json={
        "nome": "Joao Silva", "email": "joao@example.com", "telefone": "11987654321", "senha": "12345678",
    })
    assert r.status_code == 400
    assert r.json()["erros"][0]["mensagem"]


def test_login_invalido_mensagem_generica(client, dados_base):
    r1 = client.post("/auth/login", json={"email": "a@example.com", "senha": "errada123"})
    r2 = client.post("/auth/login", json={"email": "naoexiste@example.com", "senha": "errada123"})
    assert r1.status_code == r2.status_code == 401
    assert r1.json()["detail"] == r2.json()["detail"] == "E-mail ou senha inválidos."


def test_bloqueio_apos_5_tentativas(client, dados_base):
    for _ in range(5):
        assert client.post("/auth/login", json={"email": "a@example.com", "senha": "errada"}).status_code == 401
    r = client.post("/auth/login", json={"email": "a@example.com", "senha": SENHA})
    assert r.status_code == 429


def test_rota_protegida_sem_token(client, dados_base):
    assert client.get("/agendamentos").status_code == 401


def test_logout_encerra_sessao(client, dados_base):
    headers, refresh = login(client, "a@example.com")
    assert client.post("/auth/logout", json={"refresh_token": refresh}, headers=headers).status_code == 204
    assert client.get("/auth/me", headers=headers).status_code == 401
    assert client.post("/auth/refresh", json={"refresh_token": refresh}).status_code == 401


# ---------- RF02 ----------

def test_cliente_nao_cadastra_barbeiro(client, dados_base):
    headers, _ = login(client, "a@example.com")
    r = client.post("/barbeiros", headers=headers, json={
        "nome": "Novo", "email": "novo@example.com", "telefone": "11900000009", "senha": "Pente#Fino2026",
        "horarios": [{"dia_semana": 1, "hora_inicio": "09:00", "hora_fim": "18:00"}],
    })
    assert r.status_code == 403


def test_admin_cadastra_barbeiro(client, dados_base):
    headers, _ = login(client, "admin@example.com")
    r = client.post("/barbeiros", headers=headers, json={
        "nome": "Diego", "email": "diego@example.com", "telefone": "11900000009", "senha": "Pente#Fino2026",
        "horarios": [{"dia_semana": 1, "hora_inicio": "09:00", "hora_fim": "18:00"}],
    })
    assert r.status_code == 201, r.text
    assert any(b["nome"] == "Diego" for b in client.get("/barbeiros").json())


# ---------- RF03 / RF04 ----------

def test_agendamento_sem_conflito(client, dados_base):
    h_a, _ = login(client, "a@example.com")
    h_b, _ = login(client, "b@example.com")
    inicio = _proximo_horario(5)
    corpo = {**dados_base, "inicio": inicio}
    assert client.post("/agendamentos", headers=h_a, json=corpo).status_code == 201
    assert client.post("/agendamentos", headers=h_b, json=corpo).status_code == 409

    data = inicio[:10]
    disp = client.get("/agendamentos/disponibilidade", headers=h_b,
                      params={**dados_base, "data": data}).json()
    hora = inicio[11:]
    assert next(h for h in disp["horarios"] if h["hora"] == hora)["disponivel"] is False


def test_cancelamento_libera_horario(client, dados_base):
    h_a, _ = login(client, "a@example.com")
    inicio = _proximo_horario(5)
    ag = client.post("/agendamentos", headers=h_a, json={**dados_base, "inicio": inicio}).json()
    r = client.post(f"/agendamentos/{ag['id']}/cancelar", headers=h_a)
    assert r.status_code == 200 and r.json()["status"] == "cancelado"
    h_b, _ = login(client, "b@example.com")
    assert client.post("/agendamentos", headers=h_b, json={**dados_base, "inicio": inicio}).status_code == 201


def test_cancelamento_com_menos_de_2_horas_recusado(client, dados_base, db):
    h_a, _ = login(client, "a@example.com")
    inicio = _proximo_horario(1)
    r = client.post("/agendamentos", headers=h_a, json={**dados_base, "inicio": inicio})
    if r.status_code != 201:  # perto da meia-noite o horário pode cair fora do dia
        return
    r = client.post(f"/agendamentos/{r.json()['id']}/cancelar", headers=h_a)
    assert r.status_code == 400
    assert "2 horas" in r.json()["detail"]


def test_cliente_nao_ve_nem_cancela_agendamento_de_outro(client, dados_base):
    h_a, _ = login(client, "a@example.com")
    h_b, _ = login(client, "b@example.com")
    ag = client.post("/agendamentos", headers=h_a, json={**dados_base, "inicio": _proximo_horario(5)}).json()
    assert client.post(f"/agendamentos/{ag['id']}/cancelar", headers=h_b).status_code == 404
    assert client.get("/agendamentos", headers=h_b).json() == []


def test_barbeiro_ve_a_propria_agenda(client, dados_base):
    h_a, _ = login(client, "a@example.com")
    client.post("/agendamentos", headers=h_a, json={**dados_base, "inicio": _proximo_horario(5)})
    h_barb, _ = login(client, "rafael@example.com")
    assert len(client.get("/agendamentos", headers=h_barb).json()) == 1


# ---------- RF05 / RF06 / RF07 ----------

def test_estoque_entrada_saida_e_alerta(client, dados_base):
    h, _ = login(client, "admin@example.com")
    p = client.post("/produtos", headers=h, json={
        "nome": "Pomada modeladora", "categoria": "Finalização", "quantidade": 6, "quantidade_minima": 5,
    }).json()
    r = client.post(f"/produtos/{p['id']}/movimentacoes", headers=h, json={"tipo": "saida", "quantidade": 10})
    assert r.status_code == 400  # saída maior que o saldo

    r = client.post(f"/produtos/{p['id']}/movimentacoes", headers=h, json={"tipo": "saida", "quantidade": 4})
    assert r.status_code == 201
    corpo = r.json()
    assert corpo["produto"]["quantidade"] == 2
    assert corpo["produto"]["estoque_baixo"] is True
    assert "Estoque baixo" in corpo["alerta"]
    assert [x["id"] for x in client.get("/produtos/alertas", headers=h).json()] == [p["id"]]

    r = client.post(f"/produtos/{p['id']}/movimentacoes", headers=h, json={"tipo": "entrada", "quantidade": 8})
    assert r.json()["produto"]["quantidade"] == 10 and r.json()["alerta"] is None
    assert len(client.get(f"/produtos/{p['id']}/movimentacoes", headers=h).json()) == 3


def test_cliente_nao_acessa_estoque(client, dados_base):
    h, _ = login(client, "a@example.com")
    assert client.get("/produtos", headers=h).status_code == 403


# ---------- RNF02: entradas maliciosas ----------

def test_xss_recusado(client, dados_base):
    h, _ = login(client, "admin@example.com")
    r = client.post("/produtos", headers=h, json={
        "nome": "<script>alert(1)</script>", "categoria": "Teste", "quantidade": 1, "quantidade_minima": 0,
    })
    assert r.status_code == 400


def test_sql_injection_nao_funciona(client, dados_base):
    r = client.post("/auth/login", json={"email": "a@example.com", "senha": "' OR '1'='1"})
    assert r.status_code == 401
    h, _ = login(client, "admin@example.com")
    r = client.get("/produtos", headers=h, params={"busca": "' OR 1=1 --"})
    assert r.status_code == 200 and r.json() == []


def test_erro_validacao_sem_detalhes_tecnicos(client, dados_base):
    r = client.post("/auth/login", content="{json quebrado", headers={"Content-Type": "application/json"})
    assert r.status_code == 400
    assert "Traceback" not in r.text


def test_cabecalhos_de_seguranca(client, db):
    r = client.get("/saude")
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert "default-src 'none'" in r.headers["Content-Security-Policy"]


# ---------- Estoque de venda, PDV e dashboard ----------

def _produto(client, h, **extra):
    corpo = {"nome": "Pomada", "categoria": "Finalização", "quantidade": 5, "quantidade_minima": 2,
             "tipo": "venda", "preco_venda": "45.00", **extra}
    r = client.post("/produtos", headers=h, json=corpo)
    assert r.status_code == 201, r.text
    return r.json()


def test_produto_de_venda_exige_preco(client, dados_base):
    h, _ = login(client, "admin@example.com")
    r = client.post("/produtos", headers=h, json={
        "nome": "Pomada", "categoria": "Finalização", "quantidade": 5, "quantidade_minima": 2, "tipo": "venda",
    })
    assert r.status_code == 400


def test_editar_produto_nao_muda_quantidade(client, dados_base):
    h, _ = login(client, "admin@example.com")
    p = _produto(client, h)
    r = client.put(f"/produtos/{p['id']}", headers=h, json={
        "nome": "Pomada matte", "categoria": "Finalização", "tipo": "venda", "preco_venda": "50.00",
        "quantidade_minima": 3, "quantidade": 999,
    })
    assert r.status_code == 200
    assert r.json()["nome"] == "Pomada matte" and r.json()["quantidade"] == 5


def test_venda_baixa_estoque_e_calcula_troco(client, dados_base):
    h, _ = login(client, "admin@example.com")
    p = _produto(client, h)
    r = client.post("/vendas", headers=h, json={
        "itens": [{"produto_id": p["id"], "quantidade": 3}], "forma_pagamento": "dinheiro",
        "desconto": "5.00", "valor_recebido": "200.00",
    })
    assert r.status_code == 201, r.text
    venda = r.json()["venda"]
    assert venda["total"] == "130.00" and venda["troco"] == "70.00"
    assert r.json()["alertas"]  # sobrou 2, que é o mínimo
    produtos = client.get("/produtos", headers=h).json()
    assert produtos[0]["quantidade"] == 2
    hist = client.get(f"/produtos/{p['id']}/movimentacoes", headers=h).json()
    assert hist[0]["observacao"] == f"Venda #{venda['id']}"


def test_venda_sem_estoque_ou_de_consumo_recusada(client, dados_base):
    h, _ = login(client, "admin@example.com")
    p = _produto(client, h)
    c = _produto(client, h, nome="Lâmina", tipo="consumo", preco_venda=None)
    r = client.post("/vendas", headers=h, json={"itens": [{"produto_id": p["id"], "quantidade": 9}], "forma_pagamento": "pix"})
    assert r.status_code == 400 and "insuficiente" in r.json()["detail"]
    r = client.post("/vendas", headers=h, json={"itens": [{"produto_id": c["id"], "quantidade": 1}], "forma_pagamento": "pix"})
    assert r.status_code == 400 and "uso interno" in r.json()["detail"]
    r = client.post("/vendas", headers=h, json={
        "itens": [{"produto_id": p["id"], "quantidade": 1}], "forma_pagamento": "pix", "desconto": "100.00"})
    assert r.status_code == 400


def test_cancelar_venda_devolve_estoque(client, dados_base):
    h, _ = login(client, "admin@example.com")
    p = _produto(client, h)
    venda = client.post("/vendas", headers=h, json={
        "itens": [{"produto_id": p["id"], "quantidade": 2}], "forma_pagamento": "pix"}).json()["venda"]
    r = client.post(f"/vendas/{venda['id']}/cancelar", headers=h)
    assert r.status_code == 200 and r.json()["status"] == "cancelada"
    assert client.get("/produtos", headers=h).json()[0]["quantidade"] == 5
    assert client.get("/vendas", headers=h).json()["total"] == "0"


def test_barbeiro_vende_mas_cliente_nao(client, dados_base):
    h_admin, _ = login(client, "admin@example.com")
    p = _produto(client, h_admin)
    h_barb, _ = login(client, "rafael@example.com")
    corpo = {"itens": [{"produto_id": p["id"], "quantidade": 1}], "forma_pagamento": "debito"}
    assert client.post("/vendas", headers=h_barb, json=corpo).status_code == 201
    h_cli, _ = login(client, "a@example.com")
    assert client.post("/vendas", headers=h_cli, json=corpo).status_code == 403
    assert client.get("/dashboard", headers=h_barb).status_code == 403


def test_dashboard_soma_vendas(client, dados_base):
    h, _ = login(client, "admin@example.com")
    p = _produto(client, h)
    client.post("/vendas", headers=h, json={"itens": [{"produto_id": p["id"], "quantidade": 2}], "forma_pagamento": "pix"})
    r = client.get("/dashboard", headers=h, params={"periodo": "hoje"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["faturamento_vendas"] == "90.00" and d["vendas"] == 1
    assert d["produtos_mais_vendidos"][0]["nome"] == "Pomada"
    assert d["por_forma_pagamento"]["pix"] == "90.00"


# ---------- Recuperação de senha ----------

NOVA = "Navalha#Nova2027"


def test_esqueci_senha_mesma_resposta_para_email_inexistente(client, dados_base):
    r1 = client.post("/auth/esqueci-senha", json={"email": "a@example.com"})
    r2 = client.post("/auth/esqueci-senha", json={"email": "ninguem@example.com"})
    assert r1.status_code == r2.status_code == 200
    assert r1.json()["mensagem"] == r2.json()["mensagem"]
    assert r2.json()["link_dev"] is None


def test_link_de_redefinicao_funciona_uma_vez_e_derruba_sessoes(client, dados_base, db):
    headers_antigos, _ = login(client, "a@example.com")
    link = client.post("/auth/esqueci-senha", json={"email": "a@example.com"}).json()["link_dev"]
    token = link.split("#token=")[1]
    from app.models import TokenRedefinicao
    assert token not in [t.token_hash for t in db.query(TokenRedefinicao).all()]  # só o hash no banco

    assert client.post("/auth/redefinir-senha", json={"token": token, "nova_senha": "123"}).status_code == 400
    assert client.post("/auth/redefinir-senha", json={"token": token, "nova_senha": NOVA}).status_code == 204
    assert client.post("/auth/redefinir-senha", json={"token": token, "nova_senha": NOVA}).status_code == 400
    assert client.get("/auth/me", headers=headers_antigos).status_code == 401
    assert client.post("/auth/login", json={"email": "a@example.com", "senha": SENHA}).status_code == 401
    login(client, "a@example.com", NOVA)


def test_admin_gera_senha_temporaria_e_barbeiro_precisa_trocar(client, dados_base):
    h_admin, _ = login(client, "admin@example.com")
    r = client.post(f"/barbeiros/{dados_base['barbeiro_id']}/senha-temporaria", headers=h_admin)
    assert r.status_code == 200
    temporaria = r.json()["senha_temporaria"]

    h_barb, _ = login(client, "rafael@example.com", temporaria)
    assert client.get("/auth/me", headers=h_barb).json()["trocar_senha"] is True
    assert client.get("/agendamentos", headers=h_barb).status_code == 403  # bloqueado até trocar

    r = client.post("/auth/trocar-senha", headers=h_barb, json={"senha_atual": temporaria, "nova_senha": NOVA})
    assert r.status_code == 200
    h_novo = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert r.json()["usuario"]["trocar_senha"] is False
    assert client.get("/agendamentos", headers=h_novo).status_code == 200
    assert client.get("/agendamentos", headers=h_barb).status_code == 401  # token antigo caiu


def test_trocar_senha_exige_senha_atual(client, dados_base):
    h, _ = login(client, "a@example.com")
    r = client.post("/auth/trocar-senha", headers=h, json={"senha_atual": "errada", "nova_senha": NOVA})
    assert r.status_code == 400


def test_cliente_nao_gera_senha_temporaria(client, dados_base):
    h, _ = login(client, "a@example.com")
    assert client.post(f"/barbeiros/{dados_base['barbeiro_id']}/senha-temporaria", headers=h).status_code == 403
