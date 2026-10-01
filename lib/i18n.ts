export const locales = ["en", "zh"] as const;
export type Locale = (typeof locales)[number];

export function isLocale(value: string): value is Locale {
  return value === "en" || value === "zh";
}

export const messages = {
  en: {
    htmlLang: "en",
    brand: "VidSum",
    brandCaption: "VIDEO DURATION",
    homeLabel: "VidSum home — video duration calculator",
    languageLabel: "Language",
    eyebrow: "LESS EFFORT. EVERY SECOND COUNTED.",
    heading: "Video Duration Calculator",
    manageLabel: "Add and manage videos",
    addVideos: "Add your videos",
    inputLabel: "Select video files. You can select multiple files.",
    dropHere: "Drop your videos here",
    chooseOrDrop: "Click to select or drag videos here",
    uploadHint: "Add multiple videos at once or in batches",
    formats: "Add MP4, MOV, FLV, AVI, RMVB, MKV, WebM and more",
    formatHint:
      "MOV, FLV, AVI and RMVB use file headers. Files without valid duration data are marked as failed.",
    addedVideos: "Added videos",
    waitingForFiles: "Waiting for files",
    totalSize: (size: string) => `${size} total`,
    emptyTitle: "No videos added yet",
    emptyHint: "Your files will appear here once added",
    listLabel: "Added video files",
    removeLabel: (name: string) => `Remove ${name}`,
    statuses: { pending: "Waiting", loading: "Reading", success: "Done", error: "Failed" },
    skippedFiles: (count: number) =>
      `Skipped ${count} non-video ${count === 1 ? "file" : "files"}. Please select video files.`,
    resultLabel: "Calculation and result",
    calculate: "Calculate total duration",
    totalDuration: "Total video duration",
    durationLabel: (duration: string) =>
      `Total video duration ${duration}, in hours, minutes and seconds`,
    progress: (completed: number, total: number) => `Reading videos… ${completed} / ${total}`,
    summary: (success: number, failed: number) =>
      failed
        ? `Calculated ${success} ${success === 1 ? "video" : "videos"}; ${failed} could not be read.`
        : `Calculated ${success} ${success === 1 ? "video" : "videos"}`,
    calculating: "Calculating…",
    clear: "Clear",
    privacy: "Your videos are never uploaded. All calculations happen locally in your browser.",
    errors: {
      "invalid-duration":
        "No valid duration found. The file may be damaged or use an unsupported format.",
      unreadable:
        "Cannot read duration. The file may be damaged, lack valid duration metadata, or use an unsupported format.",
      timeout: "Reading timed out. Try again or use a supported video format.",
    },
    seo: {
      title: "VidSum — Video Duration Calculator for Multiple Files",
      description:
        "Calculate the total duration of multiple videos with VidSum. Add MP4, MOV, AVI, FLV or RMVB files. Free and private, with local processing and no uploads.",
      ogLocale: "en_US",
    },
  },
  zh: {
    htmlLang: "zh-CN",
    brand: "视频时长汇总",
    brandCaption: "VidSum",
    homeLabel: "VidSum 视频时长汇总首页",
    languageLabel: "语言切换",
    eyebrow: "简单一点 · 时间清楚一点",
    heading: "视频总时长计算器",
    manageLabel: "添加与管理视频",
    addVideos: "添加你的视频",
    inputLabel: "选择视频文件，可一次选择多个",
    dropHere: "松开鼠标，添加视频",
    chooseOrDrop: "点击选择或将视频拖到这里",
    uploadHint: "支持一次或分多次添加多个视频",
    formats: "可添加 MP4、MOV、FLV、AVI、RMVB、MKV、WebM 等视频",
    formatHint: "MOV、FLV、AVI、RMVB 可直接读取文件头；缺少有效时长信息的文件会提示失败",
    addedVideos: "已添加视频",
    waitingForFiles: "等待添加",
    totalSize: (size: string) => `共 ${size}`,
    emptyTitle: "还没有添加视频",
    emptyHint: "添加后，文件会显示在这里",
    listLabel: "已添加的视频列表",
    removeLabel: (name: string) => `删除 ${name}`,
    statuses: { pending: "等待计算", loading: "读取中", success: "已完成", error: "读取失败" },
    skippedFiles: (count: number) => `已忽略 ${count} 个非视频文件，请选择视频文件。`,
    resultLabel: "计算与结果",
    calculate: "计算总时长",
    totalDuration: "视频总时长",
    durationLabel: (duration: string) => `视频总时长 ${duration}，格式为小时、分钟、秒`,
    progress: (completed: number, total: number) => `正在读取视频… ${completed} / ${total}`,
    summary: (success: number, failed: number) =>
      failed
        ? `已成功计算 ${success} 个视频，${failed} 个视频无法读取。`
        : `已成功计算 ${success} 个视频`,
    calculating: "计算中...",
    clear: "清空",
    privacy: "视频文件不会上传到任何服务器，所有计算均在你的浏览器中完成。",
    errors: {
      "invalid-duration": "无法获取有效时长，文件可能已损坏或格式不受支持。",
      unreadable: "无法读取时长：文件可能损坏、缺少有效时长元数据，或格式不受浏览器支持。",
      timeout: "读取超时，请重试或使用浏览器支持的视频格式。",
    },
    seo: {
      title: "VidSum 视频总时长计算器 - 多个视频时长汇总",
      description:
        "免费计算多个本地视频的总时长，支持 MP4、MOV、AVI、FLV、RMVB 等格式，一次选择或分批添加。视频无需上传服务器，直接在浏览器本地汇总为时:分:秒，支持超过 24 小时。",
      ogLocale: "zh_CN",
    },
  },
} as const;
