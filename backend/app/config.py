"""Configurações lidas de variáveis de ambiente (nada de segredo no código)."""
import os
import secrets
from pathlib import Path

from dotenv import load_dotenv

PASTA_BACKEND = Path(__file__).resolve().parent.parent
load_dotenv(PASTA_BACKEND / ".env")


def _bool(valor: str | None) -> bool:
    return (valor or "").strip().lower() in {"1", "true", "sim", "yes"}


class Settings:
    def __init__(self) -> None:
        self.debug = _bool(os.getenv("DEBUG"))
        self.database_url = os.getenv("DATABASE_URL", "sqlite:///./barbearia.db")
        if self.database_url.startswith("sqlite:///./"):
            # Caminho relativo do SQLite sempre a partir da pasta backend/.
            self.database_url = "sqlite:///" + str(PASTA_BACKEND / self.database_url[len("sqlite:///./"):])
        self.cors_origins = [
            origem.strip()
            for origem in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
            if origem.strip()
        ]
        self.access_token_minutes = int(os.getenv("ACCESS_TOKEN_MINUTES", "15"))
        self.refresh_token_days = int(os.getenv("REFRESH_TOKEN_DAYS", "1"))
        self.login_max_tentativas = int(os.getenv("LOGIN_MAX_TENTATIVAS", "5"))
        self.login_janela_minutos = int(os.getenv("LOGIN_JANELA_MINUTOS", "5"))
        self.fuso_horario = os.getenv("FUSO_HORARIO", "America/Sao_Paulo")

        # Recuperação de senha por e-mail
        self.frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
        self.smtp_host = os.getenv("SMTP_HOST", "")
        self.smtp_porta = int(os.getenv("SMTP_PORTA", "587"))
        self.smtp_usuario = os.getenv("SMTP_USUARIO", "")
        self.smtp_senha = os.getenv("SMTP_SENHA", "")
        self.smtp_remetente = os.getenv("SMTP_REMETENTE", self.smtp_usuario)

        self.jwt_secret = os.getenv("JWT_SECRET", "")
        if not self.jwt_secret:
            if self.debug:
                # Só em desenvolvimento: chave aleatória a cada execução.
                self.jwt_secret = secrets.token_urlsafe(48)
            else:
                raise RuntimeError(
                    "JWT_SECRET não definido. Configure a variável de ambiente antes de iniciar."
                )


settings = Settings()
