"use client";

import { LoaderCircle, Power, QrCode, RefreshCw, Smartphone } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type ConnectionState = "open" | "connecting" | "close" | "unknown";
type Status = { configured: boolean; state: ConnectionState };

// Conexão do número de WhatsApp da filial via QR code. Este componente fala
// apenas com as rotas internas /api/whatsapp — a URL e a chave da Evolution API
// ficam restritas ao servidor.
export function WhatsAppConnect() {
  const [status, setStatus] = useState<Status | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<number | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/whatsapp", { cache: "no-store" });
      const body = (await response.json()) as Status & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Falha ao consultar a conexão.");
      setStatus({ configured: body.configured, state: body.state });
      if (body.state === "open") { setQr(null); setPairingCode(null); }
      return body.state;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao consultar a conexão.");
      return "unknown" as ConnectionState;
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadStatus(), 0);
    return () => window.clearTimeout(timer);
  }, [loadStatus]);

  // Enquanto o QR estiver na tela, verifica a cada 4s se o pareamento concluiu.
  useEffect(() => {
    if (!qr) return;
    pollTimer.current = window.setInterval(() => void loadStatus(), 4000);
    return () => { if (pollTimer.current) window.clearInterval(pollTimer.current); };
  }, [qr, loadStatus]);

  const connect = async () => {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/whatsapp", { method: "POST" });
      const body = (await response.json()) as { state: ConnectionState; qr: string | null; pairingCode: string | null; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Não foi possível gerar o QR code.");
      setStatus({ configured: true, state: body.state });
      setQr(body.qr); setPairingCode(body.pairingCode);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível gerar o QR code."); }
    finally { setBusy(false); }
  };

  const disconnect = async () => {
    if (!window.confirm("Desconectar o WhatsApp desta filial? Os avisos automáticos por WhatsApp ficarão na fila até reconectar.")) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/whatsapp", { method: "DELETE" });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Não foi possível desconectar.");
      setQr(null); setPairingCode(null);
      await loadStatus();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível desconectar."); }
    finally { setBusy(false); }
  };

  const state = status?.state ?? "unknown";
  const badge = state === "open"
    ? { label: "Conectado", className: "bg-[var(--row-green)] text-[var(--row-green-strong)]" }
    : state === "connecting"
      ? { label: "Aguardando pareamento", className: "bg-[var(--row-yellow)] text-[var(--row-yellow-strong)]" }
      : { label: "Desconectado", className: "bg-[var(--row-gray)] text-[var(--row-gray-strong)]" };

  return (
    <div className="mt-4 border border-[var(--line)]">
      <div className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3">
        <Smartphone size={17} className="shrink-0 text-[var(--brand)]" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">Número de envio (WhatsApp)</p>
          <p className="text-[11px] text-[var(--ink-muted)]">Conecte o aparelho da oficina escaneando o QR code.</p>
        </div>
        {status && <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${badge.className}`}>{badge.label}</span>}
      </div>
      <div className="p-4">
        {!status ? <div className="grid h-16 place-items-center"><LoaderCircle size={18} className="animate-spin text-[var(--brand)]" /></div> : !status.configured ? (
          <p className="text-xs text-[var(--ink-muted)]">O servidor ainda não possui a Evolution API configurada. Peça ao responsável técnico para definir <code>EVOLUTION_API_URL</code> e <code>EVOLUTION_API_KEY</code>.</p>
        ) : (
          <>
            {error && <p className="mb-3 text-xs text-[var(--danger)]" role="alert">{error}</p>}
            {qr && state !== "open" && (
              <div className="mb-3 grid place-items-center border border-[var(--line)] bg-white p-4">
                {/* eslint-disable-next-line @next/next/no-img-element -- QR code gerado no servidor (data URI) */}
                <img src={qr} alt="QR code para conectar o WhatsApp" className="size-52" />
                {pairingCode && <p className="mt-2 text-xs font-bold tracking-widest text-[#18201f]">Código: {pairingCode}</p>}
                <p className="mt-2 max-w-64 text-center text-[10px] text-[#66706e]">Abra o WhatsApp no celular → Dispositivos conectados → Conectar dispositivo. O código expira em alguns segundos; gere outro se necessário.</p>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {state !== "open" && <button disabled={busy} onClick={() => void connect()} className="inline-flex h-9 items-center gap-2 bg-[var(--brand)] px-3 text-xs font-bold text-white disabled:opacity-60">{busy ? <LoaderCircle size={14} className="animate-spin" /> : <QrCode size={14} />}{qr ? "Gerar novo QR code" : "Conectar por QR code"}</button>}
              {state === "open" && <button disabled={busy} onClick={() => void disconnect()} className="inline-flex h-9 items-center gap-2 border border-[var(--line-strong)] px-3 text-xs font-bold text-[var(--danger)] disabled:opacity-60"><Power size={14} />Desconectar número</button>}
              <button disabled={busy} onClick={() => void loadStatus()} className="inline-flex h-9 items-center gap-2 border border-[var(--line)] px-3 text-xs font-bold disabled:opacity-60"><RefreshCw size={14} />Atualizar situação</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
