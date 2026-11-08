from datetime import datetime
from zoneinfo import ZoneInfo

from .config import settings

FUSO = ZoneInfo(settings.fuso_horario)


def agora() -> datetime:
    """Data e hora atuais no fuso da barbearia, sem tzinfo (é assim que o banco guarda)."""
    return datetime.now(FUSO).replace(tzinfo=None, microsecond=0)
