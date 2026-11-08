import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import api, { mensagemErro } from "../api";
import { Alerta, Carregando, TituloPagina, useTituloDocumento } from "../components";
import { dataPorExtenso, hora, moeda, paraData } from "../formatos";

const DUAS_HORAS = 2 * 60 * 60 * 1000;

function Status({ valor }) {
  return <span className={`etiqueta etiqueta-${valor}`}>{valor === "confirmado" ? "Confirmado" : "Cancelado"}</span>;
}

export default function MeusAgendamentos() {
  useTituloDocumento("Meus agendamentos");
  const local = useLocation();
  const [confirmado] = useState(() => local.state?.confirmado ?? null);
  const [lista, setLista] = useState(null);
  const [mensagem, setMensagem] = useState(null);
  const [cancelandoId, setCancelandoId] = useState(null);
  const [perguntaId, setPerguntaId] = useState(null);

  useEffect(() => {
    // Limpa o estado da navegação para a mensagem não voltar ao recarregar.
    if (local.state?.confirmado) window.history.replaceState({}, "");
  }, [local.state]);

  const carregar = useCallback(async () => {
    try {
      setLista((await api.get("/agendamentos")).data);
    } catch (e) {
      setLista([]);
      setMensagem({ tipo: "erro", texto: mensagemErro(e) });
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function cancelar(id) {
    setCancelandoId(id);
    setMensagem(null);
    try {
      await api.post(`/agendamentos/${id}/cancelar`);
      setMensagem({ tipo: "sucesso", texto: "Agendamento cancelado. O horário foi liberado." });
      await carregar();
    } catch (e) {
      setMensagem({ tipo: "erro", texto: mensagemErro(e) });
    } finally {
      setCancelandoId(null);
      setPerguntaId(null);
    }
  }

  const agora = Date.now();
  const proximos = (lista ?? []).filter((a) => paraData(a.inicio).getTime() >= agora).reverse();
  const anteriores = (lista ?? []).filter((a) => paraData(a.inicio).getTime() < agora);

  function Cartao({ a }) {
    const podeCancelar = a.status === "confirmado" && paraData(a.inicio).getTime() - agora >= DUAS_HORAS;
    return (
      <li className={`agendamento ${a.status === "cancelado" ? "agendamento-cancelado" : ""}`}>
        <div className="agendamento-topo">
          <p className="agendamento-quando">
            {dataPorExtenso(a.inicio)} às {hora(a.inicio)}
          </p>
          <Status valor={a.status} />
        </div>
        <p>
          {a.servico.nome} com <strong>{a.barbeiro.nome}</strong> · {moeda(a.servico.preco)}
        </p>
        {a.status === "confirmado" && paraData(a.inicio).getTime() >= agora && (
          perguntaId === a.id ? (
            <div className="confirmacao" role="group" aria-label="Confirmar cancelamento">
              <p>Tem certeza que quer cancelar este horário?</p>
              <div className="barra-acoes">
                <button type="button" className="botao botao-secundario" onClick={() => setPerguntaId(null)}>
                  Não, manter
                </button>
                <button type="button" className="botao botao-perigo" onClick={() => cancelar(a.id)} disabled={cancelandoId === a.id}>
                  {cancelandoId === a.id ? "Cancelando..." : "Sim, cancelar"}
                </button>
              </div>
            </div>
          ) : podeCancelar ? (
            <button type="button" className="botao botao-secundario" onClick={() => setPerguntaId(a.id)}>
              Cancelar agendamento
            </button>
          ) : (
            <p className="texto-apoio">Faltam menos de 2 horas: o cancelamento não é mais permitido pelo sistema.</p>
          )
        )}
      </li>
    );
  }

  return (
    <section>
      <TituloPagina>Meus agendamentos</TituloPagina>

      {confirmado && (
        <Alerta tipo="sucesso" titulo="Agendamento confirmado">
          {confirmado.servico.nome} com {confirmado.barbeiro.nome}, {dataPorExtenso(confirmado.inicio)} às{" "}
          {hora(confirmado.inicio)}. Se não puder ir, cancele com pelo menos 2 horas de antecedência.
        </Alerta>
      )}
      {mensagem && <Alerta tipo={mensagem.tipo} titulo={mensagem.texto} />}

      {lista === null ? (
        <Carregando texto="Carregando seus agendamentos..." />
      ) : (
        <>
          <h2>Próximos</h2>
          {proximos.length === 0 ? (
            <p className="texto-apoio">Você não tem horários marcados.</p>
          ) : (
            <ul className="lista-agendamentos">
              {proximos.map((a) => (
                <Cartao key={a.id} a={a} />
              ))}
            </ul>
          )}
          {anteriores.length > 0 && (
            <details className="historico">
              <summary>Atendimentos anteriores ({anteriores.length})</summary>
              <ul className="lista-agendamentos">
                {anteriores.map((a) => (
                  <Cartao key={a.id} a={a} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      <div className="barra-acoes">
        <Link to="/" className="botao botao-secundario">Voltar ao início</Link>
        <Link to="/agendar" className="botao botao-principal">Novo agendamento</Link>
      </div>
    </section>
  );
}
