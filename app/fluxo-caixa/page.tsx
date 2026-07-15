import type { Metadata } from "next";
import { ModuleRoute, moduleTitle } from "@/components/module-route";

export const metadata: Metadata = { title: moduleTitle("fluxo-caixa") };
export default function Page() { return <ModuleRoute module="fluxo-caixa" />; }
