"""Dependências de autenticação e autorização usadas em cada rota protegida."""
import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import get_db
from .models import TokenRevogado, Usuario
from .security import decodificar_token

_bearer = HTTPBearer(auto_error=False)


def token_revogado(db: Session, jti: str) -> bool:
    return db.scalar(select(TokenRevogado.id).where(TokenRevogado.jti == jti)) is not None


def payload_atual(
    cred: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> dict:
    erro = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Sessão inválida ou expirada. Faça login novamente.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if cred is None:
        raise erro
    try:
        payload = decodificar_token(cred.credentials, "access")
    except jwt.PyJWTError:
        raise erro
    if token_revogado(db, payload["jti"]):
        raise erro
    return payload


ROTAS_LIBERADAS_TROCA = {"/auth/me", "/auth/trocar-senha", "/auth/logout"}


def usuario_atual(
    request: Request, payload: dict = Depends(payload_atual), db: Session = Depends(get_db)
) -> Usuario:
    usuario = db.get(Usuario, int(payload["sub"]))
    # Token de uma versão de sessão antiga (a senha foi trocada/redefinida) não vale mais.
    if usuario is None or not usuario.ativo or payload.get("ver", 0) != usuario.sessao_versao:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sessão inválida ou expirada. Faça login novamente.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    # Com senha temporária, só dá para trocar a senha (ou sair).
    if usuario.trocar_senha and request.url.path not in ROTAS_LIBERADAS_TROCA:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Crie uma senha nova para continuar usando o sistema.",
        )
    return usuario


def exigir_perfil(*perfis: str):
    """Uso: Depends(exigir_perfil("admin")). O perfil vem do banco, não do token."""

    def verificar(usuario: Usuario = Depends(usuario_atual)) -> Usuario:
        if usuario.perfil not in perfis:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Você não tem permissão para esta ação.",
            )
        return usuario

    return verificar
