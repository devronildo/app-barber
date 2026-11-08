import { useEffect, useId, useRef, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./auth";
import { iniciais } from "./formatos";

/* Ícones em SVG (decorativos: o texto ao lado já explica). */
const traco = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
const ICONES = {
  sucesso: <path d="M5 12.5l4.5 4.5L19 7.5" {...traco} strokeWidth="2.5" />,
  erro: <path d="M7 7l10 10M17 7L7 17" {...traco} strokeWidth="2.5" />,
  aviso: (
    <>
      <path d="M12 3L2 21h20L12 3z" {...traco} />
      <path d="M12 10v5M12 18v.5" {...traco} strokeWidth="2.5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" {...traco} />
      <path d="M12 11v6M12 7.5v.5" {...traco} strokeWidth="2.5" />
    </>
  ),
  casa: <path d="M3 11l9-7 9 7M5 9.5V20h5v-6h4v6h5V9.5" {...traco} />,
  calendario: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" {...traco} />
      <path d="M3 10h18M8 3v4M16 3v4M8 14h2M14 14h2M8 17h2" {...traco} />
    </>
  ),
  lista: <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" {...traco} strokeWidth="2.5" />,
  tesoura: (
    <>
      <circle cx="6" cy="6" r="3" {...traco} />
      <circle cx="6" cy="18" r="3" {...traco} />
      <path d="M8.1 8.1L20 20M8.1 15.9L20 4" {...traco} />
    </>
  ),
  caixa: (
    <>
      <path d="M3 7l9-4 9 4v10l-9 4-9-4V7z" {...traco} />
      <path d="M3 7l9 4 9-4M12 11v10" {...traco} />
    </>
  ),
  pessoa: (
    <>
      <circle cx="12" cy="8" r="4" {...traco} />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" {...traco} />
    </>
  ),
  sair: <path d="M15 4h4a1 1 0 011 1v14a1 1 0 01-1 1h-4M10 17l5-5-5-5M15 12H3" {...traco} />,
  relogio: (
    <>
      <circle cx="12" cy="12" r="9" {...traco} />
      <path d="M12 7v5l3 2" {...traco} />
    </>
  ),
  carrinho: (
    <>
      <path d="M3 4h2l2.4 11.2a1 1 0 001 .8h9.2a1 1 0 001-.8L20 8H6.2" {...traco} />
      <circle cx="9" cy="20" r="1.4" fill="currentColor" />
      <circle cx="17" cy="20" r="1.4" fill="currentColor" />
    </>
  ),
  grafico: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" {...traco} />,
  mais: <path d="M12 5v14M5 12h14" {...traco} strokeWidth="2.5" />,
  menos: <path d="M5 12h14" {...traco} strokeWidth="2.5" />,
  lixeira: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" {...traco} />,
  lapis: <path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" {...traco} />,
  setas: <path d="M7 4v16M7 4L3 8M7 4l4 4M17 20V4M17 20l-4-4M17 20l4-4" {...traco} />,
  recibo: <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6M9 16h3" {...traco} />,
  chave: (
    <>
      <circle cx="8" cy="15" r="4" {...traco} />
      <path d="M10.8 12.2L20 3M16 7l3 3M14 9l2 2" {...traco} />
    </>
  ),
  fechar: <path d="M6 6l12 12M18 6L6 18" {...traco} strokeWidth="2.5" />,
  esquerda: <path d="M15 5l-7 7 7 7" {...traco} strokeWidth="2.5" />,
  direita: <path d="M9 5l7 7-7 7" {...traco} strokeWidth="2.5" />,
  check: (
    <>
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="var(--sobre-dourado)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
};

export function Icone({ nome, tamanho = 22 }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="icone">
      {ICONES[nome]}
    </svg>
  );
}

export const NOME_BARBEARIA = "Mooca Barber Club";

/** Símbolo (navalha e tesoura cruzadas em um selo) + nome. */
export function Logo({ pequeno = false }) {
  return (
    <span className={`logo ${pequeno ? "logo-pequeno" : ""}`}>
      <img src="/favicon.svg" alt="" className="logo-simbolo" width="56" height="56" />
      <span className="logo-textos">
        <span className="logo-nome">MOOCA</span>
        <span className="logo-sub">Barber Club</span>
      </span>
    </span>
  );
}

export function Avatar({ nome, grande = false }) {
  return (
    <span className={`avatar ${grande ? "avatar-grande" : ""}`} aria-hidden="true">
      {iniciais(nome)}
    </span>
  );
}

const PREFIXO = { sucesso: "Sucesso", erro: "Erro", aviso: "Atenção", info: "Informação" };

/** Alerta com texto + ícone + cor (nunca só cor). */
export function Alerta({ tipo = "info", titulo, children, acoes }) {
  return (
    <div className={`alerta alerta-${tipo}`} role={tipo === "erro" ? "alert" : "status"}>
      <Icone nome={tipo} />
      <div className="alerta-texto">
        <p className="alerta-titulo">
          <span className="sr-only">{PREFIXO[tipo]}: </span>
          {titulo}
        </p>
        {children && <div className="alerta-corpo">{children}</div>}
        {acoes && <div className="alerta-acoes">{acoes}</div>}
      </div>
    </div>
  );
}

/** Campo com rótulo sempre visível, dica e erro ligados ao input (aria-describedby). */
export function Campo({ id, label, erro, dica, as = "input", children, ...props }) {
  const Elemento = as;
  const descritores = [dica && `${id}-dica`, erro && `${id}-erro`].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`campo ${erro ? "campo-com-erro" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {dica && (
        <p id={`${id}-dica`} className="campo-dica">
          {dica}
        </p>
      )}
      <Elemento id={id} name={id} aria-invalid={erro ? "true" : undefined} aria-describedby={descritores} {...props}>
        {children}
      </Elemento>
      {erro && (
        <p id={`${id}-erro`} className="campo-erro">
          <Icone nome="erro" tamanho={16} /> {erro}
        </p>
      )}
    </div>
  );
}

/** Janela modal com o <dialog> nativo: prende o foco, fecha com Esc e devolve o foco ao botão que abriu. */
export function Modal({ aberto, aoFechar, titulo, subtitulo, children, rodape, largura = "media" }) {
  const ref = useRef(null);
  const tituloId = useId();

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    if (aberto && !dialogo.open) dialogo.showModal();
    if (!aberto && dialogo.open) dialogo.close();
  }, [aberto]);

  return (
    <dialog
      ref={ref}
      className={`modal modal-${largura}`}
      aria-labelledby={tituloId}
      onClose={aoFechar}
      onClick={(e) => {
        if (e.target === ref.current) aoFechar(); // clique no fundo escuro
      }}
    >
      {aberto && (
        <div className="modal-caixa">
          <header className="modal-cabecalho">
            <div>
              <h2 id={tituloId}>{titulo}</h2>
              {subtitulo && <p className="texto-apoio">{subtitulo}</p>}
            </div>
            <button type="button" className="modal-fechar" onClick={aoFechar} aria-label="Fechar">
              <Icone nome="fechar" />
            </button>
          </header>
          <div className="modal-corpo">{children}</div>
          {rodape && <footer className="modal-rodape">{rodape}</footer>}
        </div>
      )}
    </dialog>
  );
}

/** Botões de escolha única lado a lado (ex.: Entrada / Saída). */
export function Segmentado({ legenda, opcoes, valor, aoMudar, nome }) {
  return (
    <fieldset className="segmentado">
      <legend>{legenda}</legend>
      <div className="segmentado-opcoes">
        {opcoes.map((o) => (
          <label key={o.valor} className={`segmentado-opcao ${valor === o.valor ? "segmentado-marcado" : ""} ${o.classe ?? ""}`}>
            <input type="radio" className="sr-only" name={nome} value={o.valor} checked={valor === o.valor} onChange={() => aoMudar(o.valor)} />
            {o.icone && <Icone nome={o.icone} tamanho={18} />}
            <span>{o.texto}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function CartaoNumero({ rotulo, valor, detalhe, icone, destaque = false, tom }) {
  return (
    <div className={`numero ${destaque ? "numero-destaque" : ""} ${tom ? `numero-${tom}` : ""}`}>
      <div className="numero-topo">
        <span className="numero-rotulo">{rotulo}</span>
        {icone && <span className="numero-icone"><Icone nome={icone} tamanho={20} /></span>}
      </div>
      <span className="numero-valor">{valor}</span>
      {detalhe && <span className="numero-detalhe">{detalhe}</span>}
    </div>
  );
}

export function Carregando({ texto = "Carregando..." }) {
  return (
    <p className="carregando" role="status">
      <span className="spinner" aria-hidden="true" /> {texto}
    </p>
  );
}

function AvisoConexao() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  if (online) return null;
  return (
    <div className="faixa-offline">
      <Alerta tipo="aviso" titulo="Sem conexão com a internet">
        Você pode consultar a última agenda salva. Novos agendamentos e movimentações só funcionam com internet.
      </Alerta>
    </div>
  );
}

const LINKS = {
  cliente: [
    { para: "/", texto: "Início", icone: "casa" },
    { para: "/agendar", texto: "Agendar", icone: "calendario" },
    { para: "/meus-agendamentos", texto: "Meus horários", icone: "lista" },
  ],
  barbeiro: [
    { para: "/", texto: "Início", icone: "casa" },
    { para: "/agenda", texto: "Minha agenda", icone: "calendario" },
    { para: "/pdv", texto: "PDV", icone: "carrinho" },
  ],
  admin: [
    { para: "/dashboard", texto: "Dashboard", icone: "grafico" },
    { para: "/agenda", texto: "Agenda", icone: "calendario" },
    { para: "/pdv", texto: "PDV", icone: "carrinho" },
    { para: "/estoque", texto: "Estoque", icone: "caixa" },
    { para: "/barbeiros", texto: "Barbeiros", icone: "tesoura" },
  ],
};

const NOME_PERFIL = { cliente: "Cliente", barbeiro: "Barbeiro", admin: "Administrador" };

export function Layout() {
  const { usuario, sair } = useAuth();

  if (!usuario) {
    return (
      <div className="app-publico">
        <a href="#conteudo" className="pular-link">Pular para o conteúdo</a>
        <header className="publico-topo">
          <Link to="/entrar" className="logo-link" aria-label={`${NOME_BARBEARIA}, página inicial`}>
            <Logo />
          </Link>
        </header>
        <AvisoConexao />
        <main id="conteudo" tabIndex={-1} className="publico-conteudo">
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <a href="#conteudo" className="pular-link">Pular para o conteúdo</a>
      <aside className="lateral">
        <Link to="/" className="logo-link lateral-logo" aria-label={`${NOME_BARBEARIA}, início`}>
          <Logo pequeno />
        </Link>
        <nav aria-label="Menu principal" className="lateral-menu">
          {LINKS[usuario.perfil].map((l) => (
            <NavLink key={l.para} to={l.para} end={l.para === "/"} className="lateral-item">
              <Icone nome={l.icone} />
              <span>{l.texto}</span>
            </NavLink>
          ))}
          <button type="button" className="lateral-item lateral-sair" onClick={sair}>
            <Icone nome="sair" />
            <span>Sair</span>
          </button>
        </nav>
      </aside>
      <div className="area">
        <header className="barra-topo">
          <span className="barra-topo-nome">{NOME_BARBEARIA}</span>
          <Link to="/alterar-senha" className="usuario-chip" aria-label={`${usuario.nome}, ${NOME_PERFIL[usuario.perfil]}. Alterar senha`}>
            <Avatar nome={usuario.nome} />
            <span className="usuario-chip-texto">
              <span>{usuario.nome.split(" ")[0]}</span>
              <span className="usuario-chip-perfil">{NOME_PERFIL[usuario.perfil]} · alterar senha</span>
            </span>
          </Link>
        </header>
        <AvisoConexao />
        <main id="conteudo" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function Protegida({ perfis, children }) {
  const { usuario } = useAuth();
  const local = useLocation();
  if (!usuario) return <Navigate to="/entrar" replace state={{ de: local.pathname }} />;
  // Entrou com senha temporária: precisa criar uma senha nova antes de qualquer coisa.
  if (usuario.trocar_senha && local.pathname !== "/alterar-senha") return <Navigate to="/alterar-senha" replace />;
  if (perfis && !perfis.includes(usuario.perfil)) return <Navigate to="/" replace />;
  return children;
}

/** Coloca o foco no título da página ao trocar de tela (leitores de tela anunciam a mudança). */
export function TituloPagina({ children, subtitulo }) {
  return (
    <div className="titulo-pagina">
      <h1
        tabIndex={-1}
        ref={(el) => {
          if (el && document.activeElement === document.body) el.focus({ preventScroll: true });
        }}
      >
        {children}
      </h1>
      {subtitulo && <p className="subtitulo">{subtitulo}</p>}
    </div>
  );
}

export function useTituloDocumento(titulo) {
  useEffect(() => {
    document.title = `${titulo} | ${NOME_BARBEARIA}`;
  }, [titulo]);
}
