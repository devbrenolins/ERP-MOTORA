import type { Metadata } from "next";
import { ModuleRoute, moduleTitle } from "@/components/module-route";

export const metadata: Metadata = { title: moduleTitle("contas-receber") };
export default function Page() { return <ModuleRoute module="contas-receber" />; }
