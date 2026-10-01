import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

const ts = createRequire(import.meta.url)("typescript");
function transpile(path) {
  return ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
}
function moduleUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}
const dictionaryUrl = moduleUrl(transpile("../lib/i18n.ts"));
const { isLocale, locales, messages } = await import(dictionaryUrl);
const seoSource = transpile("../lib/seo.ts").replaceAll(
  '"@/lib/i18n"',
  JSON.stringify(dictionaryUrl),
);
const { createMetadata, getSiteOrigin } = await import(moduleUrl(seoSource));

// Every displayed string and every callable message has a translation in both locales.
test("only English and Chinese are supported and translations have matching keys", () => {
  assert.deepEqual(locales, ["en", "zh"]);
  assert.ok(isLocale("en"));
  assert.ok(isLocale("zh"));
  for (const value of ["fr", "en-US", "constructor", "__proto__", ""]) assert.ok(!isLocale(value));
  function compare(en, zh) {
    assert.deepEqual(Object.keys(en), Object.keys(zh));
    for (const key of Object.keys(en)) {
      assert.equal(typeof en[key], typeof zh[key]);
      if (typeof en[key] === "object") compare(en[key], zh[key]);
      else if (typeof en[key] === "string") {
        assert.ok(en[key].length > 0);
        assert.ok(zh[key].length > 0);
        assert.ok(!/\p{Script=Han}/u.test(en[key]));
      }
    }
  }
  compare(messages.en, messages.zh);
});

test("English count messages use singular/plural and both locales report failures", () => {
  assert.equal(messages.en.summary(1, 0), "Calculated 1 video");
  assert.equal(messages.en.summary(2, 0), "Calculated 2 videos");
  assert.match(messages.en.summary(0, 2), /0 videos; 2 could not be read/);
  assert.match(messages.en.skippedFiles(1), /1 non-video file\./);
  assert.match(messages.en.skippedFiles(2), /2 non-video files\./);
  assert.match(messages.zh.summary(0, 2), /2 个视频无法读取/);
  assert.equal(messages.en.progress(2, 4), "Reading videos… 2 / 4");
});

test("each locale has its own canonical and reciprocal language metadata", () => {
  for (const locale of locales) {
    const metadata = createMetadata(locale, "https://vid-sum.vercel.app");
    assert.equal(metadata.alternates.canonical, `https://vid-sum.vercel.app/${locale}`);
    assert.deepEqual(metadata.alternates.languages, {
      en: "https://vid-sum.vercel.app/en",
      zh: "https://vid-sum.vercel.app/zh",
      "x-default": "https://vid-sum.vercel.app/en",
    });
    assert.equal(metadata.openGraph.locale, messages[locale].seo.ogLocale);
    assert.equal(metadata.openGraph.url, metadata.alternates.canonical);
    assert.equal(metadata.twitter.description, metadata.description);
  }
  assert.notEqual(createMetadata("en").title, createMetadata("zh").title);
  assert.notEqual(createMetadata("en").description, createMetadata("zh").description);
});

test("production domain defaults correctly and custom origins are validated", () => {
  const original = process.env.SITE_URL;
  try {
    delete process.env.SITE_URL;
    assert.equal(getSiteOrigin(), "https://vid-sum.vercel.app");
    process.env.SITE_URL = " https://custom.example/ ";
    assert.equal(getSiteOrigin(), "https://custom.example");
    for (const value of [
      "ftp://custom.example",
      "https://custom.example/path",
      "https://custom.example?q=x",
      "https://custom.example#x",
      "https://user:pass@custom.example",
    ]) {
      process.env.SITE_URL = value;
      assert.throws(getSiteOrigin, /SITE_URL must/);
    }
  } finally {
    if (original === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = original;
  }
});

const readBuild = (path) => readFileSync(new URL(`../.next/${path}`, import.meta.url), "utf8");

test("generated HTML includes localized content, document language and switch links", () => {
  for (const locale of locales) {
    const html = readBuild(`server/app/${locale}.html`);
    assert.match(html, new RegExp(`<html lang="${messages[locale].htmlLang}"`));
    assert.ok(html.includes(messages[locale].heading));
    assert.ok(html.includes(messages[locale].privacy));
    for (const language of locales) assert.ok(html.includes(`href="/${language}"`));
    const links = html.match(/<a\b[^>]*>/g) ?? [];
    assert.ok(
      links.some(
        (link) => link.includes(`href="/${locale}"`) && link.includes('aria-current="page"'),
      ),
    );
    const text = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ");
    if (locale === "en") assert.ok(!/视频|计算|读取|清空/.test(text));
  }
});

test("generated SEO tags and structured data use the real language URLs", () => {
  for (const locale of locales) {
    const html = readBuild(`server/app/${locale}.html`);
    const origin = getSiteOrigin();
    assert.ok(html.includes(`<link rel="canonical" href="${origin}/${locale}"`));
    for (const language of [...locales, "x-default"]) {
      const target = language === "x-default" ? "en" : language;
      assert.ok(
        html.includes(`<link rel="alternate" hrefLang="${language}" href="${origin}/${target}"`),
      );
    }
    assert.ok(
      html.includes(`<meta property="og:locale" content="${messages[locale].seo.ogLocale}"`),
    );
    const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    assert.ok(match);
    const data = JSON.parse(match[1]);
    assert.equal(data.inLanguage, messages[locale].htmlLang);
    assert.equal(data.url, `${origin}/${locale}`);
    assert.equal(data["@type"], "WebApplication");
    assert.ok(!html.includes("http://localhost:3000"));
  }
});

test("root redirects permanently to English and unsupported locales are not generated", () => {
  const routes = JSON.parse(readBuild("routes-manifest.json"));
  const redirect = routes.redirects.find((item) => item.source === "/");
  assert.equal(redirect.destination, "/en");
  assert.equal(redirect.statusCode, 308);
  const prerender = JSON.parse(readBuild("prerender-manifest.json"));
  assert.ok(prerender.routes["/en"]);
  assert.ok(prerender.routes["/zh"]);
  assert.equal(prerender.dynamicRoutes["/[locale]"].fallback, false);
});

test("generated sitemap and robots include the domain and both language pages", () => {
  const sitemap = readBuild("server/app/sitemap.xml.body");
  const origin = getSiteOrigin();
  for (const locale of locales) {
    assert.ok(sitemap.includes(`<loc>${origin}/${locale}</loc>`));
    assert.ok(sitemap.includes(`hreflang="${locale}" href="${origin}/${locale}"`));
  }
  assert.ok(sitemap.includes(`hreflang="x-default" href="${origin}/en"`));
  assert.ok(readBuild("server/app/robots.txt.body").includes(`Sitemap: ${origin}/sitemap.xml`));
});
