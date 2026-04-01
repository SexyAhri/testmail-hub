import { Alert, Col, Form, Input, Select, Switch } from "antd";
import type { FormInstance } from "antd";

import { domainProviderSupports, type DomainProviderDefinition } from "../../../shared/domain-providers";
import { FormDrawer } from "../../components";
import type {
  CatchAllMode,
  DomainAssetRecord,
  DomainMutationPayload,
} from "../../types";
import {
  CLOUDFLARE_TOKEN_MODE_OPTIONS,
  PROVIDER_CAPABILITY_LABELS,
} from "./domains-utils";

interface DomainAssetDrawerProps {
  accessibleProjectIds: number[];
  activeProvider?: DomainProviderDefinition;
  domainCatchAllOptions: Array<{ label: string; value: CatchAllMode }>;
  editing: DomainAssetRecord | null;
  editingHasActiveMailboxes: boolean;
  editingProtectedReason: string;
  environmentOptions: Array<{ label: string; value: number }>;
  form: FormInstance<DomainMutationPayload>;
  isProjectScoped: boolean;
  loading: boolean;
  onClose: () => void;
  onSubmit: () => void;
  open: boolean;
  projectOptions: Array<{ label: string; value: number }>;
  providerOptions: Array<{ label: string; value: string }>;
  routingProfileOptions: Array<{ label: string; value: number }>;
  watchedCatchAllMode: CatchAllMode;
  watchedCloudflareTokenMode: NonNullable<DomainMutationPayload["cloudflare_api_token_mode"]>;
  watchedProjectId?: number | null;
}

export function DomainAssetDrawer({
  accessibleProjectIds,
  activeProvider,
  domainCatchAllOptions,
  editing,
  editingHasActiveMailboxes,
  editingProtectedReason,
  environmentOptions,
  form,
  isProjectScoped,
  loading,
  onClose,
  onSubmit,
  open,
  projectOptions,
  providerOptions,
  routingProfileOptions,
  watchedCatchAllMode,
  watchedCloudflareTokenMode,
  watchedProjectId,
}: DomainAssetDrawerProps) {
  return (
    <FormDrawer
      title={editing ? "编辑域名资产" : "新增域名资产"}
      open={open}
      onClose={onClose}
      onSubmit={onSubmit}
      form={form}
      loading={loading}
      labelLayout="top"
      width="42vw"
    >
      {editingHasActiveMailboxes ? (
        <Col xs={24}>
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message="当前域名仍有活跃邮箱"
            description={
              editingProtectedReason
              || "为避免已使用该域名的邮箱失效，域名、项目、环境与启用状态已在编辑表单中锁定。"
            }
          />
        </Col>
      ) : null}
      <Col xs={24} md={12}>
        <Form.Item
          label="域名"
          name="domain"
          rules={[{ required: true, message: "请输入域名" }]}
        >
          <Input placeholder="例如：vixenahri.cn" disabled={editingHasActiveMailboxes} />
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
            placeholder={isProjectScoped ? "请选择绑定项目" : "可选，绑定到项目"}
            disabled={editingHasActiveMailboxes || (isProjectScoped && accessibleProjectIds.length === 1)}
          />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item label="环境" name="environment_id">
          <Select
            allowClear
            options={environmentOptions}
            placeholder={watchedProjectId ? "可选，绑定到环境" : "请先选择项目"}
            disabled={editingHasActiveMailboxes || !watchedProjectId}
          />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item
          label={domainProviderSupports(activeProvider, "zone_id") ? "Cloudflare Zone ID" : "Zone ID（当前 Provider 不适用）"}
          name="zone_id"
        >
          <Input
            placeholder={domainProviderSupports(activeProvider, "zone_id") ? "可留空，留空时回退到环境变量" : "当前 Provider 不需要 Zone ID"}
            disabled={!domainProviderSupports(activeProvider, "zone_id")}
          />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item
          label={domainProviderSupports(activeProvider, "email_worker") ? "邮件 Worker" : "邮件 Worker（当前 Provider 不适用）"}
          name="email_worker"
        >
          <Input
            placeholder={domainProviderSupports(activeProvider, "email_worker") ? "可留空，留空时回退到环境变量" : "当前 Provider 不需要邮件 Worker"}
            disabled={!domainProviderSupports(activeProvider, "email_worker")}
          />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item
          label={domainProviderSupports(activeProvider, "mailbox_route_sync") ? "邮箱路由转发到" : "邮箱路由转发到（当前 Provider 不适用）"}
          name="mailbox_route_forward_to"
          extra={
            domainProviderSupports(activeProvider, "mailbox_route_sync")
              ? "可选。填写后自动创建或更新的邮箱路由会优先使用 forward 动作，适合跨 CF 账号集中收件。"
              : "当前 Provider 不支持托管邮箱路由。"
          }
        >
          <Input
            placeholder={
              domainProviderSupports(activeProvider, "mailbox_route_sync")
                ? "例如：relay@primary.example.com"
                : "当前 Provider 不支持邮箱路由同步"
            }
            disabled={!domainProviderSupports(activeProvider, "mailbox_route_sync")}
          />
        </Form.Item>
      </Col>
      {activeProvider?.key === "cloudflare" ? (
        <Col xs={24} md={12}>
          <Form.Item
            label="Cloudflare Token 来源"
            name="cloudflare_api_token_mode"
            extra="默认复用环境变量 CLOUDFLARE_API_TOKEN；独立 Token 只对当前域名生效。"
          >
            <Select options={CLOUDFLARE_TOKEN_MODE_OPTIONS} />
          </Form.Item>
        </Col>
      ) : null}
      {activeProvider?.key === "cloudflare" ? (
        <Col xs={24} md={12}>
          <Form.Item
            label="域名独立 Token"
            name="cloudflare_api_token"
            extra={
              watchedCloudflareTokenMode === "domain"
                ? editing?.cloudflare_api_token_configured
                  ? "当前已配置独立 Token；留空表示保留，输入新值表示替换。"
                  : "仅在当前域名需要独立 Cloudflare 权限时填写。"
                : "切换到“使用域名独立 Token”后再填写。"
            }
            rules={
              watchedCloudflareTokenMode === "domain" && !editing?.cloudflare_api_token_configured
                ? [{ required: true, message: "请输入域名独立 Token" }]
                : undefined
            }
          >
            <Input.Password
              placeholder={
                watchedCloudflareTokenMode === "domain"
                  ? editing?.cloudflare_api_token_configured
                    ? "留空则保留当前独立 Token"
                    : "输入当前域名使用的 Cloudflare API Token"
                  : "当前使用全局 CLOUDFLARE_API_TOKEN"
              }
              disabled={watchedCloudflareTokenMode !== "domain"}
            />
          </Form.Item>
        </Col>
      ) : null}
      <Col xs={24} md={12}>
        <Form.Item label="绑定路由策略" name="routing_profile_id">
          <Select
            allowClear
            options={routingProfileOptions}
            placeholder={
              !domainProviderSupports(activeProvider, "routing_profile")
                ? "当前 Provider 不支持路由策略"
                : routingProfileOptions.length > 0
                  ? "可选，绑定独立路由策略"
                  : "当前工作空间暂无可用策略"
            }
            disabled={!domainProviderSupports(activeProvider, "routing_profile")}
          />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item label="域名直配 Catch-all 策略" name="catch_all_mode">
          <Select
            options={domainCatchAllOptions}
            disabled={!domainProviderSupports(activeProvider, "catch_all_policy")}
          />
        </Form.Item>
      </Col>
      <Col xs={24}>
        {activeProvider ? (
          <Alert
            type={activeProvider.key === "manual" ? "warning" : "info"}
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
          extra={
            !domainProviderSupports(activeProvider, "catch_all_policy")
              ? "当前 Provider 不支持托管 Catch-all 策略，系统只保留域名资产记录。"
              : watchedCatchAllMode === "enabled"
                ? "开启后，所有未单独建档的地址都会转发到这里。"
                : "当这里保持“跟随当前 Cloudflare 配置”时，如果已绑定路由策略，则会优先继承路由策略。"
          }
          rules={watchedCatchAllMode === "enabled" ? [{ required: true, message: "请输入转发地址" }] : undefined}
        >
          <Input
            placeholder="例如：ops@vixenahri.cn"
            disabled={watchedCatchAllMode !== "enabled" || !domainProviderSupports(activeProvider, "catch_all_policy")}
          />
        </Form.Item>
      </Col>
      <Col xs={24}>
        <Form.Item label="备注" name="note">
          <Input placeholder="例如：生产主域名 / 测试验证码域名" />
        </Form.Item>
      </Col>
      <Col xs={24}>
        <Form.Item
          label="本次操作备注"
          name="operation_note"
          extra="这条说明不会写入域名资产资料，只会进入审计日志。"
        >
          <Input.TextArea rows={2} placeholder="例如：补录域名归属、切换独立 Token、调整 Catch-all 与路由治理策略" />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item label="允许新建邮箱" name="allow_new_mailboxes" valuePropName="checked">
          <Switch checkedChildren="允许新建" unCheckedChildren="仅存量" />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item label="允许 Catch-all 同步" name="allow_catch_all_sync" valuePropName="checked">
          <Switch
            checkedChildren="允许同步"
            unCheckedChildren="关闭同步"
            disabled={!domainProviderSupports(activeProvider, "catch_all_sync")}
          />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item label="允许路由同步" name="allow_mailbox_route_sync" valuePropName="checked">
          <Switch
            checkedChildren="允许同步"
            unCheckedChildren="关闭同步"
            disabled={!domainProviderSupports(activeProvider, "mailbox_route_sync")}
          />
        </Form.Item>
      </Col>
      <Col xs={24}>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="域名治理规则"
          description="“允许新建邮箱”关闭后，该域名不会再出现在邮箱创建可选列表中；“允许 Catch-all 同步”关闭后，页面和批量操作都不会再把 Catch-all 策略同步到 Cloudflare；“允许路由同步”关闭后，系统不会再自动写入、更新或删除该域名下的邮箱路由；如果填写了“邮箱路由转发到”，系统会优先按这个地址写入 forward 路由。"
        />
      </Col>
      <Col xs={24} md={12}>
        <Form.Item label="设为主域名" name="is_primary" valuePropName="checked">
          <Switch checkedChildren="主域名" unCheckedChildren="普通域名" />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item label="启用状态" name="is_enabled" valuePropName="checked">
          <Switch
            checkedChildren="启用"
            unCheckedChildren="停用"
            disabled={editingHasActiveMailboxes}
          />
        </Form.Item>
      </Col>
    </FormDrawer>
  );
}
