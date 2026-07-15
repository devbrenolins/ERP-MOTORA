"use client";

import { Check } from "lucide-react";
import { PROGRESS_STAGES, progressIndex, dateTime } from "@/lib/workshop";

// Barra de progresso do serviço (Recebido → Entregue), compartilhada entre o
// painel da oficina e o portal do cliente.
export function ServiceProgress({ status }: { status: string }) {
  const index = progressIndex(status);
  if (index < 0) return <p className="text-xs font-bold text-[var(--row-gray-strong)]">Serviço cancelado</p>;
  return (
    <div aria-label={`Progresso: etapa ${index + 1} de ${PROGRESS_STAGES.length} (${PROGRESS_STAGES[index]})`} role="img">
      <div className="flex gap-1">
        {PROGRESS_STAGES.map((stage, position) => (
          <div key={stage} className="min-w-0 flex-1">
            <div className={`h-2 transition-colors duration-500 ${position <= index ? "bg-[var(--row-green-strong)]" : "bg-[var(--line)]"}`} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 hidden justify-between text-[10px] font-semibold text-[var(--ink-muted)] sm:flex">
        {PROGRESS_STAGES.map((stage, position) => (
          <span key={stage} className={position <= index ? "text-[var(--row-green-strong)]" : ""}>{stage}</span>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] font-bold text-[var(--row-green-strong)] sm:hidden">{PROGRESS_STAGES[index]}</p>
    </div>
  );
}

export type TimelineEvent = { id: number | string; type: string; description: string; created_at: string; author?: string | null };

// Linha do tempo permanente da ordem de serviço.
export function ServiceTimeline({ events, emptyLabel = "Nenhum evento registrado ainda." }: { events: TimelineEvent[]; emptyLabel?: string }) {
  if (!events.length) return <p className="py-6 text-center text-xs text-[var(--ink-muted)]">{emptyLabel}</p>;
  return (
    <ol className="relative ml-2 border-l-2 border-[var(--line)]">
      {events.map((event, index) => (
        <li key={event.id} className="relative pb-5 pl-5 last:pb-1">
          <span className={`absolute -left-[7px] top-1 grid size-3 place-items-center rounded-full border-2 border-[var(--surface)] ${index === events.length - 1 ? "bg-[var(--brand)]" : "bg-[var(--line-strong)]"}`}>
            {index === events.length - 1 && <Check size={8} className="text-white" />}
          </span>
          <p className="text-[11px] font-bold text-[var(--ink-muted)]">{dateTime(event.created_at)}</p>
          <p className="mt-0.5 text-xs font-semibold">{event.description}</p>
          {event.author && <p className="mt-0.5 text-[10px] text-[var(--ink-muted)]">por {event.author}</p>}
        </li>
      ))}
    </ol>
  );
}
