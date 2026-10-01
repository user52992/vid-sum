import Link from "next/link";
import { notFound } from "next/navigation";

import VideoDurationCalculator from "@/components/video-duration-calculator";
import { isLocale, locales, messages } from "@/lib/i18n";
import { createMetadata, getSiteOrigin } from "@/lib/seo";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return createMetadata(locale);
}

export default async function Home({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = messages[locale];
  const origin = getSiteOrigin();
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "VidSum",
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Any",
    inLanguage: t.htmlLang,
    description: t.seo.description,
    isAccessibleForFree: true,
    url: `${origin}/${locale}`,
  };
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-5 sm:px-8 lg:px-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />
      <header className="flex min-h-24 items-center justify-between gap-3 border-b border-stone-200/80">
        <Link
          href={`/${locale}`}
          className="flex min-w-0 items-center gap-2 rounded-md sm:gap-3"
          aria-label={t.homeLabel}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-800 text-white">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect
                x="3"
                y="5"
                width="18"
                height="14"
                rx="3"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M7 5v14M17 5v14M3 10h4M3 14h4M17 10h4M17 14h4"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path d="m10 9 5 3-5 3V9Z" fill="currentColor" />
            </svg>
          </span>
          <span className="text-base font-semibold tracking-tight sm:text-lg">
            {t.brand}
            <span className="ml-2 hidden text-xs font-normal tracking-widest text-stone-400 sm:inline">
              / {t.brandCaption}
            </span>
          </span>
        </Link>
        <nav
          aria-label={t.languageLabel}
          className="flex shrink-0 rounded-lg border border-stone-200 bg-white p-1"
        >
          {locales.map((language) => (
            <Link
              key={language}
              href={`/${language}`}
              hrefLang={language}
              lang={messages[language].htmlLang}
              aria-current={language === locale ? "page" : undefined}
              aria-label={language === "en" ? "Switch to English" : "切换到中文"}
              className={`flex min-h-11 min-w-11 items-center justify-center rounded-md px-2 text-xs font-medium transition-colors ${language === locale ? "bg-emerald-800 text-white" : "text-stone-500 hover:bg-stone-100 hover:text-stone-800"}`}
            >
              {language === "en" ? "EN" : "中文"}
            </Link>
          ))}
        </nav>
      </header>

      <main className="flex-1 py-10 sm:py-14">
        <div className="mb-9 sm:mb-11">
          <p className="mb-4 text-xs font-medium tracking-[0.2em] text-emerald-800">{t.eyebrow}</p>
          <h1 className="text-[28px] leading-tight font-semibold tracking-tight sm:text-4xl">
            {t.heading}
          </h1>
        </div>
        <VideoDurationCalculator locale={locale} />
      </main>
    </div>
  );
}
