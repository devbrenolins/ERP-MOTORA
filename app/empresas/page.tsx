import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { CompanyAdminModule } from "@/components/company-admin-module";

export const metadata: Metadata = { title: "Empresas clientes" };
export default function Page() { return <AppShell><CompanyAdminModule /></AppShell>; }
