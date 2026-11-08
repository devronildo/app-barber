import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api, { lerSessao, salvarSessao } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [sessao, setSessao] = useState(() => lerSessao());

  useEffect(() => {
    const expirou = () => setSessao(null);
    window.addEventListener("sessao-expirada", expirou);
    return () => window.removeEventListener("sessao-expirada", expirou);
  }, []);

  const iniciar = useCallback((dados) => {
    salvarSessao(dados);
    setSessao(dados);
    return dados.usuario;
  }, []);

  const entrar = useCallback(
    async (email, senha) => iniciar((await api.post("/auth/login", { email, senha })).data),
    [iniciar],
  );

  const cadastrar = useCallback(
    async (dados) => iniciar((await api.post("/auth/cadastro", dados)).data),
    [iniciar],
  );

  const sair = useCallback(async () => {
    const atual = lerSessao();
    try {
      if (atual) await api.post("/auth/logout", { refresh_token: atual.refresh_token });
    } catch {
      /* mesmo sem resposta do servidor, a sessão local é apagada */
    }
    salvarSessao(null);
    setSessao(null);
  }, []);

  const valor = useMemo(
    () => ({ usuario: sessao?.usuario ?? null, entrar, cadastrar, sair, iniciar }),
    [sessao, entrar, cadastrar, sair, iniciar],
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
