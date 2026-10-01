import "./globals.css";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "视频总时长计算器",
  description: "免费在线计算多个视频的总时长。视频无需上传服务器，直接在浏览器本地计算。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
