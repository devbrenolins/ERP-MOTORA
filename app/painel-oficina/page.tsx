import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { WorkshopBoard } from "@/components/workshop-board";

export const metadata: Metadata = { title: "Agenda da oficina", description: "Painel em tempo real com todos os veículos por data, status e prioridade." };
export default function Page() { return <AppShell><WorkshopBoard /></AppShell>; }
