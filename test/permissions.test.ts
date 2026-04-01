import assert from "node:assert/strict";
import test from "node:test";

import {
  canManageProjectResource,
  canManageNotificationRecord,
  getAccessModeTag,
  getReadonlyNotice,
  getWriteScopeNotice,
} from "../src/client/permissions";
import type { SessionPayload } from "../src/client/types";

type CurrentUser = SessionPayload["user"];

const projectBinding = {
  id: 7,
  name: "Alpha",
  slug: "alpha",
};

const ownerUser: CurrentUser = {
  access_scope: "all",
  display_name: "Owner",
  projects: [],
  role: "owner",
  username: "owner",
};

const viewerUser: CurrentUser = {
  access_scope: "all",
  display_name: "Viewer",
  projects: [],
  role: "viewer",
  username: "viewer",
};

const projectAdminUser: CurrentUser = {
  access_scope: "bound",
  display_name: "Project Admin",
  projects: [projectBinding],
  role: "project_admin",
  username: "project-admin",
};

test("access mode tag reflects readonly and project-scoped users", () => {
  assert.deepEqual(getAccessModeTag(viewerUser), {
    color: "gold",
    label: "只读视角",
  });
  assert.deepEqual(getAccessModeTag(projectAdminUser), {
    color: "gold",
    label: "项目级视角",
  });
  assert.equal(getAccessModeTag(ownerUser), null);
});

test("write scope notice supports custom readonly and project-scoped copy", () => {
  assert.deepEqual(
    getWriteScopeNotice(viewerUser, "通知配置", {
      readOnlyTitle: "当前账号为通知只读视角",
      readOnlyDescription: "只能查看通知端点和投递记录。",
    }),
    {
      title: "当前账号为通知只读视角",
      description: "只能查看通知端点和投递记录。",
    },
  );

  assert.deepEqual(
    getWriteScopeNotice(projectAdminUser, "API Token", {
      projectScopedTitle: "当前账号为项目级 Token 视角",
      projectScopedDescription: "只能维护绑定项目下的 Token。",
    }),
    {
      title: "当前账号为项目级 Token 视角",
      description: "只能维护绑定项目下的 Token。",
    },
  );
});

test("readonly notice keeps project-scoped platform resources in readonly mode", () => {
  assert.deepEqual(getReadonlyNotice(projectAdminUser, "项目空间"), {
    title: "项目空间当前为项目级只读视角",
    description: "项目空间属于平台级资源，项目级管理员当前仅支持查看，不支持新增、编辑或删除。",
  });
});

test("notification record management stays limited to bound projects", () => {
  assert.equal(
    canManageNotificationRecord(projectAdminUser, {
      access_scope: "all",
      projects: [],
    }),
    false,
  );

  assert.equal(
    canManageNotificationRecord(projectAdminUser, {
      access_scope: "bound",
      projects: [projectBinding],
    }),
    true,
  );

  assert.equal(
    canManageNotificationRecord(projectAdminUser, {
      access_scope: "bound",
      projects: [{ id: 8, name: "Beta", slug: "beta" }],
    }),
    false,
  );
});

test("project resource management requires write access and matching scope", () => {
  assert.equal(canManageProjectResource(viewerUser, 7), false);
  assert.equal(canManageProjectResource(projectAdminUser, 7), true);
  assert.equal(canManageProjectResource(projectAdminUser, null), false);
  assert.equal(canManageProjectResource(ownerUser, null), true);
});
