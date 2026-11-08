import logging

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .routers import agendamentos, auth, barbeiros, dashboard, produtos, servicos, vendas

logger = logging.getLogger("barbearia")

app = FastAPI(
    title="API Mooca Barber Club",
    version="1.0.0",
    description="Agendamento de clientes com barbeiros e controle de estoque.",
    # Swagger só em desenvolvimento (em produção não expõe a estrutura da API).
    docs_url="/docs" if settings.debug else None,
    redoc_url=None,
    openapi_url="/openapi.json" if settings.debug else None,
)

app.add_middleware(GZipMiddleware, minimum_size=500)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,  # só o domínio do frontend
    allow_credentials=False,  # o token vai no cabeçalho Authorization, não em cookie
    allow_methods=["GET", "POST", "PUT"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def cabecalhos_seguranca(request: Request, call_next):
    resposta = await call_next(request)
    resposta.headers["X-Content-Type-Options"] = "nosniff"
    resposta.headers["X-Frame-Options"] = "DENY"
    resposta.headers["Referrer-Policy"] = "no-referrer"
    if not request.url.path.startswith("/docs"):
        # A API só devolve JSON: nada nela deve executar script.
        resposta.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    if not settings.debug:
        resposta.headers["Strict-Transport-Security"] = "max-age=31536000"
    return resposta


# ---------- Mensagens de erro em português e sem detalhes técnicos ----------

_MENSAGENS = {
    "missing": "Campo obrigatório.",
    "string_too_short": "Texto muito curto (mínimo {min_length} caracteres).",
    "string_too_long": "Texto muito longo (máximo {max_length} caracteres).",
    "too_short": "Informe pelo menos {min_length} item(ns).",
    "too_long": "Informe no máximo {max_length} item(ns).",
    "greater_than": "O valor precisa ser maior que {gt}.",
    "greater_than_equal": "O valor precisa ser maior ou igual a {ge}.",
    "less_than_equal": "O valor precisa ser menor ou igual a {le}.",
    "int_parsing": "Informe um número inteiro.",
    "int_from_float": "Informe um número inteiro.",
    "decimal_parsing": "Informe um número válido.",
    "date_from_datetime_parsing": "Informe uma data válida.",
    "date_parsing": "Informe uma data válida.",
    "datetime_from_date_parsing": "Informe data e hora válidas.",
    "datetime_parsing": "Informe data e hora válidas.",
    "time_parsing": "Informe um horário válido (HH:MM).",
    "literal_error": "Valor não permitido.",
    "string_pattern_mismatch": "Formato inválido.",
    "json_invalid": "Dados enviados em formato inválido.",
}


def _traduzir(erro: dict) -> str:
    tipo = erro.get("type", "")
    if tipo == "value_error":
        mensagem = str(erro.get("msg", ""))
        if "email" in mensagem.lower() and "@" not in mensagem:
            return "Informe um e-mail válido."
        return mensagem.removeprefix("Value error, ")
    modelo = _MENSAGENS.get(tipo)
    if modelo is None:
        return "Valor inválido."
    try:
        return modelo.format(**(erro.get("ctx") or {}))
    except (KeyError, IndexError):
        return modelo


@app.exception_handler(RequestValidationError)
async def erro_validacao(_request: Request, exc: RequestValidationError):
    erros = []
    for erro in exc.errors():
        local = [str(p) for p in erro.get("loc", ()) if p not in ("body", "query", "path")]
        erros.append({"campo": ".".join(local) or None, "mensagem": _traduzir(erro)})
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"detail": "Dados inválidos. Confira os campos destacados.", "erros": erros},
    )


@app.exception_handler(Exception)
async def erro_inesperado(_request: Request, exc: Exception):
    # O detalhe técnico vai só para o log do servidor.
    logger.exception("Erro não tratado", exc_info=exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Ocorreu um erro inesperado. Tente novamente em instantes."},
    )


app.include_router(auth.router)
app.include_router(servicos.router)
app.include_router(barbeiros.router)
app.include_router(agendamentos.router)
app.include_router(produtos.router)
app.include_router(vendas.router)
app.include_router(dashboard.router)


@app.get("/saude", tags=["Sistema"])
def saude():
    return {"status": "ok"}
