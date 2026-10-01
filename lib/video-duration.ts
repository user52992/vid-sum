import { readContainerDuration } from "@/lib/video-container";

const VIDEO_EXTENSIONS = [
  "mp4",
  "m4v",
  "mov",
  "qt",
  "flv",
  "f4v",
  "avi",
  "rmvb",
  "rm",
  "webm",
  "mkv",
  "wmv",
  "asf",
  "mpg",
  "mpeg",
  "mpe",
  "ogv",
  "ogg",
  "3gp",
  "3g2",
  "mts",
  "m2ts",
  "ts",
  "vob",
];

export const VIDEO_ACCEPT = [
  "video/*",
  ...VIDEO_EXTENSIONS.map((extension) => `.${extension}`),
].join(",");

export function isVideoFile(file: Pick<File, "name" | "type">): boolean {
  // OS-provided MIME types can be empty or application/octet-stream for videos.
  const extension = /\.([^.]+)$/.exec(file.name)?.[1].toLowerCase() ?? "";
  return file.type.startsWith("video/") || VIDEO_EXTENSIONS.includes(extension);
}

export type VideoReadErrorCode = "invalid-duration" | "unreadable" | "timeout";

export type VideoReadState =
  | { status: "pending" | "loading" }
  | { status: "success"; duration: number }
  | { status: "error"; error: VideoReadErrorCode };

export type VideoFileItem = { id: string; file: File } & VideoReadState;

export class VideoDurationError extends Error {
  constructor(public readonly code: VideoReadErrorCode) {
    // User-facing descriptions live in the locale dictionaries.
    super(code);
    this.name = "VideoDurationError";
  }
}

/** Read metadata only; the detached video is never played or rendered. */
export function getVideoDuration(file: File, signal?: AbortSignal): Promise<number> {
  if (/\.(mov|qt|m4v|f4v|avi|flv|rmvb|rm)$/i.test(file.name)) {
    return readContainerDuration(file, signal).catch((error: unknown) => {
      if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
      return getBrowserVideoDuration(file, signal);
    });
  }
  return getBrowserVideoDuration(file, signal);
}

function getBrowserVideoDuration(file: File, signal?: AbortSignal): Promise<number> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Video metadata read cancelled", "AbortError"));
      return;
    }

    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    let settled = false;

    const cleanup = () => {
      try {
        window.clearTimeout(timeout);
        video.removeEventListener("loadedmetadata", onMetadata);
        video.removeEventListener("error", onError);
        signal?.removeEventListener("abort", onAbort);
        video.removeAttribute("src");
        video.load();
      } finally {
        // Release the blob even if resetting the media element fails.
        URL.revokeObjectURL(objectUrl);
      }
    };

    const finish = (error?: Error, duration = 0) => {
      if (settled) return;
      settled = true;
      try {
        cleanup();
      } catch {
        error ??= new VideoDurationError("unreadable");
      }
      if (error) reject(error);
      else resolve(duration);
    };

    const onMetadata = () => {
      const duration = video.duration;
      if (!Number.isFinite(duration) || duration < 0) {
        finish(new VideoDurationError("invalid-duration"));
      } else {
        finish(undefined, duration);
      }
    };
    const onError = () => finish(new VideoDurationError("unreadable"));
    const onAbort = () => finish(new DOMException("Video metadata read cancelled", "AbortError"));
    const timeout = window.setTimeout(() => finish(new VideoDurationError("timeout")), 30_000);

    video.addEventListener("loadedmetadata", onMetadata);
    video.addEventListener("error", onError);
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      video.preload = "metadata";
      video.src = objectUrl;
    } catch {
      finish(new VideoDurationError("unreadable"));
    }
  });
}
