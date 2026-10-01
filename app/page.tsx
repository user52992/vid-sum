import Link from "next/link";

import VideoDurationCalculator from "@/components/video-duration-calculator";

export default function Home() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-5 sm:px-8 lg:px-12">
      <header className="flex h-24 items-center justify-between border-b border-stone-200/80">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-md"
          aria-label="视频总时长计算器首页"
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
            时长
            <span className="ml-2 text-xs font-normal tracking-widest text-stone-400">
              / VIDEO DURATION
            </span>
          </span>
        </Link>
        <span className="hidden items-center gap-2 text-xs text-stone-500 sm:flex">
          <span className="size-1.5 rounded-full bg-emerald-700" />
          本地处理，安心使用
        </span>
      </header>

      <main className="flex-1 py-10 sm:py-14">
        <div className="mb-9 sm:mb-11">
          <p className="mb-4 text-xs font-medium tracking-[0.2em] text-emerald-800">
            简单一点 · 时间清楚一点
          </p>
          <h1 className="text-[28px] leading-tight font-semibold tracking-tight sm:text-4xl">
            视频总时长计算器
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-stone-500">
            一次选择或分多次添加视频，
            <br className="sm:hidden" />
            在浏览器本地快速计算所有视频的总时长。
          </p>
        </div>
        <VideoDurationCalculator />
      </main>

      <footer className="flex flex-col gap-3 border-t border-stone-200/80 py-6 text-xs text-stone-500 sm:flex-row sm:items-center sm:justify-between">
        <p>只计算时间，不打扰你的文件。</p>
        <p className="text-stone-400">无需上传 · 无需注册 · 免费使用</p>
      </footer>
    </div>
  );
}
