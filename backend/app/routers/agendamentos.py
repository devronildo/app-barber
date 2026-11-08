"""RF03 (agendar sem conflito) e RF04 (cancelar com 2 horas de antecedência)."""
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from ..database import get_db
from ..deps import exigir_perfil, usuario_atual
from ..models import Agendamento, Barbeiro, Servico, Usuario
from ..schemas import AgendamentoCriar, AgendamentoOut, DisponibilidadeOut, HorarioDisponivel
from ..utils import agora

router = APIRouter(prefix="/agendamentos", tags=["Agendamentos"])

INTERVALO_GRADE = timedelta(minutes=30)
ANTECEDENCIA_CANCELAMENTO = timedelta(hours=2)
DIAS_MAXIMOS_A_FRENTE = 60


def _carregar_barbeiro_servico(db: Session, barbeiro_id: int, servico_id: int) -> tuple[Barbeiro, Servico]:
    barbeiro = db.scalar(
        select(Barbeiro).where(Barbeiro.id == barbeiro_id).options(selectinload(Barbeiro.horarios))
    )
    if barbeiro is None or not barbeiro.ativo:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Barbeiro não encontrado.")
    servico = db.get(Servico, servico_id)
    if servico is None or not servico.ativo:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Serviço não encontrado.")
    return barbeiro, servico


def calcular_grade(db: Session, barbeiro: Barbeiro, servico: Servico, dia: date) -> list[tuple[datetime, bool]]:
    """Gera os horários de 30 em 30 minutos dentro do expediente do barbeiro.
    Um horário está livre se o serviço inteiro cabe no expediente, não está no
    passado e não cruza com outro agendamento confirmado do mesmo barbeiro."""
    duracao = timedelta(minutes=servico.duracao_min)
    inicio_dia = datetime.combine(dia, time.min)
    fim_dia = inicio_dia + timedelta(days=1)
    ocupados = db.execute(
        select(Agendamento.inicio, Agendamento.fim).where(
            Agendamento.barbeiro_id == barbeiro.id,
            Agendamento.status == "confirmado",
            Agendamento.inicio < fim_dia,
            Agendamento.fim > inicio_dia,
        )
    ).all()
    momento_atual = agora()

    grade: list[tuple[datetime, bool]] = []
    for janela in barbeiro.horarios:
        if janela.dia_semana != dia.weekday():
            continue
        horario = datetime.combine(dia, janela.hora_inicio)
        limite = datetime.combine(dia, janela.hora_fim)
        while horario + duracao <= limite:
            # Horários que já passaram não aparecem: "ocupado" fica só para quem já tem cliente.
            if horario > momento_atual:
                termino = horario + duracao
                conflita = any(o_inicio < termino and o_fim > horario for o_inicio, o_fim in ocupados)
                grade.append((horario, not conflita))
            horario += INTERVALO_GRADE
    grade.sort(key=lambda item: item[0])
    return grade


def _validar_data(dia: date) -> None:
    hoje = agora().date()
    if dia < hoje:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Escolha a data de hoje ou uma data futura.")
    if dia > hoje + timedelta(days=DIAS_MAXIMOS_A_FRENTE):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Só é possível agendar até {DIAS_MAXIMOS_A_FRENTE} dias à frente.",
        )


@router.get("/disponibilidade", response_model=DisponibilidadeOut)
def disponibilidade(
    barbeiro_id: int = Query(gt=0),
    servico_id: int = Query(gt=0),
    data: date = Query(),
    db: Session = Depends(get_db),
    _usuario: Usuario = Depends(usuario_atual),
):
    _validar_data(data)
    barbeiro, servico = _carregar_barbeiro_servico(db, barbeiro_id, servico_id)
    grade = calcular_grade(db, barbeiro, servico, data)
    return DisponibilidadeOut(
        data=data,
        barbeiro_id=barbeiro.id,
        servico_id=servico.id,
        horarios=[HorarioDisponivel(hora=h.strftime("%H:%M"), disponivel=livre) for h, livre in grade],
    )


def _consulta_completa():
    return select(Agendamento).options(
        joinedload(Agendamento.servico),
        joinedload(Agendamento.barbeiro),
        joinedload(Agendamento.cliente),
    )


@router.post("", response_model=AgendamentoOut, status_code=status.HTTP_201_CREATED)
def criar(
    dados: AgendamentoCriar,
    db: Session = Depends(get_db),
    cliente: Usuario = Depends(exigir_perfil("cliente")),
):
    _validar_data(dados.inicio.date())
    if dados.inicio <= agora():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Esse horário já passou. Escolha outro.")
    barbeiro, servico = _carregar_barbeiro_servico(db, dados.barbeiro_id, dados.servico_id)

    # No PostgreSQL trava a linha do barbeiro até o commit, evitando que dois
    # clientes peguem o mesmo horário ao mesmo tempo (no SQLite é ignorado).
    db.execute(select(Barbeiro.id).where(Barbeiro.id == barbeiro.id).with_for_update())

    grade = dict(calcular_grade(db, barbeiro, servico, dados.inicio.date()))
    if dados.inicio not in grade:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Esse horário não faz parte do expediente do barbeiro."
        )
    if not grade[dados.inicio]:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Esse horário não está mais disponível. Escolha outro."
        )

    agendamento = Agendamento(
        cliente_id=cliente.id,
        barbeiro_id=barbeiro.id,
        servico_id=servico.id,
        inicio=dados.inicio,
        fim=dados.inicio + timedelta(minutes=servico.duracao_min),
        observacao=dados.observacao or None,
    )
    db.add(agendamento)
    db.commit()
    return db.scalar(_consulta_completa().where(Agendamento.id == agendamento.id))


@router.get("", response_model=list[AgendamentoOut])
def listar(
    data: date | None = None,
    status_filtro: str | None = Query(None, alias="status", pattern="^(confirmado|cancelado)$"),
    barbeiro_id: int | None = Query(None, gt=0),
    limite: int = Query(100, ge=1, le=200),
    pagina: int = Query(1, ge=1),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(usuario_atual),
):
    consulta = _consulta_completa()

    # Cada perfil só enxerga o que é dele.
    if usuario.perfil == "cliente":
        consulta = consulta.where(Agendamento.cliente_id == usuario.id)
    elif usuario.perfil == "barbeiro":
        consulta = consulta.join(Barbeiro, Agendamento.barbeiro_id == Barbeiro.id).where(
            Barbeiro.usuario_id == usuario.id
        )
    elif barbeiro_id is not None:
        consulta = consulta.where(Agendamento.barbeiro_id == barbeiro_id)

    if data is not None:
        inicio_dia = datetime.combine(data, time.min)
        consulta = consulta.where(
            Agendamento.inicio >= inicio_dia, Agendamento.inicio < inicio_dia + timedelta(days=1)
        ).order_by(Agendamento.inicio)
    else:
        consulta = consulta.order_by(Agendamento.inicio.desc())
    if status_filtro:
        consulta = consulta.where(Agendamento.status == status_filtro)

    consulta = consulta.limit(limite).offset((pagina - 1) * limite)
    return db.scalars(consulta).unique().all()


@router.post("/{agendamento_id}/cancelar", response_model=AgendamentoOut)
def cancelar(
    agendamento_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(exigir_perfil("cliente", "admin")),
):
    agendamento = db.scalar(_consulta_completa().where(Agendamento.id == agendamento_id))
    # Cliente tentando mexer em agendamento de outra pessoa recebe 404,
    # para não revelar que o registro existe.
    if agendamento is None or (usuario.perfil == "cliente" and agendamento.cliente_id != usuario.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Agendamento não encontrado.")
    if agendamento.status != "confirmado":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Este agendamento já foi cancelado.")
    if usuario.perfil == "cliente" and agendamento.inicio - agora() < ANTECEDENCIA_CANCELAMENTO:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "O cancelamento só é permitido até 2 horas antes do horário marcado.",
        )
    agendamento.status = "cancelado"
    db.commit()
    return agendamento
