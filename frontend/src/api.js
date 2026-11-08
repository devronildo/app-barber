import axios from "axios";

export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const CHAVE_SESSAO = "barbearia.sessao";

export function lerSessao() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_SESSAO));
  } catch {
    return null;
  }
}

export function salvarSessao(sessao) {
  try {
    if (sessao) localStorage.setItem(CHAVE_SESSAO, JSON.stringify(sessao));
    else localStorage.removeItem(CHAVE_SESSAO);
  } catch {
    /* navegador sem armazenamento: a sessão dura só enquanto a aba estiver aberta */
  }
}

const api = axios.create({ baseURL: API_URL, timeout: 20000 });

api.interceptors.request.use((config) => {
  const sessao = lerSessao();
  if (sessao?.access_token) config.headers.Authorization = `Bearer ${sessao.access_token}`;
  return config;
});

// Quando o token de acesso (15 min) vence, renova uma vez com o refresh token.
const ROTAS_SEM_RENOVACAO = [
  "/auth/login",
  "/auth/refresh",
  "/auth/logout",
  "/auth/cadastro",
  "/auth/esqueci-senha",
  "/auth/redefinir-senha",
  "/auth/trocar-senha",
];
let renovacaoEmAndamento = null;

api.interceptors.response.use(
  (resposta) => resposta,
  async (erro) => {
    const original = erro.config;
    const sessao = lerSessao();
    const podeRenovar =
      erro.response?.status === 401 &&
      sessao?.refresh_token &&
      original &&
      !original._repetido &&
      !ROTAS_SEM_RENOVACAO.includes(original.url);

    if (!podeRenovar) return Promise.reject(erro);

    original._repetido = true;
    try {
      renovacaoEmAndamento ??= axios
        .post(`${API_URL}/auth/refresh`, { refresh_token: sessao.refresh_token })
        .finally(() => {
          renovacaoEmAndamento = null;
        });
      const { data } = await renovacaoEmAndamento;
      salvarSessao(data);
      original.headers.Authorization = `Bearer ${data.access_token}`;
      return api(original);
    } catch {
      salvarSessao(null);
      window.dispatchEvent(new Event("sessao-expirada"));
      return Promise.reject(erro);
    }
  },
);

export function mensagemErro(erro, padrao = "Não foi possível concluir. Tente novamente.") {
  if (!erro?.response) {
    return "Sem conexão com o servidor. Verifique a internet e tente de novo.";
  }
  const detalhe = erro.response.data?.detail;
  return typeof detalhe === "string" ? detalhe : padrao;
}

/** Separa os erros de validação do backend: { campos: {email: "..."}, gerais: ["..."] } */
export function errosDeValidacao(erro) {
  const campos = {};
  const gerais = [];
  for (const item of erro?.response?.data?.erros || []) {
    const campo = item.campo ? item.campo.split(".")[0] : null;
    if (campo && !campos[campo]) campos[campo] = item.mensagem;
    else if (!campo) gerais.push(item.mensagem);
  }
  return { campos, gerais };
}

export default api;
