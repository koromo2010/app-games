import type { Metadata } from "next";
import { SiteAdminPanel } from "./SiteAdminPanel";

export const metadata: Metadata = { title: "サイト管理", robots: { index: false, follow: false, nocache: true } };

export default function SiteAdminPage() {
  return <SiteAdminPanel />;
}
