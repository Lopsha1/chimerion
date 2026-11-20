import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "./Chrome";
import type { Content } from "../types";

export async function loadContent(): Promise<Content> {
  const response = await fetch("/api/content");
  if (response.ok) return response.json();
  const fallback = await fetch("/content.json");
  if (!fallback.ok) throw new Error("Не удалось загрузить клуб");
  return fallback.json();
}

export function useContent() {
  return useQuery({
    queryKey: ["content"],
    queryFn: loadContent,
  });
}

export function PageShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <>
      <a className="skip" href="#main">К содержанию</a>
      <SiteHeader />
      <main id="main" className={className ? `page-in ${className}` : "page-in"}>{children}</main>
      <SiteFooter />
    </>
  );
}

export function PageIntro({ kicker, title, text }: { kicker: string; title: string; text: string }) {
  return (
    <header className="page-intro">
      <p className="eyebrow">{kicker}</p>
      <h1>{title}</h1>
      <p className="lede">{text}</p>
    </header>
  );
}
