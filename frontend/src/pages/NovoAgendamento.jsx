import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { mensagemErro } from "../api";
import Calendario from "../Calendario";
import { Alerta, Avatar, Carregando, Icone, TituloPagina, useTituloDocumento } from "../components";
import { dataPorExtenso, hojeISO, moeda, somarDias } from "../formatos";

function duracaoTexto(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h}h ${m}min` : `${h}h`;
}

export default function NovoAgendamento() {
  useTituloDocumento("Novo agendamento");
  const navegar = useNavigate();
  const [servicos, setServicos] = useState([]);
  const [barbeiros, setBarbeiros] = useState([]);
  const [servicoId, setServicoId] = useState(null);
  const [barbeiroId, setBarbeiroId] = useState(null);
  const [data, setData] = useState(hojeISO());
  const [horarios, setHorarios] = useState(null);
  const [hora, setHora] = useState(null);
  const [observacao, setObservacao] = useState("");
  const [carregandoHorarios, setCarregandoHorarios] = useState(false);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [dataEscolhida, setDataEscolhida] = useState(false);
  const [avisoData, setAvisoData] = useState("");
  const pulo = useRef(null);

  useEffect(() => {
    Promise.all([api.get("/servicos"), api.get("/barbeiros")])
      .then(([s, b]) => {
        setServicos(s.data);
        setBarbeiros(b.data);
      })
      .catch((e) => setErro(mensagemErro(e)));
  }, []);

  const buscarDia = useCallback(
    async (dia) =>
      (
        await api.get("/agendamentos/disponibilidade", {
          params: { barbeiro_id: barbeiroId, servico_id: servicoId, data: dia },
        })
      ).data.horarios,
    [barbeiroId, servicoId],
  );

  /** Procura o próximo dia (até 2 semanas) que tenha pelo menos um horário livre. */
  const procurarProximoDia = useCallback(
    async (aPartirDe) => {
      let dia = aPartirDe;
      for (let i = 0; i < 14 && dia < hojeISO(60); i++) {
        dia = somarDias(dia, 1);
        const lista = await buscarDia(dia);
        if (lista.some((h) => h.disponivel)) return { dia, lista };
      }
      return null;
    },
    [buscarDia],
  );

  const carregarHorarios = useCallback(async () => {
    if (!servicoId || !barbeiroId || !data) return;
    setHora(null);
    setAvisoData("");
    if (pulo.current?.dia === data) {
      // Já carregado pela busca do próximo dia livre.
      setHorarios(pulo.current.lista);
      setAvisoData(pulo.current.aviso);
      pulo.current = null;
      return;
    }
    setCarregandoHorarios(true);
    try {
      const lista = await buscarDia(data);
      if (!lista.some((h) => h.disponivel) && !dataEscolhida) {
        // A data foi escolhida automaticamente (hoje): pula para o próximo dia com horário.
        const proximo = await procurarProximoDia(data);
        if (proximo) {
          pulo.current = {
            ...proximo,
            aviso: `Não há mais horários livres em ${dataPorExtenso(data)}. Mostrando o próximo dia disponível.`,
          };
          setData(proximo.dia);
          return;
        }
      }
      setHorarios(lista);
    } catch (e) {
      setHorarios([]);
      setErro(mensagemErro(e));
    } finally {
      setCarregandoHorarios(false);
    }
  }, [servicoId, barbeiroId, data, dataEscolhida, buscarDia, procurarProximoDia]);

  async function irParaProximoDia() {
    setCarregandoHorarios(true);
    try {
      const proximo = await procurarProximoDia(data);
      if (proximo) {
        pulo.current = { ...proximo, aviso: "" };
        setData(proximo.dia);
      } else {
        setErro("Não encontramos horários livres nas próximas 2 semanas. Tente outro barbeiro.");
      }
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setCarregandoHorarios(false);
    }
  }

  function escolherData(dia) {
    setDataEscolhida(true);
    setData(dia);
  }

  useEffect(() => {
    carregarHorarios();
  }, [carregarHorarios]);

  const servico = servicos.find((s) => s.id === servicoId);
  const barbeiro = barbeiros.find((b) => b.id === barbeiroId);
  const livres = horarios?.filter((h) => h.disponivel).length ?? 0;

  async function confirmar() {
    setErro("");
    if (!servicoId) return setErro("Escolha um serviço para continuar.");
    if (!barbeiroId) return setErro("Escolha um barbeiro para continuar.");
    if (!hora) return setErro("Escolha um horário para continuar.");
    setEnviando(true);
    try {
      const { data: agendamento } = await api.post("/agendamentos", {
        servico_id: servicoId,
        barbeiro_id: barbeiroId,
        inicio: `${data}T${hora}`,
        observacao: observacao.trim() || null,
      });
      navegar("/meus-agendamentos", { state: { confirmado: agendamento } });
    } catch (e) {
      setErro(mensagemErro(e));
      if (e.response?.status === 409) carregarHorarios();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section>
      <TituloPagina subtitulo="Escolha o serviço, o barbeiro, o dia e o horário.">Novo agendamento</TituloPagina>

      <div className="agendar">
        <div className="agendar-passos">
          <fieldset className="passo passo-servico">
            <legend><span className="passo-numero">1</span> Selecione o serviço</legend>
            <div className="opcoes">
              {servicos.map((s) => (
                <label key={s.id} className={`opcao ${servicoId === s.id ? "opcao-marcada" : ""}`}>
                  <input type="radio" name="servico" className="sr-only" value={s.id} checked={servicoId === s.id} onChange={() => setServicoId(s.id)} />
                  <span className="opcao-titulo">{s.nome}</span>
                  <span className="opcao-detalhe">{duracaoTexto(s.duracao_min)}</span>
                  <span className="opcao-preco">{moeda(s.preco)}</span>
                  {servicoId === s.id && <span className="opcao-check-icone"><Icone nome="check" tamanho={22} /></span>}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="passo passo-data">
            <legend><span className="passo-numero">2</span> Escolha a data</legend>
            <Calendario valor={data} min={hojeISO()} max={hojeISO(60)} aoMudar={escolherData} />
          </fieldset>

          <fieldset className="passo passo-barbeiro">
            <legend><span className="passo-numero">3</span> Escolha o barbeiro</legend>
            <div className="opcoes opcoes-barbeiros">
              {barbeiros.map((b) => (
                <label key={b.id} className={`opcao opcao-barbeiro ${barbeiroId === b.id ? "opcao-marcada" : ""}`}>
                  <input type="radio" name="barbeiro" className="sr-only" value={b.id} checked={barbeiroId === b.id} onChange={() => setBarbeiroId(b.id)} />
                  <Avatar nome={b.nome} grande />
                  <span className="opcao-titulo">{b.nome}</span>
                  {barbeiroId === b.id && <span className="opcao-check-icone"><Icone nome="check" tamanho={22} /></span>}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="passo passo-horario">
            <legend><span className="passo-numero">4</span> Horários disponíveis</legend>
            {!servicoId || !barbeiroId ? (
              <Alerta tipo="info" titulo="Os horários aparecem aqui">
                {!servicoId && !barbeiroId
                  ? "Escolha o serviço (passo 1) e o barbeiro (passo 3)."
                  : !servicoId
                    ? "Falta escolher o serviço (passo 1)."
                    : "Falta escolher o barbeiro (passo 3)."}
              </Alerta>
            ) : carregandoHorarios || horarios === null ? (
              <Carregando texto="Procurando horários livres..." />
            ) : !horarios?.some((h) => h.disponivel) ? (
              <Alerta
                tipo="info"
                titulo={horarios?.length ? "Todos os horários deste dia estão ocupados" : "Sem horários livres neste dia"}
                acoes={
                  <button type="button" className="botao botao-secundario" onClick={irParaProximoDia}>
                    Ver próximo dia com horário
                  </button>
                }
              >
                {barbeiro?.nome} não tem horário livre em {dataPorExtenso(data)}. Escolha outra data ou outro barbeiro.
              </Alerta>
            ) : (
              <>
                {avisoData && <Alerta tipo="aviso" titulo={avisoData} />}
                <p className="texto-apoio" aria-live="polite">
                  {livres} horário(s) livre(s) em {dataPorExtenso(data)}.
                </p>
                <div className="grade-horarios">
                  {horarios?.map((h) =>
                    h.disponivel ? (
                      <button
                        key={h.hora}
                        type="button"
                        className={`horario ${hora === h.hora ? "horario-marcado" : ""}`}
                        aria-pressed={hora === h.hora}
                        onClick={() => setHora(h.hora)}
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
              </>
            )}
            <div className="campo campo-observacao">
              <label htmlFor="observacao">Observação (opcional)</label>
              <textarea id="observacao" rows={2} maxLength={200} value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Ex.: prefiro máquina 2 nas laterais" />
            </div>
          </fieldset>
        </div>

        <aside className="resumo" aria-labelledby="titulo-resumo">
          <h2 id="titulo-resumo">Resumo do agendamento</h2>
          <dl>
            <div className="resumo-bloco">
              <dt>Serviço</dt>
              <dd>{servico?.nome ?? <span className="resumo-vazio">Não escolhido</span>}</dd>
            </div>
            <div className="resumo-bloco resumo-barbeiro">
              <div>
                <dt>Barbeiro</dt>
                <dd>{barbeiro?.nome ?? <span className="resumo-vazio">Não escolhido</span>}</dd>
              </div>
              {barbeiro && <Avatar nome={barbeiro.nome} grande />}
            </div>
            <div className="resumo-linha">
              <dt>Data</dt>
              <dd>{dataPorExtenso(data).replace(/^\w/, (c) => c.toUpperCase())}</dd>
            </div>
            <div className="resumo-linha">
              <dt>Horário</dt>
              <dd>{hora ?? <span className="resumo-vazio">—</span>}</dd>
            </div>
            <div className="resumo-linha">
              <dt>Duração</dt>
              <dd>{servico ? duracaoTexto(servico.duracao_min) : <span className="resumo-vazio">—</span>}</dd>
            </div>
            <div className="resumo-linha resumo-total">
              <dt>Total</dt>
              <dd>{servico ? moeda(servico.preco) : "R$ 0,00"}</dd>
            </div>
          </dl>

          {erro && <Alerta tipo="erro" titulo={erro} />}

          <button type="button" className="botao botao-principal botao-largo" onClick={confirmar} disabled={enviando}>
            {enviando ? "Confirmando..." : "Confirmar agendamento"}
          </button>
          <Link to="/" className="botao botao-texto botao-largo">Voltar</Link>
        </aside>
      </div>
    </section>
  );
}
