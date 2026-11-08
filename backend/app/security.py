"""Hash de senha (bcrypt) e tokens JWT (PyJWT).

Hash é de mão única: não existe "descriptografar" a senha. No login,
calculamos o hash da senha digitada e comparamos com o hash salvo.
Nunca usamos texto limpo, MD5 ou SHA-1 para senhas.
"""
import secrets
import threading
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from .config import settings

ALGORITMO = "HS256"
BCRYPT_CUSTO = 12

# Hash fixo usado quando o e-mail não existe, para o tempo de resposta
# ser parecido e não revelar quais e-mails estão cadastrados.
_HASH_FICTICIO = bcrypt.hashpw(b"senha-ficticia-para-tempo", bcrypt.gensalt(BCRYPT_CUSTO))


def gerar_hash(senha: str) -> str:
    return bcrypt.hashpw(senha.encode("utf-8"), bcrypt.gensalt(BCRYPT_CUSTO)).decode("utf-8")


def verificar_senha(senha: str, senha_hash: str | None) -> bool:
    try:
        if senha_hash is None:
            bcrypt.checkpw(senha.encode("utf-8"), _HASH_FICTICIO)
            return False
        return bcrypt.checkpw(senha.encode("utf-8"), senha_hash.encode("utf-8"))
    except ValueError:
        # Senha maior que 72 bytes ou hash inválido.
        return False


ALFABETO_TEMPORARIA = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"  # sem 0/O, 1/l/I


def gerar_senha_temporaria() -> str:
    """Ex.: 'Kx7m-P9qa-T4wz': fácil de ditar, difícil de adivinhar."""
    blocos = ["".join(secrets.choice(ALFABETO_TEMPORARIA) for _ in range(4)) for _ in range(3)]
    return "-".join(blocos)


def criar_token(usuario_id: int, perfil: str, tipo: str, versao: int = 0) -> tuple[str, str, datetime]:
    """Retorna (token, jti, expiração em UTC)."""
    agora_utc = datetime.now(timezone.utc)
    if tipo == "access":
        expira = agora_utc + timedelta(minutes=settings.access_token_minutes)
    else:
        expira = agora_utc + timedelta(days=settings.refresh_token_days)
    jti = uuid.uuid4().hex
    payload = {
        "sub": str(usuario_id),
        "perfil": perfil,
        "tipo": tipo,
        "jti": jti,
        "ver": versao,
        "iat": agora_utc,
        "exp": expira,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITMO), jti, expira


def decodificar_token(token: str, tipo_esperado: str) -> dict:
    """Lança jwt.PyJWTError se o token for inválido, vencido ou do tipo errado."""
    payload = jwt.decode(
        token,
        settings.jwt_secret,
        algorithms=[ALGORITMO],
        options={"require": ["exp", "sub", "jti", "tipo"]},
    )
    if payload.get("tipo") != tipo_esperado:
        raise jwt.InvalidTokenError("tipo de token incorreto")
    return payload


class LimiteTentativas:
    """Bloqueia o login depois de N senhas erradas seguidas para o mesmo e-mail
    dentro da janela de tempo. Fica em memória (suficiente para 1 servidor no MVP)."""

    def __init__(self, maximo: int, janela_segundos: int) -> None:
        self.maximo = maximo
        self.janela = janela_segundos
        self._falhas: dict[str, deque[float]] = defaultdict(deque)
        self._trava = threading.Lock()

    def _limpar(self, chave: str, agora_s: float) -> deque[float]:
        fila = self._falhas[chave]
        while fila and agora_s - fila[0] > self.janela:
            fila.popleft()
        return fila

    def bloqueado(self, chave: str) -> bool:
        with self._trava:
            return len(self._limpar(chave, time.monotonic())) >= self.maximo

    def registrar_falha(self, chave: str) -> None:
        with self._trava:
            agora_s = time.monotonic()
            self._limpar(chave, agora_s).append(agora_s)

    def limpar(self, chave: str) -> None:
        with self._trava:
            self._falhas.pop(chave, None)

    def resetar_tudo(self) -> None:
        with self._trava:
            self._falhas.clear()


limite_login = LimiteTentativas(
    settings.login_max_tentativas, settings.login_janela_minutos * 60
)
