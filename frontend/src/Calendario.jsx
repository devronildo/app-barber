import { useEffect, useState } from "react";
import { Icone } from "./components";

const SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const NOME_MES = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
const NOME_DIA = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" });

const paraISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const deISO = (iso) => {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d);
};

/** Calendário mensal com botões grandes (44x44 px) e nome completo do dia para leitores de tela. */
export default function Calendario({ valor, min, max, aoMudar }) {
  const [mes, setMes] = useState(() => {
    const d = deISO(valor);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  // Se a data mudar por fora (ex.: pulo para o próximo dia livre), mostra o mês dela.
  useEffect(() => {
    const d = deISO(valor);
    setMes((atual) =>
      atual.getFullYear() === d.getFullYear() && atual.getMonth() === d.getMonth()
        ? atual
        : new Date(d.getFullYear(), d.getMonth(), 1),
    );
  }, [valor]);

  const hoje = paraISO(new Date());
  const primeiroMesPermitido = deISO(min).getFullYear() * 12 + deISO(min).getMonth();
  const ultimoMesPermitido = deISO(max).getFullYear() * 12 + deISO(max).getMonth();
  const mesAtual = mes.getFullYear() * 12 + mes.getMonth();

  const dias = [];
  for (let i = 0; i < mes.getDay(); i++) dias.push(null);
  const totalDias = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
  for (let d = 1; d <= totalDias; d++) dias.push(new Date(mes.getFullYear(), mes.getMonth(), d));

  const mudarMes = (passo) => setMes(new Date(mes.getFullYear(), mes.getMonth() + passo, 1));
  const titulo = NOME_MES.format(mes);

  return (
    <div className="calendario">
      <div className="calendario-topo">
        <button type="button" className="calendario-seta" onClick={() => mudarMes(-1)} disabled={mesAtual <= primeiroMesPermitido} aria-label="Mês anterior">
          <Icone nome="esquerda" tamanho={18} />
        </button>
        <p className="calendario-mes" aria-live="polite">{titulo[0].toUpperCase() + titulo.slice(1)}</p>
        <button type="button" className="calendario-seta" onClick={() => mudarMes(1)} disabled={mesAtual >= ultimoMesPermitido} aria-label="Próximo mês">
          <Icone nome="direita" tamanho={18} />
        </button>
      </div>
      <div className="calendario-grade" role="group" aria-label={`Dias de ${titulo}`}>
        {SEMANA.map((s) => (
          <span key={s} className="calendario-semana" aria-hidden="true">{s}</span>
        ))}
        {dias.map((d, i) => {
          if (!d) return <span key={`vazio-${i}`} />;
          const iso = paraISO(d);
          const fora = iso < min || iso > max;
          const marcado = iso === valor;
          return (
            <button
              key={iso}
              type="button"
              className={`calendario-dia ${marcado ? "calendario-dia-marcado" : ""} ${iso === hoje ? "calendario-hoje" : ""}`}
              disabled={fora}
              aria-pressed={marcado}
              aria-label={`${NOME_DIA.format(d)}${iso === hoje ? ", hoje" : ""}`}
              onClick={() => aoMudar(iso)}
            >
              {d.getDate()}
              {iso === hoje && <span className="calendario-marca-hoje" aria-hidden="true">hoje</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
