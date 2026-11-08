"""RF02: cadastro de barbeiros com dias e horários (somente administrador)."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..deps import exigir_perfil
from ..models import Barbeiro, HorarioAtendimento, Usuario
from ..schemas import BarbeiroCriar, BarbeiroHorarios, BarbeiroOut, SenhaTemporariaOut
from ..security import gerar_hash, gerar_senha_temporaria

router = APIRouter(prefix="/barbeiros", tags=["Barbeiros"])


@router.get("", response_model=list[BarbeiroOut])
def listar(db: Session = Depends(get_db)):
    return db.scalars(
        select(Barbeiro)
        .where(Barbeiro.ativo.is_(True))
        .options(selectinload(Barbeiro.horarios))
        .order_by(Barbeiro.nome)
    ).all()


@router.post("", response_model=BarbeiroOut, status_code=status.HTTP_201_CREATED)
def criar(dados: BarbeiroCriar, db: Session = Depends(get_db), _admin=Depends(exigir_perfil("admin"))):
    if db.scalar(select(Usuario.id).where(Usuario.email == dados.email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Este e-mail já está cadastrado.")
    usuario = Usuario(
        nome=dados.nome,
        email=dados.email,
        telefone=dados.telefone,
        senha_hash=gerar_hash(dados.senha),
        perfil="barbeiro",
    )
    barbeiro = Barbeiro(
        nome=dados.nome,
        usuario=usuario,
        horarios=[HorarioAtendimento(**h.model_dump()) for h in dados.horarios],
    )
    db.add(barbeiro)
    db.commit()
    db.refresh(barbeiro)
    return barbeiro


@router.post("/{barbeiro_id}/senha-temporaria", response_model=SenhaTemporariaOut)
def gerar_senha_temporaria_barbeiro(
    barbeiro_id: int,
    db: Session = Depends(get_db),
    _admin=Depends(exigir_perfil("admin")),
):
    """Para quando o barbeiro esquece a senha e não consegue usar o e-mail.
    A senha aparece uma única vez; no primeiro acesso ele precisa criar outra."""
    barbeiro = db.get(Barbeiro, barbeiro_id)
    if barbeiro is None or barbeiro.usuario is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Barbeiro não encontrado.")
    temporaria = gerar_senha_temporaria()
    usuario = barbeiro.usuario
    usuario.senha_hash = gerar_hash(temporaria)
    usuario.trocar_senha = True
    usuario.sessao_versao += 1  # derruba as sessões abertas
    db.commit()
    return SenhaTemporariaOut(
        senha_temporaria=temporaria,
        mensagem=f"Passe esta senha para {barbeiro.nome}. No primeiro acesso ele vai criar uma senha nova.",
    )


@router.put("/{barbeiro_id}/horarios", response_model=BarbeiroOut)
def trocar_horarios(
    barbeiro_id: int,
    dados: BarbeiroHorarios,
    db: Session = Depends(get_db),
    _admin=Depends(exigir_perfil("admin")),
):
    barbeiro = db.get(Barbeiro, barbeiro_id)
    if barbeiro is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Barbeiro não encontrado.")
    barbeiro.horarios = [HorarioAtendimento(**h.model_dump()) for h in dados.horarios]
    db.commit()
    db.refresh(barbeiro)
    return barbeiro
