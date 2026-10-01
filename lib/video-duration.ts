/** Round once, after summing, and retain hours greater than 24. */
export function formatDuration(duration: number): string {
  const seconds = Math.round(duration);
  return [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

/** Read metadata only; the detached video is never played or rendered. */
export function getVideoDuration(file: File, signal?: AbortSignal): Promise<number> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("读取已取消", "AbortError"));
      return;
    }

    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    let settled = false;

    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener("loadedmetadata", onMetadata);
      video.removeEventListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(objectUrl);
    };

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      const duration = video.duration;
      cleanup();
      if (error) reject(error);
      else resolve(duration);
    };

    const onMetadata = () => {
      if (!Number.isFinite(video.duration) || video.duration < 0) {
        finish(new Error("无法获取有效时长，文件可能已损坏或格式不受支持。"));
      } else {
        finish();
      }
    };
    const onError = () =>
      finish(new Error("无法读取视频，请检查文件是否损坏或浏览器是否支持此格式。"));
    const onAbort = () => finish(new DOMException("读取已取消", "AbortError"));
    const timeout = window.setTimeout(
      () => finish(new Error("读取超时，请重试或使用浏览器支持的视频格式。")),
      30_000,
    );

    video.preload = "metadata";
    video.addEventListener("loadedmetadata", onMetadata);
    video.addEventListener("error", onError);
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      video.src = objectUrl;
    } catch {
      finish(new Error("无法读取此视频文件。"));
    }
  });
}
