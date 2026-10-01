import VideoIcon from "@/components/video-icon";
import { formatDuration, formatFileSize } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import { messages } from "@/lib/i18n";
import type { VideoFileItem } from "@/lib/video-duration";

type Props = {
  items: VideoFileItem[];
  locale: Locale;
  disabled: boolean;
  onRemove: (id: string) => void;
};

export default function VideoFileList({ items, locale, disabled, onRemove }: Props) {
  const t = messages[locale];
  const totalSize = items.reduce((sum, item) => sum + item.file.size, 0);
  return (
    <>
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
          <VideoIcon name="file" className="mb-1 size-7 text-stone-300" />
          <p className="text-xs">{t.emptyTitle}</p>
          <p className="text-[11px] text-stone-400">{t.emptyHint}</p>
        </div>
      ) : (
        <ul aria-label={t.listLabel} className="max-h-80 overflow-y-auto overscroll-contain pr-1">
          {items.map((item) => (
            <li key={item.id} className="border-b border-stone-100 py-4 last:border-0">
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-stone-50 text-stone-500">
                  <VideoIcon name="file" className="size-5" />
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
                    {item.status === "success" && (
                      <span className="font-mono text-emerald-800">
                        {formatDuration(item.duration)}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  disabled={disabled}
                  aria-label={t.removeLabel(item.file.name)}
                  className="flex size-11 shrink-0 items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <VideoIcon name="close" className="size-4" />
                </button>
              </div>
              {item.status === "error" && (
                <p className="mt-2 pl-[52px] text-[11px] leading-5 text-amber-800">
                  {t.errors[item.error]}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
