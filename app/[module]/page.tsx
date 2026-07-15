import type { Metadata } from "next";
import { ModuleRoute, moduleTitle } from "@/components/module-route";

export async function generateMetadata({ params }: { params: Promise<{ module: string }> }): Promise<Metadata> {
  return { title: moduleTitle((await params).module) };
}

export default async function DynamicModulePage({ params }: { params: Promise<{ module: string }> }) {
  return <ModuleRoute module={(await params).module} />;
}
