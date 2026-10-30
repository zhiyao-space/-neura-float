// 首页：AI 虚拟手机主应用（float）
import { createFileRoute } from "@tanstack/react-router";
import { MainApp } from "@/components/main-app";

export const Route = createFileRoute("/")({
  component: () => <MainApp />,
});
