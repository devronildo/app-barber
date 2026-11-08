const formatoData = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const formatoHora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const formatoMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** "2026-12-15T11:00:00" vem na hora local da barbearia, sem fuso. */
export function paraData(iso) {
  const [data, hora = "00:00"] = iso.split("T");
  const [a, m, d] = data.split("-").map(Number);
  const [h, min] = hora.split(":").map(Number);
  return new Date(a, m - 1, d, h, min);
}

export const dataPorExtenso = (iso) => formatoData.format(paraData(iso));
export const hora = (iso) => formatoHora.format(paraData(iso));
export const moeda = (valor) => formatoMoeda.format(Number(valor));

export function hojeISO(somaDias = 0) {
  const d = new Date();
  d.setDate(d.getDate() + somaDias);
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Converte o que a pessoa digitou em reais para número.
 *  Aceita "1.234,50", "45,00", "45.5" e "45". Valor vazio, negativo ou inválido vira 0. */
export function valorEmReais(texto) {
  const t = String(texto ?? "").trim().replace(/^R\$\s*/i, "");
  const normalizado = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(normalizado);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

/** "11955551234" vira "(11) 95555-1234". */
export function telefone(digitos) {
  const d = String(digitos ?? "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return digitos ?? "";
}

export function somarDias(iso, dias) {
  const [a, m, d] = iso.split("-").map(Number);
  const nova = new Date(a, m - 1, d + dias);
  return `${nova.getFullYear()}-${String(nova.getMonth() + 1).padStart(2, "0")}-${String(nova.getDate()).padStart(2, "0")}`;
}

export const DIAS_SEMANA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

export function iniciais(nome) {
  return nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}
