"use client";

import {
  Bell, Boxes, Building2, CalendarDays, CarFront, ChevronDown,
  CircleDollarSign, ClipboardCheck, ClipboardList, Command, FileBarChart,
  Gauge, Menu, PackageSearch, PanelLeftClose, Plus, Search, Settings,
  ShieldCheck, Users, Wrench, X,
} from "lucide-react";
import { useEffect, useState } from "react";

const navigation = [
  { label: "Visão geral", icon: Gauge, active: true },
  { label: "Atendimento", icon: ClipboardList },
  { label: "Agenda", icon: CalendarDays },
  { label: "Clientes", icon: Users },
  { label: "Veículos", icon: CarFront },
  { label: "Recepção", icon: ClipboardCheck },
  { label: "Ordens de serviço", icon: Wrench },
  { label: "Estoque", icon: Boxes },
  { label: "Compras", icon: PackageSearch },
  { label: "Financeiro", icon: CircleDollarSign },
  { label: "Relatórios", icon: FileBarChart },
];

const metrics = [
  { label: "Faturamento no período", value: "R$ 0,00", helper: "Nenhuma movimentação" },
  { label: "Ordens em andamento", value: "0", helper: "Operação ainda não iniciada" },
  { label: "Orçamentos pendentes", value: "0", helper: "Nenhuma aprovação aguardando" },
  { label: "Contas vencidas", value: "R$ 0,00", helper: "Nenhum título vencido" },
];

const setupSteps = [
  ["Cadastrar empresa", "Dados fiscais e identidade"],
  ["Criar primeira filial", "Horários e numeração"],
  ["Convidar equipe", "Usuários, perfis e acessos"],
  ["Configurar serviços", "Catálogo e preços"],
  ["Revisar segurança", "Permissões e auditoria"],
];

export function ErpShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <aside className={`fixed inset-y-0 left-0 z-40 w-[252px] bg-[var(--sidebar)] text-white transition-transform lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
          <div className="grid size-9 place-items-center bg-[var(--brand)] text-white"><Wrench size={18} strokeWidth={2.2} /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold tracking-tight">MOTORA</p>
            <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-[var(--sidebar-muted)]">ERP Automotivo</p>
          </div>
          <button className="p-2 text-white/70 lg:hidden" aria-label="Fechar menu" onClick={() => setSidebarOpen(false)}><X size={18} /></button>
        </div>

        <div className="mx-3 mt-3 border border-white/10 bg-white/[.04] px-3 py-2.5">
          <button className="flex w-full items-center gap-2 text-left" aria-label="Selecionar empresa e filial">
            <Building2 size={16} className="text-[#74c4b7]" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold">Configuração inicial</span>
              <span className="block truncate text-[11px] text-[var(--sidebar-muted)]">Nenhuma filial selecionada</span>
            </span>
            <ChevronDown size={14} className="text-[var(--sidebar-muted)]" />
          </button>
        </div>

        <nav aria-label="Módulos principais" className="mt-3 space-y-0.5 px-3">
          <p className="px-3 pb-2 pt-2 text-[10px] font-bold uppercase tracking-[.14em] text-[var(--sidebar-muted)]">Operação</p>
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <a key={item.label} href={item.active ? "/" : "#configuracao"} className={`flex h-9 items-center gap-3 px-3 text-[13px] font-medium transition ${item.active ? "bg-white/10 text-white" : "text-[#c3cfcc] hover:bg-white/[.06] hover:text-white"}`} aria-current={item.active ? "page" : undefined}>
                <Icon size={16} /><span>{item.label}</span>
              </a>
            );
          })}
        </nav>

        <div className="absolute inset-x-3 bottom-3 border-t border-white/10 pt-3">
          <a href="#configuracao" className="flex h-9 items-center gap-3 px-3 text-[13px] font-medium text-[#c3cfcc] hover:bg-white/[.06] hover:text-white"><Settings size={16} />Configurações</a>
          <div className="mt-2 flex items-center gap-3 px-3 py-2">
            <div className="grid size-8 place-items-center rounded-full bg-[#344440] text-xs font-bold">AD</div>
            <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">Administrador</p><p className="truncate text-[11px] text-[var(--sidebar-muted)]">Ambiente de implantação</p></div>
          </div>
        </div>
      </aside>

      {sidebarOpen && <button aria-label="Fechar menu" className="fixed inset-0 z-30 bg-black/45 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <div className="lg:pl-[252px]">
        <header className="sticky top-0 z-20 flex h-16 items-center border-b border-[var(--line)] bg-[var(--surface)] px-4 lg:px-6">
          <button className="mr-3 p-2 text-[var(--ink-muted)] lg:hidden" aria-label="Abrir menu" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
          <div className="hidden items-center gap-2 text-xs text-[var(--ink-muted)] sm:flex"><span>Início</span><span>/</span><span className="font-semibold text-[var(--ink)]">Visão geral</span></div>
          <div className="ml-auto flex items-center gap-1.5">
            <button onClick={() => setSearchOpen(true)} className="hidden h-9 min-w-64 items-center gap-2 border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-left text-xs text-[var(--ink-muted)] transition hover:border-[var(--line-strong)] md:flex">
              <Search size={15} /><span className="flex-1">Buscar cliente, placa ou OS</span><kbd className="flex items-center gap-0.5 border border-[var(--line)] bg-[var(--surface)] px-1.5 py-0.5 text-[10px]"><Command size={10} />K</kbd>
            </button>
            <button onClick={() => setSearchOpen(true)} className="grid size-9 place-items-center text-[var(--ink-muted)] md:hidden" aria-label="Abrir pesquisa"><Search size={18} /></button>
            <button className="relative grid size-9 place-items-center text-[var(--ink-muted)]" aria-label="Notificações"><Bell size={18} /><span className="absolute right-2 top-2 size-1.5 rounded-full bg-[var(--danger)]" /></button>
            <button className="hidden h-9 items-center gap-2 border-l border-[var(--line)] pl-3 pr-1 text-xs font-semibold sm:flex"><span className="grid size-7 place-items-center rounded-full bg-[var(--brand-soft)] text-[11px] text-[var(--brand)]">AD</span><ChevronDown size={14} /></button>
          </div>
        </header>

        <main className="mx-auto max-w-[1520px] px-4 py-5 lg:px-7 lg:py-6">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-[.12em] text-[var(--brand)]">Terça-feira, 14 de julho</p>
              <h1 className="text-2xl font-bold tracking-[-.025em]">Visão geral da oficina</h1>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">Acompanhe a operação e conclua a configuração inicial.</p>
            </div>
            <a href="/onboarding" className="inline-flex h-10 items-center justify-center gap-2 bg-[var(--brand)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--brand-strong)]"><Plus size={17} />Configurar empresa</a>
          </div>

          <section aria-label="Indicadores principais" className="grid gap-px border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => (
              <article key={metric.label} className="bg-[var(--surface)] p-4 lg:p-5">
                <p className="text-xs font-semibold text-[var(--ink-muted)]">{metric.label}</p>
                <p className="mt-3 text-2xl font-bold tracking-[-.03em]">{metric.value}</p>
                <p className="mt-2 text-[11px] text-[var(--ink-muted)]">{metric.helper}</p>
              </article>
            ))}
          </section>

          <div className="mt-5 grid gap-5 xl:grid-cols-[1.45fr_.8fr]">
            <section className="border border-[var(--line)] bg-[var(--surface)]">
              <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
                <div><h2 className="font-bold">Fluxo da oficina</h2><p className="mt-0.5 text-xs text-[var(--ink-muted)]">Ordens de serviço por etapa</p></div>
                <select aria-label="Período do fluxo" className="h-8 border border-[var(--line)] bg-[var(--surface)] px-2 text-xs"><option>Hoje</option><option>Esta semana</option></select>
              </div>
              <div className="grid min-h-64 place-items-center px-6 py-10 text-center">
                <div className="max-w-sm">
                  <div className="mx-auto grid size-11 place-items-center rounded-full bg-[var(--surface-muted)] text-[var(--ink-muted)]"><PanelLeftClose size={20} /></div>
                  <h3 className="mt-4 text-sm font-bold">A operação aparecerá aqui</h3>
                  <p className="mt-1.5 text-xs leading-5 text-[var(--ink-muted)]">Conclua o cadastro da empresa e crie a primeira ordem de serviço para acompanhar o fluxo em tempo real.</p>
                </div>
              </div>
            </section>

            <section id="configuracao" className="border border-[var(--line)] bg-[var(--surface)]">
              <div className="border-b border-[var(--line)] px-5 py-4"><h2 className="font-bold">Implantação</h2><p className="mt-0.5 text-xs text-[var(--ink-muted)]">0 de 5 etapas concluídas</p></div>
              <div className="h-1 bg-[var(--surface-muted)]"><div className="h-full w-[4%] bg-[var(--brand)]" /></div>
              <ol className="divide-y divide-[var(--line)]">
                {setupSteps.map(([title, subtitle], index) => (
                  <li key={title} className="flex items-center gap-3 px-5 py-3.5">
                    <span className="grid size-6 place-items-center rounded-full border border-[var(--line-strong)] text-[10px] font-bold text-[var(--ink-muted)]">{index + 1}</span>
                    <span className="min-w-0 flex-1"><span className="block text-xs font-semibold">{title}</span><span className="block text-[11px] text-[var(--ink-muted)]">{subtitle}</span></span>
                    {index === 0 ? <a href="/onboarding" className="text-xs font-bold text-[var(--brand)] hover:underline">Iniciar</a> : <ShieldCheck size={15} className="text-[var(--line-strong)]" />}
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </main>
      </div>

      {searchOpen && (
        <div className="fixed inset-0 z-50 bg-black/45 px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Pesquisa global" onMouseDown={(event) => event.target === event.currentTarget && setSearchOpen(false)}>
          <div className="mx-auto max-w-xl border border-[var(--line)] bg-[var(--surface)] shadow-2xl">
            <div className="flex items-center gap-3 border-b border-[var(--line)] px-4"><Search size={18} className="text-[var(--ink-muted)]" /><input autoFocus className="h-14 min-w-0 flex-1 bg-transparent outline-none" placeholder="Busque por cliente, CPF, placa, OS ou produto" /><button onClick={() => setSearchOpen(false)} className="p-2 text-[var(--ink-muted)]" aria-label="Fechar pesquisa"><X size={18} /></button></div>
            <div className="px-5 py-8 text-center"><p className="text-sm font-semibold">Digite para pesquisar em todo o ERP</p><p className="mt-1 text-xs text-[var(--ink-muted)]">Os resultados respeitam sua empresa, filial e permissões.</p></div>
          </div>
        </div>
      )}
    </div>
  );
}
