import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api, { mensagemErro } from "../api";
import { Alerta, Carregando, CartaoNumero, Icone, TituloPagina, useTituloDocumento } from "../components";
import { moeda } from "../formatos";

/* Cores das séries, validadas para o fundo escuro (faixa de luminosidade,
   separação para daltonismo e contraste ≥ 3:1). */
const COR = { servicos: "#b8892a", vendas: "#3f8fd9" };

const PERIODOS = [
  { valor: "hoje", texto: "Hoje" },
  { valor: "7d", texto: "7 dias" },
  { valor: "mes", texto: "Este mês" },
  { valor: "30d", texto: "30 dias" },
];
const NOME_FORMA = { pix: "Pix", dinheiro: "Dinheiro", debito: "Débito", credito: "Crédito" };

const dataCurta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const moedaCurta = (v) =>
  v >= 1000 ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : `R$ ${Math.round(v)}`;

function escalaLimpa(maximo, divisoes = 4) {
  const bruto = Math.max(maximo, 1) / divisoes;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= bruto);
  const topo = passo * Math.ceil(Math.max(maximo, 1) / passo);
  return { topo, ticks: Array.from({ length: Math.round(topo / passo) + 1 }, (_, i) => i * passo) };
}

/** Coluna com cantos de 4px só na ponta de cima (a base fica reta). */
function caminhoColuna(x, y, w, h, raio) {
  const r = Math.min(raio, h, w / 2);
  if (r <= 0) return `M${x},${y + h}V${y}H${x + w}V${y + h}Z`;
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function GraficoDiario({ pontos }) {
  const caixa = useRef(null);
  const [largura, setLargura] = useState(640);
  const [ativo, setAtivo] = useState(null);

  useLayoutEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) => setLargura(Math.max(280, e.contentRect.width)));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const altura = 260;
  const m = { topo: 22, direita: 8, baixo: 28, esquerda: 64 };
  const areaH = altura - m.topo - m.baixo;
  const areaW = largura - m.esquerda - m.direita;
  const totais = pontos.map((p) => Number(p.servicos) + Number(p.vendas));
  const { topo, ticks } = escalaLimpa(Math.max(...totais, 0));
  const banda = areaW / pontos.length;
  const barra = Math.min(24, Math.max(4, banda * 0.62));
  const y = (v) => m.topo + areaH - (v / topo) * areaH;
  const base = y(0);
  const passoRotulo = Math.ceil(pontos.length / Math.max(1, Math.floor(areaW / 56)));
  const maior = totais.indexOf(Math.max(...totais));

  const p = ativo !== null ? pontos[ativo] : null;
  const xAtivo = ativo !== null ? m.esquerda + banda * ativo + banda / 2 : 0;

  return (
    <div className="grafico" ref={caixa}>
      <svg width={largura} height={altura} role="img" aria-label={`Faturamento por dia: maior valor ${moeda(totais[maior] || 0)} em ${dataCurta(pontos[maior].data)}. A tabela abaixo tem todos os valores.`} onMouseLeave={() => setAtivo(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.esquerda} x2={largura - m.direita} y1={y(t)} y2={y(t)} className="grafico-grade" />
            <text x={m.esquerda - 8} y={y(t)} className="grafico-eixo" textAnchor="end" dominantBaseline="middle">
              {moedaCurta(t)}
            </text>
          </g>
        ))}

        {pontos.map((ponto, i) => {
          const s = Number(ponto.servicos);
          const v = Number(ponto.vendas);
          const x = m.esquerda + banda * i + (banda - barra) / 2;
          const hS = (s / topo) * areaH;
          const hV = (v / topo) * areaH;
          const gap = s > 0 && v > 0 ? 2 : 0;
          return (
            <g key={ponto.data} className={ativo !== null && ativo !== i ? "grafico-apagado" : ""}>
              {ativo === i && <rect x={m.esquerda + banda * i} y={m.topo} width={banda} height={areaH} className="grafico-foco" />}
              {s > 0 && <path d={caminhoColuna(x, base - hS, barra, hS, v > 0 ? 0 : 4)} fill={COR.servicos} />}
              {v > 0 && <path d={caminhoColuna(x, base - hS - gap - hV, barra, hV, 4)} fill={COR.vendas} />}
              {i === maior && totais[i] > 0 && (
                <text x={x + barra / 2} y={base - hS - gap - hV - 6} textAnchor="middle" className="grafico-rotulo">
                  {moedaCurta(totais[i])}
                </text>
              )}
              {i % passoRotulo === 0 && (
                <text x={m.esquerda + banda * i + banda / 2} y={altura - 8} textAnchor="middle" className="grafico-eixo">
                  {dataCurta(ponto.data)}
                </text>
              )}
              <rect
                x={m.esquerda + banda * i}
                y={m.topo}
                width={banda}
                height={areaH}
                fill="transparent"
                onMouseEnter={() => setAtivo(i)}
                onTouchStart={() => setAtivo(i)}
              />
            </g>
          );
        })}
        <line x1={m.esquerda} x2={largura - m.direita} y1={base} y2={base} className="grafico-base" />
      </svg>

      {p && (
        <div className={`grafico-dica ${xAtivo > largura * 0.6 ? "grafico-dica-esquerda" : ""}`} style={{ left: xAtivo }}>
          <p className="grafico-dica-data">{dataCurta(p.data)}</p>
          <p><span className="amostra" style={{ background: COR.servicos }} /> Serviços <strong>{moeda(p.servicos)}</strong></p>
          <p><span className="amostra" style={{ background: COR.vendas }} /> Vendas <strong>{moeda(p.vendas)}</strong></p>
          <p className="grafico-dica-total">Total <strong>{moeda(Number(p.servicos) + Number(p.vendas))}</strong></p>
        </div>
      )}
    </div>
  );
}

function Ranking({ titulo, itens, cor, unidade, vazio }) {
  const maximo = Math.max(...itens.map((i) => Number(i.valor)), 1);
  return (
    <section className="cartao painel">
      <h2>{titulo}</h2>
      {itens.length === 0 ? (
        <p className="texto-apoio">{vazio}</p>
      ) : (
        <ol className="ranking">
          {itens.map((i) => (
            <li key={i.nome}>
              <div className="ranking-linha">
                <span className="ranking-nome">{i.nome}</span>
                <span className="ranking-valor">{moeda(i.valor)}</span>
              </div>
              <div className="ranking-trilho" aria-hidden="true">
                <span className="ranking-barra" style={{ width: `${(Number(i.valor) / maximo) * 100}%`, background: cor }} />
              </div>
              <span className="texto-apoio ranking-qtd">{i.quantidade} {unidade}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default function Dashboard() {
  useTituloDocumento("Dashboard");
  const [periodo, setPeriodo] = useState("30d");
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    setErro("");
    api
      .get("/dashboard", { params: { periodo } })
      .then((r) => ativo && setDados(r.data))
      .catch((e) => ativo && setErro(mensagemErro(e)));
    return () => {
      ativo = false;
    };
  }, [periodo]);

  const variacao = dados?.variacao_percentual;
  const formas = dados ? Object.entries(dados.por_forma_pagamento).map(([k, v]) => ({ nome: NOME_FORMA[k] ?? k, valor: v, quantidade: "" })) : [];

  return (
    <section>
      <div className="cabecalho-pagina">
        <TituloPagina subtitulo="Faturamento de serviços realizados e vendas do PDV.">Dashboard</TituloPagina>
        <div className="abas abas-compactas" role="group" aria-label="Período">
          {PERIODOS.map((p) => (
            <button key={p.valor} type="button" className={`aba ${periodo === p.valor ? "aba-ativa" : ""}`} aria-pressed={periodo === p.valor} onClick={() => setPeriodo(p.valor)}>
              {p.texto}
            </button>
          ))}
        </div>
      </div>

      {erro && <Alerta tipo="erro" titulo={erro} />}
      {!dados ? (
        !erro && <Carregando texto="Calculando o faturamento..." />
      ) : (
        <>
          <div className="grade-numeros grade-numeros-4">
            <CartaoNumero
              destaque
              rotulo="Faturamento total"
              valor={moeda(dados.faturamento_total)}
              icone="grafico"
              detalhe={
                variacao == null
                  ? "ainda sem histórico para comparar"
                  : `${variacao >= 0 ? "▲" : "▼"} ${Math.abs(variacao).toLocaleString("pt-BR")}% em relação ao período anterior`
              }
            />
            <CartaoNumero rotulo="Serviços" valor={moeda(dados.faturamento_servicos)} detalhe={`${dados.atendimentos} atendimentos · ticket ${moeda(dados.ticket_medio_atendimento)}`} icone="tesoura" />
            <CartaoNumero rotulo="Vendas no PDV" valor={moeda(dados.faturamento_vendas)} detalhe={`${dados.vendas} vendas · ticket ${moeda(dados.ticket_medio_venda)}`} icone="carrinho" />
            <CartaoNumero rotulo="Agendados hoje" valor={dados.agendados_hoje} detalhe={`${dados.cancelamentos} cancelamento(s) no período`} icone="calendario" />
          </div>

          {dados.estoque_baixo > 0 && (
            <Alerta tipo="aviso" titulo={`${dados.estoque_baixo} produto(s) com estoque baixo`} acoes={<Link to="/estoque?baixo=1" className="botao botao-secundario botao-pequeno">Ver estoque</Link>} />
          )}

          <section className="cartao painel">
            <div className="painel-topo">
              <h2>Faturamento por dia</h2>
              <ul className="legenda" aria-label="Legenda">
                <li><span className="amostra" style={{ background: COR.servicos }} /> Serviços</li>
                <li><span className="amostra" style={{ background: COR.vendas }} /> Vendas (PDV)</li>
              </ul>
            </div>
            <GraficoDiario pontos={dados.por_dia} />
            <details className="ver-tabela">
              <summary>Ver os valores em tabela</summary>
              <div className="tabela-rolagem" tabIndex={0} role="region" aria-label="Faturamento por dia">
                <table className="tabela tabela-compacta">
                  <thead>
                    <tr><th scope="col">Dia</th><th scope="col" className="num">Serviços</th><th scope="col" className="num">Vendas</th><th scope="col" className="num">Total</th></tr>
                  </thead>
                  <tbody>
                    {dados.por_dia.map((d) => (
                      <tr key={d.data}>
                        <th scope="row">{dataCurta(d.data)}</th>
                        <td className="num">{moeda(d.servicos)}</td>
                        <td className="num">{moeda(d.vendas)}</td>
                        <td className="num"><strong>{moeda(Number(d.servicos) + Number(d.vendas))}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>

          <div className="grade-paineis">
            <Ranking titulo="Serviços mais feitos" itens={dados.servicos_mais_feitos} cor={COR.servicos} unidade="atendimento(s)" vazio="Nenhum atendimento no período." />
            <Ranking titulo="Produtos mais vendidos" itens={dados.produtos_mais_vendidos} cor={COR.vendas} unidade="unidade(s)" vazio="Nenhuma venda no período." />
            <Ranking titulo="Faturamento por barbeiro" itens={dados.por_barbeiro} cor={COR.servicos} unidade="atendimento(s)" vazio="Nenhum atendimento no período." />
            <Ranking titulo="Vendas por forma de pagamento" itens={formas} cor={COR.vendas} unidade="" vazio="Nenhuma venda no período." />
          </div>
        </>
      )}
    </section>
  );
}
