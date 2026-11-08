import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import api from "../api";
import { useAuth } from "../auth";
import { Alerta, Icone, TituloPagina, useTituloDocumento } from "../components";

const CARTOES = {
  cliente: [
    { para: "/agendar", icone: "calendario", titulo: "Novo agendamento", texto: "Escolha o serviço, o barbeiro e o horário.", destaque: true },
    { para: "/meus-agendamentos", icone: "lista", titulo: "Meus agendamentos", texto: "Veja seus horários ou cancele um agendamento." },
  ],
  barbeiro: [
    { para: "/agenda", icone: "calendario", titulo: "Minha agenda", texto: "Veja os clientes marcados para o dia.", destaque: true },
    { para: "/pdv", icone: "carrinho", titulo: "PDV", texto: "Venda produtos da prateleira." },
  ],
  admin: [
    { para: "/agenda", icone: "calendario", titulo: "Agenda do dia", texto: "Todos os atendimentos marcados.", destaque: true },
    { para: "/estoque", icone: "caixa", titulo: "Estoque", texto: "Produtos, entradas, saídas e alertas." },
    { para: "/barbeiros", icone: "tesoura", titulo: "Barbeiros", texto: "Cadastre profissionais e horários de atendimento." },
  ],
};

export default function Inicio() {
  useTituloDocumento("Início");
  const { usuario } = useAuth();
  const [alertas, setAlertas] = useState([]);

  useEffect(() => {
    if (usuario.perfil !== "admin") return;
    api.get("/produtos/alertas").then((r) => setAlertas(r.data)).catch(() => {});
  }, [usuario.perfil]);

  // O início do administrador é o dashboard.
  if (usuario.perfil === "admin") return <Navigate to="/dashboard" replace />;

  return (
    <section>
      <TituloPagina subtitulo="O que você quer fazer agora?">Olá, {usuario.nome.split(" ")[0]}</TituloPagina>

      {alertas.length > 0 && (
        <Alerta
          tipo="aviso"
          titulo={`${alertas.length} produto(s) com estoque baixo`}
          acoes={<Link to="/estoque?baixo=1" className="botao botao-secundario">Ver produtos</Link>}
        >
          {alertas
            .slice(0, 3)
            .map((p) => `${p.nome} (${p.quantidade} un.)`)
            .join(", ")}
          {alertas.length > 3 && " e outros."}
        </Alerta>
      )}

      <ul className="grade-cartoes">
        {CARTOES[usuario.perfil].map((c) => (
          <li key={c.para}>
            <Link to={c.para} className={`cartao-menu ${c.destaque ? "cartao-menu-destaque" : ""}`}>
              <span className="cartao-menu-icone"><Icone nome={c.icone} tamanho={28} /></span>
              <span className="cartao-menu-titulo">{c.titulo}</span>
              <span className="cartao-menu-texto">{c.texto}</span>
              <span className="cartao-menu-seta" aria-hidden="true"><Icone nome="direita" tamanho={20} /></span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
