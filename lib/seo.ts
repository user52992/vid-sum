import type { Metadata } from "next";

import type { Locale } from "@/lib/i18n";
import { messages } from "@/lib/i18n";

/** Use the confirmed production domain, with an override for custom deployments. */
export function getSiteOrigin(): string {
  const configured = process.env.SITE_URL?.trim() || "https://vid-sum.vercel.app";
  const url = new URL(configured);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error("SITE_URL must be an http(s) origin, such as https://your-domain.com");
  }
  return url.origin;
}

export function getLanguageUrls(origin: string) {
  return { en: `${origin}/en`, zh: `${origin}/zh`, "x-default": `${origin}/en` };
}

export function createMetadata(locale: Locale, origin = getSiteOrigin()): Metadata {
  const t = messages[locale];
  const alternate = messages[locale === "en" ? "zh" : "en"];
  const url = `${origin}/${locale}`;
  return {
    title: t.seo.title,
    description: t.seo.description,
    applicationName: "VidSum",
    metadataBase: new URL(origin),
    alternates: { canonical: url, languages: getLanguageUrls(origin) },
    openGraph: {
      type: "website",
      siteName: "VidSum",
      title: t.seo.title,
      description: t.seo.description,
      locale: t.seo.ogLocale,
      alternateLocale: alternate.seo.ogLocale,
      url,
    },
    twitter: { card: "summary", title: t.seo.title, description: t.seo.description },
    robots: { index: true, follow: true },
  };
}
