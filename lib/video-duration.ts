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

/** Round once, after summing, and retain hours greater than 24. */
export function formatDuration(duration: number): string {
  const seconds = Math.round(duration);
  return [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

export type VideoReadErrorCode = "invalid-duration" | "unreadable" | "timeout";

export class VideoDurationError extends Error {
  constructor(public readonly code: VideoReadErrorCode) {
    const descriptions = {
      "invalid-duration": "无法获取有效时长，文件可能已损坏或格式不受支持。",
      unreadable: "无法读取时长：文件可能损坏、缺少有效时长元数据，或格式不受浏览器支持。",
      timeout: "读取超时，请重试或使用浏览器支持的视频格式。",
    };
    super(descriptions[code]);
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
        finish(new VideoDurationError("invalid-duration"));
      } else {
        finish();
      }
    };
    const onError = () => finish(new VideoDurationError("unreadable"));
    const onAbort = () => finish(new DOMException("读取已取消", "AbortError"));
    const timeout = window.setTimeout(() => finish(new VideoDurationError("timeout")), 30_000);

    video.preload = "metadata";
    video.addEventListener("loadedmetadata", onMetadata);
    video.addEventListener("error", onError);
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      video.src = objectUrl;
    } catch {
      finish(new VideoDurationError("unreadable"));
    }
  });
}

type ReadMetadata = (offset: number, length: number) => Promise<DataView>;

function fourCC(view: DataView, offset = 0): string {
  return String.fromCharCode(...new Uint8Array(view.buffer, view.byteOffset + offset, 4));
}

/** Bounded reads of container headers only; never load or decode video payloads. */
async function readContainerDuration(file: File, signal?: AbortSignal): Promise<number> {
  let bytesRead = 0;
  let reads = 0;
  const deadline = Date.now() + 30_000;
  function checkCancelled() {
    if (signal?.aborted) throw new DOMException("读取已取消", "AbortError");
    if (Date.now() > deadline) throw new Error("读取超时");
  }
  const read: ReadMetadata = async (offset, length) => {
    checkCancelled();
    bytesRead += length;
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      length < 0 ||
      offset + length > file.size ||
      bytesRead > 512 * 1024 ||
      ++reads > 2048
    ) {
      throw new Error("文件头无效或超出元数据读取限制");
    }
    const buffer = await file.slice(offset, offset + length).arrayBuffer();
    checkCancelled();
    if (buffer.byteLength !== length) throw new Error("文件头不完整");
    return new DataView(buffer);
  };
  const extension = file.name.split(".").pop()?.toLowerCase();
  const duration =
    extension === "avi"
      ? await readAviDuration(file.size, read)
      : extension === "flv"
        ? await readFlvDuration(file.size, read)
        : extension === "rmvb" || extension === "rm"
          ? await readRealMediaDuration(file.size, read)
          : await readMovieDuration(file.size, read);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("缺少有效时长元数据");
  return duration;
}

// RealNetworks RMFF: PROP stores file duration in ms; MDPR stores stream duration.
// https://multimedia.cx/rmff.htm (RealNetworks' archived format specification)
async function readRealMediaDuration(size: number, read: ReadMetadata): Promise<number> {
  const header = await read(0, 10);
  const headerSize = header.getUint32(4);
  if (
    fourCC(header) !== ".RMF" ||
    header.getUint16(8) !== 0 ||
    headerSize < 16 ||
    headerSize > size
  ) {
    throw new Error("无效的 RealMedia 文件头");
  }
  let streamDuration = 0;
  for (let offset = headerSize; offset + 10 <= size;) {
    const chunk = await read(offset, 10);
    const type = fourCC(chunk);
    const length = chunk.getUint32(4);
    if (length < 10 || offset + length > size) throw new Error("RealMedia 数据块不完整");
    // Metadata precedes DATA; never inspect encoded RealVideo/RealAudio packets.
    if (type === "DATA") break;
    if (chunk.getUint16(8) === 0) {
      if (type === "PROP") {
        if (length < 50) throw new Error("RealMedia 属性头不完整");
        const duration = (await read(offset + 30, 4)).getUint32(0);
        if (duration > 0) return duration / 1000;
      } else if (type === "MDPR") {
        if (length < 40) throw new Error("RealMedia 媒体头不完整");
        streamDuration = Math.max(streamDuration, (await read(offset + 36, 4)).getUint32(0));
      }
    }
    offset += length;
  }
  if (!streamDuration) throw new Error("RealMedia 缺少有效时长元数据");
  return streamDuration / 1000;
}

// QuickTime / ISO BMFF: jump over mdat and read moov/mvhd, including 64-bit sizes.
// https://developer.apple.com/documentation/quicktime-file-format/atoms
async function readMovieDuration(size: number, read: ReadMetadata): Promise<number> {
  async function scan(start: number, end: number, inMovie = false): Promise<number> {
    for (let offset = start; offset + 8 <= end;) {
      const header = await read(offset, 8);
      const type = fourCC(header, 4);
      let atomSize = header.getUint32(0);
      let headerSize = 8;
      if (atomSize === 1) {
        atomSize = Number((await read(offset + 8, 8)).getBigUint64(0));
        headerSize = 16;
      } else if (atomSize === 0) atomSize = end - offset;
      if (!Number.isSafeInteger(atomSize) || atomSize < headerSize || offset + atomSize > end)
        throw new Error("无效的电影文件头");
      const payload = offset + headerSize;
      if (type === "moov" && !inMovie) return scan(payload, offset + atomSize, true);
      if (type === "mvhd" && inMovie) {
        if (atomSize - headerSize < 1) throw new Error("电影时长头不完整");
        const version = (await read(payload, 1)).getUint8(0);
        const length = version === 0 ? 20 : version === 1 ? 32 : 0;
        if (!length || length > atomSize - headerSize) throw new Error("无效的电影时长头");
        const data = await read(payload, length);
        const timescale = data.getUint32(version === 0 ? 12 : 20);
        const duration = version === 0 ? data.getUint32(16) : Number(data.getBigUint64(24));
        if (
          !Number.isSafeInteger(duration) ||
          (version === 0 && duration === 0xffffffff) ||
          !timescale
        )
          throw new Error("电影时长未知");
        return duration / timescale;
      }
      offset += atomSize;
    }
    throw new Error("缺少电影时长头");
  }
  return scan(0, size);
}

// AVI RIFF headers: strh supplies exact rate/scale; avih and OpenDML dmlh supply frames.
// https://learn.microsoft.com/en-us/windows/win32/directshow/avi-riff-file-reference
async function readAviDuration(size: number, read: ReadMetadata): Promise<number> {
  const header = await read(0, 12);
  if (fourCC(header) !== "RIFF" || fourCC(header, 8) !== "AVI ")
    throw new Error("无效的 AVI 文件头");
  const end = header.getUint32(4, true) + 8;
  if (end > size || end < 12) throw new Error("AVI 文件头不完整");
  let microseconds = 0;
  let frames = 0;
  let openDmlFrames = 0;
  let frameSeconds = 0;
  const durations: number[] = [];
  async function scan(start: number, end: number, depth = 0): Promise<void> {
    if (depth > 4) throw new Error("AVI 文件头层级过深");
    for (let offset = start; offset + 8 <= end;) {
      const chunk = await read(offset, 8);
      const type = fourCC(chunk);
      const length = chunk.getUint32(4, true);
      const payload = offset + 8;
      if (payload + length > end) throw new Error("AVI 数据块不完整");
      if (type === "LIST" && length >= 4) {
        const listType = fourCC(await read(payload, 4));
        if (["hdrl", "strl", "odml"].includes(listType))
          await scan(payload + 4, payload + length, depth + 1);
      } else if (type === "avih" && length >= 20) {
        const data = await read(payload, 20);
        microseconds = data.getUint32(0, true);
        frames = data.getUint32(16, true);
      } else if (type === "strh" && length >= 36) {
        const data = await read(payload, 36);
        const streamType = fourCC(data);
        const scale = data.getUint32(20, true);
        const rate = data.getUint32(24, true);
        if (rate && scale && ["vids", "auds"].includes(streamType)) {
          durations.push((data.getUint32(32, true) * scale) / rate);
          if (streamType === "vids" && !frameSeconds) frameSeconds = scale / rate;
        }
      } else if (type === "dmlh" && length >= 4) {
        openDmlFrames = (await read(payload, 4)).getUint32(0, true);
      }
      offset = payload + length + (length % 2);
    }
  }
  await scan(12, end);
  const totalFrames = openDmlFrames || frames;
  const headerDuration = totalFrames * (frameSeconds || microseconds / 1_000_000);
  return Math.max(headerDuration, ...durations);
}

// Adobe FLV specification, Annex E: onMetaData.duration is an AMF0 Number in seconds.
// https://veovera.org/docs/legacy/video-file-format-v10-1-spec.pdf
async function readFlvDuration(size: number, read: ReadMetadata): Promise<number> {
  const header = await read(0, 9);
  if (
    String.fromCharCode(header.getUint8(0), header.getUint8(1), header.getUint8(2)) !== "FLV" ||
    header.getUint8(3) !== 1
  )
    throw new Error("无效的 FLV 文件头");
  const dataOffset = header.getUint32(5);
  if (dataOffset < 9) throw new Error("无效的 FLV 数据偏移");
  for (let offset = dataOffset + 4; offset + 11 <= size;) {
    const tag = await read(offset, 11);
    const length = (tag.getUint8(1) << 16) | (tag.getUint8(2) << 8) | tag.getUint8(3);
    if (offset + 11 + length + 4 > size) throw new Error("FLV 数据块不完整");
    if (tag.getUint8(0) === 18 && length <= 256 * 1024) {
      const duration = readAmfDuration(await read(offset + 11, length));
      if (duration !== undefined && duration > 0) return duration;
    }
    // Jump over encoded audio/video data without reading it.
    offset += 11 + length + 4;
  }
  throw new Error("FLV 缺少 duration 元数据");
}

function readAmfDuration(view: DataView): number | undefined {
  let cursor = 0;
  let values = 0;
  function take(length: number): number {
    const start = cursor;
    cursor += length;
    if (cursor > view.byteLength) throw new Error("FLV 元数据不完整");
    return start;
  }
  function string(long = false): string {
    const length = long ? view.getUint32(take(4)) : view.getUint16(take(2));
    return new TextDecoder().decode(
      new Uint8Array(view.buffer, view.byteOffset + take(length), length),
    );
  }
  function value(depth = 0): unknown {
    if (depth > 16 || ++values > 20_000) throw new Error("FLV 元数据超出读取限制");
    const type = view.getUint8(take(1));
    if (type === 0) return view.getFloat64(take(8));
    if (type === 1) return view.getUint8(take(1)) !== 0;
    if (type === 2 || type === 12) return string(type === 12);
    if (type === 5 || type === 6) return null;
    if (type === 11) {
      take(10);
      return null;
    }
    if (type === 10) {
      const count = view.getUint32(take(4));
      if (count > 20_000) throw new Error("FLV 数组超出读取限制");
      for (let index = 0; index < count; index++) value(depth + 1);
      return null;
    }
    if (type === 3 || type === 8) {
      if (type === 8) take(4); // ECMA array count is advisory; stop at ObjectEnd.
      const object: Record<string, unknown> = Object.create(null);
      while (cursor + 3 <= view.byteLength) {
        if (view.getUint16(cursor) === 0 && view.getUint8(cursor + 2) === 9) {
          take(3);
          return object;
        }
        const key = string();
        object[key] = value(depth + 1);
      }
    }
    throw new Error("无法解析 FLV 元数据类型");
  }
  if (value() !== "onMetaData") return undefined;
  const metadata = value();
  if (!metadata || typeof metadata !== "object" || !("duration" in metadata)) return undefined;
  return typeof metadata.duration === "number" && Number.isFinite(metadata.duration)
    ? metadata.duration
    : undefined;
}
