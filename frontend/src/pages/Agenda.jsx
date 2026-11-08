import { useCallback, useEffect, useState } from "react";
import api, { errosDeValidacao, mensagemErro } from "../api";
import { useAuth } from "../auth";
import {
  Alerta,
  Campo,
  Carregando,
  CartaoNumero,
  Icone,
  Modal,
  TituloPagina,
  useTituloDocumento,
} from "../components";
import { dataPorExtenso, hojeISO, hora, moeda, paraData, telefone } from "../formatos";

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
    localStorage.setItem(CHAVE_CACHE, JSON.stringify({ [chave]: { itens, salvoEm: new Date().toISOString() } }));
  } catch {
    /* sem armazenamento disponível */
  }
}

/** Grade de horários livres de um barbeiro em um dia (reaproveitada em "novo" e "remarcar"). */
function SeletorHorario({ barbeiroId, servicoId, data, ignorar, valor, aoMudar }) {
  const [horarios, setHorarios] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!barbeiroId || !servicoId || !data) return;
    let ativo = true;
    setHorarios(null);
    setErro("");
    api
      .get("/agendamentos/disponibilidade", {
        params: { barbeiro_id: barbeiroId, servico_id: servicoId, data, ...(ignorar && { ignorar }) },
      })
      .then((r) => ativo && setHorarios(r.data.horarios))
      .catch((e) => {
        if (!ativo) return;
        setHorarios([]);
        setErro(mensagemErro(e));
      });
    return () => {
      ativo = false;
    };
  }, [barbeiroId, servicoId, data, ignorar]);

  if (!barbeiroId || !servicoId) return <p className="texto-apoio">Escolha o serviço para ver os horários.</p>;
  if (erro) return <Alerta tipo="erro" titulo={erro} />;
  if (horarios === null) return <Carregando texto="Carregando horários..." />;
  if (!horarios.some((h) => h.disponivel)) {
    return <Alerta tipo="info" titulo="Sem horário livre neste dia">Escolha outra data.</Alerta>;
  }
  return (
    <div className="grade-horarios" role="group" aria-label="Horários">
      {horarios.map((h) =>
        h.disponivel ? (
          <button
            key={h.hora}
            type="button"
            className={`horario ${valor === h.hora ? "horario-marcado" : ""}`}
            aria-pressed={valor === h.hora}
            onClick={() => aoMudar(h.hora)}
          >
            {h.hora}
          </button>
        ) : (
          <button key={h.hora} type="button" className="horario horario-ocupado" disabled aria-label={`${h.hora}, ocupado`}>
            <span className="horario-riscado">{h.hora}</span>
            <span className="horario-status">Ocupado</span>
          </button>
        ),
      )}
    </div>
  );
}

/* ---------- Modal: novo agendamento (balcão) ---------- */

function ModalNovo({ aberto, ehAdmin, meuBarbeiroId, barbeiros, dataInicial, aoFechar, aoSalvar }) {
  const [servicos, setServicos] = useState([]);
  const [dados, setDados] = useState({});
  const [hora, setHora] = useState(null);
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    api.get("/servicos").then((r) => setServicos(r.data)).catch(() => {});
    setDados({
      barbeiro_id: ehAdmin ? "" : meuBarbeiroId,
      servico_id: "",
      data: dataInicial < hojeISO() ? hojeISO() : dataInicial,
      cliente_nome: "",
      cliente_telefone: "",
      observacao: "",
    });
    setHora(null);
    setErros({});
    setErro("");
  }, [aberto, ehAdmin, meuBarbeiroId, dataInicial]);

  const alterar = (c) => (e) => {
    setDados({ ...dados, [c]: e.target.value });
    if (["barbeiro_id", "servico_id", "data"].includes(c)) setHora(null);
  };

  async function salvar(e) {
    e.preventDefault();
    const loc = {};
    if (ehAdmin && !dados.barbeiro_id) loc.barbeiro_id = "Escolha o barbeiro.";
    if (!dados.servico_id) loc.servico_id = "Escolha o serviço.";
    if ((dados.cliente_nome ?? "").trim().length < 2) loc.cliente_nome = "Informe o nome do cliente.";
    const digitos = (dados.cliente_telefone ?? "").replace(/\D/g, "");
    if (digitos && (digitos.length < 10 || digitos.length > 11)) loc.cliente_telefone = "Telefone com DDD, ex.: (11) 91234-5678.";
    setErros(loc);
    setErro(Object.keys(loc).length ? "" : !hora ? "Escolha um horário." : "");
    if (Object.keys(loc).length || !hora) return;
    setEnviando(true);
    try {
      const { data } = await api.post("/agendamentos/balcao", {
        barbeiro_id: ehAdmin ? Number(dados.barbeiro_id) : null,
        servico_id: Number(dados.servico_id),
        inicio: `${dados.data}T${hora}`,
        cliente_nome: dados.cliente_nome.trim(),
        cliente_telefone: digitos || null,
        observacao: dados.observacao.trim() || null,
      });
      aoSalvar(data);
    } catch (er) {
      const { campos, gerais } = errosDeValidacao(er);
      setErros(campos);
      setErro(gerais[0] || (Object.keys(campos).length ? "" : mensagemErro(er)));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Novo agendamento"
      subtitulo="Para o cliente que ligou, mandou mensagem ou chegou no balcão."
      rodape={
        <>
          <button type="button" className="botao botao-texto" onClick={aoFechar}>Cancelar</button>
          <button type="submit" form="form-novo-ag" className="botao botao-principal" disabled={enviando}>
            {enviando ? "Salvando..." : "Marcar horário"}
          </button>
        </>
      }
    >
      {erro && <Alerta tipo="erro" titulo={erro} />}
      <form id="form-novo-ag" onSubmit={salvar} noValidate>
        <div className="form-grade">
          <Campo id="n-cliente" label="Nome do cliente" value={dados.cliente_nome ?? ""} onChange={alterar("cliente_nome")} erro={erros.cliente_nome} maxLength={100} />
          <Campo id="n-telefone" label="Celular (opcional)" type="tel" inputMode="tel" placeholder="(11) 91234-5678" value={dados.cliente_telefone ?? ""} onChange={alterar("cliente_telefone")} erro={erros.cliente_telefone} maxLength={20} />
          {ehAdmin && (
            <Campo id="n-barbeiro" as="select" label="Barbeiro" value={dados.barbeiro_id ?? ""} onChange={alterar("barbeiro_id")} erro={erros.barbeiro_id}>
              <option value="">Escolha...</option>
              {barbeiros.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
            </Campo>
          )}
          <Campo id="n-servico" as="select" label="Serviço" value={dados.servico_id ?? ""} onChange={alterar("servico_id")} erro={erros.servico_id}>
            <option value="">Escolha...</option>
            {servicos.map((s) => <option key={s.id} value={s.id}>{s.nome} – {moeda(s.preco)}</option>)}
          </Campo>
          <Campo id="n-data" label="Dia" type="date" min={hojeISO()} max={hojeISO(60)} value={dados.data ?? ""} onChange={alterar("data")} />
        </div>
        <p className="rotulo-grupo">Horário</p>
        <SeletorHorario barbeiroId={Number(dados.barbeiro_id) || null} servicoId={Number(dados.servico_id) || null} data={dados.data} valor={hora} aoMudar={setHora} />
        <Campo id="n-obs" label="Observação (opcional)" value={dados.observacao ?? ""} onChange={alterar("observacao")} maxLength={200} />
      </form>
    </Modal>
  );
}

/* ---------- Modal: remarcar ---------- */

function ModalRemarcar({ agendamento, aoFechar, aoSalvar }) {
  const [data, setData] = useState("");
  const [horaNova, setHoraNova] = useState(null);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!agendamento) return;
    const dia = agendamento.inicio.slice(0, 10);
    setData(dia < hojeISO() ? hojeISO() : dia);
    setHoraNova(null);
    setErro("");
  }, [agendamento]);

  async function salvar() {
    if (!horaNova) return setErro("Escolha o novo horário.");
    setEnviando(true);
    setErro("");
    try {
      const { data: atualizado } = await api.post(`/agendamentos/${agendamento.id}/remarcar`, { inicio: `${data}T${horaNova}` });
      aoSalvar(atualizado);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      aberto={Boolean(agendamento)}
      aoFechar={aoFechar}
      titulo="Remarcar horário"
      subtitulo={agendamento ? `${agendamento.cliente_nome} · ${agendamento.servico.nome} · hoje marcado para ${dataPorExtenso(agendamento.inicio)} às ${hora(agendamento.inicio)}` : ""}
      rodape={
        <>
          <button type="button" className="botao botao-texto" onClick={aoFechar}>Voltar</button>
          <button type="button" className="botao botao-principal" onClick={salvar} disabled={enviando || !horaNova}>
            {enviando ? "Salvando..." : horaNova ? `Remarcar para ${horaNova}` : "Remarcar"}
          </button>
        </>
      }
    >
      {erro && <Alerta tipo="erro" titulo={erro} />}
      {agendamento && (
        <>
          <Campo id="r-data" label="Novo dia" type="date" min={hojeISO()} max={hojeISO(60)} value={data} onChange={(e) => { setData(e.target.value); setHoraNova(null); }} />
          <p className="rotulo-grupo">Novo horário</p>
          <SeletorHorario barbeiroId={agendamento.barbeiro.id} servicoId={agendamento.servico.id} data={data} ignorar={agendamento.id} valor={horaNova} aoMudar={setHoraNova} />
        </>
      )}
    </Modal>
  );
}

/* ---------- Página ---------- */

export default function Agenda() {
  const { usuario } = useAuth();
  const ehAdmin = usuario.perfil === "admin";
  useTituloDocumento(ehAdmin ? "Agenda" : "Minha agenda");
  const [data, setData] = useState(hojeISO());
  const [barbeiros, setBarbeiros] = useState([]);
  const [meuBarbeiroId, setMeuBarbeiroId] = useState(null);
  const [barbeiroId, setBarbeiroId] = useState("");
  const [itens, setItens] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [mensagem, setMensagem] = useState(null);
  const [faturamento, setFaturamento] = useState(null);
  const [novoAberto, setNovoAberto] = useState(false);
  const [remarcando, setRemarcando] = useState(null);
  const [cancelando, setCancelando] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    if (ehAdmin) api.get("/barbeiros").then((r) => setBarbeiros(r.data)).catch(() => {});
    else api.get("/barbeiros/eu").then((r) => setMeuBarbeiroId(r.data.id)).catch(() => {});
  }, [ehAdmin]);

  const carregarFaturamento = useCallback(() => {
    if (ehAdmin) return;
    api.get("/agendamentos/meu-faturamento").then((r) => setFaturamento(r.data)).catch(() => {});
  }, [ehAdmin]);

  useEffect(() => {
    carregarFaturamento();
  }, [carregarFaturamento, versao]);

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
  }, [data, barbeiroId, usuario.id, versao]);

  async function confirmarCancelamento() {
    setEnviando(true);
    try {
      await api.post(`/agendamentos/${cancelando.id}/cancelar`);
      setMensagem({ tipo: "sucesso", texto: `Horário de ${cancelando.cliente_nome} às ${hora(cancelando.inicio)} cancelado. O horário foi liberado.` });
      setCancelando(null);
      setVersao((v) => v + 1);
    } catch (e) {
      setMensagem({ tipo: "erro", texto: mensagemErro(e) });
      setCancelando(null);
    } finally {
      setEnviando(false);
    }
  }

  const agoraMs = Date.now();
  const confirmados = itens?.filter((a) => a.status === "confirmado") ?? [];

  return (
    <section>
      <div className="cabecalho-pagina">
        <TituloPagina subtitulo={dataPorExtenso(data)}>{ehAdmin ? "Agenda" : "Minha agenda"}</TituloPagina>
        <button type="button" className="botao botao-principal" onClick={() => setNovoAberto(true)} disabled={!ehAdmin && !meuBarbeiroId}>
          <Icone nome="mais" tamanho={20} /> Novo agendamento
        </button>
      </div>

      {faturamento && (
        <div className="grade-numeros grade-numeros-4">
          <CartaoNumero destaque rotulo="Faturado hoje" valor={moeda(faturamento.hoje)} detalhe={`${faturamento.atendimentos_hoje} atendimento(s) realizado(s)`} icone="grafico" />
          <CartaoNumero rotulo="Nesta semana" valor={moeda(faturamento.semana)} detalhe="desde segunda-feira" icone="calendario" />
          <CartaoNumero rotulo="Neste mês" valor={moeda(faturamento.mes)} detalhe={`${faturamento.atendimentos_mes} atendimento(s)`} icone="tesoura" />
          <CartaoNumero rotulo="Ainda hoje" valor={faturamento.restantes_hoje} detalhe="cliente(s) por atender" icone="relogio" />
        </div>
      )}

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

      {mensagem && <Alerta tipo={mensagem.tipo} titulo={mensagem.texto} />}
      {aviso && <Alerta tipo={aviso.tipo} titulo={aviso.texto} />}

      {itens === null ? (
        <Carregando texto="Carregando agenda..." />
      ) : itens.length === 0 ? (
        <Alerta tipo="info" titulo="Nenhum atendimento marcado neste dia." />
      ) : (
        <>
          <p className="texto-apoio">{confirmados.length} atendimento(s) confirmado(s).</p>
          <ul className="lista-agenda">
            {itens.map((a) => {
              const futuro = paraData(a.inicio).getTime() > agoraMs;
              const podeMexer = a.status === "confirmado" && futuro;
              return (
                <li key={a.id} className={`linha-agenda ${a.status === "cancelado" ? "agendamento-cancelado" : ""}`}>
                  <span className="linha-agenda-hora">
                    {hora(a.inicio)}–{hora(a.fim)}
                  </span>
                  <span className="linha-agenda-info">
                    <strong>{a.cliente_nome}</strong>
                    <span>
                      {a.servico.nome} · {moeda(a.servico.preco)}
                      {ehAdmin && ` · ${a.barbeiro.nome}`}
                    </span>
                    {a.cliente_telefone && <span className="texto-apoio">Tel.: {telefone(a.cliente_telefone)}</span>}
                    {!a.cliente && <span className="texto-apoio">Marcado no balcão</span>}
                    {a.observacao && <span className="texto-apoio">Obs.: {a.observacao}</span>}
                  </span>
                  <span className={`etiqueta etiqueta-${a.status}`}>{a.status === "confirmado" ? "Confirmado" : "Cancelado"}</span>
                  {podeMexer && (
                    <div className="linha-agenda-acoes">
                      <button type="button" className="botao botao-secundario botao-pequeno" onClick={() => { setMensagem(null); setRemarcando(a); }}>
                        <Icone nome="calendario" tamanho={16} /> Remarcar<span className="sr-only"> {a.cliente_nome}</span>
                      </button>
                      <button type="button" className="botao botao-texto botao-pequeno" onClick={() => { setMensagem(null); setCancelando(a); }}>
                        <Icone nome="lixeira" tamanho={16} /> Cancelar<span className="sr-only"> {a.cliente_nome}</span>
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <ModalNovo
        aberto={novoAberto}
        ehAdmin={ehAdmin}
        meuBarbeiroId={meuBarbeiroId}
        barbeiros={barbeiros}
        dataInicial={data}
        aoFechar={() => setNovoAberto(false)}
        aoSalvar={(ag) => {
          setNovoAberto(false);
          setMensagem({ tipo: "sucesso", texto: `Horário marcado: ${ag.cliente_nome}, ${dataPorExtenso(ag.inicio)} às ${hora(ag.inicio)}.` });
          setData(ag.inicio.slice(0, 10));
          setVersao((v) => v + 1);
        }}
      />

      <ModalRemarcar
        agendamento={remarcando}
        aoFechar={() => setRemarcando(null)}
        aoSalvar={(ag) => {
          setRemarcando(null);
          setMensagem({ tipo: "sucesso", texto: `${ag.cliente_nome} foi remarcado para ${dataPorExtenso(ag.inicio)} às ${hora(ag.inicio)}.` });
          setVersao((v) => v + 1);
        }}
      />

      <Modal
        aberto={Boolean(cancelando)}
        aoFechar={() => setCancelando(null)}
        largura="pequena"
        titulo="Cancelar este horário?"
        subtitulo="O horário fica livre para outro cliente."
        rodape={
          <>
            <button type="button" className="botao botao-texto" onClick={() => setCancelando(null)}>Não, manter</button>
            <button type="button" className="botao botao-perigo" onClick={confirmarCancelamento} disabled={enviando}>
              {enviando ? "Cancelando..." : "Sim, cancelar"}
            </button>
          </>
        }
      >
        {cancelando && (
          <p>
            <strong>{cancelando.cliente_nome}</strong> · {cancelando.servico.nome}
            <br />
            {dataPorExtenso(cancelando.inicio)} às {hora(cancelando.inicio)}
          </p>
        )}
      </Modal>
    </section>
  );
}
