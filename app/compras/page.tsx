import type { Metadata } from "next";
import { ModuleRoute, moduleTitle } from "@/components/module-route";

export const metadata: Metadata = { title: moduleTitle("compras") };
export default function Page() { return <ModuleRoute module="compras" />; }
