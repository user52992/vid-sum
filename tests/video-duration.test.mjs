import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { afterEach, test } from "node:test";

const ts = createRequire(import.meta.url)("typescript");
const source = readFileSync(new URL("../lib/video-duration.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
});
const { formatDuration, getVideoDuration } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

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
    [65, "00:01:05"],
    [3661, "01:01:01"],
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
  assert.match(results[0].reason.message, /无法读取/);
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
    await assert.rejects(reading, /有效时长/);
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
  await assert.rejects(reading, /读取超时/);
  env.assertCleaned();
});
