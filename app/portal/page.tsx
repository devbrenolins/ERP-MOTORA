import type { Metadata } from "next";
import { CustomerPortal } from "@/components/customer-portal";

export const metadata: Metadata = { title:"Portal do cliente",description:"Acompanhamento seguro de ordens, orçamentos e garantias.",referrer:"no-referrer",robots:{index:false,follow:false} };
export default function PortalPage(){return <CustomerPortal/>}
