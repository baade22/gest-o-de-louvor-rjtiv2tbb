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
import UserProfile from '@/pages/UserProfile'
import ChurchSettings from '@/pages/ChurchSettings'
import IntegrationsSettings from '@/pages/IntegrationsSettings'
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
              <RequireAuth requireRole="MEMBERSHIP">
                <PersonDocuments />
              </RequireAuth>
            }
          />
          <Route
            path="/membros/carteirinhas"
            element={
              <RequireAuth requireRole="MEMBERSHIP">
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
                <RequireAuth>
                  <SongsList />
                </RequireAuth>
              }
            />
            <Route
              path="/songs/new"
              element={
                <RequireAuth requireRole="CONTENT_MANAGER">
                  <SongForm />
                </RequireAuth>
              }
            />
            <Route
              path="/songs/:id"
              element={
                <RequireAuth>
                  <SongDetail />
                </RequireAuth>
              }
            />
            <Route
              path="/songs/:id/edit"
              element={
                <RequireAuth requireRole="CONTENT_MANAGER">
                  <SongForm />
                </RequireAuth>
              }
            />

            {/* Eventos e Cultos */}
            <Route
              path="/events"
              element={
                <RequireAuth requireRole="CONTENT_MANAGER">
                  <EventsList />
                </RequireAuth>
              }
            />
            <Route
              path="/events/new"
              element={
                <RequireAuth requireRole="CONTENT_MANAGER">
                  <EventForm />
                </RequireAuth>
              }
            />
            <Route
              path="/events/:id/edit"
              element={
                <RequireAuth requireRole="CONTENT_MANAGER">
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
                <RequireAuth requireModule="sound">
                  <SoundModule />
                </RequireAuth>
              }
            />

            <Route
              path="/projecao"
              element={
                <RequireAuth requireModule="projection">
                  <ProjectionModule />
                </RequireAuth>
              }
            />

            <Route
              path="/midias"
              element={
                <RequireAuth requireModule="media">
                  <MediaModule />
                </RequireAuth>
              }
            />

            <Route
              path="/tarefas"
              element={
                <RequireAuth requireModule="tasks">
                  <TasksModule />
                </RequireAuth>
              }
            />

            <Route
              path="/iluminacao"
              element={
                <RequireAuth requireModule="lighting">
                  <LightingModule />
                </RequireAuth>
              }
            />

            {/* Financeiro: MASTER, ADMIN (leitura) e função FINANCEIRO */}
            <Route
              path="/financeiro"
              element={
                <RequireAuth requireRole="FINANCE">
                  <FinancePanel />
                </RequireAuth>
              }
            />
            <Route
              path="/financeiro/lancamentos"
              element={
                <RequireAuth requireRole="FINANCE">
                  <FinanceTransactions />
                </RequireAuth>
              }
            />
            <Route
              path="/financeiro/contagem"
              element={
                <RequireAuth requireRole="FINANCE">
                  <FinanceCounts />
                </RequireAuth>
              }
            />
            <Route
              path="/financeiro/contas"
              element={
                <RequireAuth requireRole="FINANCE">
                  <FinanceBills />
                </RequireAuth>
              }
            />
            <Route
              path="/financeiro/saldos"
              element={
                <RequireAuth requireRole="FINANCE">
                  <FinanceBalances />
                </RequireAuth>
              }
            />
            <Route
              path="/financeiro/conciliacao"
              element={
                <RequireAuth requireRole="FINANCE">
                  <FinanceReconcile />
                </RequireAuth>
              }
            />
            <Route
              path="/financeiro/fluxo-de-caixa"
              element={
                <RequireAuth requireRole="FINANCE">
                  <FinanceCashFlow />
                </RequireAuth>
              }
            />
            <Route
              path="/financeiro/campanhas"
              element={
                <RequireAuth requireRole="FINANCE">
                  <FinanceCampaigns />
                </RequireAuth>
              }
            />
            <Route
              path="/financeiro/orcamento"
              element={
                <RequireAuth requireRole="FINANCE">
                  <FinanceBudget />
                </RequireAuth>
              }
            />
            <Route
              path="/financeiro/fechamento"
              element={
                <RequireAuth requireRole="FINANCE">
                  <FinanceClosing />
                </RequireAuth>
              }
            />
            <Route
              path="/financeiro/auditoria"
              element={
                <RequireAuth requireRole="FINANCE">
                  <FinanceAudit />
                </RequireAuth>
              }
            />
            <Route
              path="/financeiro/relatorios"
              element={
                <RequireAuth requireRole="FINANCE">
                  <FinanceReports />
                </RequireAuth>
              }
            />
            <Route
              path="/financeiro/informes"
              element={
                <RequireAuth requireRole="FINANCE">
                  <FinanceStatements />
                </RequireAuth>
              }
            />
            <Route
              path="/financeiro/cadastros"
              element={
                <RequireAuth requireRole="FINANCE">
                  <FinanceRegistry />
                </RequireAuth>
              }
            />

            {/* Gestão de Convites */}
            <Route
              path="/convites"
              element={
                <RequireAuth requireRole="ADMIN">
                  <InvitationsManagement />
                </RequireAuth>
              }
            />

            {/* Membresia (fichas com dados pessoais: só MASTER/ADMIN) */}
            <Route
              path="/membros"
              element={
                <RequireAuth requireRole="MEMBERSHIP">
                  <PeopleList />
                </RequireAuth>
              }
            />
            <Route
              path="/membros/novo"
              element={
                <RequireAuth requireRole="MEMBERSHIP">
                  <PersonForm />
                </RequireAuth>
              }
            />
            <Route
              path="/membros/aniversarios"
              element={
                <RequireAuth requireRole="MEMBERSHIP">
                  <Birthdays />
                </RequireAuth>
              }
            />
            <Route
              path="/membros/painel"
              element={
                <RequireAuth requireRole="MEMBERSHIP">
                  <MembershipDashboard />
                </RequireAuth>
              }
            />
            <Route
              path="/membros/cadastros"
              element={
                <RequireAuth requireRole="MEMBERSHIP">
                  <Signups />
                </RequireAuth>
              }
            />
            <Route
              path="/membros/acompanhamento"
              element={
                <RequireAuth requireRole="MEMBERSHIP">
                  <FollowUp />
                </RequireAuth>
              }
            />
            <Route
              path="/membros/relatorios"
              element={
                <RequireAuth requireRole="MEMBERSHIP">
                  <Reports />
                </RequireAuth>
              }
            />
            <Route
              path="/membros/grupos"
              element={
                <RequireAuth requireRole="MEMBERSHIP">
                  <Groups />
                </RequireAuth>
              }
            />
            <Route
              path="/membros/grupos/:id"
              element={
                <RequireAuth requireRole="MEMBERSHIP">
                  <GroupDetail />
                </RequireAuth>
              }
            />
            <Route
              path="/membros/eventos"
              element={
                <RequireAuth requireRole="EVENTS">
                  <ChurchEvents />
                </RequireAuth>
              }
            />
            <Route
              path="/membros/eventos/novo"
              element={
                <RequireAuth requireRole="EVENTS">
                  <ChurchEventForm />
                </RequireAuth>
              }
            />
            <Route
              path="/membros/eventos/:id"
              element={
                <RequireAuth requireRole="EVENTS">
                  <ChurchEventDetail />
                </RequireAuth>
              }
            />
            <Route
              path="/checkin/:code"
              element={
                <RequireAuth requireRole="EVENTS">
                  <EventCheckin />
                </RequireAuth>
              }
            />
            <Route
              path="/membros/eventos/:id/editar"
              element={
                <RequireAuth requireRole="EVENTS">
                  <ChurchEventForm />
                </RequireAuth>
              }
            />
            <Route
              path="/membros/:id"
              element={
                <RequireAuth requireRole="MEMBERSHIP">
                  <PersonProfile />
                </RequireAuth>
              }
            />
            <Route
              path="/membros/:id/editar"
              element={
                <RequireAuth requireRole="MEMBERSHIP">
                  <PersonForm />
                </RequireAuth>
              }
            />

            {/* Músicos */}
            <Route
              path="/musicians"
              element={
                <RequireAuth requireRole="CONTENT_MANAGER">
                  <MusiciansList />
                </RequireAuth>
              }
            />
            <Route
              path="/musicians/new"
              element={
                <RequireAuth requireRole="ADMIN">
                  <MusicianForm />
                </RequireAuth>
              }
            />
            <Route
              path="/musicians/:id/edit"
              element={
                <RequireAuth requireRole="ADMIN">
                  <MusicianForm />
                </RequireAuth>
              }
            />

            {/* Funções e Instrumentos */}
            <Route
              path="/roles"
              element={
                <RequireAuth requireRole="ADMIN">
                  <RolesManagement />
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
                <RequireAuth requireRole="ADMIN">
                  <ChurchSettings />
                </RequireAuth>
              }
            />
            <Route
              path="/configuracoes/integracoes"
              element={
                <RequireAuth requireRole="ADMIN">
                  <IntegrationsSettings />
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
