"use client";

import { useEffect, useRef, useState } from "react";

import VideoFileList from "@/components/video-file-list";
import VideoIcon from "@/components/video-icon";
import { formatDuration } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import { messages } from "@/lib/i18n";
import type { VideoFileItem, VideoReadState } from "@/lib/video-duration";
import {
  getVideoDuration,
  isVideoFile,
  VIDEO_ACCEPT,
  VideoDurationError,
} from "@/lib/video-duration";

export default function VideoDurationCalculator({ locale }: { locale: Locale }) {
  const t = messages[locale];
  const [items, setItems] = useState<VideoFileItem[]>([]);
  const [hasCalculated, setHasCalculated] = useState(false);
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
    setHasCalculated(false);
  }

  function clearVideos() {
    calculation.current?.abort();
    calculation.current = null;
    setItems([]);
    setHasCalculated(false);
    setIsCalculating(false);
    setSkippedFiles(0);
    setIsDragging(false);
    dragDepth.current = 0;
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeFile(id: string) {
    if (calculation.current) return;
    setItems((current) => current.filter((item) => item.id !== id));
    setHasCalculated(false);
  }

  async function calculateTotalDuration() {
    if (!items.length || calculation.current) return;
    const controller = new AbortController();
    calculation.current = controller;
    setIsCalculating(true);
    setHasCalculated(false);
    setSkippedFiles(0);
    const snapshot = items.slice();
    // Keep successful reads cached, but reset failures before retrying for stable progress.
    setItems((current) =>
      current.map((item) =>
        item.status === "success" ? item : { id: item.id, file: item.file, status: "pending" },
      ),
    );
    let cursor = 0;

    function updateItem(id: string, state: VideoReadState) {
      if (calculation.current !== controller) return;
      setItems((current) =>
        current.map((item) => (item.id === id ? { id: item.id, file: item.file, ...state } : item)),
      );
    }

    async function worker() {
      while (cursor < snapshot.length && !controller.signal.aborted) {
        const item = snapshot[cursor++];
        if (item.status === "success") continue;
        updateItem(item.id, { status: "loading" });
        try {
          const duration = await getVideoDuration(item.file, controller.signal);
          if (controller.signal.aborted) return;
          updateItem(item.id, { status: "success", duration });
        } catch (error) {
          if (controller.signal.aborted) return;
          updateItem(item.id, {
            status: "error",
            error: error instanceof VideoDurationError ? error.code : "unreadable",
          });
        }
      }
    }

    try {
      // Four workers bound resource use without opening every video at once.
      await Promise.all(Array.from({ length: Math.min(4, snapshot.length) }, worker));
      if (calculation.current === controller) setHasCalculated(true);
    } finally {
      if (calculation.current === controller) {
        calculation.current = null;
        setIsCalculating(false);
      }
    }
  }

  const successfulVideos = items.filter((item) => item.status === "success");
  const failedCount = items.filter((item) => item.status === "error").length;
  const completedCount = successfulVideos.length + failedCount;
  const totalDuration = successfulVideos.reduce((sum, item) => sum + item.duration, 0);
  const formattedDuration = formatDuration(hasCalculated ? totalDuration : 0);
  const resultMessage = isCalculating
    ? t.progress(completedCount, items.length)
    : hasCalculated
      ? t.summary(successfulVideos.length, failedCount)
      : null;

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
            // Selecting the same file again must still fire change, including after clearing.
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
              <VideoIcon name="upload" className="size-6" />
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

        <VideoFileList
          items={items}
          locale={locale}
          disabled={isCalculating}
          onRemove={removeFile}
        />
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
              <VideoIcon name="clock" className="size-3.5" />
              {t.totalDuration}
            </p>
            <p
              aria-label={t.durationLabel(formattedDuration)}
              className={`overflow-x-auto font-mono text-[clamp(2rem,8vw,3rem)] leading-tight font-medium tracking-[-0.06em] tabular-nums sm:text-5xl ${hasCalculated ? "text-emerald-950" : "text-[#81988a]"}`}
            >
              {formattedDuration}
            </p>
            {resultMessage && (
              <p className="mt-4 text-xs leading-6 text-emerald-900/75">{resultMessage}</p>
            )}
          </div>
          <div className="mt-6 border-t border-emerald-900/10 pt-6">
            <button
              type="button"
              onClick={calculateTotalDuration}
              disabled={!items.length || isCalculating}
              className="flex min-h-12 w-full items-center justify-center gap-3 rounded-lg bg-emerald-800 px-4 text-sm font-medium text-white transition-[background-color,transform] hover:bg-emerald-900 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#cbd8ce] disabled:text-[#526b5a]"
            >
              {isCalculating ? t.calculating : t.calculate}
              {!isCalculating && <VideoIcon name="arrow" className="size-4" />}
            </button>
            <button
              type="button"
              onClick={clearVideos}
              disabled={!items.length}
              className="mt-3 min-h-11 w-full rounded-lg text-xs font-medium text-stone-600 transition-colors hover:bg-white/60 disabled:cursor-not-allowed disabled:text-stone-400"
            >
              {t.clear}
            </button>
          </div>
        </section>
        <div className="mt-6 flex items-start gap-2 px-2 text-[11px] leading-5 text-stone-500">
          <VideoIcon name="lock" className="mt-0.5 size-3.5 shrink-0 text-emerald-800" />
          <p>{t.privacy}</p>
        </div>
      </aside>
    </div>
  );
}
