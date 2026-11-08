import os

os.environ.setdefault("DEBUG", "true")
os.environ.setdefault("JWT_SECRET", "chave-somente-para-testes-automatizados-0123456789")

from datetime import time  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.database import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Barbeiro, HorarioAtendimento, Servico, Usuario  # noqa: E402
from app.routers.auth import limite_esqueci  # noqa: E402
from app.security import gerar_hash, limite_login  # noqa: E402

SENHA = "Navalha#Teste2026"


@pytest.fixture()
def db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    Sessao = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    sessao = Sessao()

    def _get_db():
        s = Sessao()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = _get_db
    limite_login.resetar_tudo()
    limite_esqueci.resetar_tudo()
    yield sessao
    sessao.close()
    app.dependency_overrides.clear()
    engine.dispose()  # fecha a conexão do banco em memória ao fim de cada teste


@pytest.fixture()
def client(db):
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture()
def dados_base(db):
    admin = Usuario(nome="Admin", email="admin@example.com", telefone="11900000000",
                    senha_hash=gerar_hash(SENHA), perfil="admin")
    barbeiro_user = Usuario(nome="Rafael", email="rafael@example.com", telefone="11900000001",
                            senha_hash=gerar_hash(SENHA), perfil="barbeiro")
    cliente_a = Usuario(nome="Cliente A", email="a@example.com", telefone="11911111111",
                        senha_hash=gerar_hash(SENHA), perfil="cliente")
    cliente_b = Usuario(nome="Cliente B", email="b@example.com", telefone="11922222222",
                        senha_hash=gerar_hash(SENHA), perfil="cliente")
    barbeiro = Barbeiro(
        nome="Rafael",
        usuario=barbeiro_user,
        horarios=[HorarioAtendimento(dia_semana=d, hora_inicio=time(0), hora_fim=time(23, 59))
                  for d in range(7)],
    )
    servico = Servico(nome="Corte", preco=45, duracao_min=60)
    db.add_all([admin, cliente_a, cliente_b, barbeiro, servico])
    db.commit()
    return {"barbeiro_id": barbeiro.id, "servico_id": servico.id}


def login(client, email, senha=SENHA):
    r = client.post("/auth/login", json={"email": email, "senha": senha})
    assert r.status_code == 200, r.text
    dados = r.json()
    return {"Authorization": f"Bearer {dados['access_token']}"}, dados["refresh_token"]
