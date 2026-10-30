// 角色中心页面
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/characters")({
  component: () => (
    <main className="page-frame">
      <p>角色中心页面重做中，敬请期待。</p>
    </main>
  ),
});
