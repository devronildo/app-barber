import { useCallback, useEffect, useMemo, useState } from "react";
import api, { mensagemErro } from "../api";
import { useAuth } from "../auth";
import { Alerta, Campo, Carregando, CartaoNumero, Icone, Modal, TituloPagina, useTituloDocumento } from "../components";
import { hora, moeda } from "../formatos";

const FORMAS = [
  { valor: "pix", texto: "Pix" },
  { valor: "dinheiro", texto: "Dinheiro" },
  { valor: "debito", texto: "Débito" },
  { valor: "credito", texto: "Crédito" },
];
const NOME_FORMA = Object.fromEntries(FORMAS.map((f) => [f.valor, f.texto]));

/** Aceita "1.234,50", "45,00" ou "45.5". */
function paraNumero(texto) {
  const t = String(texto ?? "").trim();
  const normalizado = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(normalizado);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function Recibo({ venda }) {
  return (
    <div className="recibo">
      <ul className="recibo-itens">
        {venda.itens.map((i) => (
          <li key={i.produto_id}>
            <span>{i.quantidade}× {i.nome_produto}</span>
            <span>{moeda(i.subtotal)}</span>
          </li>
        ))}
      </ul>
      <dl className="recibo-totais">
        {Number(venda.desconto) > 0 && (
          <>
            <div><dt>Subtotal</dt><dd>{moeda(venda.subtotal)}</dd></div>
            <div><dt>Desconto</dt><dd>− {moeda(venda.desconto)}</dd></div>
          </>
        )}
        <div className="recibo-total"><dt>Total</dt><dd>{moeda(venda.total)}</dd></div>
        <div><dt>Pagamento</dt><dd>{NOME_FORMA[venda.forma_pagamento]}</dd></div>
        {venda.troco != null && (
          <>
            <div><dt>Recebido</dt><dd>{moeda(venda.valor_recebido)}</dd></div>
            <div className="recibo-troco"><dt>Troco</dt><dd>{moeda(venda.troco)}</dd></div>
          </>
        )}
      </dl>
    </div>
  );
}

function VendasDoDia({ recarregar, ehAdmin }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [cancelando, setCancelando] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(() => {
    api.get("/vendas").then((r) => setDados(r.data)).catch((e) => setErro(mensagemErro(e)));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar, recarregar]);

  async function confirmarCancelamento() {
    setEnviando(true);
    try {
      await api.post(`/vendas/${cancelando.id}/cancelar`);
      setCancelando(null);
      carregar();
    } catch (e) {
      setErro(mensagemErro(e));
      setCancelando(null);
    } finally {
      setEnviando(false);
    }
  }

  if (erro) return <Alerta tipo="erro" titulo={erro} />;
  if (!dados) return <Carregando texto="Carregando vendas de hoje..." />;

  return (
    <div>
      <div className="grade-numeros">
        <CartaoNumero rotulo="Vendido hoje" valor={moeda(dados.total)} icone="carrinho" destaque />
        <CartaoNumero rotulo="Vendas" valor={dados.quantidade_vendas} detalhe={dados.quantidade_vendas ? `ticket médio ${moeda(Number(dados.total) / dados.quantidade_vendas)}` : "nenhuma ainda"} icone="recibo" />
        {FORMAS.filter((f) => dados.por_forma[f.valor]).slice(0, 2).map((f) => (
          <CartaoNumero key={f.valor} rotulo={`Em ${f.texto.toLowerCase()}`} valor={moeda(dados.por_forma[f.valor])} />
        ))}
      </div>

      {dados.vendas.length === 0 ? (
        <Alerta tipo="info" titulo="Nenhuma venda registrada hoje." />
      ) : (
        <ul className="lista-vendas">
          {dados.vendas.map((v) => (
            <li key={v.id} className={`venda ${v.status === "cancelada" ? "venda-cancelada" : ""}`}>
              <div className="venda-topo">
                <span className="venda-numero">Venda #{v.id}</span>
                <span className="texto-apoio">{hora(v.criado_em)} · {v.vendedor.nome}{v.cliente_nome ? ` · ${v.cliente_nome}` : ""}</span>
                <span className={`etiqueta ${v.status === "cancelada" ? "etiqueta-cancelado" : "etiqueta-confirmado"}`}>
                  {v.status === "cancelada" ? "Cancelada" : NOME_FORMA[v.forma_pagamento]}
                </span>
                <strong className="venda-total">{moeda(v.total)}</strong>
              </div>
              <p className="venda-itens">{v.itens.map((i) => `${i.quantidade}× ${i.nome_produto}`).join(" · ")}</p>
              {ehAdmin && v.status === "concluida" && (
                <button type="button" className="botao botao-texto botao-pequeno" onClick={() => setCancelando(v)}>
                  <Icone nome="lixeira" tamanho={16} /> Cancelar venda
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal
        aberto={Boolean(cancelando)}
        aoFechar={() => setCancelando(null)}
        titulo={cancelando ? `Cancelar a venda #${cancelando.id}?` : ""}
        subtitulo="Os produtos voltam para o estoque. Isso não pode ser desfeito."
        largura="pequena"
        rodape={
          <>
            <button type="button" className="botao botao-texto" onClick={() => setCancelando(null)}>Voltar</button>
            <button type="button" className="botao botao-perigo" onClick={confirmarCancelamento} disabled={enviando}>
              {enviando ? "Cancelando..." : "Sim, cancelar venda"}
            </button>
          </>
        }
      >
        {cancelando && <Recibo venda={cancelando} />}
      </Modal>
    </div>
  );
}

export default function PDV() {
  useTituloDocumento("PDV");
  const { usuario } = useAuth();
  const [aba, setAba] = useState("venda");
  const [catalogo, setCatalogo] = useState(null);
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("Todas");
  const [carrinho, setCarrinho] = useState([]); // [{produto, quantidade}]
  const [forma, setForma] = useState("pix");
  const [desconto, setDesconto] = useState("");
  const [recebido, setRecebido] = useState("");
  const [cliente, setCliente] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [concluida, setConcluida] = useState(null);
  const [recarregarVendas, setRecarregarVendas] = useState(0);

  const carregarCatalogo = useCallback(() => {
    api.get("/vendas/catalogo").then((r) => setCatalogo(r.data)).catch((e) => {
      setCatalogo([]);
      setErro(mensagemErro(e));
    });
  }, []);

  useEffect(() => {
    carregarCatalogo();
  }, [carregarCatalogo]);

  const categorias = useMemo(() => ["Todas", ...new Set((catalogo ?? []).map((p) => p.categoria))], [catalogo]);
  const termo = busca.trim().toLowerCase();
  const visiveis = (catalogo ?? []).filter(
    (p) => (categoria === "Todas" || p.categoria === categoria) && (!termo || p.nome.toLowerCase().includes(termo)),
  );

  const noCarrinho = (id) => carrinho.find((i) => i.produto.id === id)?.quantidade ?? 0;
  const subtotal = carrinho.reduce((s, i) => s + i.quantidade * Number(i.produto.preco_venda), 0);
  const valorDesconto = Math.min(paraNumero(desconto), subtotal);
  const total = subtotal - valorDesconto;
  const valorRecebido = paraNumero(recebido);
  const troco = forma === "dinheiro" && recebido ? valorRecebido - total : null;
  const itensTotal = carrinho.reduce((s, i) => s + i.quantidade, 0);

  function adicionar(produto) {
    setErro("");
    const atual = noCarrinho(produto.id);
    if (atual >= produto.quantidade) {
      setErro(`Só há ${produto.quantidade} unidade(s) de ${produto.nome} no estoque.`);
      return;
    }
    setCarrinho((c) =>
      atual ? c.map((i) => (i.produto.id === produto.id ? { ...i, quantidade: i.quantidade + 1 } : i)) : [...c, { produto, quantidade: 1 }],
    );
  }

  function alterarQuantidade(id, delta) {
    setErro("");
    setCarrinho((c) =>
      c
        .map((i) => {
          if (i.produto.id !== id) return i;
          const nova = i.quantidade + delta;
          if (nova > i.produto.quantidade) {
            setErro(`Só há ${i.produto.quantidade} unidade(s) de ${i.produto.nome} no estoque.`);
            return i;
          }
          return { ...i, quantidade: nova };
        })
        .filter((i) => i.quantidade > 0),
    );
  }

  function limpar() {
    setCarrinho([]);
    setDesconto("");
    setRecebido("");
    setCliente("");
    setForma("pix");
    setErro("");
  }

  async function finalizar() {
    setErro("");
    if (!carrinho.length) return setErro("Adicione pelo menos um produto à venda.");
    if (paraNumero(desconto) > subtotal) return setErro("O desconto não pode ser maior que o valor da venda.");
    if (forma === "dinheiro" && recebido && valorRecebido < total) return setErro("O valor recebido é menor que o total.");
    setEnviando(true);
    try {
      const { data } = await api.post("/vendas", {
        itens: carrinho.map((i) => ({ produto_id: i.produto.id, quantidade: i.quantidade })),
        forma_pagamento: forma,
        desconto: valorDesconto.toFixed(2),
        valor_recebido: forma === "dinheiro" && recebido ? valorRecebido.toFixed(2) : null,
        cliente_nome: cliente.trim() || null,
      });
      setConcluida(data);
      limpar();
      carregarCatalogo();
      setRecarregarVendas((n) => n + 1);
    } catch (e) {
      setErro(mensagemErro(e));
      carregarCatalogo();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section>
      <div className="cabecalho-pagina">
        <TituloPagina subtitulo="Venda dos produtos da prateleira. O estoque baixa sozinho.">Ponto de venda</TituloPagina>
        <div className="abas abas-compactas" role="group" aria-label="Tela do PDV">
          <button type="button" className={`aba ${aba === "venda" ? "aba-ativa" : ""}`} aria-pressed={aba === "venda"} onClick={() => setAba("venda")}>
            <Icone nome="carrinho" tamanho={18} /> Nova venda
          </button>
          <button type="button" className={`aba ${aba === "hoje" ? "aba-ativa" : ""}`} aria-pressed={aba === "hoje"} onClick={() => setAba("hoje")}>
            <Icone nome="recibo" tamanho={18} /> Vendas de hoje
          </button>
        </div>
      </div>

      {aba === "hoje" ? (
        <VendasDoDia recarregar={recarregarVendas} ehAdmin={usuario.perfil === "admin"} />
      ) : (
        <div className="pdv">
          <div className="pdv-catalogo">
            <div className="campo">
              <label htmlFor="pdv-busca">Buscar produto</label>
              <input id="pdv-busca" type="search" placeholder="Ex.: pomada" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <div className="chips" role="group" aria-label="Categoria">
              {categorias.map((c) => (
                <button key={c} type="button" className={`chip ${categoria === c ? "chip-ativo" : ""}`} aria-pressed={categoria === c} onClick={() => setCategoria(c)}>
                  {c}
                </button>
              ))}
            </div>

            {catalogo === null ? (
              <Carregando texto="Carregando produtos..." />
            ) : visiveis.length === 0 ? (
              <Alerta tipo="info" titulo="Nenhum produto de venda encontrado." >Cadastre produtos do tipo “Vender no PDV” na tela de Estoque.</Alerta>
            ) : (
              <ul className="grade-produtos">
                {visiveis.map((p) => {
                  const qtd = noCarrinho(p.id);
                  const esgotado = p.quantidade === 0;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        className={`produto-pdv ${qtd ? "produto-pdv-marcado" : ""}`}
                        onClick={() => adicionar(p)}
                        disabled={esgotado}
                        aria-label={`Adicionar ${p.nome}, ${moeda(p.preco_venda)}, ${esgotado ? "esgotado" : `${p.quantidade} em estoque`}`}
                      >
                        <span className="produto-pdv-categoria">{p.categoria}</span>
                        <span className="produto-pdv-nome">{p.nome}</span>
                        <span className="produto-pdv-preco">{moeda(p.preco_venda)}</span>
                        <span className={`produto-pdv-estoque ${p.estoque_baixo ? "texto-aviso" : ""}`}>
                          {esgotado ? "Esgotado" : `${p.quantidade} em estoque`}
                        </span>
                        {qtd > 0 && <span className="produto-pdv-qtd" aria-hidden="true">{qtd}</span>}
                        {!esgotado && <span className="produto-pdv-mais" aria-hidden="true"><Icone nome="mais" tamanho={18} /></span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <aside className="pdv-carrinho" aria-labelledby="titulo-carrinho">
            <div className="pdv-carrinho-topo">
              <h2 id="titulo-carrinho">Venda atual</h2>
              {carrinho.length > 0 && (
                <button type="button" className="botao botao-texto botao-pequeno" onClick={limpar}>
                  <Icone nome="lixeira" tamanho={16} /> Limpar
                </button>
              )}
            </div>

            {carrinho.length === 0 ? (
              <div className="carrinho-vazio">
                <Icone nome="carrinho" tamanho={36} />
                <p>Toque nos produtos para adicionar.</p>
              </div>
            ) : (
              <ul className="carrinho-itens">
                {carrinho.map(({ produto, quantidade }) => (
                  <li key={produto.id}>
                    <div className="carrinho-item-info">
                      <span className="carrinho-item-nome">{produto.nome}</span>
                      <span className="texto-apoio">{moeda(produto.preco_venda)} cada</span>
                    </div>
                    <div className="contador contador-pequeno">
                      <button type="button" className="contador-botao" onClick={() => alterarQuantidade(produto.id, -1)} aria-label={`Diminuir ${produto.nome}`}>
                        <Icone nome={quantidade === 1 ? "lixeira" : "menos"} tamanho={16} />
                      </button>
                      <span className="contador-valor" aria-live="polite">{quantidade}</span>
                      <button type="button" className="contador-botao" onClick={() => alterarQuantidade(produto.id, 1)} aria-label={`Aumentar ${produto.nome}`}>
                        <Icone nome="mais" tamanho={16} />
                      </button>
                    </div>
                    <strong className="carrinho-item-total">{moeda(quantidade * Number(produto.preco_venda))}</strong>
                  </li>
                ))}
              </ul>
            )}

            <fieldset className="formas">
              <legend>Forma de pagamento</legend>
              <div className="formas-opcoes">
                {FORMAS.map((f) => (
                  <label key={f.valor} className={`forma ${forma === f.valor ? "forma-marcada" : ""}`}>
                    <input type="radio" className="sr-only" name="forma" value={f.valor} checked={forma === f.valor} onChange={() => setForma(f.valor)} />
                    {f.texto}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="pdv-campos">
              <Campo id="pdv-desconto" label="Desconto (R$)" inputMode="decimal" placeholder="0,00" value={desconto} onChange={(e) => setDesconto(e.target.value)} />
              {forma === "dinheiro" && (
                <Campo id="pdv-recebido" label="Valor recebido (R$)" inputMode="decimal" placeholder="0,00" value={recebido} onChange={(e) => setRecebido(e.target.value)} />
              )}
            </div>
            <Campo id="pdv-cliente" label="Cliente (opcional)" placeholder="Nome do cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} maxLength={100} />

            <dl className="pdv-totais">
              <div><dt>Itens</dt><dd>{itensTotal}</dd></div>
              <div><dt>Subtotal</dt><dd>{moeda(subtotal)}</dd></div>
              {valorDesconto > 0 && <div><dt>Desconto</dt><dd>− {moeda(valorDesconto)}</dd></div>}
              <div className="pdv-total"><dt>Total</dt><dd>{moeda(total)}</dd></div>
              {troco !== null && (
                <div className={troco < 0 ? "texto-erro" : "pdv-troco"}>
                  <dt>{troco < 0 ? "Falta" : "Troco"}</dt>
                  <dd>{moeda(Math.abs(troco))}</dd>
                </div>
              )}
            </dl>

            {erro && <Alerta tipo="erro" titulo={erro} />}

            <button type="button" className="botao botao-principal botao-largo botao-grande" onClick={finalizar} disabled={enviando || !carrinho.length}>
              {enviando ? "Finalizando..." : `Finalizar venda · ${moeda(total)}`}
            </button>
          </aside>
        </div>
      )}

      <Modal
        aberto={Boolean(concluida)}
        aoFechar={() => setConcluida(null)}
        titulo={concluida ? `Venda #${concluida.venda.id} concluída` : ""}
        subtitulo="O estoque já foi atualizado."
        largura="pequena"
        rodape={
          <button type="button" className="botao botao-principal botao-largo" onClick={() => setConcluida(null)}>
            <Icone nome="carrinho" tamanho={18} /> Nova venda
          </button>
        }
      >
        {concluida && (
          <>
            <div className="sucesso-icone" aria-hidden="true"><Icone nome="sucesso" tamanho={36} /></div>
            <Recibo venda={concluida.venda} />
            {concluida.alertas.map((a) => (
              <Alerta key={a} tipo="aviso" titulo={a} />
            ))}
          </>
        )}
      </Modal>
    </section>
  );
}
