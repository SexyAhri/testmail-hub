import { Layout, theme } from "antd";

import { APP_COPYRIGHT } from "../../brand";

const { Footer: AntFooter } = Layout;

export function Footer() {
  const { token } = theme.useToken();

  return (
    <AntFooter
      style={{
        textAlign: "center",
        padding: "12px 24px",
        background: "transparent",
        color: token.colorTextTertiary,
        fontSize: 12,
      }}
    >
      {APP_COPYRIGHT}
    </AntFooter>
  );
}
