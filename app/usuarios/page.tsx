import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { UsersModule } from "@/components/users-module";

export const metadata: Metadata = { title: "Usuários" };
export default function Page() { return <AppShell><UsersModule /></AppShell>; }
