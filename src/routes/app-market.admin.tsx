// 应用市场管理后台页面
import { createFileRoute } from "@tanstack/react-router";
import { AppMarketAdminPage } from "@/components/app-market-admin/app-market-admin-page";

export const Route = createFileRoute("/app-market/admin")({
  component: () => <AppMarketAdminPage />,
});
