import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth";
import { Layout, Protegida } from "./components";
import Agenda from "./pages/Agenda";
import AlterarSenha from "./pages/AlterarSenha";
import EsqueciSenha from "./pages/EsqueciSenha";
import RedefinirSenha from "./pages/RedefinirSenha";
import Barbeiros from "./pages/Barbeiros";
import Cadastro from "./pages/Cadastro";
import Dashboard from "./pages/Dashboard";
import Estoque from "./pages/Estoque";
import Inicio from "./pages/Inicio";
import Login from "./pages/Login";
import MeusAgendamentos from "./pages/MeusAgendamentos";
import NovoAgendamento from "./pages/NovoAgendamento";
import PDV from "./pages/PDV";
import "./styles.css";
import "./styles-extra.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/entrar" element={<Login />} />
            <Route path="/cadastro" element={<Cadastro />} />
            <Route path="/esqueci-senha" element={<EsqueciSenha />} />
            <Route path="/redefinir-senha" element={<RedefinirSenha />} />
            <Route path="/alterar-senha" element={<Protegida><AlterarSenha /></Protegida>} />
            <Route path="/" element={<Protegida><Inicio /></Protegida>} />
            <Route path="/agendar" element={<Protegida perfis={["cliente"]}><NovoAgendamento /></Protegida>} />
            <Route path="/meus-agendamentos" element={<Protegida perfis={["cliente"]}><MeusAgendamentos /></Protegida>} />
            <Route path="/agenda" element={<Protegida perfis={["barbeiro", "admin"]}><Agenda /></Protegida>} />
            <Route path="/estoque" element={<Protegida perfis={["admin"]}><Estoque /></Protegida>} />
            <Route path="/pdv" element={<Protegida perfis={["admin", "barbeiro"]}><PDV /></Protegida>} />
            <Route path="/dashboard" element={<Protegida perfis={["admin"]}><Dashboard /></Protegida>} />
            <Route path="/barbeiros" element={<Protegida perfis={["admin"]}><Barbeiros /></Protegida>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);
