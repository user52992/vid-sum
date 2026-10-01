"use client";

import { useEffect, useRef, useState } from "react";

import type { Locale } from "@/lib/i18n";
import { messages } from "@/lib/i18n";
import type { VideoReadErrorCode } from "@/lib/video-duration";
import {
  formatDuration,
  getVideoDuration,
  isVideoFile,
  VIDEO_ACCEPT,
  VideoDurationError,
} from "@/lib/video-duration";

type VideoFileItem = {
  id: string;
  file: File;
  duration?: number;
  status: "pending" | "loading" | "success" | "error";
  error?: VideoReadErrorCode;
};
type Result = { duration: number; success: number; failed: number };
type IconName = "upload" | "file" | "clock" | "lock" | "arrow" | "close";

function Icon({ name, className = "size-5" }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    upload: (
      <>
        <path d="M12 16V3m-5 5 5-5 5 5" />
        <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
      </>
    ),
    file: (
      <>
        <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z" />
        <path d="M14 3v6h6m-10 3 5 3-5 3v-6Z" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
      </>
    ),
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
  };
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export default function VideoDurationCalculator({ locale }: { locale: Locale }) {
  const t = messages[locale];
  const [items, setItems] = useState<VideoFileItem[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [skippedFiles, setSkippedFiles] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(0);
  const dragDepth = useRef(0);
  // A synchronous guard also prevents double clicks before React renders.
  const calculation = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      const controller = calculation.current;
      calculation.current = null;
      controller?.abort();
    },
    [],
  );

  function addFiles(files: File[]) {
    if (calculation.current) return;
    const videos = files.filter(isVideoFile);
    const skipped = files.length - videos.length;
    setSkippedFiles(skipped);
    if (!videos.length) return;
    const additions = videos.map((file): VideoFileItem => ({
      id: `video-${nextId.current++}`,
      file,
      status: "pending",
    }));
    setItems((current) => [...current, ...additions]);
    setResult(null);
  }

  function clear() {
    calculation.current?.abort();
    calculation.current = null;
    setItems([]);
    setResult(null);
    setIsCalculating(false);
    setSkippedFiles(0);
    setIsDragging(false);
    dragDepth.current = 0;
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeFile(id: string) {
    if (calculation.current) return;
    setItems((current) => current.filter((item) => item.id !== id));
    setResult(null);
  }

  async function calculate() {
    if (!items.length || calculation.current) return;
    const controller = new AbortController();
    calculation.current = controller;
    setIsCalculating(true);
    setResult(null);
    setSkippedFiles(0);
    const snapshot = items.slice();
    const totals: Result = { duration: 0, success: 0, failed: 0 };
    let cursor = 0;

    function updateItem(id: string, changes: Partial<VideoFileItem>) {
      if (calculation.current !== controller) return;
      setItems((current) =>
        current.map((item) => (item.id === id ? { ...item, ...changes } : item)),
      );
    }

    async function worker() {
      while (cursor < snapshot.length && !controller.signal.aborted) {
        const item = snapshot[cursor++];
        if (item.status === "success" && item.duration !== undefined) {
          totals.duration += item.duration;
          totals.success++;
          continue;
        }
        updateItem(item.id, { status: "loading", error: undefined });
        try {
          const duration = await getVideoDuration(item.file, controller.signal);
          if (controller.signal.aborted) return;
          totals.duration += duration;
          totals.success++;
          updateItem(item.id, { status: "success", duration });
        } catch (error) {
          if (controller.signal.aborted) return;
          totals.failed++;
          updateItem(item.id, {
            status: "error",
            duration: undefined,
            error: error instanceof VideoDurationError ? error.code : "unreadable",
          });
        }
      }
    }

    try {
      await Promise.all(Array.from({ length: Math.min(4, snapshot.length) }, worker));
      if (calculation.current === controller) setResult(totals);
    } finally {
      if (calculation.current === controller) {
        calculation.current = null;
        setIsCalculating(false);
      }
    }
  }

  const completed = items.filter(
    (item) => item.status === "success" || item.status === "error",
  ).length;
  const totalSize = items.reduce((sum, item) => sum + item.file.size, 0);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
      <section
        className="min-w-0 rounded-2xl border border-stone-200/80 bg-white p-5 sm:p-7"
        aria-label={t.manageLabel}
      >
        <div className="mb-5 flex items-center gap-3">
          <span className="flex size-6 items-center justify-center rounded-full bg-stone-100 font-mono text-xs text-stone-500">
            01
          </span>
          <h2 className="text-sm font-semibold">{t.addVideos}</h2>
        </div>
        <label htmlFor="video-files" className="sr-only">
          {t.inputLabel}
        </label>
        <input
          ref={inputRef}
          id="video-files"
          type="file"
          accept={VIDEO_ACCEPT}
          multiple
          className="sr-only"
          tabIndex={-1}
          disabled={isCalculating}
          onChange={(event) => {
            addFiles(Array.from(event.currentTarget.files ?? []));
            event.currentTarget.value = "";
          }}
        />
        <div
          onDragEnter={(event) => {
            event.preventDefault();
            if (!calculation.current) {
              dragDepth.current++;
              setIsDragging(true);
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = isCalculating ? "none" : "copy";
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            dragDepth.current = Math.max(0, dragDepth.current - 1);
            if (!dragDepth.current) setIsDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            dragDepth.current = 0;
            setIsDragging(false);
            addFiles(Array.from(event.dataTransfer.files));
          }}
          className={`rounded-xl border border-dashed transition-colors ${isDragging ? "border-emerald-600 bg-emerald-50" : "border-stone-300 bg-stone-50/60"}`}
        >
          <button
            type="button"
            disabled={isCalculating}
            onClick={() => inputRef.current?.click()}
            aria-describedby="upload-hint"
            className="group flex min-h-60 w-full flex-col items-center justify-center rounded-xl px-4 py-7 transition-colors hover:bg-emerald-50/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="mb-5 flex size-14 items-center justify-center rounded-2xl border border-stone-200/80 bg-white text-emerald-800 shadow-sm transition-transform group-hover:-translate-y-1">
              <Icon name="upload" className="size-6" />
            </span>
            <span className="text-sm font-medium">{isDragging ? t.dropHere : t.chooseOrDrop}</span>
            <span id="upload-hint" className="mt-2 text-xs leading-6 text-stone-500">
              {t.uploadHint}
            </span>
          </button>
        </div>
        <p className="mt-3 text-center text-[11px] leading-5 text-stone-500">{t.formats}</p>
        <p className="mt-1 text-center text-[11px] leading-5 text-stone-500">{t.formatHint}</p>
        {skippedFiles > 0 && (
          <p
            role="alert"
            className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800"
          >
            {t.skippedFiles(skippedFiles)}
          </p>
        )}

        <div className="mt-7 flex items-center justify-between gap-3 border-b border-stone-100 pb-4">
          <h3 className="text-sm font-medium">
            {t.addedVideos}{" "}
            <span className="ml-1.5 rounded-md bg-stone-100 px-2 py-0.5 font-mono text-xs text-stone-500">
              {items.length}
            </span>
          </h3>
          <span className="text-xs text-stone-500">
            {items.length ? t.totalSize(formatFileSize(totalSize)) : t.waitingForFiles}
          </span>
        </div>
        {items.length === 0 ? (
          <div className="flex min-h-36 flex-col items-center justify-center gap-2 text-stone-500">
            <Icon name="file" className="mb-1 size-7 text-stone-300" />
            <p className="text-xs">{t.emptyTitle}</p>
            <p className="text-[11px] text-stone-400">{t.emptyHint}</p>
          </div>
        ) : (
          <ul aria-label={t.listLabel} className="max-h-80 overflow-y-auto overscroll-contain pr-1">
            {items.map((item) => (
              <li key={item.id} className="border-b border-stone-100 py-4 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-stone-50 text-stone-500">
                    <Icon name="file" className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p title={item.file.name} className="truncate text-xs font-medium">
                      {item.file.name}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-stone-500">
                      <span className="font-mono">{formatFileSize(item.file.size)}</span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          item.status === "error"
                            ? "text-amber-800"
                            : item.status === "success"
                              ? "text-emerald-800"
                              : ""
                        }
                      >
                        {t.statuses[item.status]}
                      </span>
                      {item.duration !== undefined && (
                        <span className="font-mono text-emerald-800">
                          {formatDuration(item.duration)}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(item.id)}
                    disabled={isCalculating}
                    aria-label={t.removeLabel(item.file.name)}
                    className="flex size-11 shrink-0 items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Icon name="close" className="size-4" />
                  </button>
                </div>
                {item.error && (
                  <p className="mt-2 pl-[52px] text-[11px] leading-5 text-amber-800">
                    {t.errors[item.error]}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside className="min-w-0 lg:sticky lg:top-8" aria-label={t.resultLabel}>
        <section className="overflow-hidden rounded-2xl border border-[#dce6de] bg-[#edf3ee] p-6 sm:p-7">
          <div className="flex items-center gap-3">
            <span className="flex size-6 items-center justify-center rounded-full bg-white/70 font-mono text-xs text-emerald-800">
              02
            </span>
            <h2 className="text-sm font-semibold">{t.calculate}</h2>
          </div>
          <div className="mt-10 text-center" aria-live="polite" aria-atomic="true" role="status">
            <p className="mb-4 flex items-center justify-center gap-1.5 text-xs text-emerald-900/70">
              <Icon name="clock" className="size-3.5" />
              {t.totalDuration}
            </p>
            <p
              aria-label={t.durationLabel(formatDuration(result?.duration ?? 0))}
              className={`overflow-x-auto font-mono text-[clamp(2rem,8vw,3rem)] leading-tight font-medium tracking-[-0.06em] tabular-nums sm:text-5xl ${result ? "text-emerald-950" : "text-[#81988a]"}`}
            >
              {formatDuration(result?.duration ?? 0)}
            </p>
            {(isCalculating || result) && (
              <p className="mt-4 text-xs leading-6 text-emerald-900/75">
                {isCalculating
                  ? t.progress(completed, items.length)
                  : result
                    ? t.summary(result.success, result.failed)
                    : null}
              </p>
            )}
          </div>
          <div className="mt-6 border-t border-emerald-900/10 pt-6">
            <button
              type="button"
              onClick={calculate}
              disabled={!items.length || isCalculating}
              className="flex min-h-12 w-full items-center justify-center gap-3 rounded-lg bg-emerald-800 px-4 text-sm font-medium text-white transition-[background-color,transform] hover:bg-emerald-900 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#cbd8ce] disabled:text-[#526b5a]"
            >
              {isCalculating ? t.calculating : t.calculate}
              {!isCalculating && <Icon name="arrow" className="size-4" />}
            </button>
            <button
              type="button"
              onClick={clear}
              disabled={!items.length}
              className="mt-3 min-h-11 w-full rounded-lg text-xs font-medium text-stone-600 transition-colors hover:bg-white/60 disabled:cursor-not-allowed disabled:text-stone-400"
            >
              {t.clear}
            </button>
          </div>
        </section>
        <div className="mt-6 flex items-start gap-2 px-2 text-[11px] leading-5 text-stone-500">
          <Icon name="lock" className="mt-0.5 size-3.5 shrink-0 text-emerald-800" />
          <p>{t.privacy}</p>
        </div>
      </aside>
    </div>
  );
}
