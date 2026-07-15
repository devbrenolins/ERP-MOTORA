"use client";

import {
  ArrowLeftRight, Bell, Boxes, Building2, CalendarDays, CarFront, ChevronDown, ClipboardCheck,
  ClipboardList, Command, FileText, Gauge, Menu, PackageSearch, Search, Settings, ShieldCheck,
  Activity, BarChart3, Banknote, Bot, CircleDollarSign, KeyRound, Landmark, LogOut, Plug, ReceiptText, RefreshCw, ShoppingCart, SlidersHorizontal, Target, Truck, UserRoundCheck, Users, WalletCards, Warehouse, Wrench, X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { NotificationCenter } from "@/components/notification-center";

const navigation = [
  { href: "/", label: "Visão geral", icon: Gauge },
  { href: "/atendimento", label: "Atendimento", icon: ClipboardList },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/veiculos", label: "Veículos", icon: CarFront },
  { href: "/recepcao", label: "Recepção", icon: ClipboardCheck },
  { href: "/inspecoes", label: "Inspeções", icon: ShieldCheck },
  { href: "/orcamentos", label: "Orçamentos", icon: FileText },
  { href: "/ordens", label: "Ordens de serviço", icon: Wrench },
  { href: "/produtos", label: "Produtos e peças", icon: PackageSearch, section: "Suprimentos" },
  { href: "/estoque", label: "Estoque", icon: Boxes },
  { href: "/fornecedores", label: "Fornecedores", icon: Truck },
  { href: "/compras", label: "Compras", icon: ShoppingCart },
  { href: "/inventario", label: "Inventários", icon: Warehouse },
  { href: "/transferencias", label: "Transferências", icon: ArrowLeftRight },
  { href: "/contas-receber", label: "Contas a receber", icon: ReceiptText, section: "Financeiro" },
  { href: "/contas-pagar", label: "Contas a pagar", icon: Banknote },
  { href: "/pagamentos", label: "Pagamentos", icon: CircleDollarSign },
  { href: "/fluxo-caixa", label: "Fluxo de caixa", icon: Landmark },
  { href: "/caixa", label: "Caixa", icon: WalletCards },
  { href: "/comissoes", label: "Comissões", icon: Users },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { href: "/crm", label: "CRM", icon: Target, section: "Recursos avançados" },
  { href: "/segmentos", label: "Segmentos", icon: Users },
  { href: "/garantias", label: "Garantias", icon: ShieldCheck },
  { href: "/retornos-garantia", label: "Retornos", icon: RefreshCw },
  { href: "/frotas", label: "Frotas e convênios", icon: Building2 },
  { href: "/motoristas-frota", label: "Motoristas de frota", icon: Users },
  { href: "/veiculos-frota", label: "Veículos de frota", icon: CarFront },
  { href: "/modelos-mensagem", label: "Modelos de mensagem", icon: FileText },
  { href: "/automacoes", label: "Automações", icon: Bot },
  { href: "/portal-acessos", label: "Portal do cliente", icon: KeyRound },
  { href: "/bi", label: "BI", icon: BarChart3 },
  { href: "/integracoes", label: "Integrações", icon: Plug },
  { href: "/notificacoes", label: "Notificações", icon: Bell, section: "Administração" },
  { href: "/perfis", label: "Cargos e acessos", icon: ShieldCheck },
  { href: "/auditoria", label: "Auditoria", icon: Activity },
  { href: "/privacidade", label: "Privacidade e LGPD", icon: UserRoundCheck },
  { href: "/configuracoes", label: "Configurações", icon: SlidersHorizontal },
];

type SearchResult = { id: string; title: string; subtitle: string; href: string };

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [identity, setIdentity] = useState({ name: "Usuário", role: "Acesso protegido" });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); setSearchOpen(true);
      }
      if (event.key === "Escape") { setSearchOpen(false); setSidebarOpen(false); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const loadIdentity = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const [{ data: profile }, { data: assignments }] = await Promise.all([
          supabase.from("profiles").select("full_name,last_organization_id").eq("id", user.id).single(),
          supabase.from("user_roles").select("role_id").eq("user_id", user.id),
        ]);
        const roleIds = (assignments ?? []).map((assignment) => assignment.role_id);
        const { data: roles } = roleIds.length ? await supabase.from("roles").select("code,name").in("id", roleIds).is("deleted_at", null) : { data: [] };
        const priority = ["super_admin", "owner", "administrator", "manager", "administrative"];
        const rank = (code: string) => { const index = priority.indexOf(code); return index < 0 ? priority.length : index; };
        const selectedRole = [...(roles ?? [])].sort((a, b) => rank(a.code) - rank(b.code))[0];
        setIdentity({ name: profile?.full_name || user.email || "Usuário", role: selectedRole?.name || "Acesso protegido" });
      } catch { /* Mantém o rótulo seguro quando o perfil não puder ser carregado. */ }
    };
    const timer = window.setTimeout(() => void loadIdentity(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const runSearch = async (event: FormEvent) => {
    event.preventDefault();
    const term = query.trim().replace(/[%_,()]/g, "");
    if (term.length < 2) return;
    setSearching(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("last_organization_id").eq("id", user.id).single();
      if (!profile?.last_organization_id) return;
      const org = profile.last_organization_id;
      const [customers, vehicles, orders, products] = await Promise.all([
        supabase.from("customers").select("id,name,primary_phone").eq("organization_id", org).is("deleted_at", null).ilike("name", `%${term}%`).limit(5),
        supabase.from("vehicles").select("id,license_plate,brand,model").eq("organization_id", org).is("deleted_at", null).or(`license_plate.ilike.%${term}%,model.ilike.%${term}%`).limit(5),
        supabase.from("work_orders").select("id,number,customer_complaint").eq("organization_id", org).is("deleted_at", null).or(`number.ilike.%${term}%,customer_complaint.ilike.%${term}%`).limit(5),
        supabase.from("products").select("id,sku,name").eq("organization_id", org).is("deleted_at", null).or(`sku.ilike.%${term}%,name.ilike.%${term}%`).limit(5),
      ]);
      setResults([
        ...(customers.data ?? []).map((item) => ({ id: item.id, title: item.name, subtitle: item.primary_phone ?? "Cliente", href: "/clientes" })),
        ...(vehicles.data ?? []).map((item) => ({ id: item.id, title: item.license_plate, subtitle: `${item.brand} ${item.model}`, href: "/veiculos" })),
        ...(orders.data ?? []).map((item) => ({ id: item.id, title: `OS ${item.number}`, subtitle: item.customer_complaint, href: "/ordens" })),
        ...(products.data ?? []).map((item) => ({ id: item.id, title: item.name, subtitle: `Produto • ${item.sku}`, href: "/produtos" })),
      ]);
    } catch { setResults([]); } finally { setSearching(false); }
  };

  const signOut = async () => {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  const current = navigation.find((item) => item.href === pathname)?.label ?? "Operação";
  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <aside className={`fixed inset-y-0 left-0 z-40 w-[252px] bg-[var(--sidebar)] text-white transition-transform lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
          <div className="grid size-9 place-items-center bg-[var(--brand)]"><Wrench size={18} /></div>
          <div className="min-w-0 flex-1"><p className="text-[15px] font-bold">MOTORA</p><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-[var(--sidebar-muted)]">ERP Automotivo</p></div>
          <button onClick={() => setSidebarOpen(false)} className="p-2 text-white/70 lg:hidden" aria-label="Fechar menu"><X size={18} /></button>
        </div>
        <div className="mx-3 mt-3 border border-white/10 bg-white/[.04] px-3 py-2.5">
          <div className="flex items-center gap-2"><Building2 size={16} className="text-[#74c4b7]" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">Empresa ativa</span><span className="block truncate text-[11px] text-[var(--sidebar-muted)]">Filial selecionada no perfil</span></span><ChevronDown size={14} /></div>
        </div>
        <nav aria-label="Módulos principais" className="mt-3 max-h-[calc(100vh-190px)] space-y-0.5 overflow-y-auto px-3 pb-28">
          <p className="px-3 pb-2 pt-2 text-[10px] font-bold uppercase tracking-[.14em] text-[var(--sidebar-muted)]">Operação</p>
          {navigation.map((item) => {
            const Icon = item.icon; const active = pathname === item.href;
            return <span key={item.href} className="contents">{item.section && <span className="mt-4 block px-3 pb-2 pt-2 text-[10px] font-bold uppercase tracking-[.14em] text-[var(--sidebar-muted)]">{item.section}</span>}<Link href={item.href} onClick={() => setSidebarOpen(false)} className={`flex h-9 items-center gap-3 px-3 text-[13px] font-medium transition ${active ? "bg-white/10 text-white" : "text-[#c3cfcc] hover:bg-white/[.06] hover:text-white"}`} aria-current={active ? "page" : undefined}><Icon size={16} />{item.label}</Link></span>;
          })}
        </nav>
        <div className="absolute inset-x-3 bottom-3 border-t border-white/10 pt-3">
          <Link href="/configuracoes" className="flex h-9 items-center gap-3 px-3 text-[13px] text-[#c3cfcc] hover:bg-white/[.06]"><Settings size={16} />Configurações</Link>
          <div className="mt-2 flex items-center gap-3 px-3 py-2"><div className="grid size-8 place-items-center rounded-full bg-[#344440] text-xs font-bold">{identity.name.split(/\s+/).slice(0,2).map((part) => part[0]).join("").toUpperCase()}</div><div className="min-w-0"><p className="truncate text-xs font-semibold">{identity.name}</p><p className="truncate text-[11px] text-[var(--sidebar-muted)]">{identity.role}</p></div></div>
          <button onClick={signOut} className="flex h-9 w-full items-center gap-3 px-3 text-[13px] text-[#c3cfcc] hover:bg-white/[.06]"><LogOut size={16} />Sair</button>
        </div>
      </aside>
      {sidebarOpen && <button aria-label="Fechar menu" className="fixed inset-0 z-30 bg-black/45 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <div className="lg:pl-[252px]">
        <header className="sticky top-0 z-20 flex h-16 items-center border-b border-[var(--line)] bg-[var(--surface)] px-4 lg:px-6">
          <button className="mr-3 p-2 text-[var(--ink-muted)] lg:hidden" aria-label="Abrir menu" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
          <div className="hidden items-center gap-2 text-xs text-[var(--ink-muted)] sm:flex"><span>Operação</span><span>/</span><span className="font-semibold text-[var(--ink)]">{current}</span></div>
          <div className="ml-auto flex items-center gap-1.5">
            <button onClick={() => setSearchOpen(true)} className="hidden h-9 min-w-64 items-center gap-2 border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-left text-xs text-[var(--ink-muted)] md:flex"><Search size={15} /><span className="flex-1">Buscar cliente, placa ou OS</span><kbd className="flex items-center gap-0.5 border border-[var(--line)] bg-[var(--surface)] px-1.5 py-0.5 text-[10px]"><Command size={10} />K</kbd></button>
            <button onClick={() => setSearchOpen(true)} className="grid size-9 place-items-center md:hidden" aria-label="Pesquisar"><Search size={18} /></button>
            <NotificationCenter />
          </div>
        </header>
        {children}
      </div>

      {searchOpen && <div className="fixed inset-0 z-50 bg-black/50 px-4 pt-[10vh]" role="dialog" aria-modal="true" aria-label="Pesquisa global" onMouseDown={(event) => event.target === event.currentTarget && setSearchOpen(false)}>
        <div className="mx-auto max-w-xl border border-[var(--line)] bg-[var(--surface)] shadow-2xl">
          <form onSubmit={runSearch} className="flex items-center gap-3 border-b border-[var(--line)] px-4"><Search size={18} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} className="h-14 min-w-0 flex-1 bg-transparent outline-none" placeholder="Cliente, placa, modelo, OS ou reclamação" /><button type="button" onClick={() => setSearchOpen(false)} className="p-2" aria-label="Fechar pesquisa"><X size={18} /></button></form>
          <div className="max-h-80 overflow-y-auto p-2">{searching ? <p className="p-6 text-center text-xs text-[var(--ink-muted)]">Pesquisando...</p> : results.length ? results.map((item) => <Link key={item.id} href={item.href} onClick={() => setSearchOpen(false)} className="block border-b border-[var(--line)] px-3 py-3 last:border-0 hover:bg-[var(--surface-muted)]"><p className="text-sm font-semibold">{item.title}</p><p className="mt-0.5 text-xs text-[var(--ink-muted)]">{item.subtitle}</p></Link>) : <p className="p-6 text-center text-xs text-[var(--ink-muted)]">Digite ao menos 2 caracteres e pressione Enter.</p>}</div>
        </div>
      </div>}
    </div>
  );
}
