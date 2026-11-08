import { useEffect, useState } from "react";
import api, { mensagemErro } from "../api";
import { useAuth } from "../auth";
import { Alerta, Carregando, TituloPagina, useTituloDocumento } from "../components";
import { dataPorExtenso, hojeISO, hora } from "../formatos";

const CHAVE_CACHE = "barbearia.agenda";

function lerCache(chave) {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_CACHE))?.[chave] ?? null;
  } catch {
    return null;
  }
}

function salvarCache(chave, itens) {
  try {
    // Guarda só a última consulta (sem telefone ou e-mail de clientes).
    localStorage.setItem(CHAVE_CACHE, JSON.stringify({ [chave]: { itens, salvoEm: new Date().toISOString() } }));
  } catch {
    /* sem armazenamento disponível */
  }
}

export default function Agenda() {
  const { usuario } = useAuth();
  const ehAdmin = usuario.perfil === "admin";
  useTituloDocumento(ehAdmin ? "Agenda" : "Minha agenda");
  const [data, setData] = useState(hojeISO());
  const [barbeiros, setBarbeiros] = useState([]);
  const [barbeiroId, setBarbeiroId] = useState("");
  const [itens, setItens] = useState(null);
  const [aviso, setAviso] = useState(null);

  useEffect(() => {
    if (ehAdmin) api.get("/barbeiros").then((r) => setBarbeiros(r.data)).catch(() => {});
  }, [ehAdmin]);

  useEffect(() => {
    let ativo = true;
    const chave = `${usuario.id}:${data}:${barbeiroId}`;
    setItens(null);
    setAviso(null);
    api
      .get("/agendamentos", { params: { data, ...(barbeiroId && { barbeiro_id: barbeiroId }) } })
      .then((r) => {
        if (!ativo) return;
        setItens(r.data);
        salvarCache(chave, r.data);
      })
      .catch((e) => {
        if (!ativo) return;
        const cache = lerCache(chave);
        if (!e.response && cache) {
          setItens(cache.itens);
          setAviso({
            tipo: "aviso",
            texto: `Sem conexão. Mostrando a agenda salva às ${new Date(cache.salvoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`,
          });
        } else {
          setItens([]);
          setAviso({ tipo: "erro", texto: mensagemErro(e) });
        }
      });
    return () => {
      ativo = false;
    };
  }, [data, barbeiroId, usuario.id]);

  const confirmados = itens?.filter((a) => a.status === "confirmado") ?? [];

  return (
    <section>
      <TituloPagina subtitulo={dataPorExtenso(data)}>{ehAdmin ? "Agenda" : "Minha agenda"}</TituloPagina>

      <div className="filtros">
        <div className="campo campo-curto">
          <label htmlFor="data">Dia</label>
          <input id="data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </div>
        {ehAdmin && (
          <div className="campo campo-curto">
            <label htmlFor="barbeiro">Barbeiro</label>
            <select id="barbeiro" value={barbeiroId} onChange={(e) => setBarbeiroId(e.target.value)}>
              <option value="">Todos</option>
              {barbeiros.map((b) => (
                <option key={b.id} value={b.id}>{b.nome}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {aviso && <Alerta tipo={aviso.tipo} titulo={aviso.texto} />}

      {itens === null ? (
        <Carregando texto="Carregando agenda..." />
      ) : itens.length === 0 ? (
        <Alerta tipo="info" titulo="Nenhum atendimento marcado neste dia." />
      ) : (
        <>
          <p className="texto-apoio">{confirmados.length} atendimento(s) confirmado(s).</p>
          <ul className="lista-agenda">
            {itens.map((a) => (
              <li key={a.id} className={`linha-agenda ${a.status === "cancelado" ? "agendamento-cancelado" : ""}`}>
                <span className="linha-agenda-hora">
                  {hora(a.inicio)}–{hora(a.fim)}
                </span>
                <span className="linha-agenda-info">
                  <strong>{a.cliente.nome}</strong>
                  <span>
                    {a.servico.nome}
                    {ehAdmin && ` · ${a.barbeiro.nome}`}
                  </span>
                  {a.observacao && <span className="texto-apoio">Obs.: {a.observacao}</span>}
                </span>
                <span className={`etiqueta etiqueta-${a.status}`}>{a.status === "confirmado" ? "Confirmado" : "Cancelado"}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
