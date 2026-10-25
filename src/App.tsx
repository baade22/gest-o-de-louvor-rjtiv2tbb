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
import PersonDocuments from '@/pages/membership/documents/PersonDocuments'
import MemberCards from '@/pages/membership/documents/MemberCards'
import PublicSignup from '@/pages/membership/PublicSignup'
import NotFound from '@/pages/NotFound'

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
              <RequireAuth requireRole="ADMIN">
                <PersonDocuments />
              </RequireAuth>
            }
          />
          <Route
            path="/membros/carteirinhas"
            element={
              <RequireAuth requireRole="ADMIN">
                <MemberCards />
              </RequireAuth>
            }
          />

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
                <RequireAuth requireRole="ADMIN">
                  <PeopleList />
                </RequireAuth>
              }
            />
            <Route
              path="/membros/novo"
              element={
                <RequireAuth requireRole="ADMIN">
                  <PersonForm />
                </RequireAuth>
              }
            />
            <Route
              path="/membros/aniversarios"
              element={
                <RequireAuth requireRole="ADMIN">
                  <Birthdays />
                </RequireAuth>
              }
            />
            <Route
              path="/membros/painel"
              element={
                <RequireAuth requireRole="ADMIN">
                  <MembershipDashboard />
                </RequireAuth>
              }
            />
            <Route
              path="/membros/cadastros"
              element={
                <RequireAuth requireRole="ADMIN">
                  <Signups />
                </RequireAuth>
              }
            />
            <Route
              path="/membros/acompanhamento"
              element={
                <RequireAuth requireRole="ADMIN">
                  <FollowUp />
                </RequireAuth>
              }
            />
            <Route
              path="/membros/relatorios"
              element={
                <RequireAuth requireRole="ADMIN">
                  <Reports />
                </RequireAuth>
              }
            />
            <Route
              path="/membros/grupos"
              element={
                <RequireAuth requireRole="ADMIN">
                  <Groups />
                </RequireAuth>
              }
            />
            <Route
              path="/membros/grupos/:id"
              element={
                <RequireAuth requireRole="ADMIN">
                  <GroupDetail />
                </RequireAuth>
              }
            />
            <Route
              path="/membros/eventos"
              element={
                <RequireAuth requireRole="ADMIN">
                  <ChurchEvents />
                </RequireAuth>
              }
            />
            <Route
              path="/membros/eventos/novo"
              element={
                <RequireAuth requireRole="ADMIN">
                  <ChurchEventForm />
                </RequireAuth>
              }
            />
            <Route
              path="/membros/eventos/:id"
              element={
                <RequireAuth requireRole="ADMIN">
                  <ChurchEventDetail />
                </RequireAuth>
              }
            />
            <Route
              path="/membros/eventos/:id/editar"
              element={
                <RequireAuth requireRole="ADMIN">
                  <ChurchEventForm />
                </RequireAuth>
              }
            />
            <Route
              path="/membros/:id"
              element={
                <RequireAuth requireRole="ADMIN">
                  <PersonProfile />
                </RequireAuth>
              }
            />
            <Route
              path="/membros/:id/editar"
              element={
                <RequireAuth requireRole="ADMIN">
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
