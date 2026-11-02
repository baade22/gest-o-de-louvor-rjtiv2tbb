import React from 'react'
import { Check, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { SyncEventRepertoireSummary, SyncEventSongItemResult } from '@/services/holyricsAgent'

export interface MediaReportItem {
  id: string
  name: string
  state: 'ok' | 'error' | 'waiting'
  detail: string
}

export interface SyncReport {
  items: SyncEventSongItemResult[]
  summary: SyncEventRepertoireSummary | null
  message: string
  hasErrors: boolean
  /** Mídias do culto: enviadas ao computador e colocadas na playlist (ou o erro). */
  media?: MediaReportItem[]
  /** Resultado da playlist do culto no Holyrics (títulos, músicas e mídias). */
  playlist?: { state: 'ok' | 'error' | 'waiting'; title: string; description: string } | null
}

export function SyncReportDialog({
  report,
  eventTitle,
  onClose,
}: {
  report: SyncReport | null
  eventTitle: string
  onClose: () => void
}) {
  const summary = report?.summary
  const stats = summary
    ? [
        { label: 'Total', value: summary.total, className: 'text-slate-900' },
        { label: 'Criadas', value: summary.created, className: 'text-violet-700' },
        { label: 'Já no acervo', value: summary.already_existed, className: 'text-sky-700' },
        {
          label: 'Na playlist',
          value: summary.added + summary.already_in_playlist,
          className: 'text-emerald-700',
        },
        {
          label: 'Erros',
          value: summary.errors,
          className: summary.errors ? 'text-red-700' : 'text-slate-400',
        },
      ]
    : []

  return (
    <Dialog open={Boolean(report)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col rounded-xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Resultado do envio ao Holyrics</DialogTitle>
          <DialogDescription>{eventTitle} · na ordem do repertório</DialogDescription>
        </DialogHeader>

        {stats.length > 0 && (
          <div className="grid grid-cols-5 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200">
            {stats.map((s) => (
              <div key={s.label} className="bg-white px-2 py-2 text-center">
                <div className={cn('text-lg font-bold', s.className)}>{s.value}</div>
                <div className="text-[11px] text-slate-500">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {report?.message && (
          <div
            className={cn(
              'rounded-lg border p-3 text-sm',
              report.hasErrors
                ? 'border-amber-200 bg-amber-50 text-amber-900'
                : 'border-emerald-200 bg-emerald-50 text-emerald-900',
            )}
          >
            {report.message}
          </div>
        )}

        {report?.playlist && (
          <div
            className={cn(
              'flex items-start gap-2 rounded-lg border p-3 text-sm',
              report.playlist.state === 'error'
                ? 'border-red-200 bg-red-50 text-red-900'
                : report.playlist.state === 'waiting'
                  ? 'border-slate-200 bg-slate-50 text-slate-700'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-900',
            )}
          >
            {report.playlist.state === 'waiting' && (
              <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
            )}
            <div>
              <div className="font-semibold">{report.playlist.title}</div>
              <div className="text-xs">{report.playlist.description}</div>
            </div>
          </div>
        )}

        <div className="my-1 flex-1 space-y-3 overflow-y-auto pr-1">
          {report && report.items.length > 0 && (
            <ul className="space-y-1.5">
              {report?.items.map((item) => {
                const ok = item.status === 'SUCCESS'
                return (
                  <li
                    key={item.event_song_id || item.order}
                    className={cn(
                      'flex items-start gap-3 rounded-lg border p-3',
                      ok ? 'border-slate-200 bg-white' : 'border-red-200 bg-red-50/50',
                    )}
                  >
                    <span
                      className={cn(
                        'grid h-6 w-6 shrink-0 place-items-center rounded-md',
                        ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700',
                      )}
                    >
                      {ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-900">
                        {item.order}. {item.song_title}
                      </div>
                      <p
                        className={cn(
                          'text-xs',
                          ok ? 'text-slate-500' : 'font-medium text-red-700',
                        )}
                      >
                        {item.detail || item.error}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {report?.media && report.media.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Mídias
              </div>
              <ul className="space-y-1.5">
                {report.media.map((m) => (
                  <li
                    key={m.id}
                    className={cn(
                      'flex items-start gap-3 rounded-lg border p-3',
                      m.state === 'error'
                        ? 'border-red-200 bg-red-50/50'
                        : 'border-slate-200 bg-white',
                    )}
                  >
                    <span
                      className={cn(
                        'grid h-6 w-6 shrink-0 place-items-center rounded-md',
                        m.state === 'ok' && 'bg-emerald-100 text-emerald-700',
                        m.state === 'error' && 'bg-red-100 text-red-700',
                        m.state === 'waiting' && 'bg-slate-100 text-slate-500',
                      )}
                    >
                      {m.state === 'ok' ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : m.state === 'error' ? (
                        <X className="h-3.5 w-3.5" />
                      ) : (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="break-words text-sm font-medium text-slate-900">{m.name}</div>
                      <p
                        className={cn(
                          'text-xs',
                          m.state === 'error' ? 'font-medium text-red-700' : 'text-slate-500',
                        )}
                      >
                        {m.detail}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onClose} className="rounded-lg">
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
