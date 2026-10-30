const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

export function isSelfHostedModeEnabled(): boolean {
  // 迁移版：无服务端登录接口，恒以本地用户身份直接进入（跳过登录门控）
  return true;
}
