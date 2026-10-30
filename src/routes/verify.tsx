// 验证申请 / 激活码查询页面
import { createFileRoute } from "@tanstack/react-router";
import { VerifyPage } from "@/components/verify/verify-page";

export const Route = createFileRoute("/verify")({
  component: () => <VerifyPage />,
});
