import { useEffect, useState } from "react";
import api, { errosDeValidacao, mensagemErro } from "../api";
import { Alerta, Avatar, Campo, Carregando, Icone, Modal, TituloPagina, useTituloDocumento } from "../components";
import { DIAS_SEMANA } from "../formatos";

const CURTO = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const ESCALA_INICIO = 7 * 60; // a linha do tempo vai das 7h
const ESCALA_FIM = 21 * 60; // às 21h
const MARCAS = [8, 10, 12, 14, 16, 18, 20];

const paraMin = (h) => {
  const [hh, mm] = h.slice(0, 5).split(":").map(Number);
  return hh * 60 + mm;
};
const hhmm = (h) => h.slice(0, 5);

/** Intervalos de cada dia: [[{inicio, fim}], ...] (índice 0 = segunda). */
function porDia(horarios) {
  return DIAS_SEMANA.map((_, i) =>
    horarios
      .filter((h) => h.dia_semana === i)
      .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio))
      .map((h) => ({ inicio: hhmm(h.hora_inicio), fim: hhmm(h.hora_fim) })),
  );
}

const textoDia = (intervalos) => intervalos.map((i) => `${i.inicio}–${i.fim}`).join(" e ");

/** Junta dias seguidos com o mesmo horário: "Seg a Sáb: 09:00–12:00 e 13:00–19:00". */
function resumo(dias) {
  const grupos = [];
  dias.forEach((intervalos, i) => {
    const texto = intervalos.length ? textoDia(intervalos) : "Folga";
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.texto === texto && ultimo.fim === i - 1) ultimo.fim = i;
    else grupos.push({ inicio: i, fim: i, texto });
  });
  return grupos.map((g) => ({
    dias: g.inicio === g.fim ? CURTO[g.inicio] : `${CURTO[g.inicio]} a ${CURTO[g.fim]}`,
    texto: g.texto,
    folga: g.texto === "Folga",
  }));
}

function horasSemana(dias) {
  const minutos = dias.flat().reduce((s, i) => s + paraMin(i.fim) - paraMin(i.inicio), 0);
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

function LinhaDoTempo({ dias }) {
  const total = ESCALA_FIM - ESCALA_INICIO;
  const pos = (min) => `${((Math.min(Math.max(min, ESCALA_INICIO), ESCALA_FIM) - ESCALA_INICIO) / total) * 100}%`;
  return (
    <div className="semana" aria-hidden="true">
      <div className="semana-linha semana-escala">
        <span />
        <div className="semana-trilho semana-trilho-escala">
          {MARCAS.map((h) => (
            <span key={h} className="semana-marca" style={{ left: pos(h * 60) }}>{h}h</span>
          ))}
        </div>
      </div>
      {dias.map((intervalos, i) => (
        <div key={CURTO[i]} className={`semana-linha ${intervalos.length ? "" : "semana-folga"}`}>
          <span className="semana-dia">{CURTO[i]}</span>
          <div className="semana-trilho">
            {MARCAS.map((h) => (
              <span key={h} className="semana-grade" style={{ left: pos(h * 60) }} />
            ))}
            {intervalos.length === 0 && <span className="semana-folga-texto">Folga</span>}
            {intervalos.map((t) => (
              <span
                key={t.inicio}
                className="semana-bloco"
                style={{ left: pos(paraMin(t.inicio)), width: `calc(${pos(paraMin(t.fim))} - ${pos(paraMin(t.inicio))})` }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CartaoBarbeiro({ barbeiro, aoEditar, aoSenha, aoDesativar }) {
  const dias = porDia(barbeiro.horarios);
  const diasTrabalho = dias.filter((d) => d.length).length;
  return (
    <li className="cartao barbeiro-cartao">
      <div className="barbeiro-topo">
        <Avatar nome={barbeiro.nome} grande />
        <div className="barbeiro-titulo">
          <h2>{barbeiro.nome}</h2>
          <p className="texto-apoio">
            {diasTrabalho} {diasTrabalho === 1 ? "dia" : "dias"} por semana · {horasSemana(dias)} de atendimento
          </p>
        </div>
        <div className="barbeiro-acoes">
          <button type="button" className="botao botao-secundario botao-pequeno" onClick={() => aoEditar(barbeiro)}>
            <Icone nome="lapis" tamanho={16} /> Editar horários<span className="sr-only"> de {barbeiro.nome}</span>
          </button>
          <button type="button" className="botao-icone" onClick={() => aoSenha(barbeiro)} aria-label={`Gerar senha temporária para ${barbeiro.nome}`} title="Esqueceu a senha? Gerar senha temporária">
            <Icone nome="chave" tamanho={18} />
          </button>
          <button type="button" className="botao-icone botao-icone-perigo" onClick={() => aoDesativar(barbeiro)} aria-label={`Desativar ${barbeiro.nome}`} title="Desativar barbeiro (saiu da equipe)">
            <Icone nome="lixeira" tamanho={18} />
          </button>
        </div>
      </div>

      <ul className="barbeiro-resumo">
        {resumo(dias).map((g) => (
          <li key={g.dias} className={g.folga ? "resumo-folga" : ""}>
            <span className="resumo-dias">{g.dias}</span>
            <span className="resumo-horas">
              <Icone nome={g.folga ? "fechar" : "relogio"} tamanho={16} /> {g.texto}
            </span>
          </li>
        ))}
      </ul>

      <LinhaDoTempo dias={dias} />
    </li>
  );
}

/* ---------------- Formulário de horários (cadastro e edição) ---------------- */

function diasDoBarbeiro(barbeiro) {
  if (!barbeiro) {
    return DIAS_SEMANA.map((_, i) => ({ ativo: i < 6, inicio: "09:00", fim: "19:00" }));
  }
  return porDia(barbeiro.horarios).map((intervalos) =>
    intervalos.length
      ? { ativo: true, inicio: intervalos[0].inicio, fim: intervalos[intervalos.length - 1].fim }
      : { ativo: false, inicio: "09:00", fim: "19:00" },
  );
}

function pausaDoBarbeiro(barbeiro) {
  const dia = barbeiro ? porDia(barbeiro.horarios).find((d) => d.length > 1) : null;
  if (!barbeiro) return { ativa: true, inicio: "12:00", fim: "13:00" };
  return dia ? { ativa: true, inicio: dia[0].fim, fim: dia[1].inicio } : { ativa: false, inicio: "12:00", fim: "13:00" };
}

function ModalBarbeiro({ aberto, barbeiro, aoFechar, aoSalvar }) {
  const editando = Boolean(barbeiro);
  const [dados, setDados] = useState({ nome: "", email: "", telefone: "", senha: "" });
  const [dias, setDias] = useState(diasDoBarbeiro(null));
  const [pausa, setPausa] = useState(pausaDoBarbeiro(null));
  const [erros, setErros] = useState({});
  const [erroGeral, setErroGeral] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setDados({ nome: "", email: "", telefone: "", senha: "" });
    setDias(diasDoBarbeiro(barbeiro));
    setPausa(pausaDoBarbeiro(barbeiro));
    setErros({});
    setErroGeral("");
  }, [aberto, barbeiro]);

  const alterar = (c) => (e) => setDados({ ...dados, [c]: e.target.value });
  const alterarDia = (i, campo, valor) => setDias(dias.map((d, j) => (j === i ? { ...d, [campo]: valor } : d)));
  const copiarSegunda = () => setDias(dias.map((d, i) => (i === 6 ? d : { ...dias[0], ativo: d.ativo })));

  function montarHorarios() {
    const lista = [];
    dias.forEach((d, i) => {
      if (!d.ativo) return;
      const pausaDentro = pausa.ativa && pausa.inicio > d.inicio && pausa.fim < d.fim && pausa.fim > pausa.inicio;
      if (pausaDentro) {
        lista.push({ dia_semana: i, hora_inicio: d.inicio, hora_fim: pausa.inicio });
        lista.push({ dia_semana: i, hora_inicio: pausa.fim, hora_fim: d.fim });
      } else {
        lista.push({ dia_semana: i, hora_inicio: d.inicio, hora_fim: d.fim });
      }
    });
    return lista;
  }

  async function salvar(e) {
    e.preventDefault();
    const loc = {};
    if (!editando) {
      if (dados.nome.trim().length < 2) loc.nome = "Informe o nome do barbeiro.";
      if (!/^\S+@\S+\.\S+$/.test(dados.email.trim())) loc.email = "Informe um e-mail válido.";
      if (dados.telefone.replace(/\D/g, "").length < 10) loc.telefone = "Informe o telefone com DDD.";
      if (dados.senha.length < 8) loc.senha = "A senha inicial precisa ter pelo menos 8 caracteres.";
    }
    if (!dias.some((d) => d.ativo)) loc.horarios = "Marque pelo menos um dia de atendimento.";
    else if (dias.some((d) => d.ativo && d.fim <= d.inicio)) loc.horarios = "Em cada dia, a saída precisa ser depois da entrada.";
    else if (pausa.ativa && pausa.fim <= pausa.inicio) loc.horarios = "O fim da pausa precisa ser depois do início.";
    setErros(loc);
    setErroGeral("");
    if (Object.keys(loc).length) return;

    setEnviando(true);
    try {
      const horarios = montarHorarios();
      const { data } = editando
        ? await api.put(`/barbeiros/${barbeiro.id}/horarios`, { horarios })
        : await api.post("/barbeiros", { ...dados, nome: dados.nome.trim(), email: dados.email.trim(), horarios });
      aoSalvar(data, editando);
    } catch (er) {
      const { campos, gerais } = errosDeValidacao(er);
      setErros(campos);
      setErroGeral(gerais[0] || (Object.keys(campos).length ? "Confira os campos destacados." : mensagemErro(er)));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={editando ? `Horários de ${barbeiro.nome}` : "Cadastrar barbeiro"}
      subtitulo={editando ? "Os novos horários valem para os próximos agendamentos." : "Dados de acesso e dias de atendimento."}
      rodape={
        <>
          <button type="button" className="botao botao-texto" onClick={aoFechar}>Cancelar</button>
          <button type="submit" form="form-barbeiro" className="botao botao-principal" disabled={enviando}>
            {enviando ? "Salvando..." : editando ? "Salvar horários" : "Cadastrar barbeiro"}
          </button>
        </>
      }
    >
      {erroGeral && <Alerta tipo="erro" titulo={erroGeral} />}
      <form id="form-barbeiro" onSubmit={salvar} noValidate>
        {!editando && (
          <div className="form-grade">
            <Campo id="b-nome" label="Nome" value={dados.nome} onChange={alterar("nome")} erro={erros.nome} maxLength={100} />
            <Campo id="b-email" label="E-mail de acesso" type="email" value={dados.email} onChange={alterar("email")} erro={erros.email} maxLength={120} />
            <Campo id="b-telefone" label="Celular com DDD" type="tel" value={dados.telefone} onChange={alterar("telefone")} erro={erros.telefone} maxLength={20} />
            <Campo id="b-senha" label="Senha inicial" type="password" autoComplete="new-password" value={dados.senha} onChange={alterar("senha")} erro={erros.senha} maxLength={72} />
          </div>
        )}

        <fieldset className="horarios-form" aria-describedby={erros.horarios ? "erro-horarios" : undefined}>
          <div className="horarios-form-topo">
            <legend>Dias e horários</legend>
            <button type="button" className="botao botao-texto botao-pequeno" onClick={copiarSegunda}>
              Copiar horário de segunda para os outros dias
            </button>
          </div>
          <div className="dias-lista">
            <div className="dias-cabecalho" aria-hidden="true">
              <span>Dia</span>
              <span>Entrada</span>
              <span>Saída</span>
            </div>
            {dias.map((d, i) => (
              <div key={CURTO[i]} className={`dia-linha ${d.ativo ? "" : "dia-desligado"}`}>
                <label className="interruptor">
                  <input type="checkbox" checked={d.ativo} onChange={(e) => alterarDia(i, "ativo", e.target.checked)} />
                  <span className="interruptor-trilho" aria-hidden="true" />
                  <span className="interruptor-texto">{DIAS_SEMANA[i]}</span>
                </label>
                {d.ativo ? (
                  <>
                    <input type="time" value={d.inicio} onChange={(e) => alterarDia(i, "inicio", e.target.value)} aria-label={`${DIAS_SEMANA[i]}: entrada`} />
                    <input type="time" value={d.fim} onChange={(e) => alterarDia(i, "fim", e.target.value)} aria-label={`${DIAS_SEMANA[i]}: saída`} />
                  </>
                ) : (
                  <span className="dia-folga">Folga</span>
                )}
              </div>
            ))}
          </div>

          <div className={`pausa ${pausa.ativa ? "pausa-ativa" : ""}`}>
            <label className="interruptor">
              <input type="checkbox" checked={pausa.ativa} onChange={(e) => setPausa({ ...pausa, ativa: e.target.checked })} />
              <span className="interruptor-trilho" aria-hidden="true" />
              <span className="interruptor-texto">Pausa para almoço</span>
            </label>
            {pausa.ativa && (
              <div className="pausa-horas">
                <input type="time" value={pausa.inicio} onChange={(e) => setPausa({ ...pausa, inicio: e.target.value })} aria-label="Início da pausa" />
                <span>até</span>
                <input type="time" value={pausa.fim} onChange={(e) => setPausa({ ...pausa, fim: e.target.value })} aria-label="Fim da pausa" />
              </div>
            )}
          </div>
          {erros.horarios && <p id="erro-horarios" className="campo-erro"><Icone nome="erro" tamanho={16} /> {erros.horarios}</p>}
        </fieldset>

        <p className="texto-apoio">Prévia da semana:</p>
        <LinhaDoTempo dias={porDia(montarHorarios())} />
      </form>
    </Modal>
  );
}

/* ---------------- Senha temporária ---------------- */

function ModalSenha({ barbeiro, aoFechar }) {
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    setResultado(null);
    setErro("");
    setCopiado(false);
  }, [barbeiro]);

  async function gerar() {
    setEnviando(true);
    setErro("");
    try {
      setResultado((await api.post(`/barbeiros/${barbeiro.id}/senha-temporaria`)).data);
    } catch (er) {
      setErro(mensagemErro(er));
    } finally {
      setEnviando(false);
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(resultado.senha_temporaria);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <Modal
      aberto={Boolean(barbeiro)}
      aoFechar={aoFechar}
      largura="pequena"
      titulo={barbeiro ? `Senha de ${barbeiro.nome}` : ""}
      subtitulo={resultado ? "Mostrada só uma vez." : "Para quando o barbeiro esquece a senha."}
      rodape={
        resultado ? (
          <button type="button" className="botao botao-principal botao-largo" onClick={aoFechar}>Pronto</button>
        ) : (
          <>
            <button type="button" className="botao botao-texto" onClick={aoFechar}>Cancelar</button>
            <button type="button" className="botao botao-principal" onClick={gerar} disabled={enviando}>
              <Icone nome="chave" tamanho={18} /> {enviando ? "Gerando..." : "Gerar senha temporária"}
            </button>
          </>
        )
      }
    >
      {erro && <Alerta tipo="erro" titulo={erro} />}
      {resultado ? (
        <>
          <p className="texto-apoio">Senha temporária:</p>
          <div className="senha-temporaria">
            <code>{resultado.senha_temporaria}</code>
            <button type="button" className="botao botao-secundario botao-pequeno" onClick={copiar}>
              <Icone nome={copiado ? "sucesso" : "recibo"} tamanho={16} /> {copiado ? "Copiada" : "Copiar"}
            </button>
          </div>
          <Alerta tipo="info" titulo="Próximo passo">{resultado.mensagem}</Alerta>
        </>
      ) : (
        barbeiro && (
          <ul className="lista-passos">
            <li>O sistema cria uma senha temporária e mostra aqui uma única vez.</li>
            <li>A senha antiga de {barbeiro.nome} deixa de funcionar e ele sai de todos os aparelhos.</li>
            <li>No primeiro acesso, ele é obrigado a criar uma senha nova.</li>
          </ul>
        )
      )}
    </Modal>
  );
}

/* ---------------- Desativar ---------------- */

function ModalDesativar({ barbeiro, aoFechar, aoDesativar }) {
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => setErro(""), [barbeiro]);

  async function confirmar() {
    setEnviando(true);
    setErro("");
    try {
      await api.delete(`/barbeiros/${barbeiro.id}`);
      aoDesativar(barbeiro);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      aberto={Boolean(barbeiro)}
      aoFechar={aoFechar}
      largura="pequena"
      titulo={barbeiro ? `Desativar ${barbeiro.nome}?` : ""}
      subtitulo="Use quando o barbeiro sair da equipe."
      rodape={
        <>
          <button type="button" className="botao botao-texto" onClick={aoFechar}>Voltar</button>
          <button type="button" className="botao botao-perigo" onClick={confirmar} disabled={enviando}>
            {enviando ? "Desativando..." : "Sim, desativar"}
          </button>
        </>
      }
    >
      {erro && <Alerta tipo="erro" titulo={erro} />}
      {barbeiro && (
        <ul className="lista-passos">
          <li>{barbeiro.nome} deixa de aparecer na tela de agendamento dos clientes.</li>
          <li>O acesso dele ao sistema é bloqueado.</li>
          <li>Os atendimentos já feitos continuam no histórico e no faturamento.</li>
          <li>Se ainda houver horários marcados com ele, remarque ou cancele antes na Agenda.</li>
        </ul>
      )}
    </Modal>
  );
}

/* ---------------- Página ---------------- */

export default function Barbeiros() {
  useTituloDocumento("Barbeiros");
  const [barbeiros, setBarbeiros] = useState(null);
  const [mensagem, setMensagem] = useState(null);
  const [editando, setEditando] = useState(null);
  const [novo, setNovo] = useState(false);
  const [senhaDe, setSenhaDe] = useState(null);
  const [desativando, setDesativando] = useState(null);

  useEffect(() => {
    api.get("/barbeiros").then((r) => setBarbeiros(r.data)).catch((e) => {
      setBarbeiros([]);
      setMensagem({ tipo: "erro", texto: mensagemErro(e) });
    });
  }, []);

  function aoSalvar(barbeiro, editou) {
    setBarbeiros((l) =>
      (editou ? l.map((b) => (b.id === barbeiro.id ? barbeiro : b)) : [...l, barbeiro]).sort((a, b) => a.nome.localeCompare(b.nome)),
    );
    setEditando(null);
    setNovo(false);
    setMensagem({
      tipo: "sucesso",
      texto: editou ? `Horários de ${barbeiro.nome} atualizados.` : `${barbeiro.nome} foi cadastrado e já aparece na tela de agendamento.`,
    });
  }

  return (
    <section>
      <div className="cabecalho-pagina">
        <TituloPagina subtitulo="Profissionais e horários de atendimento.">Barbeiros</TituloPagina>
        <button type="button" className="botao botao-principal" onClick={() => setNovo(true)}>
          <Icone nome="mais" tamanho={20} /> Cadastrar barbeiro
        </button>
      </div>
      {mensagem && <Alerta tipo={mensagem.tipo} titulo={mensagem.texto} />}

      {barbeiros === null ? (
        <Carregando />
      ) : (
        <ul className="lista-barbeiros-cartoes">
          {barbeiros.map((b) => (
            <CartaoBarbeiro key={b.id} barbeiro={b} aoEditar={setEditando} aoSenha={setSenhaDe} aoDesativar={setDesativando} />
          ))}
        </ul>
      )}

      <ModalBarbeiro
        aberto={novo || Boolean(editando)}
        barbeiro={editando}
        aoFechar={() => {
          setNovo(false);
          setEditando(null);
        }}
        aoSalvar={aoSalvar}
      />
      <ModalSenha barbeiro={senhaDe} aoFechar={() => setSenhaDe(null)} />
      <ModalDesativar
        barbeiro={desativando}
        aoFechar={() => setDesativando(null)}
        aoDesativar={(b) => {
          setBarbeiros((l) => l.filter((x) => x.id !== b.id));
          setDesativando(null);
          setMensagem({ tipo: "sucesso", texto: `${b.nome} foi desativado e não aparece mais para agendamento.` });
        }}
      />
    </section>
  );
}
