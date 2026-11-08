# Mooca Barber Club – MVP

[![CI](https://github.com/devronildo/app-barber/actions/workflows/ci.yml/badge.svg)](https://github.com/devronildo/app-barber/actions/workflows/ci.yml)

Sistema web em que o cliente cria a conta e agenda um horário com um dos barbeiros. O sistema também controla dois estoques (consumo interno e produtos para venda), tem um PDV para vender os produtos e um dashboard de faturamento.

- **Backend:** Python 3.11+ · FastAPI · SQLAlchemy · Alembic · PyJWT · bcrypt
- **Frontend:** React · Vite · Axios · React Router
- **Banco:** SQLite em desenvolvimento e PostgreSQL em produção

## Perfis

| Perfil | O que pode fazer |
|---|---|
| Cliente | Criar conta, agendar, ver e cancelar os próprios agendamentos |
| Barbeiro | Ver a própria agenda e vender no PDV |
| Administrador | Dashboard, agenda geral, PDV (inclusive cancelar vendas), estoque e cadastro de barbeiros |

## Requisitos implementados

| Requisito | Onde está |
|---|---|
| RF01 Cadastro do cliente | `POST /auth/cadastro` · tela Criar conta |
| RF02 Barbeiros e horários | `POST /barbeiros` · tela Barbeiros |
| RF03 Agendamento sem conflito | `GET /agendamentos/disponibilidade`, `POST /agendamentos` · tela Novo agendamento |
| RF04 Cancelamento (até 2 h antes) | `POST /agendamentos/{id}/cancelar` · tela Meus agendamentos |
| RF05 Cadastro de produtos | `POST /produtos` · tela Estoque |
| RF06 Entradas e saídas | `POST /produtos/{id}/movimentacoes` · tela Estoque |
| RF07 Alerta de estoque baixo | `GET /produtos/alertas` · tela Início e Estoque |
| RF08 Lembrete por e-mail | Desejável, não implementado no MVP |
| Extra: dois tipos de estoque | Campo `tipo` (consumo ou venda) e `preco_venda` · abas na tela Estoque · edição em `PUT /produtos/{id}` |
| Extra: PDV | `GET /vendas/catalogo`, `POST /vendas`, `GET /vendas`, `POST /vendas/{id}/cancelar` · tela PDV. Cada venda baixa o estoque e fica no histórico do produto; o cancelamento devolve os itens |
| Extra: Dashboard | `GET /dashboard?periodo=hoje\|7d\|mes\|30d` · faturamento de serviços realizados + vendas, gráfico por dia, rankings e formas de pagamento |
| RNF01 Autenticação | bcrypt (custo 12), JWT de 15 min + renovação de 1 dia, logout com lista de bloqueio, bloqueio após 5 senhas erradas |
| Ajustes da validação | Barbeiro marca cliente do balcão (`POST /agendamentos/balcao`), remarca (`POST /agendamentos/{id}/remarcar`), cancela e vê o próprio faturamento (`GET /agendamentos/meu-faturamento`). Admin desativa barbeiro (`DELETE /barbeiros/{id}`) e exclui ou arquiva produto (`DELETE /produtos/{id}`) |
| Recuperação de senha | “Esqueci minha senha” no login para todos: link por e-mail que vale 30 min e uma vez (`POST /auth/esqueci-senha`, `POST /auth/redefinir-senha`). O administrador também pode gerar senha temporária para barbeiro (`POST /barbeiros/{id}/senha-temporaria`), e a troca fica obrigatória no primeiro acesso. Trocar a senha encerra as outras sessões |
| RNF02 OWASP | Validação no servidor (Pydantic), ORM com consultas parametrizadas, recusa de `<` e `>`, permissão por perfil em cada rota, erros genéricos, CSP |
| RNF03 Desempenho | Índice em (barbeiro, início), compressão gzip, paginação |
| Acessibilidade | Botões de no mínimo 44x44 px, rótulos visíveis, foco visível, alertas com texto + ícone + cor, "Ocupado" escrito nos horários |

## Como rodar (Windows)

### 1. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements-dev.txt
copy .env.example .env
alembic upgrade head
python seed.py
uvicorn app.main:app --reload
```

A API fica em http://localhost:8000. Com `DEBUG=true`, a documentação Swagger fica em http://localhost:8000/docs.

### 2. Frontend

```bash
cd frontend
npm install
copy .env.example .env
npm run dev
```

Acesse http://localhost:5173.

### Logins de teste (dados fictícios do `seed.py`)

| Perfil | E-mail | Senha |
|---|---|---|
| Administrador | admin@example.com | valor de `SEED_SENHA_ADMIN` no `.env` |
| Barbeiro | rafael@example.com | valor de `SEED_SENHA_PADRAO` no `.env` |
| Cliente | cliente@example.com | valor de `SEED_SENHA_PADRAO` no `.env` |

## Testes

São 83 testes automatizados, em duas pastas:

| Tipo | Pasta | O que testa |
|---|---|---|
| Unitários (31) | `backend/tests/unit` | Regras isoladas, sem banco nem API: grade de horários livres, serviço de estoque, hash e força da senha, senha temporária, limite de tentativas, validação de entradas e intervalo do dashboard |
| Integração (52) | `backend/tests/integracao` | A API inteira com banco em memória: cadastro e login, 401/403, logout, conflito de horário, regra das 2 horas, estoque, PDV, dashboard, recuperação de senha, agenda do barbeiro (balcão, remarcar, faturamento), desativar barbeiro, excluir produto, registro duplicado simultâneo (409), XSS e SQL injection |

```bash
cd backend
.venv\Scripts\python -m pytest tests/unit -q
```

```bash
.venv\Scripts\python -m pytest tests/integracao -q
```

Cobertura de código (atualmente **92%**; o CI exige no mínimo 85%):

```bash
.venv\Scripts\python -m pytest --cov --cov-report=term
```

## Integração Contínua (CI)

O arquivo [`.github/workflows/ci.yml`](.github/workflows/ci.yml) roda no GitHub Actions a cada envio para a `main` e em todo Pull Request:

1. Testes unitários e de integração do backend.
2. Migrações do banco aplicadas do zero.
3. Verificação de vulnerabilidades nas dependências (`pip-audit` e `npm audit`).
4. Build de produção do frontend.

Um Pull Request só deve ser aceito com o CI verde.

## Padrão de commits

As mensagens seguem o padrão semântico:

| Prefixo | Uso |
|---|---|
| `feat:` | nova funcionalidade |
| `fix:` | correção de erro |
| `test:` | testes |
| `docs:` | documentação |
| `ci:` | integração contínua |
| `chore:` | manutenção e configuração |
| `style:` / `refactor:` | visual ou reorganização de código, sem mudar o comportamento |

Para verificar dependências com falhas conhecidas:

```bash
.venv\Scripts\pip-audit -r requirements.txt
```

```bash
npm audit
```

## Recuperação de senha e e-mail

O link de “Esqueci minha senha” é enviado por SMTP. Configure no `backend/.env`:

```
FRONTEND_URL=https://seu-site.vercel.app
SMTP_HOST=smtp.gmail.com
SMTP_PORTA=587
SMTP_USUARIO=seu-email@gmail.com
SMTP_SENHA=senha-de-app-do-gmail
SMTP_REMETENTE=seu-email@gmail.com
```

Sem `SMTP_HOST`, o link vai para o log do servidor. Com `DEBUG=true`, ele também aparece na tela, para testar e apresentar. A resposta é sempre a mesma, exista ou não o e-mail, para não revelar quem tem conta. No banco fica só o hash do token.

## Implantação (planos gratuitos)

**Backend no Render (Web Service)**
- Root directory: `backend`
- Build: `pip install -r requirements.txt && alembic upgrade head`
- Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Variáveis: `DEBUG=false`, `DATABASE_URL` (PostgreSQL do Render), `JWT_SECRET` (valor longo e aleatório), `CORS_ORIGINS` (URL do frontend na Vercel)

**Frontend na Vercel**
- Root directory: `frontend` · Framework: Vite
- Variável: `VITE_API_URL` com a URL do backend no Render
- O `vercel.json` já configura as rotas do React e o cabeçalho Content-Security-Policy.

**Limites do plano gratuito:** o backend no Render entra em suspensão depois de um tempo sem uso, e o primeiro acesso demora mais. O banco gratuito tem pouco espaço e validade limitada.

## Estrutura

```
backend/
  app/
    main.py          # app, CORS, cabeçalhos de segurança, erros em português
    config.py        # variáveis de ambiente
    models.py        # entidades (SQLAlchemy)
    schemas.py       # validação (Pydantic)
    security.py      # bcrypt, JWT, limite de tentativas
    deps.py          # autenticação e permissão por perfil
    routers/         # auth, barbeiros, servicos, agendamentos, produtos
  alembic/           # migrações do banco
  seed.py            # dados fictícios
  tests/             # testes automatizados
frontend/
  src/
    pages/           # Login, Cadastro, Inicio, NovoAgendamento, MeusAgendamentos, Agenda, Estoque, Barbeiros
    components.jsx   # Alerta, Campo, Layout, rotas protegidas
    api.js           # Axios + renovação automática do token
```
