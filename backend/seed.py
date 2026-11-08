"""Popula o banco com dados FICTÍCIOS para demonstração e para o teste de desempenho (RNF03):
4 barbeiros, 10 serviços, 50 produtos e cerca de 200 agendamentos.

Uso (com o venv ativo, depois de `alembic upgrade head`):
    python seed.py            # só roda em banco vazio
    python seed.py --limpar   # apaga os dados e recria

As senhas de teste ficam no .env (SEED_SENHA_ADMIN e SEED_SENHA_PADRAO).
"""
import os
import random
import sys
from datetime import datetime, time, timedelta
from decimal import Decimal

from sqlalchemy import delete, select

from app.config import settings
from app.database import SessionLocal
from app.models import (
    Agendamento,
    Barbeiro,
    ItemVenda,
    HorarioAtendimento,
    MovimentacaoEstoque,
    Produto,
    Servico,
    TokenRevogado,
    Usuario,
    Venda,
)
from app.security import gerar_hash
from app.utils import agora

DOMINIO = "example.com"  # domínio reservado para exemplos (RFC 2606)

SERVICOS = [
    ("Corte masculino", "45.00", 30),
    ("Barba", "35.00", 30),
    ("Corte + Barba", "70.00", 60),
    ("Corte infantil", "35.00", 30),
    ("Pezinho", "15.00", 30),
    ("Sobrancelha", "15.00", 30),
    ("Barba com toalha quente", "45.00", 30),
    ("Platinado", "150.00", 120),
    ("Pigmentação de barba", "40.00", 30),
    ("Hidratação capilar", "50.00", 30),
]

PRECOS = {
    "Pomada modeladora": "45.00", "Cera matte": "42.00", "Gel fixador": "25.00",
    "Spray fixador": "38.00", "Pó texturizador": "49.00", "Óleo para barba": "39.90",
    "Balm para barba": "44.90", "Shampoo para barba": "32.00", "Espuma de barbear": "29.90",
    "Loção pós-barba": "35.00", "Shampoo anticaspa": "34.90", "Condicionador": "29.90",
    "Tônico capilar": "55.00", "Máscara hidratante": "48.00", "Shampoo neutro": "27.90",
}

BARBEIROS = ["Rafael", "Bruno", "Diego", "Lucas"]

CATEGORIAS = {
    "Finalização": ["Pomada modeladora", "Cera matte", "Gel fixador", "Spray fixador", "Pó texturizador"],
    "Barba": ["Óleo para barba", "Balm para barba", "Shampoo para barba", "Espuma de barbear", "Loção pós-barba"],
    "Cabelo": ["Shampoo anticaspa", "Condicionador", "Tônico capilar", "Máscara hidratante", "Shampoo neutro"],
    "Descartáveis": ["Lâmina descartável", "Papel pescoço", "Luva descartável", "Toalha descartável", "Algodão"],
    "Higiene": ["Álcool 70%", "Talco", "Desinfetante de máquina", "Lenço umedecido", "Sabonete líquido"],
}


def criar_usuario(nome: str, email: str, senha: str, perfil: str, telefone: str) -> Usuario:
    return Usuario(nome=nome, email=email, telefone=telefone, senha_hash=gerar_hash(senha), perfil=perfil)


def main() -> None:
    if not settings.debug and "--forcar" not in sys.argv:
        print("Seed bloqueado com DEBUG=false (produção). Use --forcar se tiver certeza.")
        sys.exit(1)

    senha_admin = os.getenv("SEED_SENHA_ADMIN")
    senha_padrao = os.getenv("SEED_SENHA_PADRAO")
    if not senha_admin or not senha_padrao:
        print("Defina SEED_SENHA_ADMIN e SEED_SENHA_PADRAO no .env antes de rodar o seed.")
        sys.exit(1)

    rnd = random.Random(42)
    db = SessionLocal()
    try:
        if "--limpar" in sys.argv:
            for modelo in (ItemVenda, Venda, MovimentacaoEstoque, Agendamento, HorarioAtendimento, Barbeiro,
                           Produto, Servico, TokenRevogado, Usuario):
                db.execute(delete(modelo))
            db.commit()
        elif db.scalar(select(Usuario.id).limit(1)):
            print("O banco já tem dados. Use --limpar para recriar.")
            return

        admin = criar_usuario("Administrador", f"admin@{DOMINIO}", senha_admin, "admin", "11900000000")
        db.add(admin)

        servicos = [Servico(nome=n, preco=Decimal(p), duracao_min=d) for n, p, d in SERVICOS]
        db.add_all(servicos)

        barbeiros = []
        for i, nome in enumerate(BARBEIROS, start=1):
            usuario = criar_usuario(nome, f"{nome.lower()}@{DOMINIO}", senha_padrao, "barbeiro", f"1190000000{i}")
            horarios = []
            for dia in range(0, 6):  # segunda a sábado
                horarios.append(HorarioAtendimento(dia_semana=dia, hora_inicio=time(9), hora_fim=time(12)))
                horarios.append(HorarioAtendimento(dia_semana=dia, hora_inicio=time(13), hora_fim=time(19)))
            barbeiros.append(Barbeiro(nome=nome, usuario=usuario, horarios=horarios))
        db.add_all(barbeiros)

        clientes = [criar_usuario("Cliente Teste", f"cliente@{DOMINIO}", senha_padrao, "cliente", "11911111111")]
        for i in range(1, 25):
            clientes.append(
                criar_usuario(f"Cliente {i:02d}", f"cliente{i:02d}@{DOMINIO}", senha_padrao, "cliente", f"119222200{i:02d}")
            )
        db.add_all(clientes)

        # Produtos com preço: a versão normal vai para a prateleira (venda) e o
        # refil fica para uso nos atendimentos (consumo).
        produtos = []
        for categoria, nomes in CATEGORIAS.items():
            for nome in nomes:
                for variacao in ("", " (refil)"):
                    vende = nome in PRECOS and variacao == ""
                    produtos.append(
                        Produto(
                            nome=nome + variacao,
                            categoria=categoria,
                            tipo="venda" if vende else "consumo",
                            preco_venda=Decimal(PRECOS[nome]) if vende else None,
                            quantidade=rnd.randint(12, 40) if vende else rnd.randint(0, 40),
                            quantidade_minima=rnd.choice([3, 5, 10]),
                        )
                    )
        db.add_all(produtos)
        db.flush()
        for produto in produtos:
            if produto.quantidade > 0:
                db.add(MovimentacaoEstoque(
                    produto_id=produto.id, usuario_id=admin.id, tipo="entrada",
                    quantidade=produto.quantidade, saldo_apos=produto.quantidade,
                    observacao="Quantidade inicial", criado_em=agora() - timedelta(days=31),
                ))

        # ~70 vendas no PDV nos últimos 30 dias (baixam o estoque de venda).
        momento = agora()
        hoje = momento.date()
        de_venda = [p for p in produtos if p.tipo == "venda"]
        vendedores = [admin] + [b.usuario for b in barbeiros]
        total_vendas = 0
        for _ in range(70):
            dia = hoje - timedelta(days=rnd.randint(0, 29))
            quando = datetime.combine(dia, time(rnd.randint(9, 18), rnd.choice([0, 15, 30, 45])))
            if quando > momento or dia.weekday() == 6:
                continue
            itens = []
            for produto in rnd.sample(de_venda, rnd.choice([1, 1, 1, 2, 2, 3])):
                qtd = rnd.choice([1, 1, 1, 2])
                if produto.quantidade - qtd < 1:
                    continue
                itens.append(ItemVenda(
                    produto_id=produto.id, nome_produto=produto.nome, quantidade=qtd,
                    preco_unitario=produto.preco_venda, subtotal=produto.preco_venda * qtd,
                ))
            if not itens:
                continue
            subtotal = sum(i.subtotal for i in itens)
            desconto = Decimal("5.00") if subtotal > 80 and rnd.random() < 0.3 else Decimal("0")
            venda = Venda(
                vendedor_id=rnd.choice(vendedores).id, forma_pagamento=rnd.choice(["pix", "pix", "debito", "credito", "dinheiro"]),
                subtotal=subtotal, desconto=desconto, total=subtotal - desconto, itens=itens, criado_em=quando,
            )
            db.add(venda)
            db.flush()
            for item in itens:
                produto = next(p for p in de_venda if p.id == item.produto_id)
                produto.quantidade -= item.quantidade
                db.add(MovimentacaoEstoque(
                    produto_id=produto.id, usuario_id=venda.vendedor_id, tipo="saida",
                    quantidade=item.quantidade, saldo_apos=produto.quantidade,
                    observacao=f"Venda #{venda.id}", criado_em=quando,
                ))
            total_vendas += 1

        # ~200 agendamentos sem conflito: 30 dias para trás e 14 para frente.
        ocupados: dict[int, list[tuple[datetime, datetime]]] = {b.id: [] for b in barbeiros}
        total = 0
        tentativas = 0
        while total < 200 and tentativas < 5000:
            tentativas += 1
            dia = hoje + timedelta(days=rnd.randint(-30, 14))
            if dia.weekday() == 6:
                continue
            barbeiro = rnd.choice(barbeiros)
            servico = rnd.choice(servicos)
            hora = rnd.choice([9, 10, 11, 13, 14, 15, 16, 17, 18])
            inicio = datetime.combine(dia, time(hora, rnd.choice([0, 30])))
            fim = inicio + timedelta(minutes=servico.duracao_min)
            janela_fim = datetime.combine(dia, time(12 if hora < 12 else 19))
            if fim > janela_fim:
                continue
            if any(i < fim and f > inicio for i, f in ocupados[barbeiro.id]):
                continue
            ocupados[barbeiro.id].append((inicio, fim))
            status = "cancelado" if rnd.random() < 0.1 else "confirmado"
            db.add(Agendamento(
                cliente_id=rnd.choice(clientes).id, barbeiro_id=barbeiro.id, servico_id=servico.id,
                inicio=inicio, fim=fim, status=status,
            ))
            total += 1

        db.commit()
        print(f"Seed concluído: {len(barbeiros)} barbeiros, {len(servicos)} serviços, "
              f"{len(produtos)} produtos, {len(clientes)} clientes, {total} agendamentos e {total_vendas} vendas.")
        print(f"Logins de teste: admin@{DOMINIO}, rafael@{DOMINIO}, cliente@{DOMINIO} "
              "(senhas definidas no .env).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
