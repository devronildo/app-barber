from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import exigir_perfil
from ..models import Servico
from ..schemas import ServicoCriar, ServicoOut

router = APIRouter(prefix="/servicos", tags=["Serviços"])


@router.get("", response_model=list[ServicoOut])
def listar(db: Session = Depends(get_db)):
    return db.scalars(select(Servico).where(Servico.ativo.is_(True)).order_by(Servico.nome)).all()


@router.post("", response_model=ServicoOut, status_code=status.HTTP_201_CREATED)
def criar(dados: ServicoCriar, db: Session = Depends(get_db), _admin=Depends(exigir_perfil("admin"))):
    if db.scalar(select(Servico.id).where(Servico.nome == dados.nome)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Já existe um serviço com esse nome.")
    servico = Servico(**dados.model_dump())
    db.add(servico)
    db.commit()
    db.refresh(servico)
    return servico
