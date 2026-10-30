// 世界书 / 3D 场景构建器页面
import { createFileRoute } from "@tanstack/react-router";
import WorldBuilder from "@/components/world-builder/WorldBuilder";

export const Route = createFileRoute("/world-builder")({
  component: () => <WorldBuilder />,
});
