import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { mensagemErro } from "../api";
import { useAuth } from "../auth";
import { Alerta, Campo, TituloPagina, useTituloDocumento } from "../components";

export default function Login() {
  useTituloDocumento("Entrar");
  const { usuario, entrar } = useAuth();
  const navegar = useNavigate();
  const local = useLocation();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erros, setErros] = useState({});
  const [erroGeral, setErroGeral] = useState("");
  const [enviando, setEnviando] = useState(false);

  if (usuario) return <Navigate to="/" replace />;

  async function enviar(e) {
    e.preventDefault();
    const novos = {};
    if (!email.trim()) novos.email = "Informe seu e-mail.";
    if (!senha) novos.senha = "Informe sua senha.";
    setErros(novos);
    setErroGeral("");
    if (Object.keys(novos).length) return;

    setEnviando(true);
    try {
      await entrar(email.trim(), senha);
      navegar(local.state?.de || "/", { replace: true });
    } catch (erro) {
      setErroGeral(mensagemErro(erro, "E-mail ou senha inválidos."));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="cartao cartao-estreito">
      <TituloPagina subtitulo="Entre para agendar seu horário.">Entrar</TituloPagina>
      {erroGeral && <Alerta tipo="erro" titulo={erroGeral} />}
      <form onSubmit={enviar} noValidate>
        <Campo
          id="email"
          label="E-mail"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          erro={erros.email}
          required
        />
        <Campo
          id="senha"
          label="Senha"
          type={mostrarSenha ? "text" : "password"}
          autoComplete="current-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          erro={erros.senha}
          required
        />
        <div className="linha-login">
          <label className="opcao-check">
            <input type="checkbox" checked={mostrarSenha} onChange={(e) => setMostrarSenha(e.target.checked)} />
            Mostrar senha
          </label>
          <Link to="/esqueci-senha" className="link-esqueci">Esqueci minha senha</Link>
        </div>
        <button type="submit" className="botao botao-principal botao-largo" disabled={enviando}>
          {enviando ? "Entrando..." : "Entrar"}
        </button>
      </form>
      <p className="texto-centro">
        Ainda não tem conta? <Link to="/cadastro">Criar conta</Link>
      </p>
    </section>
  );
}
