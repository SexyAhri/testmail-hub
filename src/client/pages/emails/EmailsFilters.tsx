import { Button, DatePicker, Input, Select, Space } from "antd";
import type { ComponentProps } from "react";

import { SearchToolbar } from "../../components";
import type { WorkspaceCatalog } from "../../types";

const { RangePicker } = DatePicker;

export type RangePickerValue = ComponentProps<typeof RangePicker>["value"];
export type RangePickerChangeValue = Parameters<NonNullable<ComponentProps<typeof RangePicker>["onChange"]>>[0];

export interface EmailFilterDrafts {
  address: string;
  domain?: string;
  environment_id?: number;
  has_attachments?: string;
  has_matches?: string;
  mailbox_pool_id?: number;
  project_id?: number;
  sender: string;
  subject: string;
}

interface EmailsFiltersProps {
  catalog: WorkspaceCatalog;
  dateRangeValue: RangePickerValue;
  domains: string[];
  drafts: EmailFilterDrafts;
  loading: boolean;
  onApply: () => void;
  onDateRangeChange: (values: RangePickerChangeValue) => void;
  onDraftChange: (next: Partial<EmailFilterDrafts>) => void;
  onReset: () => void;
}

export function EmailsFilters({
  catalog,
  dateRangeValue,
  domains,
  drafts,
  loading,
  onApply,
  onDateRangeChange,
  onDraftChange,
  onReset,
}: EmailsFiltersProps) {
  return (
    <SearchToolbar>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 170, flex: "1 1 170px" }}>
          <Input
            placeholder="完整邮箱地址"
            value={drafts.address}
            onChange={event => onDraftChange({ address: event.target.value })}
          />
        </div>
        <div style={{ minWidth: 150, flex: "1 1 150px" }}>
          <Input
            placeholder="发件人"
            value={drafts.sender}
            onChange={event => onDraftChange({ sender: event.target.value })}
          />
        </div>
        <div style={{ minWidth: 150, flex: "1 1 150px" }}>
          <Input
            placeholder="主题关键词"
            value={drafts.subject}
            onChange={event => onDraftChange({ subject: event.target.value })}
          />
        </div>
        <div style={{ minWidth: 130, flex: "1 1 130px" }}>
          <Select
            allowClear
            placeholder="域名"
            value={drafts.domain}
            options={domains.map(item => ({ label: item, value: item }))}
            onChange={value => onDraftChange({ domain: value })}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ minWidth: 150, flex: "1 1 150px" }}>
          <Select
            allowClear
            placeholder="项目"
            value={drafts.project_id}
            options={catalog.projects.map(item => ({
              label: item.is_enabled ? item.name : `${item.name}（已停用）`,
              value: item.id,
            }))}
            onChange={value => onDraftChange({
              project_id: value,
              environment_id: undefined,
              mailbox_pool_id: undefined,
            })}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ minWidth: 150, flex: "1 1 150px" }}>
          <Select
            allowClear
            placeholder="环境"
            value={drafts.environment_id}
            options={catalog.environments
              .filter(item => !drafts.project_id || item.project_id === drafts.project_id)
              .map(item => ({
                label: item.is_enabled ? item.name : `${item.name}（已停用）`,
                value: item.id,
              }))}
            onChange={value => onDraftChange({
              environment_id: value,
              mailbox_pool_id: undefined,
            })}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ minWidth: 160, flex: "1 1 160px" }}>
          <Select
            allowClear
            placeholder="邮箱池"
            value={drafts.mailbox_pool_id}
            options={catalog.mailbox_pools
              .filter(item => !drafts.project_id || item.project_id === drafts.project_id)
              .filter(item => !drafts.environment_id || item.environment_id === drafts.environment_id)
              .map(item => ({
                label: item.is_enabled ? item.name : `${item.name}（已停用）`,
                value: item.id,
              }))}
            onChange={value => onDraftChange({ mailbox_pool_id: value })}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ minWidth: 140, flex: "1 1 140px" }}>
          <Select
            allowClear
            placeholder="命中情况"
            value={drafts.has_matches}
            options={[
              { label: "已命中", value: "1" },
              { label: "未命中", value: "0" },
            ]}
            onChange={value => onDraftChange({ has_matches: value })}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ minWidth: 140, flex: "1 1 140px" }}>
          <Select
            allowClear
            placeholder="附件"
            value={drafts.has_attachments}
            options={[
              { label: "有", value: "1" },
              { label: "无", value: "0" },
            ]}
            onChange={value => onDraftChange({ has_attachments: value })}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ minWidth: 260, flex: "1 1 260px" }}>
          <RangePicker
            showTime
            value={dateRangeValue}
            onChange={onDateRangeChange}
            style={{ width: "100%" }}
          />
        </div>
        <Space size={8}>
          <Button type="primary" onClick={onApply} loading={loading}>
            应用筛选
          </Button>
          <Button onClick={onReset} disabled={loading}>
            重置
          </Button>
        </Space>
      </div>
    </SearchToolbar>
  );
}
