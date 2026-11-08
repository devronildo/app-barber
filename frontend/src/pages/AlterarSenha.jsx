import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { mensagemErro } from "../api";
import { useAuth } from "../auth";
import { Alerta, Campo, TituloPagina, useTituloDocumento } from "../components";

export default function AlterarSenha() {
  useTituloDocumento("Alterar senha");
  const { usuario, iniciar, sair } = useAuth();
  const navegar = useNavigate();
  const obrigatoria = usuario.trocar_senha;
  const [dados, setDados] = useState({ atual: "", nova: "", confirmar: "" });
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const alterar = (c) => (e) => setDados({ ...dados, [c]: e.target.value });

  async function enviar(e) {
    e.preventDefault();
    const loc = {};
    if (!dados.atual) loc.atual = obrigatoria ? "Digite a senha temporária que você recebeu." : "Digite sua senha atual.";
    if (dados.nova.length < 8) loc.nova = "A senha nova precisa ter pelo menos 8 caracteres.";
    if (dados.confirmar !== dados.nova) loc.confirmar = "As senhas não são iguais.";
    setErros(loc);
    setErro("");
    setSucesso(false);
    if (Object.keys(loc).length) return;
    setEnviando(true);
    try {
      const { data } = await api.post("/auth/trocar-senha", { senha_atual: dados.atual, nova_senha: dados.nova });
      iniciar(data); // tokens novos: as outras sessões foram encerradas
      setDados({ atual: "", nova: "", confirmar: "" });
      if (obrigatoria) navegar("/", { replace: true });
      else setSucesso(true);
    } catch (er) {
      setErro(mensagemErro(er));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="cartao cartao-estreito">
      <TituloPagina subtitulo={obrigatoria ? undefined : "Ao trocar, você sai dos outros aparelhos conectados."}>
        {obrigatoria ? "Crie sua senha" : "Alterar senha"}
      </TituloPagina>
      {obrigatoria && (
        <Alerta tipo="aviso" titulo="Você entrou com uma senha temporária">
          Para continuar, crie uma senha só sua. A temporária deixa de valer.
        </Alerta>
      )}
      {sucesso && <Alerta tipo="sucesso" titulo="Senha alterada com sucesso." />}
      {erro && <Alerta tipo="erro" titulo={erro} />}
      <form onSubmit={enviar} noValidate>
        <Campo id="atual" label={obrigatoria ? "Senha temporária" : "Senha atual"} type="password" autoComplete="current-password" value={dados.atual} onChange={alterar("atual")} erro={erros.atual} maxLength={128} />
        <Campo id="nova" label="Senha nova" type="password" autoComplete="new-password" dica="Mínimo de 8 caracteres, sem seu nome ou e-mail." value={dados.nova} onChange={alterar("nova")} erro={erros.nova} maxLength={72} />
        <Campo id="confirmar" label="Repita a senha nova" type="password" autoComplete="new-password" value={dados.confirmar} onChange={alterar("confirmar")} erro={erros.confirmar} maxLength={72} />
        <button type="submit" className="botao botao-principal botao-largo" disabled={enviando}>
          {enviando ? "Salvando..." : "Salvar senha nova"}
        </button>
      </form>
      {obrigatoria && (
        <button type="button" className="botao botao-texto botao-largo" onClick={sair}>Sair</button>
      )}
    </section>
  );
}
