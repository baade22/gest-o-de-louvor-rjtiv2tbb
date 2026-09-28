import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Bell,
  CheckCheck,
  CalendarDays,
  ExternalLink,
  Film,
  CheckSquare,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useAuth } from '@/contexts/AuthContext'
import type { InternalNotification } from '@/types'
import {
  listNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '@/services/notifications'

export function NotificationsBell() {
  const { currentChurch } = useAuth()
  const [notifications, setNotifications] = useState<InternalNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const fetchNotifs = async () => {
    try {
      setIsLoading(true)
      const data = await listNotifications(currentChurch?.id)
      setNotifications(data.notifications || [])
      setUnreadCount(data.unread_count || 0)
    } catch (err) {
      console.error('Erro ao carregar notificações:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchNotifs()
    const interval = setInterval(fetchNotifs, 30000)
    return () => clearInterval(interval)
  }, [currentChurch?.id])

  const handleMarkAll = async () => {
    try {
      await markAllNotificationsAsRead()
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
      setUnreadCount(0)
    } catch (err) {
      console.error(err)
    }
  }

  const handleItemClick = async (notif: InternalNotification) => {
    if (!notif.read) {
      try {
        await markNotificationAsRead(notif.id)
        setNotifications((prev) => prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n)))
        setUnreadCount((c) => Math.max(0, c - 1))
      } catch (err) {
        console.error(err)
      }
    }
    setIsOpen(false)
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Abrir notificações"
          className="relative h-9 w-9 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 h-4 min-w-4 px-1 rounded-full bg-teal-600 text-[10px] font-bold text-white flex items-center justify-center animate-pulse">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 sm:w-96 p-0 rounded-2xl shadow-xl border border-slate-200"
      >
        <div className="p-3 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-900">Notificações</span>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-[10px] bg-teal-50 text-teal-700">
                {unreadCount} nova{unreadCount > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAll}
              className="h-7 text-xs text-slate-500 hover:text-slate-900 gap-1 px-2"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Marcar lidas
            </Button>
          )}
        </div>

        <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-100">
          {notifications.length === 0 ? (
            <div className="p-6 text-center text-slate-400">
              <Bell className="h-6 w-6 mx-auto mb-1.5 opacity-30" />
              <p className="text-xs">Nenhuma notificação por aqui.</p>
            </div>
          ) : (
            notifications.map((n) => {
              const isMedia = n.type === 'MEDIA_ASSIGNED'
              const isTask = n.type === 'TASK_ASSIGNED'

              const innerContent = (
                <div
                  className={`p-3 text-left transition-colors flex items-start gap-2.5 ${
                    !n.read ? 'bg-teal-50/40 hover:bg-teal-50/70' : 'hover:bg-slate-50'
                  }`}
                  onClick={() => handleItemClick(n)}
                >
                  <div
                    className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                      isMedia
                        ? 'bg-emerald-100 text-emerald-700'
                        : isTask
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {isMedia ? (
                      <Film className="h-3.5 w-3.5" />
                    ) : isTask ? (
                      <CheckSquare className="h-3.5 w-3.5" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-xs font-bold text-slate-900 truncate">{n.title}</p>
                      {!n.read && <span className="h-2 w-2 rounded-full bg-teal-600 shrink-0" />}
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{n.message}</p>
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      {n.created ? new Date(n.created).toLocaleString('pt-BR') : ''}
                    </span>
                  </div>
                </div>
              )

              if (n.link) {
                return (
                  <Link key={n.id} to={n.link} className="block">
                    {innerContent}
                  </Link>
                )
              }
              return (
                <div key={n.id} role="button">
                  {innerContent}
                </div>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
