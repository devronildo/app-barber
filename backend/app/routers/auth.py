"""RF01 (cadastro do cliente) e RNF01 (login, renovação, logout e recuperação de senha)."""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ..config import settings
from ..correio import enviar_link_redefinicao, smtp_configurado
from ..database import get_db
from ..deps import payload_atual, token_revogado, usuario_atual
from ..models import TokenRedefinicao, TokenRevogado, Usuario
from ..schemas import (
    CadastroCliente,
    EsqueciSenha,
    EsqueciSenhaResposta,
    Login,
    RedefinirSenha,
    RefreshIn,
    TokensOut,
    TrocarSenha,
    UsuarioOut,
    validar_senha_forte,
)
from ..security import (
    LimiteTentativas,
    criar_token,
    decodificar_token,
    gerar_hash,
    limite_login,
    verificar_senha,
)
from ..utils import agora

router = APIRouter(prefix="/auth", tags=["Autenticação"])

MSG_LOGIN_INVALIDO = "E-mail ou senha inválidos."
MSG_ESQUECI = (
    "Se este e-mail estiver cadastrado, enviamos um link para criar uma senha nova. "
    "Confira sua caixa de entrada e o spam. O link vale por 30 minutos."
)
VALIDADE_LINK = timedelta(minutes=30)
limite_esqueci = LimiteTentativas(maximo=3, janela_segundos=15 * 60)


def _emitir_tokens(usuario: Usuario) -> TokensOut:
    access, _, _ = criar_token(usuario.id, usuario.perfil, "access", usuario.sessao_versao)
    refresh, _, _ = criar_token(usuario.id, usuario.perfil, "refresh", usuario.sessao_versao)
    return TokensOut(access_token=access, refresh_token=refresh, usuario=UsuarioOut.model_validate(usuario))


def _revogar(db: Session, payload: dict) -> None:
    if token_revogado(db, payload["jti"]):
        return
    expira = datetime.fromtimestamp(payload["exp"], tz=timezone.utc).replace(tzinfo=None)
    db.add(TokenRevogado(jti=payload["jti"], expira_em=expira))


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _definir_senha(usuario: Usuario, nova: str) -> None:
    """Grava a senha nova e encerra todas as sessões abertas desse usuário."""
    try:
        validar_senha_forte(nova, usuario.email, usuario.nome)
    except ValueError as erro:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(erro))
    usuario.senha_hash = gerar_hash(nova)
    usuario.trocar_senha = False
    usuario.sessao_versao += 1


@router.post("/cadastro", response_model=TokensOut, status_code=status.HTTP_201_CREATED)
def cadastrar(dados: CadastroCliente, db: Session = Depends(get_db)):
    if db.scalar(select(Usuario.id).where(Usuario.email == dados.email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Este e-mail já está cadastrado.")
    usuario = Usuario(
        nome=dados.nome,
        email=dados.email,
        telefone=dados.telefone,
        senha_hash=gerar_hash(dados.senha),
        perfil="cliente",  # o cadastro público só cria clientes
    )
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    return _emitir_tokens(usuario)


@router.post("/login", response_model=TokensOut)
def login(dados: Login, db: Session = Depends(get_db)):
    chave = dados.email
    if limite_login.bloqueado(chave):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Muitas tentativas de login. Aguarde alguns minutos e tente de novo.",
        )
    usuario = db.scalar(select(Usuario).where(Usuario.email == dados.email))
    senha_ok = verificar_senha(dados.senha, usuario.senha_hash if usuario else None)
    if not usuario or not senha_ok or not usuario.ativo:
        limite_login.registrar_falha(chave)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, MSG_LOGIN_INVALIDO)
    limite_login.limpar(chave)
    return _emitir_tokens(usuario)


@router.post("/refresh", response_model=TokensOut)
def renovar(dados: RefreshIn, db: Session = Depends(get_db)):
    erro = HTTPException(status.HTTP_401_UNAUTHORIZED, "Sessão expirada. Faça login novamente.")
    try:
        payload = decodificar_token(dados.refresh_token, "refresh")
    except jwt.PyJWTError:
        raise erro
    if token_revogado(db, payload["jti"]):
        raise erro
    usuario = db.get(Usuario, int(payload["sub"]))
    if usuario is None or not usuario.ativo or payload.get("ver", 0) != usuario.sessao_versao:
        raise erro
    # Rotação: o refresh usado deixa de valer.
    _revogar(db, payload)
    db.commit()
    return _emitir_tokens(usuario)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(dados: RefreshIn, payload: dict = Depends(payload_atual), db: Session = Depends(get_db)):
    """Encerra a sessão: o token de acesso e o de renovação vão para a lista de bloqueio."""
    _revogar(db, payload)
    try:
        refresh = decodificar_token(dados.refresh_token, "refresh")
        if refresh["sub"] == payload["sub"]:
            _revogar(db, refresh)
    except jwt.PyJWTError:
        pass
    db.commit()


@router.get("/me", response_model=UsuarioOut)
def eu(usuario: Usuario = Depends(usuario_atual)):
    return usuario


# ---------- Recuperação e troca de senha ----------

@router.post("/esqueci-senha", response_model=EsqueciSenhaResposta)
def esqueci_senha(dados: EsqueciSenha, tarefas: BackgroundTasks, db: Session = Depends(get_db)):
    """Sempre responde a mesma mensagem, exista ou não o e-mail (não revela quem tem conta)."""
    resposta = EsqueciSenhaResposta(mensagem=MSG_ESQUECI)
    chave = dados.email
    if limite_esqueci.bloqueado(chave):
        return resposta
    limite_esqueci.registrar_falha(chave)

    usuario = db.scalar(select(Usuario).where(Usuario.email == dados.email, Usuario.ativo.is_(True)))
    if usuario is None:
        return resposta

    # Só o link mais recente vale.
    db.execute(
        update(TokenRedefinicao)
        .where(TokenRedefinicao.usuario_id == usuario.id, TokenRedefinicao.usado_em.is_(None))
        .values(usado_em=agora())
    )
    token = secrets.token_urlsafe(32)
    db.add(TokenRedefinicao(usuario_id=usuario.id, token_hash=_hash_token(token), expira_em=agora() + VALIDADE_LINK))
    db.commit()

    # O token vai depois do "#": o navegador não envia essa parte ao servidor nem a outros sites.
    link = f"{settings.frontend_url}/redefinir-senha#token={token}"
    tarefas.add_task(enviar_link_redefinicao, usuario.email, usuario.nome.split()[0], link)
    if settings.debug and not smtp_configurado():
        # Só em desenvolvimento, sem e-mail configurado: mostra o link para testar.
        resposta.link_dev = link
    return resposta


@router.post("/redefinir-senha", status_code=status.HTTP_204_NO_CONTENT)
def redefinir_senha(dados: RedefinirSenha, db: Session = Depends(get_db)):
    registro = db.scalar(select(TokenRedefinicao).where(TokenRedefinicao.token_hash == _hash_token(dados.token)))
    if registro is None or registro.usado_em is not None or registro.expira_em < agora():
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Este link é inválido ou já expirou. Peça um novo em “Esqueci minha senha”.",
        )
    usuario = db.get(Usuario, registro.usuario_id)
    _definir_senha(usuario, dados.nova_senha)
    registro.usado_em = agora()
    limite_login.limpar(usuario.email)
    db.commit()


@router.post("/trocar-senha", response_model=TokensOut)
def trocar_senha(dados: TrocarSenha, usuario: Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    if not verificar_senha(dados.senha_atual, usuario.senha_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A senha atual está incorreta.")
    if dados.senha_atual == dados.nova_senha:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A senha nova precisa ser diferente da atual.")
    _definir_senha(usuario, dados.nova_senha)
    db.commit()
    db.refresh(usuario)
    # As outras sessões caem; esta recebe tokens novos.
    return _emitir_tokens(usuario)
