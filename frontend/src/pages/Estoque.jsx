import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api, { errosDeValidacao, mensagemErro } from "../api";
import {
  Alerta,
  Campo,
  Carregando,
  CartaoNumero,
  Icone,
  Modal,
  Segmentado,
  TituloPagina,
  useTituloDocumento,
} from "../components";
import { dataPorExtenso, hora, moeda, valorEmReais } from "../formatos";

const TIPOS = { consumo: "Consumo interno", venda: "Para venda" };

function Situacao({ produto }) {
  return produto.estoque_baixo ? (
    <span className="etiqueta etiqueta-baixo">
      <Icone nome="aviso" tamanho={15} /> Estoque baixo
    </span>
  ) : (
    <span className="etiqueta etiqueta-ok">
      <Icone nome="sucesso" tamanho={15} /> Normal
    </span>
  );
}

/** Barrinha de nível (decorativa: o número e a situação já estão escritos ao lado). */
function Nivel({ produto }) {
  const referencia = Math.max(produto.quantidade_minima * 3, 1);
  const largura = Math.min(100, Math.round((produto.quantidade / referencia) * 100));
  return (
    <span className="nivel" aria-hidden="true">
      <span className={`nivel-barra nivel-${produto.estoque_baixo ? "baixo" : "ok"} nivel-${Math.round(largura / 10) * 10}`} />
    </span>
  );
}

/* ---------------- Modal: novo produto / editar ---------------- */

function ModalProduto({ aberto, produto, tipoInicial, aoFechar, aoSalvar }) {
  const editando = Boolean(produto);
  const [dados, setDados] = useState({});
  const [erros, setErros] = useState({});
  const [erroGeral, setErroGeral] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setDados({
      nome: produto?.nome ?? "",
      categoria: produto?.categoria ?? "",
      tipo: produto?.tipo ?? tipoInicial ?? "consumo",
      preco_venda: produto?.preco_venda ?? "",
      quantidade: "0",
      quantidade_minima: String(produto?.quantidade_minima ?? 5),
    });
    setErros({});
    setErroGeral("");
  }, [aberto, produto, tipoInicial]);

  const alterar = (c) => (e) => setDados({ ...dados, [c]: e.target.value });

  async function salvar(e) {
    e.preventDefault();
    const loc = {};
    if ((dados.nome ?? "").trim().length < 2) loc.nome = "Informe o nome do produto.";
    if ((dados.categoria ?? "").trim().length < 2) loc.categoria = "Informe a categoria, por exemplo Barba.";
    if (dados.tipo === "venda" && !valorEmReais(dados.preco_venda)) {
      loc.preco_venda = "Informe o preço de venda, por exemplo 45,00.";
    }
    if (!editando && !(Number(dados.quantidade) >= 0)) loc.quantidade = "Informe 0 ou mais.";
    if (!(Number(dados.quantidade_minima) >= 0)) loc.quantidade_minima = "Informe 0 ou mais.";
    setErros(loc);
    setErroGeral("");
    if (Object.keys(loc).length) return;

    const corpo = {
      nome: dados.nome.trim(),
      categoria: dados.categoria.trim(),
      tipo: dados.tipo,
      preco_venda: dados.tipo === "venda" ? valorEmReais(dados.preco_venda).toFixed(2) : null,
      quantidade_minima: Number(dados.quantidade_minima),
      ...(editando ? {} : { quantidade: Number(dados.quantidade) }),
    };
    setEnviando(true);
    try {
      const { data } = editando ? await api.put(`/produtos/${produto.id}`, corpo) : await api.post("/produtos", corpo);
      aoSalvar(data, editando);
    } catch (er) {
      const { campos, gerais } = errosDeValidacao(er);
      setErros(campos);
      setErroGeral(gerais[0] || (Object.keys(campos).length ? "" : mensagemErro(er)));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={editando ? "Editar produto" : "Novo produto"}
      subtitulo={editando ? "A quantidade muda só por movimentação, para ficar no histórico." : "Cadastre um item de consumo ou de venda."}
      rodape={
        <>
          <button type="button" className="botao botao-texto" onClick={aoFechar}>Cancelar</button>
          <button type="submit" form="form-produto" className="botao botao-principal" disabled={enviando}>
            {enviando ? "Salvando..." : editando ? "Salvar alterações" : "Cadastrar produto"}
          </button>
        </>
      }
    >
      {erroGeral && <Alerta tipo="erro" titulo={erroGeral} />}
      <form id="form-produto" onSubmit={salvar} noValidate>
        <Segmentado
          legenda="Este produto é para"
          nome="tipo-produto"
          valor={dados.tipo}
          aoMudar={(tipo) => setDados({ ...dados, tipo })}
          opcoes={[
            { valor: "consumo", texto: "Uso nos atendimentos", icone: "tesoura" },
            { valor: "venda", texto: "Vender no PDV", icone: "carrinho" },
          ]}
        />
        <div className="form-grade">
          <Campo id="p-nome" label="Nome do produto" value={dados.nome ?? ""} onChange={alterar("nome")} erro={erros.nome} maxLength={100} />
          <Campo id="p-categoria" label="Categoria" value={dados.categoria ?? ""} onChange={alterar("categoria")} erro={erros.categoria} maxLength={50} list="categorias" />
          {dados.tipo === "venda" && (
            <Campo id="p-preco" label="Preço de venda (R$)" inputMode="decimal" placeholder="45,00" value={dados.preco_venda ?? ""} onChange={alterar("preco_venda")} erro={erros.preco_venda} />
          )}
          {!editando && (
            <Campo id="p-quantidade" label="Quantidade inicial" type="number" inputMode="numeric" min="0" value={dados.quantidade ?? ""} onChange={alterar("quantidade")} erro={erros.quantidade} />
          )}
          <Campo id="p-minima" label="Quantidade mínima" dica="Abaixo disso o sistema avisa." type="number" inputMode="numeric" min="0" value={dados.quantidade_minima ?? ""} onChange={alterar("quantidade_minima")} erro={erros.quantidade_minima} />
        </div>
        <datalist id="categorias">
          {["Finalização", "Barba", "Cabelo", "Descartáveis", "Higiene"].map((c) => <option key={c} value={c} />)}
        </datalist>
      </form>
    </Modal>
  );
}

/* ---------------- Modal: movimentar ---------------- */

function ModalMovimentar({ produto, aoFechar, aoSalvar }) {
  const [tipo, setTipo] = useState("entrada");
  const [quantidade, setQuantidade] = useState(1);
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState("");
  const [historico, setHistorico] = useState(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!produto) return;
    setTipo("entrada");
    setQuantidade(1);
    setObservacao("");
    setErro("");
    setHistorico(null);
    api.get(`/produtos/${produto.id}/movimentacoes`, { params: { limite: 8 } })
      .then((r) => setHistorico(r.data))
      .catch(() => setHistorico([]));
  }, [produto]);

  if (!produto) return <Modal aberto={false} aoFechar={aoFechar} titulo="" />;

  const qtd = Number(quantidade) || 0;
  const saldoApos = tipo === "entrada" ? produto.quantidade + qtd : produto.quantidade - qtd;
  const invalido = qtd <= 0 || !Number.isInteger(qtd) || saldoApos < 0;

  async function salvar(e) {
    e.preventDefault();
    setErro("");
    if (qtd <= 0 || !Number.isInteger(qtd)) return setErro("Informe uma quantidade inteira maior que zero.");
    if (saldoApos < 0) return setErro(`Saída maior que o estoque. Disponível: ${produto.quantidade} unidade(s).`);
    setEnviando(true);
    try {
      const { data } = await api.post(`/produtos/${produto.id}/movimentacoes`, {
        tipo,
        quantidade: qtd,
        observacao: observacao.trim() || null,
      });
      aoSalvar(data);
    } catch (er) {
      setErro(mensagemErro(er));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo="Movimentar estoque"
      subtitulo={`${produto.nome} · ${TIPOS[produto.tipo]}`}
      rodape={
        <>
          <button type="button" className="botao botao-texto" onClick={aoFechar}>Cancelar</button>
          <button type="submit" form="form-mov" className="botao botao-principal" disabled={enviando || invalido}>
            {enviando ? "Salvando..." : tipo === "entrada" ? "Registrar entrada" : "Registrar saída"}
          </button>
        </>
      }
    >
      {erro && <Alerta tipo="erro" titulo={erro} />}
      <form id="form-mov" onSubmit={salvar} noValidate>
        <Segmentado
          legenda="Tipo de movimentação"
          nome="tipo-mov"
          valor={tipo}
          aoMudar={setTipo}
          opcoes={[
            { valor: "entrada", texto: "Entrada", icone: "mais", classe: "segmentado-entrada" },
            { valor: "saida", texto: "Saída", icone: "menos", classe: "segmentado-saida" },
          ]}
        />

        <div className="campo">
          <label htmlFor="mov-qtd">Quantidade</label>
          <div className="contador">
            <button type="button" className="contador-botao" onClick={() => setQuantidade(Math.max(1, qtd - 1))} aria-label="Diminuir quantidade">
              <Icone nome="menos" tamanho={20} />
            </button>
            <input id="mov-qtd" type="number" inputMode="numeric" min="1" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
            <button type="button" className="contador-botao" onClick={() => setQuantidade(qtd + 1)} aria-label="Aumentar quantidade">
              <Icone nome="mais" tamanho={20} />
            </button>
          </div>
        </div>

        <div className="saldo-previa" aria-live="polite">
          <div>
            <span className="texto-apoio">Saldo atual</span>
            <strong>{produto.quantidade}</strong>
          </div>
          <Icone nome="direita" />
          <div>
            <span className="texto-apoio">Saldo depois</span>
            <strong className={saldoApos < 0 ? "texto-erro" : saldoApos <= produto.quantidade_minima ? "texto-aviso" : ""}>
              {saldoApos}
            </strong>
          </div>
          {saldoApos >= 0 && saldoApos <= produto.quantidade_minima && (
            <span className="etiqueta etiqueta-baixo"><Icone nome="aviso" tamanho={15} /> Vai ficar abaixo do mínimo ({produto.quantidade_minima})</span>
          )}
        </div>

        <Campo id="mov-obs" label="Observação (opcional)" placeholder={tipo === "entrada" ? "Ex.: compra do fornecedor" : "Ex.: usado nos atendimentos"} value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={200} />
      </form>

      <h3>Últimas movimentações</h3>
      {historico === null ? (
        <Carregando />
      ) : historico.length === 0 ? (
        <p className="texto-apoio">Nenhuma movimentação registrada.</p>
      ) : (
        <ul className="lista-historico">
          {historico.map((m) => (
            <li key={m.id}>
              <span className={`etiqueta etiqueta-${m.tipo}`}>{m.tipo === "entrada" ? "+" : "−"} {m.quantidade}</span>
              <span className="historico-texto">
                <span>{m.observacao || (m.tipo === "entrada" ? "Entrada" : "Saída")}</span>
                <span className="texto-apoio">{dataPorExtenso(m.criado_em)} {hora(m.criado_em)} · saldo {m.saldo_apos}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/* ---------------- Página ---------------- */

export default function Estoque() {
  useTituloDocumento("Estoque");
  const [parametros] = useSearchParams();
  const [produtos, setProdutos] = useState(null);
  const [aba, setAba] = useState("todos");
  const [busca, setBusca] = useState("");
  const [soBaixo, setSoBaixo] = useState(parametros.get("baixo") === "1");
  const [movimentando, setMovimentando] = useState(null);
  const [editando, setEditando] = useState(null);
  const [novoAberto, setNovoAberto] = useState(false);
  const [mensagem, setMensagem] = useState(null);
  const [excluindo, setExcluindo] = useState(null);
  const [enviandoExclusao, setEnviandoExclusao] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setProdutos((await api.get("/produtos")).data);
    } catch (e) {
      setProdutos([]);
      setMensagem({ tipo: "erro", texto: mensagemErro(e) });
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const lista = produtos ?? [];
  const baixos = lista.filter((p) => p.estoque_baixo);
  const deVenda = lista.filter((p) => p.tipo === "venda");
  const valorVenda = deVenda.reduce((s, p) => s + p.quantidade * Number(p.preco_venda), 0);
  const termo = busca.trim().toLowerCase();
  const visiveis = lista.filter(
    (p) =>
      (aba === "todos" || p.tipo === aba) &&
      (!soBaixo || p.estoque_baixo) &&
      (!termo || p.nome.toLowerCase().includes(termo) || p.categoria.toLowerCase().includes(termo)),
  );

  function substituir(produto) {
    setProdutos((l) => l.map((p) => (p.id === produto.id ? produto : p)));
  }

  function aoMovimentar({ produto, movimentacao, alerta }) {
    substituir(produto);
    setMovimentando(null);
    const acao = movimentacao.tipo === "entrada" ? "Entrada registrada" : "Saída registrada";
    setMensagem(
      alerta
        ? { tipo: "aviso", texto: `${acao}. ${alerta}` }
        : { tipo: "sucesso", texto: `${acao}: ${produto.nome} agora tem ${produto.quantidade} unidade(s).` },
    );
  }

  function aoSalvarProduto(produto, editou) {
    if (editou) substituir(produto);
    else setProdutos((l) => [...l, produto].sort((a, b) => a.nome.localeCompare(b.nome)));
    setNovoAberto(false);
    setEditando(null);
    setMensagem({ tipo: "sucesso", texto: editou ? `“${produto.nome}” atualizado.` : `“${produto.nome}” cadastrado em ${TIPOS[produto.tipo]}.` });
  }

  async function confirmarExclusao() {
    setEnviandoExclusao(true);
    try {
      const { data } = await api.delete(`/produtos/${excluindo.id}`);
      setProdutos((l) => l.filter((p) => p.id !== excluindo.id));
      setMensagem({ tipo: "sucesso", texto: data.mensagem });
    } catch (e) {
      setMensagem({ tipo: "erro", texto: mensagemErro(e) });
    } finally {
      setExcluindo(null);
      setEnviandoExclusao(false);
    }
  }

  const abas = [
    { id: "todos", texto: "Todos", total: lista.length },
    { id: "consumo", texto: "Consumo interno", total: lista.length - deVenda.length },
    { id: "venda", texto: "Para venda", total: deVenda.length },
  ];

  return (
    <section>
      <div className="cabecalho-pagina">
        <TituloPagina subtitulo="Produtos usados nos atendimentos e produtos vendidos no PDV.">Estoque</TituloPagina>
        <button type="button" className="botao botao-principal" onClick={() => setNovoAberto(true)}>
          <Icone nome="mais" tamanho={20} /> Novo produto
        </button>
      </div>

      <div className="grade-numeros">
        <CartaoNumero rotulo="Produtos cadastrados" valor={lista.length} detalhe={`${deVenda.length} para venda`} icone="caixa" />
        <CartaoNumero rotulo="Estoque baixo" valor={baixos.length} detalhe={baixos.length ? "precisam de reposição" : "tudo em dia"} icone="aviso" tom={baixos.length ? "aviso" : undefined} />
        <CartaoNumero rotulo="Valor em produtos de venda" valor={moeda(valorVenda)} detalhe="pelo preço de venda" icone="carrinho" />
      </div>

      {mensagem && <Alerta tipo={mensagem.tipo} titulo={mensagem.texto} />}

      {baixos.length > 0 && !soBaixo && (
        <Alerta
          tipo="aviso"
          titulo={`${baixos.length} produto(s) com estoque baixo`}
          acoes={<button type="button" className="botao botao-secundario" onClick={() => setSoBaixo(true)}>Mostrar só esses</button>}
        >
          {baixos.slice(0, 4).map((p) => `${p.nome} (${p.quantidade})`).join(" · ")}
          {baixos.length > 4 && " · ..."}
        </Alerta>
      )}

      <div className="abas" role="group" aria-label="Tipo de estoque">
        {abas.map((a) => (
          <button key={a.id} type="button" className={`aba ${aba === a.id ? "aba-ativa" : ""}`} aria-pressed={aba === a.id} onClick={() => setAba(a.id)}>
            {a.texto} <span className="aba-total">{a.total}</span>
          </button>
        ))}
      </div>

      <div className="filtros">
        <div className="campo">
          <label htmlFor="busca">Buscar produto</label>
          <input id="busca" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome ou categoria" />
        </div>
        <label className="opcao-check">
          <input type="checkbox" checked={soBaixo} onChange={(e) => setSoBaixo(e.target.checked)} />
          Só estoque baixo
        </label>
      </div>

      {produtos === null ? (
        <Carregando texto="Carregando produtos..." />
      ) : (
        <div className="tabela-rolagem" tabIndex={0} role="region" aria-label="Lista de produtos">
          <table className="tabela">
            <caption className="sr-only">Produtos em estoque</caption>
            <thead>
              <tr>
                <th scope="col">Produto</th>
                <th scope="col">Tipo</th>
                <th scope="col" className="num">Preço</th>
                <th scope="col" className="num">Qtd.</th>
                <th scope="col">Nível</th>
                <th scope="col">Situação</th>
                <th scope="col"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((p) => (
                <tr key={p.id} className={p.estoque_baixo ? "linha-baixa" : ""}>
                  <th scope="row">
                    <span className="produto-nome">{p.nome}</span>
                    <span className="produto-categoria">{p.categoria}</span>
                  </th>
                  <td>
                    <span className={`etiqueta etiqueta-tipo-${p.tipo}`}>
                      <Icone nome={p.tipo === "venda" ? "carrinho" : "tesoura"} tamanho={14} /> {p.tipo === "venda" ? "Venda" : "Consumo"}
                    </span>
                  </td>
                  <td className="num">{p.preco_venda ? moeda(p.preco_venda) : "—"}</td>
                  <td className="num"><strong>{p.quantidade}</strong> <span className="texto-apoio">/ mín. {p.quantidade_minima}</span></td>
                  <td><Nivel produto={p} /></td>
                  <td><Situacao produto={p} /></td>
                  <td>
                    <div className="acoes-linha">
                      <button type="button" className="botao botao-secundario botao-pequeno" onClick={() => setMovimentando(p)}>
                        <Icone nome="setas" tamanho={16} /> Movimentar<span className="sr-only"> {p.nome}</span>
                      </button>
                      <button type="button" className="botao-icone" onClick={() => setEditando(p)} aria-label={`Editar ${p.nome}`}>
                        <Icone nome="lapis" tamanho={18} />
                      </button>
                      <button type="button" className="botao-icone botao-icone-perigo" onClick={() => setExcluindo(p)} aria-label={`Excluir ${p.nome}`} title="Excluir produto">
                        <Icone nome="lixeira" tamanho={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {visiveis.length === 0 && (
                <tr>
                  <td colSpan={7} className="tabela-vazia">Nenhum produto encontrado com esses filtros.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        aberto={Boolean(excluindo)}
        aoFechar={() => setExcluindo(null)}
        largura="pequena"
        titulo={excluindo ? `Excluir “${excluindo.nome}”?` : ""}
        subtitulo="Use quando o produto não for mais usado nem vendido."
        rodape={
          <>
            <button type="button" className="botao botao-texto" onClick={() => setExcluindo(null)}>Voltar</button>
            <button type="button" className="botao botao-perigo" onClick={confirmarExclusao} disabled={enviandoExclusao}>
              {enviandoExclusao ? "Excluindo..." : "Sim, excluir"}
            </button>
          </>
        }
      >
        <ul className="lista-passos">
          <li>Se o produto nunca teve entradas, saídas ou vendas, ele é apagado.</li>
          <li>Se já tem histórico, ele é <strong>arquivado</strong>: sai das listas e do PDV, mas as vendas e movimentações antigas continuam nos relatórios.</li>
        </ul>
      </Modal>

      <ModalMovimentar produto={movimentando} aoFechar={() => setMovimentando(null)} aoSalvar={aoMovimentar} />
      <ModalProduto
        aberto={novoAberto || Boolean(editando)}
        produto={editando}
        tipoInicial={aba === "venda" ? "venda" : "consumo"}
        aoFechar={() => {
          setNovoAberto(false);
          setEditando(null);
        }}
        aoSalvar={aoSalvarProduto}
      />
    </section>
  );
}
