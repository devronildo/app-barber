import { useState } from "react";
import { Link } from "react-router-dom";
import api, { mensagemErro } from "../api";
import { Alerta, Campo, Icone, TituloPagina, useTituloDocumento } from "../components";

export default function EsqueciSenha() {
  useTituloDocumento("Esqueci minha senha");
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState("");
  const [enviado, setEnviado] = useState(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setErro("");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErro("Informe o e-mail que você usa para entrar.");
    setEnviando(true);
    try {
      const { data } = await api.post("/auth/esqueci-senha", { email: email.trim() });
      setEnviado(data);
    } catch (er) {
      setErro(mensagemErro(er));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="cartao cartao-estreito">
      <TituloPagina subtitulo="Vale para clientes, barbeiros e administrador.">Esqueci minha senha</TituloPagina>

      {enviado ? (
        <>
          <div className="sucesso-icone" aria-hidden="true"><Icone nome="sucesso" tamanho={34} /></div>
          <Alerta tipo="sucesso" titulo="Pedido recebido">{enviado.mensagem}</Alerta>
          {enviado.link_dev && (
            <div className="caixa-dev">
              <p className="caixa-dev-titulo"><Icone nome="info" tamanho={18} /> Modo de desenvolvimento</p>
              <p>O envio de e-mail ainda não está configurado. Use o link abaixo para testar:</p>
              <a href={enviado.link_dev.replace(/^https?:\/\/[^/]+/, window.location.origin)} className="botao botao-secundario botao-largo">
                Abrir link de redefinição
              </a>
            </div>
          )}
          <p className="texto-centro"><Link to="/entrar">Voltar para o login</Link></p>
        </>
      ) : (
        <>
          <p>Digite o e-mail da sua conta. Vamos enviar um link para você criar uma senha nova.</p>
          {erro && <Alerta tipo="erro" titulo={erro} />}
          <form onSubmit={enviar} noValidate>
            <Campo id="email" label="E-mail" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button type="submit" className="botao botao-principal botao-largo" disabled={enviando}>
              {enviando ? "Enviando..." : "Enviar link"}
            </button>
          </form>
          <div className="dica-barbeiro">
            <Icone nome="tesoura" tamanho={18} />
            <p>
              <strong>É barbeiro e não recebe o e-mail?</strong> Peça ao administrador uma senha temporária na tela
              Barbeiros.
            </p>
          </div>
          <p className="texto-centro"><Link to="/entrar">Voltar para o login</Link></p>
        </>
      )}
    </section>
  );
}
