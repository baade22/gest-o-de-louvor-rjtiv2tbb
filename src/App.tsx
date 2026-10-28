/* Main App Component - Handles routing, auth provider and route guards */
import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/contexts/AuthContext'
import { RequireAuth } from '@/components/RequireAuth'
import Layout from '@/components/Layout'

// Pages
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import SongsList from '@/pages/SongsList'
import SongForm from '@/pages/SongForm'
import SongDetail from '@/pages/SongDetail'
import EventsList from '@/pages/EventsList'
import EventForm from '@/pages/EventForm'
import EventScaleDetail from '@/pages/EventScaleDetail'
import MyScales from '@/pages/MyScales'
import MusiciansList from '@/pages/MusiciansList'
import MusicianForm from '@/pages/MusicianForm'
import RolesManagement from '@/pages/RolesManagement'
import AccessProfiles from '@/pages/access/AccessProfiles'
import AccessProfileForm from '@/pages/access/AccessProfileForm'
import UserProfile from '@/pages/UserProfile'
import ChurchSettings from '@/pages/ChurchSettings'
import IntegrationsSettings from '@/pages/IntegrationsSettings'
import WhatsAppSettings from '@/pages/WhatsAppSettings'
import AvisosPanel from '@/pages/avisos/AvisosPanel'
import AvisoEditor from '@/pages/avisos/AvisoEditor'
import AvisosCultos from '@/pages/avisos/AvisosCultos'
import AvisoEnvio from '@/pages/avisos/AvisoEnvio'
import SoundModule from '@/pages/SoundModule'
import ProjectionModule from '@/pages/ProjectionModule'
import MediaModule from '@/pages/MediaModule'
import LightingModule from '@/pages/LightingModule'
import TasksModule from '@/pages/TasksModule'
import InvitationsManagement from '@/pages/InvitationsManagement'
import InviteAccept from '@/pages/InviteAccept'
import PublicCampaign from '@/pages/PublicCampaign'
import PeopleList from '@/pages/membership/PeopleList'
import PersonForm from '@/pages/membership/PersonForm'
import Birthdays from '@/pages/membership/Birthdays'
import PersonProfile from '@/pages/membership/PersonProfile'
import MembershipDashboard from '@/pages/membership/MembershipDashboard'
import Signups from '@/pages/membership/Signups'
import FollowUp from '@/pages/membership/FollowUp'
import Reports from '@/pages/membership/Reports'
import Groups from '@/pages/membership/Groups'
import GroupDetail from '@/pages/membership/GroupDetail'
import ChurchEvents from '@/pages/membership/ChurchEvents'
import ChurchEventForm from '@/pages/membership/ChurchEventForm'
import ChurchEventDetail from '@/pages/membership/ChurchEventDetail'
import PublicEventSignup from '@/pages/membership/PublicEventSignup'
import EventCheckin from '@/pages/membership/EventCheckin'
import PersonDocuments from '@/pages/membership/documents/PersonDocuments'
import MemberCards from '@/pages/membership/documents/MemberCards'
import PublicSignup from '@/pages/membership/PublicSignup'
import NotFound from '@/pages/NotFound'
import FinancePanel from '@/pages/finance/FinancePanel'
import FinanceTransactions from '@/pages/finance/FinanceTransactions'
import FinanceRegistry from '@/pages/finance/FinanceRegistry'
import FinanceCounts from '@/pages/finance/FinanceCounts'
import FinanceBills from '@/pages/finance/FinanceBills'
import FinanceReconcile from '@/pages/finance/FinanceReconcile'
import FinanceBalances from '@/pages/finance/FinanceBalances'
import FinanceClosing from '@/pages/finance/FinanceClosing'
import FinanceReports from '@/pages/finance/FinanceReports'
import FinanceStatements from '@/pages/finance/FinanceStatements'
import FinanceCampaigns from '@/pages/finance/FinanceCampaigns'
import FinanceBudget from '@/pages/finance/FinanceBudget'
import FinanceCashFlow from '@/pages/finance/FinanceCashFlow'
import FinanceAudit from '@/pages/finance/FinanceAudit'

const App = () => (
  <BrowserRouter>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <Routes>
          {/* Public Login Route */}
          <Route path="/login" element={<Login />} />

          {/* Rota pública de aceite de convite e definição de senha */}
          <Route path="/convite/:token" element={<InviteAccept />} />
          <Route path="/cadastro/:key" element={<PublicSignup />} />
          <Route path="/inscricao/:key" element={<PublicEventSignup />} />

          {/* Documentos para imprimir: fora do Layout, para sair só a folha */}
          <Route
            path="/membros/:id/documentos"
            element={
              <RequireAuth requirePermission="membresia.documentos.ver">
                <PersonDocuments />
              </RequireAuth>
            }
          />
          <Route
            path="/membros/carteirinhas"
            element={
              <RequireAuth requirePermission="membresia.documentos.ver">
                <MemberCards />
              </RequireAuth>
            }
          />

          {/* Página pública de doação de uma campanha do Financeiro */}
          <Route path="/doar/:id" element={<PublicCampaign />} />

          {/* Authenticated Layout and Routes */}
          <Route element={<Layout />}>
            {/* Root redirects to dashboard */}
            <Route
              path="/"
              element={
                <RequireAuth>
                  <Navigate to="/dashboard" replace />
                </RequireAuth>
              }
            />

            <Route
              path="/dashboard"
              element={
                <RequireAuth>
                  <Dashboard />
                </RequireAuth>
              }
            />

            {/* Músicas */}
            <Route
              path="/songs"
              element={
                <RequireAuth requirePermission="louvor.musicas.ver">
                  <SongsList />
                </RequireAuth>
              }
            />
            <Route
              path="/songs/new"
              element={
                <RequireAuth requirePermission="louvor.musicas.novo">
                  <SongForm />
                </RequireAuth>
              }
            />
            <Route
              path="/songs/:id"
              element={
                <RequireAuth requirePermission="louvor.musicas.ver">
                  <SongDetail />
                </RequireAuth>
              }
            />
            <Route
              path="/songs/:id/edit"
              element={
                <RequireAuth requirePermission="louvor.musicas.alterar">
                  <SongForm />
                </RequireAuth>
              }
            />

            {/* Eventos e Cultos */}
            <Route
              path="/events"
              element={
                <RequireAuth requirePermission="louvor.cultos.ver">
                  <EventsList />
                </RequireAuth>
              }
            />
            <Route
              path="/events/new"
              element={
                <RequireAuth requirePermission="louvor.cultos.novo">
                  <EventForm />
                </RequireAuth>
              }
            />
            <Route
              path="/events/:id/edit"
              element={
                <RequireAuth requirePermission="louvor.cultos.alterar">
                  <EventForm />
                </RequireAuth>
              }
            />
            <Route
              path="/events/:id/escala"
              element={
                <RequireAuth>
                  <EventScaleDetail />
                </RequireAuth>
              }
            />

            {/* Minhas Escalas */}
            <Route
              path="/minhas-escalas"
              element={
                <RequireAuth>
                  <MyScales />
                </RequireAuth>
              }
            />

            {/* Módulos Operacionais Protegidos por Função */}
            <Route
              path="/som"
              element={
                <RequireAuth requirePermission="culto.som.ver">
                  <SoundModule />
                </RequireAuth>
              }
            />

            <Route
              path="/projecao"
              element={
                <RequireAuth requirePermission="culto.projecao.ver">
                  <ProjectionModule />
                </RequireAuth>
              }
            />

            <Route
              path="/midias"
              element={
                <RequireAuth requirePermission="culto.midias.ver">
                  <MediaModule />
                </RequireAuth>
              }
            />

            <Route
              path="/avisos"
              element={
                <RequireAuth requirePermission="culto.avisos.ver">
                  <AvisosPanel />
                </RequireAuth>
              }
            />
            <Route
              path="/avisos/novo"
              element={
                <RequireAuth requirePermission="culto.avisos.novo">
                  <AvisoEditor kind="AVULSO" />
                </RequireAuth>
              }
            />
            <Route
              path="/avisos/cultos"
              element={
                <RequireAuth requirePermission="culto.avisos.ver">
                  <AvisosCultos />
                </RequireAuth>
              }
            />
            <Route
              path="/avisos/regras/nova"
              element={
                <RequireAuth requirePermission="culto.avisos.novo">
                  <AvisoEditor kind="REGRA_CULTO" />
                </RequireAuth>
              }
            />
            <Route
              path="/avisos/regras/:id"
              element={
                <RequireAuth requirePermission="culto.avisos.ver">
                  <AvisoEditor kind="REGRA_CULTO" />
                </RequireAuth>
              }
            />
            <Route
              path="/avisos/:id"
              element={
                <RequireAuth requirePermission="culto.avisos.ver">
                  <AvisoEditor kind="AVULSO" />
                </RequireAuth>
              }
            />
            <Route
              path="/avisos/:id/envio"
              element={
                <RequireAuth requirePermission="culto.avisos.ver">
                  <AvisoEnvio />
                </RequireAuth>
              }
            />

            <Route
              path="/tarefas"
              element={
                <RequireAuth requirePermission="louvor.tarefas.ver">
                  <TasksModule />
                </RequireAuth>
              }
            />

            <Route
              path="/iluminacao"
              element={
                <RequireAuth requirePermission="culto.iluminacao.ver">
                  <LightingModule />
                </RequireAuth>
              }
            />

            {/* Financeiro: MASTER, ADMIN (leitura) e função FINANCEIRO */}
            <Route
              path="/financeiro"
              element={
                <RequireAuth requirePermission="financeiro.painel.ver">
                  <FinancePanel />
                </RequireAuth>
              }
            />
            <Route
              path="/financeiro/lancamentos"
              element={
                <RequireAuth requirePermission="financeiro.lancamentos.ver">
                  <FinanceTransactions />
                </RequireAuth>
              }
            />
            <Route
              path="/financeiro/contagem"
              element={
                <RequireAuth requirePermission="financeiro.contagem.ver">
                  <FinanceCounts />
                </RequireAuth>
              }
            />
            <Route
              path="/financeiro/contas"
              element={
                <RequireAuth requirePermission="financeiro.contas_pagar.ver">
                  <FinanceBills />
                </RequireAuth>
              }
            />
            <Route
              path="/financeiro/saldos"
              element={
                <RequireAuth requirePermission="financeiro.conciliacao.ver">
                  <FinanceBalances />
                </RequireAuth>
              }
            />
            <Route
              path="/financeiro/conciliacao"
              element={
                <RequireAuth requirePermission="financeiro.conciliacao.ver">
                  <FinanceReconcile />
                </RequireAuth>
              }
            />
            <Route
              path="/financeiro/fluxo-de-caixa"
              element={
                <RequireAuth requirePermission="financeiro.fluxo.ver">
                  <FinanceCashFlow />
                </RequireAuth>
              }
            />
            <Route
              path="/financeiro/campanhas"
              element={
                <RequireAuth requirePermission="financeiro.campanhas.ver">
                  <FinanceCampaigns />
                </RequireAuth>
              }
            />
            <Route
              path="/financeiro/orcamento"
              element={
                <RequireAuth requirePermission="financeiro.orcamento.ver">
                  <FinanceBudget />
                </RequireAuth>
              }
            />
            <Route
              path="/financeiro/fechamento"
              element={
                <RequireAuth requirePermission="financeiro.fechamento.ver">
                  <FinanceClosing />
                </RequireAuth>
              }
            />
            <Route
              path="/financeiro/auditoria"
              element={
                <RequireAuth requirePermission="financeiro.auditoria.ver">
                  <FinanceAudit />
                </RequireAuth>
              }
            />
            <Route
              path="/financeiro/relatorios"
              element={
                <RequireAuth requirePermission="financeiro.relatorios.ver">
                  <FinanceReports />
                </RequireAuth>
              }
            />
            <Route
              path="/financeiro/informes"
              element={
                <RequireAuth requirePermission="financeiro.relatorios.ver">
                  <FinanceStatements />
                </RequireAuth>
              }
            />
            <Route
              path="/financeiro/cadastros"
              element={
                <RequireAuth requirePermission="financeiro.cadastros.ver">
                  <FinanceRegistry />
                </RequireAuth>
              }
            />

            {/* Gestão de Convites */}
            <Route
              path="/convites"
              element={
                <RequireAuth requirePermission="admin.pessoas.novo">
                  <InvitationsManagement />
                </RequireAuth>
              }
            />

            {/* Membresia (fichas com dados pessoais: só MASTER/ADMIN) */}
            <Route
              path="/membros"
              element={
                <RequireAuth requirePermission="membresia.pessoas.ver">
                  <PeopleList />
                </RequireAuth>
              }
            />
            <Route
              path="/membros/novo"
              element={
                <RequireAuth requirePermission="membresia.pessoas.novo">
                  <PersonForm />
                </RequireAuth>
              }
            />
            <Route
              path="/membros/aniversarios"
              element={
                <RequireAuth requirePermission="membresia.painel.ver">
                  <Birthdays />
                </RequireAuth>
              }
            />
            <Route
              path="/membros/painel"
              element={
                <RequireAuth requirePermission="membresia.painel.ver">
                  <MembershipDashboard />
                </RequireAuth>
              }
            />
            <Route
              path="/membros/cadastros"
              element={
                <RequireAuth requirePermission="membresia.cadastros.ver">
                  <Signups />
                </RequireAuth>
              }
            />
            <Route
              path="/membros/acompanhamento"
              element={
                <RequireAuth requirePermission="membresia.acompanhamento.ver">
                  <FollowUp />
                </RequireAuth>
              }
            />
            <Route
              path="/membros/relatorios"
              element={
                <RequireAuth requirePermission="membresia.relatorios.ver">
                  <Reports />
                </RequireAuth>
              }
            />
            <Route
              path="/membros/grupos"
              element={
                <RequireAuth requirePermission="membresia.grupos.ver">
                  <Groups />
                </RequireAuth>
              }
            />
            <Route
              path="/membros/grupos/:id"
              element={
                <RequireAuth requirePermission="membresia.grupos.ver">
                  <GroupDetail />
                </RequireAuth>
              }
            />
            <Route
              path="/membros/eventos"
              element={
                <RequireAuth requirePermission="eventos.eventos.ver">
                  <ChurchEvents />
                </RequireAuth>
              }
            />
            <Route
              path="/membros/eventos/novo"
              element={
                <RequireAuth requirePermission="eventos.eventos.novo">
                  <ChurchEventForm />
                </RequireAuth>
              }
            />
            <Route
              path="/membros/eventos/:id"
              element={
                <RequireAuth requirePermission="eventos.eventos.ver">
                  <ChurchEventDetail />
                </RequireAuth>
              }
            />
            <Route
              path="/checkin/:code"
              element={
                <RequireAuth requirePermission="eventos.checkin.fazer">
                  <EventCheckin />
                </RequireAuth>
              }
            />
            <Route
              path="/membros/eventos/:id/editar"
              element={
                <RequireAuth requirePermission="eventos.eventos.alterar">
                  <ChurchEventForm />
                </RequireAuth>
              }
            />
            <Route
              path="/membros/:id"
              element={
                <RequireAuth requirePermission="membresia.pessoas.ver">
                  <PersonProfile />
                </RequireAuth>
              }
            />
            <Route
              path="/membros/:id/editar"
              element={
                <RequireAuth requirePermission="membresia.pessoas.alterar">
                  <PersonForm />
                </RequireAuth>
              }
            />

            {/* Músicos */}
            <Route
              path="/musicians"
              element={
                <RequireAuth requirePermission="admin.pessoas.ver">
                  <MusiciansList />
                </RequireAuth>
              }
            />
            <Route
              path="/musicians/new"
              element={
                <RequireAuth requirePermission="admin.pessoas.novo">
                  <MusicianForm />
                </RequireAuth>
              }
            />
            <Route
              path="/musicians/:id/edit"
              element={
                <RequireAuth requirePermission="admin.pessoas.alterar">
                  <MusicianForm />
                </RequireAuth>
              }
            />

            {/* Funções e Instrumentos */}
            <Route
              path="/roles"
              element={
                <RequireAuth requirePermission="admin.funcoes.ver">
                  <RolesManagement />
                </RequireAuth>
              }
            />
            {/* Perfis de acesso (estilo Eklesia): só o MASTER altera; quem gerencia pessoas consulta */}
            <Route
              path="/perfis-acesso"
              element={
                <RequireAuth requirePermission="admin.pessoas.ver">
                  <AccessProfiles />
                </RequireAuth>
              }
            />
            <Route
              path="/perfis-acesso/novo"
              element={
                <RequireAuth requireRole="MASTER">
                  <AccessProfileForm />
                </RequireAuth>
              }
            />
            <Route
              path="/perfis-acesso/:id"
              element={
                <RequireAuth requirePermission="admin.pessoas.ver">
                  <AccessProfileForm />
                </RequireAuth>
              }
            />

            {/* Perfil */}
            <Route
              path="/perfil"
              element={
                <RequireAuth>
                  <UserProfile />
                </RequireAuth>
              }
            />

            {/* Configurações da Igreja */}
            <Route
              path="/configuracoes"
              element={
                <RequireAuth requirePermission="admin.configuracoes.ver">
                  <ChurchSettings />
                </RequireAuth>
              }
            />
            <Route
              path="/configuracoes/integracoes"
              element={
                <RequireAuth requirePermission="admin.integracoes.ver">
                  <IntegrationsSettings />
                </RequireAuth>
              }
            />
            <Route
              path="/configuracoes/whatsapp"
              element={
                <RequireAuth requireRole="MASTER">
                  <WhatsAppSettings />
                </RequireAuth>
              }
            />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </TooltipProvider>
  </BrowserRouter>
)

export default App
