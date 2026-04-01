import { Alert, Col, Form, Input, Select, Switch } from "antd";
import type { FormInstance } from "antd";

import { FormDrawer } from "../../components";
import type {
  CatchAllMode,
  DomainRoutingProfileMutationPayload,
  DomainRoutingProfileRecord,
} from "../../types";
import type { DomainProviderDefinition } from "../../../shared/domain-providers";
import {
  CATCH_ALL_MODE_OPTIONS,
  PROVIDER_CAPABILITY_LABELS,
} from "./domains-utils";

interface DomainRoutingProfileDrawerProps {
  accessibleProjectIds: number[];
  activeProvider?: DomainProviderDefinition;
  editingProfile: DomainRoutingProfileRecord | null;
  environmentOptions: Array<{ label: string; value: number }>;
  form: FormInstance<DomainRoutingProfileMutationPayload>;
  isProjectScoped: boolean;
  loading: boolean;
  onClose: () => void;
  onSubmit: () => void;
  open: boolean;
  projectOptions: Array<{ label: string; value: number }>;
  providerOptions: Array<{ label: string; value: string }>;
  watchedProjectId?: number | null;
}

export function DomainRoutingProfileDrawer({
  accessibleProjectIds,
  activeProvider,
  editingProfile,
  environmentOptions,
  form,
  isProjectScoped,
  loading,
  onClose,
  onSubmit,
  open,
  projectOptions,
  providerOptions,
  watchedProjectId,
}: DomainRoutingProfileDrawerProps) {
  return (
    <FormDrawer
      title={editingProfile ? "编辑路由策略" : "新建路由策略"}
      open={open}
      onClose={onClose}
      onSubmit={onSubmit}
      form={form}
      loading={loading}
      labelLayout="top"
      width="42vw"
    >
      <Col xs={24} md={12}>
        <Form.Item
          label="策略名称"
          name="name"
          rules={[{ required: true, message: "请输入策略名称" }]}
        >
          <Input placeholder="例如：生产环境 Catch-all" />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item label="策略标识" name="slug">
          <Input placeholder="可留空，系统会自动生成" />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item label="Provider" name="provider" rules={[{ required: true, message: "请选择 Provider" }]}>
          <Select options={providerOptions} />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item label="项目" name="project_id">
          <Select
            allowClear={!isProjectScoped}
            options={projectOptions}
            placeholder={isProjectScoped ? "请选择绑定项目" : "可选，限制到项目级使用"}
            disabled={isProjectScoped && accessibleProjectIds.length === 1}
          />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item label="环境" name="environment_id">
          <Select
            allowClear
            options={environmentOptions}
            placeholder={watchedProjectId ? "可选，限制到环境级使用" : "请先选择项目"}
            disabled={!watchedProjectId}
          />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item
          label="Catch-all 策略"
          name="catch_all_mode"
          rules={[{ required: true, message: "请选择 Catch-all 策略" }]}
        >
          <Select options={CATCH_ALL_MODE_OPTIONS as Array<{ label: string; value: CatchAllMode }>} />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item label="启用状态" name="is_enabled" valuePropName="checked">
          <Switch checkedChildren="启用" unCheckedChildren="停用" />
        </Form.Item>
      </Col>
      <Col xs={24}>
        {activeProvider ? (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message={`当前 Provider：${activeProvider.label}`}
            description={`${activeProvider.description} 当前能力：${
              activeProvider.capabilities.length > 0
                ? activeProvider.capabilities.map(item => PROVIDER_CAPABILITY_LABELS[item]).join(" / ")
                : "仅资产登记与工作空间绑定"
            }。`}
          />
        ) : null}
      </Col>
      <Col xs={24}>
        <Form.Item
          label="Catch-all 转发地址"
          name="catch_all_forward_to"
          rules={[
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (getFieldValue("catch_all_mode") !== "enabled" || String(value || "").trim()) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error("启用并转发时必须填写转发地址"));
              },
            }),
          ]}
        >
          <Input placeholder="例如：ops@vixenahri.cn" />
        </Form.Item>
      </Col>
      <Col xs={24}>
        <Form.Item label="备注" name="note">
          <Input placeholder="例如：给一组测试域名复用的默认转发策略" />
        </Form.Item>
      </Col>
      <Col xs={24}>
        <Form.Item
          label="本次操作备注"
          name="operation_note"
          extra="这条说明不会写入路由策略本身，只会进入审计日志。"
        >
          <Input.TextArea rows={2} placeholder="例如：按项目交接调整策略范围、补录默认转发策略、收缩 Catch-all 权限" />
        </Form.Item>
      </Col>
    </FormDrawer>
  );
}
