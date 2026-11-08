import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { mensagemErro } from "../api";
import { Alerta, Campo, Icone, TituloPagina, useTituloDocumento } from "../components";

export default function RedefinirSenha() {
  useTituloDocumento("Criar senha nova");
  const navegar = useNavigate();
  // O token vem depois do "#" no link do e-mail (não vai para o servidor nem para outros sites).
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "");
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState("");
  const [pronto, setPronto] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    // Tira o token da barra de endereço depois de ler.
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  async function enviar(e) {
    e.preventDefault();
    const loc = {};
    if (senha.length < 8) loc.senha = "A senha precisa ter pelo menos 8 caracteres.";
    if (confirmar !== senha) loc.confirmar = "As senhas não são iguais.";
    setErros(loc);
    setErro("");
    if (Object.keys(loc).length) return;
    setEnviando(true);
    try {
      await api.post("/auth/redefinir-senha", { token, nova_senha: senha });
      setPronto(true);
    } catch (er) {
      setErro(mensagemErro(er));
    } finally {
      setEnviando(false);
    }
  }

  if (!token) {
    return (
      <section className="cartao cartao-estreito">
        <TituloPagina>Link incompleto</TituloPagina>
        <Alerta tipo="erro" titulo="Este link de redefinição está incompleto ou já foi usado.">
          Peça um link novo na tela “Esqueci minha senha”.
        </Alerta>
        <Link to="/esqueci-senha" className="botao botao-principal botao-largo">Pedir link novo</Link>
      </section>
    );
  }

  return (
    <section className="cartao cartao-estreito">
      <TituloPagina subtitulo="Escolha uma senha que você não usa em outros sites.">Criar senha nova</TituloPagina>
      {pronto ? (
        <>
          <div className="sucesso-icone" aria-hidden="true"><Icone nome="sucesso" tamanho={34} /></div>
          <Alerta tipo="sucesso" titulo="Senha alterada">Agora é só entrar com a senha nova.</Alerta>
          <button type="button" className="botao botao-principal botao-largo" onClick={() => navegar("/entrar", { replace: true })}>
            Ir para o login
          </button>
        </>
      ) : (
        <>
          {erro && (
            <Alerta tipo="erro" titulo={erro} acoes={<Link to="/esqueci-senha" className="botao botao-secundario botao-pequeno">Pedir link novo</Link>} />
          )}
          <form onSubmit={enviar} noValidate>
            <Campo id="senha" label="Senha nova" type="password" autoComplete="new-password" dica="Mínimo de 8 caracteres, sem seu nome ou e-mail." value={senha} onChange={(e) => setSenha(e.target.value)} erro={erros.senha} maxLength={72} />
            <Campo id="confirmar" label="Repita a senha nova" type="password" autoComplete="new-password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} erro={erros.confirmar} maxLength={72} />
            <button type="submit" className="botao botao-principal botao-largo" disabled={enviando}>
              {enviando ? "Salvando..." : "Salvar senha nova"}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
