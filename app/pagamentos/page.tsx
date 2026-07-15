import type { Metadata } from "next";
import { ModuleRoute, moduleTitle } from "@/components/module-route";

export const metadata: Metadata = { title: moduleTitle("pagamentos") };
export default function Page() { return <ModuleRoute module="pagamentos" />; }
