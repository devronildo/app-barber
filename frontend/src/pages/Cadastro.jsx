import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { errosDeValidacao, mensagemErro } from "../api";
import { useAuth } from "../auth";
import { Alerta, Campo, TituloPagina, useTituloDocumento } from "../components";

const VAZIO = { nome: "", email: "", telefone: "", senha: "", confirmar: "" };

export default function Cadastro() {
  useTituloDocumento("Criar conta");
  const { usuario, cadastrar } = useAuth();
  const navegar = useNavigate();
  const [dados, setDados] = useState(VAZIO);
  const [erros, setErros] = useState({});
  const [errosGerais, setErrosGerais] = useState([]);
  const [enviando, setEnviando] = useState(false);

  if (usuario) return <Navigate to="/" replace />;

  const alterar = (campo) => (e) => setDados({ ...dados, [campo]: e.target.value });

  function validar() {
    const e = {};
    if (dados.nome.trim().length < 2) e.nome = "Informe seu nome.";
    if (!/^\S+@\S+\.\S+$/.test(dados.email.trim())) e.email = "Informe um e-mail válido, como nome@email.com.";
    const digitos = dados.telefone.replace(/\D/g, "");
    if (digitos.length < 10 || digitos.length > 11) e.telefone = "Informe o telefone com DDD, por exemplo (11) 91234-5678.";
    if (dados.senha.length < 8) e.senha = "A senha precisa ter pelo menos 8 caracteres.";
    if (dados.confirmar !== dados.senha) e.confirmar = "As senhas não são iguais. Digite a mesma senha nos dois campos.";
    return e;
  }

  async function enviar(evento) {
    evento.preventDefault();
    const locais = validar();
    setErros(locais);
    setErrosGerais([]);
    if (Object.keys(locais).length) return;

    setEnviando(true);
    try {
      const { confirmar: _confirmar, ...corpo } = dados;
      await cadastrar({ ...corpo, nome: corpo.nome.trim(), email: corpo.email.trim() });
      navegar("/", { replace: true });
    } catch (erro) {
      const { campos, gerais } = errosDeValidacao(erro);
      setErros(campos);
      setErrosGerais(gerais.length || Object.keys(campos).length ? gerais : [mensagemErro(erro)]);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="cartao cartao-estreito">
      <TituloPagina subtitulo="Leva menos de um minuto.">Criar conta</TituloPagina>
      {errosGerais.length > 0 && (
        <Alerta tipo="erro" titulo="Não foi possível criar a conta">
          <ul>
            {errosGerais.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Alerta>
      )}
      <form onSubmit={enviar} noValidate>
        <Campo id="nome" label="Nome completo" autoComplete="name" value={dados.nome} onChange={alterar("nome")} erro={erros.nome} maxLength={100} required />
        <Campo id="email" label="E-mail" type="email" inputMode="email" autoComplete="email" value={dados.email} onChange={alterar("email")} erro={erros.email} maxLength={120} required />
        <Campo id="telefone" label="Celular com DDD" type="tel" inputMode="tel" autoComplete="tel" placeholder="(11) 91234-5678" value={dados.telefone} onChange={alterar("telefone")} erro={erros.telefone} maxLength={20} required />
        <Campo
          id="senha"
          label="Senha"
          type="password"
          autoComplete="new-password"
          dica="Mínimo de 8 caracteres. Não use seu nome, seu e-mail ou senhas como 12345678."
          value={dados.senha}
          onChange={alterar("senha")}
          erro={erros.senha}
          maxLength={72}
          required
        />
        <Campo id="confirmar" label="Confirme a senha" type="password" autoComplete="new-password" value={dados.confirmar} onChange={alterar("confirmar")} erro={erros.confirmar} maxLength={72} required />
        <button type="submit" className="botao botao-principal botao-largo" disabled={enviando}>
          {enviando ? "Criando conta..." : "Criar conta"}
        </button>
      </form>
      <p className="texto-centro">
        Já tem conta? <Link to="/entrar">Entrar</Link>
      </p>
    </section>
  );
}
