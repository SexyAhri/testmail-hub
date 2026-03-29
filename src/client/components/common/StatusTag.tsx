import { Tag } from "antd";

interface StatusTagProps {
  activeText?: string;
  inactiveText?: string;
  status: string;
}

export function StatusTag({
  activeText = "正常",
  inactiveText = "停用",
  status,
}: StatusTagProps) {
  const isActive =
    status === "active" ||
    status === "success" ||
    status === "running" ||
    status === "published" ||
    status === "enabled";

  return <Tag color={isActive ? "success" : "error"}>{isActive ? activeText : inactiveText}</Tag>;
}

interface TypeTagProps {
  options: Record<string, { color: string; label: string }>;
  type: string;
}

export function TypeTag({ options, type }: TypeTagProps) {
  const option = options[type];
  return option ? <Tag color={option.color}>{option.label}</Tag> : <Tag>{type}</Tag>;
}
