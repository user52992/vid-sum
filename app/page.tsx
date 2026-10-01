import Link from "next/link";

import VideoDurationCalculator from "@/components/video-duration-calculator";

export default function Home() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-5 sm:px-8 lg:px-12">
      <header className="flex h-24 items-center border-b border-stone-200/80">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-md"
          aria-label="VidSum 视频时长汇总首页"
        >
          <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-800 text-white">
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
          <span className="text-lg font-semibold tracking-tight">
            视频时长汇总
            <span className="ml-2 text-xs font-normal tracking-widest text-stone-400">
              / VidSum
            </span>
          </span>
        </Link>
      </header>

      <main className="flex-1 py-10 sm:py-14">
        <div className="mb-9 sm:mb-11">
          <p className="mb-4 text-xs font-medium tracking-[0.2em] text-emerald-800">
            简单一点 · 时间清楚一点
          </p>
          <h1 className="text-[28px] leading-tight font-semibold tracking-tight sm:text-4xl">
            视频总时长计算器
          </h1>
        </div>
        <VideoDurationCalculator />
      </main>
    </div>
  );
}
