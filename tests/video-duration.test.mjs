import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { afterEach, test } from "node:test";

const ts = createRequire(import.meta.url)("typescript");
function transpile(path) {
  return ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
}
function moduleUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}
const { formatDuration, formatFileSize } = await import(moduleUrl(transpile("../lib/format.ts")));
const containerUrl = moduleUrl(transpile("../lib/video-container.ts"));
const source = transpile("../lib/video-duration.ts").replaceAll(
  '"@/lib/video-container"',
  JSON.stringify(containerUrl),
);
const { getVideoDuration, isVideoFile, VIDEO_ACCEPT } = await import(moduleUrl(source));

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;

afterEach(() => {
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
});

function setup(t) {
  const videos = [];
  const timers = new Map();
  let timerId = 0;
  let activeListeners = 0;
  class MetadataVideo extends EventTarget {
    duration = NaN;
    preload = "";
    src = "";
    resetCount = 0;
    addEventListener(...args) {
      activeListeners++;
      super.addEventListener(...args);
    }
    removeEventListener(...args) {
      activeListeners--;
      super.removeEventListener(...args);
    }
    removeAttribute(name) {
      assert.equal(name, "src");
      this.src = "";
    }
    load() {
      this.resetCount++;
    }
  }
  globalThis.document = {
    createElement(name) {
      assert.equal(name, "video");
      const video = new MetadataVideo();
      videos.push(video);
      return video;
    },
  };
  globalThis.window = {
    setTimeout(fn, delay) {
      assert.equal(delay, 30_000);
      timers.set(++timerId, fn);
      return timerId;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  };
  const created = t.mock.method(URL, "createObjectURL", () => `blob:test-${videos.length}`);
  const revoked = t.mock.method(URL, "revokeObjectURL", () => {});
  const file = new File(["metadata fixture"], "sample.mp4", { type: "video/mp4" });
  function assertCleaned() {
    assert.equal(timers.size, 0);
    assert.equal(activeListeners, 0);
    assert.equal(created.mock.callCount(), revoked.mock.callCount());
    assert.deepEqual(
      revoked.mock.calls.map((call) => call.arguments[0]),
      created.mock.calls.map((call) => call.result),
    );
    for (const video of videos) {
      assert.equal(video.src, "");
      assert.equal(video.resetCount, 1);
      assert.equal(video.preload, "metadata");
    }
  }
  return { videos, timers, file, assertCleaned };
}

test("formats seconds, rounding boundaries and hours beyond 24", () => {
  for (const [seconds, expected] of [
    [0, "00:00:00"],
    [1, "00:00:01"],
    [59, "00:00:59"],
    [60, "00:01:00"],
    [65, "00:01:05"],
    [3661, "01:01:01"],
    [3599, "00:59:59"],
    [3600, "01:00:00"],
    [86400, "24:00:00"],
    [90000, "25:00:00"],
    [36309, "10:05:09"],
    [97200, "27:00:00"],
    [360000, "100:00:00"],
    [59.49, "00:00:59"],
    [59.5, "00:01:00"],
    [0.4 + 0.4, "00:00:01"],
  ]) {
    assert.equal(formatDuration(seconds), expected);
  }
});

test("formats file sizes consistently at unit boundaries", () => {
  for (const [bytes, expected] of [
    [0, "0 B"],
    [1023, "1023 B"],
    [1024, "1.0 KB"],
    [1024 ** 2, "1.0 MB"],
    [1024 ** 3, "1.00 GB"],
  ]) {
    assert.equal(formatFileSize(bytes), expected);
  }
});

test("reads fractional metadata and cleans all resources", async (t) => {
  const env = setup(t);
  const reading = getVideoDuration(env.file);
  env.videos[0].duration = 65.4;
  env.videos[0].dispatchEvent(new Event("loadedmetadata"));
  assert.equal(await reading, 65.4);
  env.assertCleaned();
});

test("a failed file does not prevent another file from succeeding", async (t) => {
  const env = setup(t);
  const readings = [getVideoDuration(env.file), getVideoDuration(env.file)];
  env.videos[0].dispatchEvent(new Event("error"));
  env.videos[1].duration = 3661;
  env.videos[1].dispatchEvent(new Event("loadedmetadata"));
  const results = await Promise.allSettled(readings);
  assert.equal(results[0].status, "rejected");
  assert.equal(results[0].reason.code, "unreadable");
  assert.deepEqual(results[1], { status: "fulfilled", value: 3661 });
  env.assertCleaned();
});

test("rejects infinite, NaN and negative durations and releases resources", async (t) => {
  const env = setup(t);
  for (const duration of [Infinity, NaN, -1]) {
    const reading = getVideoDuration(env.file);
    const video = env.videos.at(-1);
    video.duration = duration;
    video.dispatchEvent(new Event("loadedmetadata"));
    await assert.rejects(reading, { code: "invalid-duration" });
  }
  env.assertCleaned();
});

test("clearing an active read aborts and releases its object URL", async (t) => {
  const env = setup(t);
  const controller = new AbortController();
  const reading = getVideoDuration(env.file, controller.signal);
  controller.abort();
  await assert.rejects(reading, { name: "AbortError" });
  env.videos[0].dispatchEvent(new Event("loadedmetadata"));
  env.assertCleaned();
});

test("a cancelled batch creates no resources for subsequent files", async (t) => {
  const env = setup(t);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(getVideoDuration(env.file, controller.signal), { name: "AbortError" });
  assert.equal(env.videos.length, 0);
  env.assertCleaned();
});

test("metadata timeout rejects and releases resources", async (t) => {
  const env = setup(t);
  const reading = getVideoDuration(env.file);
  const timeout = env.timers.values().next().value;
  timeout();
  await assert.rejects(reading, { code: "timeout" });
  env.assertCleaned();
});

test("reset failures still settle the read and release every resource", async (t) => {
  const env = setup(t);
  for (const eventName of ["loadedmetadata", "error"]) {
    const reading = getVideoDuration(env.file);
    const video = env.videos.at(-1);
    const reset = video.load.bind(video);
    video.load = () => {
      reset();
      throw new Error("Media element reset failed");
    };
    video.duration = 65;
    video.dispatchEvent(new Event(eventName));
    await assert.rejects(reading, { code: "unreadable" });
    // Late events must not settle the promise or revoke the URL a second time.
    video.dispatchEvent(new Event("loadedmetadata"));
    video.dispatchEvent(new Event("error"));
  }
  env.assertCleaned();
});

test("source assignment failures release the object URL", async (t) => {
  const env = setup(t);
  const createElement = document.createElement.bind(document);
  document.createElement = (name) => {
    const video = createElement(name);
    let src = "";
    Object.defineProperty(video, "src", {
      get: () => src,
      set: (value) => {
        if (value) throw new Error("Cannot attach media source");
        src = value;
      },
    });
    return video;
  };
  await assert.rejects(getVideoDuration(env.file), { code: "unreadable" });
  env.assertCleaned();
});

test("aborting after completion does not repeat resource cleanup", async (t) => {
  const env = setup(t);
  const controller = new AbortController();
  const reading = getVideoDuration(env.file, controller.signal);
  env.videos[0].duration = 1;
  env.videos[0].dispatchEvent(new Event("loadedmetadata"));
  assert.equal(await reading, 1);
  controller.abort();
  env.videos[0].dispatchEvent(new Event("error"));
  env.assertCleaned();
});

function atom(type, payload, extended = false) {
  const header = Buffer.alloc(extended ? 16 : 8);
  header.writeUInt32BE(extended ? 1 : payload.length + 8);
  header.write(type, 4);
  if (extended) header.writeBigUInt64BE(BigInt(payload.length + 16), 8);
  return Buffer.concat([header, payload]);
}

function riffChunk(type, payload) {
  const header = Buffer.alloc(8);
  header.write(type);
  header.writeUInt32LE(payload.length, 4);
  return Buffer.concat([header, payload, Buffer.alloc(payload.length % 2)]);
}

function aviFixture(openDmlFrames = 0) {
  const main = Buffer.alloc(56);
  main.writeUInt32LE(33333);
  main.writeUInt32LE(1800, 16);
  const stream = Buffer.alloc(56);
  stream.write("vids");
  stream.writeUInt32LE(1001, 20);
  stream.writeUInt32LE(30000, 24);
  stream.writeUInt32LE(1800, 32);
  const chunks = [
    riffChunk("avih", main),
    riffChunk("LIST", Buffer.concat([Buffer.from("strl"), riffChunk("strh", stream)])),
  ];
  if (openDmlFrames) {
    const extended = Buffer.alloc(248);
    extended.writeUInt32LE(openDmlFrames);
    chunks.push(
      riffChunk("LIST", Buffer.concat([Buffer.from("odml"), riffChunk("dmlh", extended)])),
    );
  }
  return riffChunk(
    "RIFF",
    Buffer.concat([
      Buffer.from("AVI "),
      riffChunk("LIST", Buffer.concat([Buffer.from("hdrl"), ...chunks])),
      riffChunk("LIST", Buffer.concat([Buffer.from("movi"), Buffer.alloc(1_000_000)])),
    ]),
  );
}

function flvFixture(duration = 65.25, array = true) {
  const header = Buffer.from([0x46, 0x4c, 0x56, 1, 5, 0, 0, 0, 9, 0, 0, 0, 0]);
  const number = Buffer.alloc(9);
  number.writeDoubleBE(duration, 1);
  const metadata = Buffer.concat([
    Buffer.from([2, 0, 10]),
    Buffer.from("onMetaData"),
    array ? Buffer.from([8, 0, 0, 0, 1]) : Buffer.from([3]),
    Buffer.from([0, 8]),
    Buffer.from("duration"),
    number,
    Buffer.from([0, 0, 9]),
  ]);
  function tag(type, payload) {
    const tagHeader = Buffer.alloc(11);
    tagHeader[0] = type;
    tagHeader.writeUIntBE(payload.length, 1, 3);
    const previousSize = Buffer.alloc(4);
    previousSize.writeUInt32BE(payload.length + 11);
    return Buffer.concat([tagHeader, payload, previousSize]);
  }
  // Metadata after a video tag verifies that the reader jumps over media bytes.
  return Buffer.concat([header, tag(9, Buffer.alloc(1_000_000)), tag(18, metadata)]);
}

async function assertMetadataOnly(binary, name, expected) {
  const file = new File([binary], name, { type: "application/octet-stream" });
  const ranges = [];
  const slice = file.slice.bind(file);
  file.arrayBuffer = () => {
    throw new Error("Must not read the complete file");
  };
  file.slice = (start, end) => {
    ranges.push([start, end]);
    assert.ok(end - start <= 256 * 1024);
    return slice(start, end);
  };
  assert.ok(Math.abs((await getVideoDuration(file)) - expected) < 1e-8);
  assert.ok(ranges.reduce((total, [start, end]) => total + end - start, 0) < 1024);
}

test("accepts common video extensions despite missing or generic MIME types", () => {
  for (const extension of [
    "mov",
    "flv",
    "avi",
    "rmvb",
    "rm",
    "mkv",
    "wmv",
    "mp4",
    "webm",
    "f4v",
    "mts",
    "vob",
  ]) {
    assert.ok(VIDEO_ACCEPT.split(",").includes(`.${extension}`));
    for (const type of ["", "application/octet-stream", "application/x-unknown"]) {
      assert.ok(isVideoFile({ name: `video.${extension.toUpperCase()}`, type }));
    }
  }
  assert.ok(isVideoFile({ name: "unusual-format", type: "video/x-custom" }));
  assert.ok(!isVideoFile({ name: "notes.txt", type: "text/plain" }));
  assert.ok(!isVideoFile({ name: "movie.mp4.exe", type: "application/octet-stream" }));
  assert.ok(!isVideoFile({ name: "mov", type: "" }));
});

test("MOV reads a movie header after media data without a browser decoder", async () => {
  const movie = Buffer.alloc(100);
  movie.writeUInt32BE(1000, 12);
  movie.writeUInt32BE(97200250, 16);
  const binary = Buffer.concat([
    atom("mdat", Buffer.alloc(1_000_000)),
    atom("moov", atom("mvhd", movie)),
  ]);
  await assertMetadataOnly(binary, "sample.MOV", 97200.25);
});

test("MOV supports extended atom sizes and version 1 duration headers", async () => {
  const movie = Buffer.alloc(112);
  movie[0] = 1;
  movie.writeUInt32BE(1000, 20);
  movie.writeBigUInt64BE(BigInt(360000250), 24);
  await assertMetadataOnly(atom("moov", atom("mvhd", movie, true), true), "large.mov", 360000.25);
});

test("AVI uses fractional frame rates without loading its movi payload", async () => {
  await assertMetadataOnly(aviFixture(), "sample.AVI", 60.06);
});

test("OpenDML AVI uses the complete frame count", async () => {
  await assertMetadataOnly(aviFixture(3_000_000), "extended.avi", 100100);
});

test("FLV reads onMetaData.duration in ECMA arrays and objects", async () => {
  await assertMetadataOnly(flvFixture(65.25), "sample.FLV", 65.25);
  await assertMetadataOnly(flvFixture(3661.75, false), "object.flv", 3661.75);
});

test("malformed container metadata falls back to native reading and cleans resources", async (t) => {
  const env = setup(t);
  const reading = getVideoDuration(new File(["broken"], "broken.flv"));
  // Local Blob reads yield before the browser fallback is set up.
  for (let attempt = 0; attempt < 20 && !env.videos.length; attempt++)
    await new Promise((resolve) => setImmediate(resolve));
  assert.equal(env.videos.length, 1);
  env.videos[0].dispatchEvent(new Event("error"));
  await assert.rejects(reading, { code: "unreadable" });
  env.assertCleaned();
});

test("cancellation during container metadata reads prevents native fallback", async () => {
  const file = new File([aviFixture()], "cancelled.avi");
  const controller = new AbortController();
  const slice = file.slice.bind(file);
  let reads = 0;
  file.slice = (start, end) => {
    reads++;
    controller.abort();
    return slice(start, end);
  };
  await assert.rejects(getVideoDuration(file, controller.signal), { name: "AbortError" });
  assert.equal(reads, 1);
});

function realMediaFixture(duration, streamDurations = [], headerSize = 18) {
  function chunk(type, payload) {
    const header = Buffer.alloc(10);
    header.write(type);
    header.writeUInt32BE(payload.length + 10, 4);
    return Buffer.concat([header, payload]);
  }
  const fileHeader = chunk(".RMF", Buffer.alloc(headerSize - 10));
  const properties = Buffer.alloc(40);
  properties.writeUInt32BE(duration, 20);
  const streams = streamDurations.map((duration) => {
    const data = Buffer.alloc(36);
    data.writeUInt32BE(duration, 26);
    // Empty stream name, MIME type and codec data follow the fixed fields.
    return chunk("MDPR", data);
  });
  return Buffer.concat([
    fileHeader,
    chunk("CONT", Buffer.alloc(8)),
    chunk("PROP", properties),
    ...streams,
    chunk("DATA", Buffer.alloc(1_000_000)),
  ]);
}

test("RMVB reads millisecond PROP duration without loading video packets", async () => {
  await assertMetadataOnly(realMediaFixture(97200250), "sample.RMVB", 97200.25);
  await assertMetadataOnly(realMediaFixture(3661750), "sample.rm", 3661.75);
});

test("RMVB supports compact RealMedia file headers", async () => {
  await assertMetadataOnly(realMediaFixture(65250, [], 16), "compact.rmvb", 65.25);
});

test("RMVB falls back to the longest MDPR stream when PROP duration is missing", async () => {
  await assertMetadataOnly(realMediaFixture(0, [65250, 66500]), "streams.rmvb", 66.5);
});

test("RMVB rejects invalid, truncated and missing duration metadata", async (t) => {
  const env = setup(t);
  const invalid = realMediaFixture(65250);
  invalid.write("FAKE", 0);
  const truncated = realMediaFixture(65250).subarray(0, 40);
  for (const binary of [invalid, truncated, realMediaFixture(0)]) {
    const reading = getVideoDuration(new File([binary], "broken.rmvb"));
    const expectedVideos = env.videos.length + 1;
    for (let attempt = 0; attempt < 20 && env.videos.length < expectedVideos; attempt++) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(env.videos.length, expectedVideos);
    env.videos.at(-1).dispatchEvent(new Event("error"));
    await assert.rejects(reading, { code: "unreadable" });
  }
  env.assertCleaned();
});

test("cancelling RMVB metadata reads releases the batch without native fallback", async () => {
  const file = new File([realMediaFixture(65250)], "cancelled.rmvb");
  const controller = new AbortController();
  const slice = file.slice.bind(file);
  let reads = 0;
  file.slice = (start, end) => {
    reads++;
    controller.abort();
    return slice(start, end);
  };
  await assert.rejects(getVideoDuration(file, controller.signal), { name: "AbortError" });
  assert.equal(reads, 1);
});
