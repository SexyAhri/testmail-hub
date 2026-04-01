import { Button } from "antd";

import { PageHeader } from "../../components";
import { ApiDocsTabs } from "./ApiDocsTabs";

interface ApiDocsPageProps {
  mailboxDomain: string;
}

export default function ApiDocsPage({ mailboxDomain }: ApiDocsPageProps) {
  return (
    <div className="page-tab-stack">
      <PageHeader
        title="开放 API"
        subtitle="这里汇总登录会话、公开查询接口、项目级 API Token，以及支持项目绑定的 Webhook 对接方式。"
        extra={(
          <Button type="primary" href="/emails">
            返回邮件中心
          </Button>
        )}
      />

      <ApiDocsTabs mailboxDomain={mailboxDomain} />
    </div>
  );
}
