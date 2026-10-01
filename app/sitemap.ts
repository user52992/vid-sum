import type { MetadataRoute } from "next";

import { locales } from "@/lib/i18n";
import { getLanguageUrls, getSiteOrigin } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getSiteOrigin();
  return locales.map((locale) => ({
    url: `${origin}/${locale}`,
    alternates: { languages: getLanguageUrls(origin) },
  }));
}
