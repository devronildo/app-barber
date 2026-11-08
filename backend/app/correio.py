"""Envio de e-mail (SMTP). Sem SMTP configurado, o link vai só para o log do servidor."""
import logging
import smtplib
from email.message import EmailMessage

from .config import settings

logger = logging.getLogger("barbearia.email")


def smtp_configurado() -> bool:
    return bool(settings.smtp_host and settings.smtp_remetente)


def enviar_link_redefinicao(destino: str, nome: str, link: str) -> None:
    if not smtp_configurado():
        logger.warning("SMTP não configurado. Link de redefinição para %s: %s", destino, link)
        return

    msg = EmailMessage()
    msg["Subject"] = "Mooca Barber Club – redefinir sua senha"
    msg["From"] = settings.smtp_remetente
    msg["To"] = destino
    msg.set_content(
        f"Olá, {nome}!\n\n"
        "Recebemos um pedido para redefinir a sua senha no Mooca Barber Club.\n"
        f"Para criar uma senha nova, abra o link abaixo (vale por 30 minutos):\n\n{link}\n\n"
        "Se não foi você, ignore este e-mail. Sua senha atual continua a mesma.\n"
    )
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_porta, timeout=15) as smtp:
            smtp.starttls()
            if settings.smtp_usuario:
                smtp.login(settings.smtp_usuario, settings.smtp_senha)
            smtp.send_message(msg)
    except (smtplib.SMTPException, OSError):
        # Não derruba a requisição nem revela ao usuário se o e-mail existe.
        logger.exception("Falha ao enviar e-mail de redefinição para %s", destino)
