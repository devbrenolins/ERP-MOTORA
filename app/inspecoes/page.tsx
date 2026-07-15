import type { Metadata } from "next";
import { ModuleRoute, moduleTitle } from "@/components/module-route";

export const metadata: Metadata = { title: moduleTitle("inspecoes") };
export default function Page() { return <ModuleRoute module="inspecoes" />; }
