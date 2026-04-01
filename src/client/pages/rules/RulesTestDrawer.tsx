import { Button, Col, Form, Input, Row } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { FormInstance } from "antd";

import { DataTable, DetailDrawer, MetricCard } from "../../components";
import type { RuleMatch, RuleTestResult } from "../../types";

const TEST_COLUMNS: ColumnsType<RuleMatch> = [
  {
    title: "规则 ID",
    dataIndex: "rule_id",
    key: "rule_id",
    width: 100,
  },
  {
    title: "备注",
    dataIndex: "remark",
    key: "remark",
    render: value => value || "-",
  },
  {
    title: "命中内容",
    dataIndex: "value",
    key: "value",
    render: value => <span style={{ fontFamily: "monospace" }}>{value}</span>,
  },
];

interface RulesTestDrawerProps {
  form: FormInstance<{ content: string; sender: string }>;
  onClose: () => void;
  onSubmit: () => void;
  open: boolean;
  result: RuleTestResult | null;
  testing: boolean;
}

export function RulesTestDrawer({
  form,
  onClose,
  onSubmit,
  open,
  result,
  testing,
}: RulesTestDrawerProps) {
  return (
    <DetailDrawer
      title="规则测试器"
      open={open}
      onClose={onClose}
      width="58vw"
      footer={(
        <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
          <Button onClick={onClose}>关闭</Button>
          <Button type="primary" loading={testing} onClick={onSubmit}>
            开始测试
          </Button>
        </div>
      )}
    >
      <Form form={form} layout="vertical" initialValues={{ content: "", sender: "" }}>
        <Form.Item label="发件人" name="sender">
          <Input placeholder="例如：notifications@github.com" />
        </Form.Item>
        <Form.Item label="样例正文" name="content" rules={[{ required: true, message: "请输入样例正文" }]}>
          <Input.TextArea rows={10} placeholder="粘贴一段邮件正文，系统会用当前所有规则进行匹配" />
        </Form.Item>
      </Form>

      <Row gutter={[16, 16]}>
        <Col span={24}>
          <MetricCard
            title="命中条数"
            value={result?.matches.length || 0}
            icon={<>✓</>}
            percent={Math.min(100, (result?.matches.length || 0) * 20)}
            color="#52c41a"
          />
        </Col>
      </Row>

      <div style={{ marginTop: 16 }}>
        <DataTable
          cardTitle="测试结果"
          columns={TEST_COLUMNS}
          dataSource={result?.matches || []}
          rowKey={record => `${record.rule_id}-${record.value}`}
          showPagination={false}
        />
      </div>

      {result?.invalid_rules.length ? (
        <div style={{ marginTop: 16, fontSize: 13 }}>
          无效正则规则 ID：{result.invalid_rules.join(", ")}
        </div>
      ) : null}
    </DetailDrawer>
  );
}
