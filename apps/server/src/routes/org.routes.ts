import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { db } from '../db/connection';
import { users, organizations, roles, offlineConsultations, teams, teamMembers, departments } from '../db/schema';
import { requireMinRole, getRoleLevel, getUserPermissions, clearPermissionsCache } from '../middleware/rbac';
import { hash } from 'bcryptjs';
import { logAudit } from '../services/audit.service';

const app = new Hono();

// ============================================================================
// PERMISSION DEFINITIONS
// ============================================================================
const ALL_PERMISSIONS = [
  { key: 'leads:view', module: '线索管理', label: '查看线索' },
  { key: 'leads:create', module: '线索管理', label: '创建线索' },
  { key: 'leads:edit', module: '线索管理', label: '编辑线索' },
  { key: 'leads:delete', module: '线索管理', label: '删除线索' },
  { key: 'leads:assign', module: '线索管理', label: '分配线索' },
  { key: 'customers:view', module: '客户管理', label: '查看客户' },
  { key: 'customers:create', module: '客户管理', label: '创建客户' },
  { key: 'customers:edit', module: '客户管理', label: '编辑客户' },
  { key: 'customers:delete', module: '客户管理', label: '删除客户' },
  { key: 'conversations:view', module: '客服中心', label: '查看会话' },
  { key: 'conversations:reply', module: '客服中心', label: '回复会话' },
  { key: 'conversations:assign', module: '客服中心', label: '分配会话' },
  { key: 'conversations:resolve', module: '客服中心', label: '解决会话' },
  { key: 'deals:view', module: '商机管理', label: '查看商机' },
  { key: 'deals:create', module: '商机管理', label: '创建商机' },
  { key: 'deals:edit', module: '商机管理', label: '编辑商机' },
  { key: 'deals:delete', module: '商机管理', label: '删除商机' },
  { key: 'campaigns:view', module: '营销活动', label: '查看活动' },
  { key: 'campaigns:create', module: '营销活动', label: '创建活动' },
  { key: 'campaigns:edit', module: '营销活动', label: '编辑活动' },
  { key: 'campaigns:delete', module: '营销活动', label: '删除活动' },
  { key: 'knowledge:view', module: '知识库', label: '查看知识库' },
  { key: 'knowledge:edit', module: '知识库', label: '编辑知识库' },
  { key: 'workflows:view', module: '工作流', label: '查看工作流' },
  { key: 'workflows:edit', module: '工作流', label: '编辑工作流' },
  { key: 'analytics:view', module: '数据分析', label: '查看数据分析' },
  { key: 'org:members', module: '组织管理', label: '管理成员' },
  { key: 'org:roles', module: '组织管理', label: '管理角色' },
  { key: 'org:settings', module: '组织管理', label: '组织设置' },
  { key: 'org:invitations', module: '组织管理', label: '管理邀请' },
];

// GET /org/permissions — list all available permissions
app.get('/permissions', async (c) => {
  return c.json({ success: true, data: ALL_PERMISSIONS });
});

// ============================================================================
// ROLES
// ============================================================================
const roleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  level: z.number().min(1).max(99).optional(),
  permissions: z.array(z.string()),
});

// GET /org/roles
app.get('/roles', async (c) => {
  try {
    const { orgId } = c.get('user');
    const list = await db
      .select()
      .from(roles)
      .where(eq(roles.orgId, orgId))
      .orderBy(desc(roles.level));
    return c.json({ success: true, data: list });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 500);
  }
});

// POST /org/roles
app.post('/roles', requireMinRole('admin'), async (c) => {
  try {
    const { orgId } = c.get('user');
    const body = await c.req.json();
    const parsed = roleSchema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: '参数无效' }, 400);

    const [role] = await db.insert(roles).values({
      orgId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      level: parsed.data.level ?? 10,
      permissions: parsed.data.permissions,
    }).returning();
    const user = c.get('user');
    await logAudit({ orgId, userId: user.sub, action: 'role.create', resourceType: 'role', resourceId: role.id, details: { name: role.name } });
    clearPermissionsCache(orgId);
    return c.json({ success: true, data: role });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 500);
  }
});

// PUT /org/roles/:id
app.put('/roles/:id', requireMinRole('admin'), async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = roleSchema.partial().safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: '参数无效' }, 400);

    const [existing] = await db.select().from(roles)
      .where(and(eq(roles.id, id), eq(roles.orgId, orgId))).limit(1);
    if (!existing) return c.json({ success: false, error: '角色不存在' }, 404);

    const setData: Record<string, unknown> = { updatedAt: new Date() };
    if (existing.isSystem) {
      if (parsed.data.description !== undefined) setData.description = parsed.data.description;
      if (parsed.data.permissions !== undefined) setData.permissions = parsed.data.permissions;
    } else {
      if (parsed.data.name !== undefined) setData.name = parsed.data.name;
      if (parsed.data.description !== undefined) setData.description = parsed.data.description;
      if (parsed.data.level !== undefined) setData.level = parsed.data.level;
      if (parsed.data.permissions !== undefined) setData.permissions = parsed.data.permissions;
    }

    const [updated] = await db.update(roles).set(setData)
      .where(and(eq(roles.id, id), eq(roles.orgId, orgId))).returning();

    clearPermissionsCache(orgId);
    return c.json({ success: true, data: updated });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 500);
  }
});

// DELETE /org/roles/:id
app.delete('/roles/:id', requireMinRole('admin'), async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');

    const [existing] = await db.select().from(roles)
      .where(and(eq(roles.id, id), eq(roles.orgId, orgId))).limit(1);
    if (!existing) return c.json({ success: false, error: '角色不存在' }, 404);
    if (existing.isSystem) return c.json({ success: false, error: '系统角色不可删除' }, 403);

    const usersWithRole = await db.select({ id: users.id }).from(users)
      .where(and(eq(users.orgId, orgId), eq(users.role, existing.name))).limit(1);
    if (usersWithRole.length > 0) {
      return c.json({ success: false, error: '该角色下仍有成员，请先转移成员后再删除' }, 400);
    }

    await db.delete(roles).where(and(eq(roles.id, id), eq(roles.orgId, orgId)));
    return c.json({ success: true });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 500);
  }
});

// ============================================================================
// MEMBERS (enhanced)
// ============================================================================

// GET /org/members — detailed member list with more fields
app.get('/members', async (c) => {
  try {
    const { orgId } = c.get('user');
    const statusFilter = c.req.query('status') ?? 'active';
    const conditions = [eq(users.orgId, orgId)];
    if (statusFilter !== 'all') {
      conditions.push(eq(users.status, statusFilter));
    }

    const members = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        role: users.role,
        status: users.status,
        avatarUrl: users.avatarUrl,
        onlineStatus: users.onlineStatus,
        departmentId: users.departmentId,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(and(...conditions))
      .orderBy(users.createdAt);

    // Attach department name and team memberships
    const deptList = await db.select({ id: departments.id, name: departments.name })
      .from(departments).where(eq(departments.orgId, orgId));
    const deptMap = new Map(deptList.map(d => [d.id, d.name]));

    const tmList = await db.select({ userId: teamMembers.userId, teamId: teamMembers.teamId })
      .from(teamMembers)
      .innerJoin(users, eq(teamMembers.userId, users.id))
      .where(eq(users.orgId, orgId));
    const teamList = await db.select({ id: teams.id, name: teams.name })
      .from(teams).where(eq(teams.orgId, orgId));
    const teamNameMap = new Map(teamList.map(t => [t.id, t.name]));

    const userTeamMap = new Map<string, { id: string; name: string }[]>();
    for (const tm of tmList) {
      const arr = userTeamMap.get(tm.userId) ?? [];
      arr.push({ id: tm.teamId, name: teamNameMap.get(tm.teamId) ?? '' });
      userTeamMap.set(tm.userId, arr);
    }

    const enriched = members.map(m => ({
      ...m,
      departmentName: m.departmentId ? deptMap.get(m.departmentId) ?? null : null,
      teams: userTeamMap.get(m.id) ?? [],
    }));

    return c.json({ success: true, data: enriched });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 500);
  }
});

// PUT /org/members/:id — update member info (admin+)
const updateMemberSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  role: z.string().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  departmentId: z.string().uuid().nullable().optional(),
});

app.put('/members/:id', requireMinRole('admin'), async (c) => {
  try {
    const user = c.get('user');
    const targetId = c.req.param('id');
    const body = await c.req.json();
    const parsed = updateMemberSchema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: '参数无效' }, 400);

    const [target] = await db.select({ id: users.id, role: users.role, orgId: users.orgId })
      .from(users).where(eq(users.id, targetId)).limit(1);
    if (!target || target.orgId !== user.orgId) {
      return c.json({ success: false, error: '成员不存在' }, 404);
    }
    if (target.role === 'owner' && user.role !== 'owner') {
      return c.json({ success: false, error: '不能修改组织所有者' }, 403);
    }
    if (getRoleLevel(target.role) >= getRoleLevel(user.role) && user.role !== 'owner' && targetId !== user.sub) {
      return c.json({ success: false, error: '不能修改同级或更高权限成员' }, 403);
    }

    if (parsed.data.role) {
      if (parsed.data.role === 'owner') {
        return c.json({ success: false, error: '不能授予 owner 角色' }, 403);
      }
      if (targetId === user.sub) {
        return c.json({ success: false, error: '不能修改自己的角色' }, 400);
      }
    }

    const setData: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.name) setData.name = parsed.data.name;
    if (parsed.data.phone !== undefined) setData.phone = parsed.data.phone;
    if (parsed.data.role) setData.role = parsed.data.role;
    if (parsed.data.status) setData.status = parsed.data.status;
    if (parsed.data.departmentId !== undefined) setData.departmentId = parsed.data.departmentId;

    const [updated] = await db.update(users).set(setData)
      .where(and(eq(users.id, targetId), eq(users.orgId, user.orgId)))
      .returning({
        id: users.id, name: users.name, email: users.email, phone: users.phone,
        role: users.role, status: users.status, avatarUrl: users.avatarUrl,
        departmentId: users.departmentId,
        lastLoginAt: users.lastLoginAt, createdAt: users.createdAt,
      });

    return c.json({ success: true, data: updated });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 500);
  }
});

// POST /org/members/reset-password/:id — admin resets member password
const resetPwdSchema = z.object({ newPassword: z.string().min(6) });

app.post('/members/reset-password/:id', requireMinRole('admin'), async (c) => {
  try {
    const user = c.get('user');
    const targetId = c.req.param('id');
    const body = await c.req.json();
    const parsed = resetPwdSchema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: '密码至少6位' }, 400);

    const [target] = await db.select({ id: users.id, role: users.role, orgId: users.orgId })
      .from(users).where(eq(users.id, targetId)).limit(1);
    if (!target || target.orgId !== user.orgId) {
      return c.json({ success: false, error: '成员不存在' }, 404);
    }
    if (target.role === 'owner' && user.role !== 'owner') {
      return c.json({ success: false, error: '不能重置所有者密码' }, 403);
    }

    const passwordHash = await hash(parsed.data.newPassword, 10);
    await db.update(users).set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, targetId));

    return c.json({ success: true });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 500);
  }
});

// GET /org/info — org info
app.get('/info', async (c) => {
  try {
    const { orgId } = c.get('user');
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) return c.json({ success: false, error: '组织不存在' }, 404);
    return c.json({ success: true, data: org });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 500);
  }
});

// PUT /org/info — update org info (admin+)
const updateOrgSchema = z.object({
  name: z.string().min(1).optional(),
  logoUrl: z.string().optional(),
  industry: z.string().optional(),
  scale: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  website: z.string().optional(),
  address: z.string().optional(),
  description: z.string().optional(),
});

app.put('/info', requireMinRole('admin'), async (c) => {
  try {
    const { orgId } = c.get('user');
    const body = await c.req.json();
    const parsed = updateOrgSchema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: '参数无效' }, 400);

    const setData: Record<string, unknown> = { updatedAt: new Date() };
    const fields = ['name', 'logoUrl', 'industry', 'scale', 'phone', 'email', 'website', 'address', 'description'] as const;
    for (const key of fields) {
      if (parsed.data[key] !== undefined) setData[key] = parsed.data[key];
    }

    const [updated] = await db.update(organizations).set(setData)
      .where(eq(organizations.id, orgId)).returning();

    return c.json({ success: true, data: updated });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 500);
  }
});

// POST /org/seed-roles — seed default system roles (owner+admin only)
app.post('/seed-roles', requireMinRole('admin'), async (c) => {
  try {
    const { orgId } = c.get('user');
    const existing = await db.select({ id: roles.id }).from(roles)
      .where(and(eq(roles.orgId, orgId), eq(roles.isSystem, true))).limit(1);
    if (existing.length > 0) {
      return c.json({ success: true, message: '系统角色已存在' });
    }

    const defaultRoles = [
      {
        orgId, name: 'owner', description: '组织所有者，拥有全部权限', level: 100, isSystem: true,
        permissions: ALL_PERMISSIONS.map(p => p.key),
      },
      {
        orgId, name: 'admin', description: '管理员，拥有大部分管理权限', level: 80, isSystem: true,
        permissions: ALL_PERMISSIONS.map(p => p.key),
      },
      {
        orgId, name: 'agent', description: '客服/业务人员，拥有日常操作权限', level: 40, isSystem: true,
        permissions: ALL_PERMISSIONS.filter(p =>
          !p.key.startsWith('org:') && !p.key.includes(':delete')
        ).map(p => p.key),
      },
      {
        orgId, name: 'viewer', description: '只读用户，仅可查看数据', level: 10, isSystem: true,
        permissions: ALL_PERMISSIONS.filter(p => p.key.includes(':view')).map(p => p.key),
      },
    ];

    await db.insert(roles).values(defaultRoles);
    return c.json({ success: true, message: '系统角色已创建' });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 500);
  }
});

// ============================================================================
// DEPARTMENTS
// ============================================================================

const deptSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  parentId: z.string().uuid().nullable().optional(),
  leaderId: z.string().uuid().nullable().optional(),
  sort: z.number().optional(),
});

app.get('/departments', async (c) => {
  try {
    const { orgId } = c.get('user');
    const list = await db.select().from(departments)
      .where(eq(departments.orgId, orgId))
      .orderBy(departments.sort, departments.createdAt);
    const memberCounts = await db
      .select({ departmentId: users.departmentId, count: sql<number>`count(*)::int` })
      .from(users)
      .where(and(eq(users.orgId, orgId), sql`${users.departmentId} IS NOT NULL`))
      .groupBy(users.departmentId);
    const countMap = new Map(memberCounts.map(r => [r.departmentId, r.count]));
    const data = list.map(d => ({ ...d, memberCount: countMap.get(d.id) ?? 0 }));
    return c.json({ success: true, data });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 500);
  }
});

app.post('/departments', requireMinRole('admin'), async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    const parsed = deptSchema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: '参数无效' }, 400);
    const [dept] = await db.insert(departments).values({
      orgId: user.orgId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      parentId: parsed.data.parentId ?? null,
      leaderId: parsed.data.leaderId ?? null,
      sort: parsed.data.sort ?? 0,
    }).returning();
    await logAudit({ orgId: user.orgId, userId: user.sub, action: 'department.create', resourceType: 'department', resourceId: dept.id, details: { name: dept.name } });
    return c.json({ success: true, data: dept });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 500);
  }
});

app.put('/departments/:id', requireMinRole('admin'), async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = deptSchema.partial().safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: '参数无效' }, 400);
    const setData: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of ['name', 'description', 'parentId', 'leaderId', 'sort'] as const) {
      if (parsed.data[key] !== undefined) setData[key] = parsed.data[key];
    }
    const [updated] = await db.update(departments).set(setData)
      .where(and(eq(departments.id, id), eq(departments.orgId, user.orgId))).returning();
    if (!updated) return c.json({ success: false, error: '部门不存在' }, 404);
    await logAudit({ orgId: user.orgId, userId: user.sub, action: 'department.update', resourceType: 'department', resourceId: id, details: setData });
    return c.json({ success: true, data: updated });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 500);
  }
});

app.delete('/departments/:id', requireMinRole('admin'), async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');
    const [existing] = await db.select({ id: departments.id, name: departments.name })
      .from(departments).where(and(eq(departments.id, id), eq(departments.orgId, user.orgId))).limit(1);
    if (!existing) return c.json({ success: false, error: '部门不存在' }, 404);
    await db.update(users).set({ departmentId: null }).where(eq(users.departmentId, id));
    await db.update(departments).set({ parentId: null }).where(eq(departments.parentId, id));
    await db.delete(departments).where(eq(departments.id, id));
    await logAudit({ orgId: user.orgId, userId: user.sub, action: 'department.delete', resourceType: 'department', resourceId: id, details: { name: existing.name } });
    return c.json({ success: true });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 500);
  }
});

// ============================================================================
// TEAMS (Agent Groups)
// ============================================================================

const teamSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  leaderId: z.string().uuid().nullable().optional(),
});

app.get('/teams', async (c) => {
  try {
    const { orgId } = c.get('user');
    const list = await db.select().from(teams).where(eq(teams.orgId, orgId)).orderBy(teams.createdAt);
    const memberCounts = await db
      .select({ teamId: teamMembers.teamId, count: sql<number>`count(*)::int` })
      .from(teamMembers)
      .where(inArray(teamMembers.teamId, list.map(t => t.id).length > 0 ? list.map(t => t.id) : ['__none__']))
      .groupBy(teamMembers.teamId);
    const countMap = new Map(memberCounts.map(r => [r.teamId, r.count]));
    const data = list.map(t => ({ ...t, memberCount: countMap.get(t.id) ?? 0 }));
    return c.json({ success: true, data });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 500);
  }
});

app.post('/teams', requireMinRole('admin'), async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    const parsed = teamSchema.safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: '参数无效' }, 400);
    const [team] = await db.insert(teams).values({
      orgId: user.orgId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      leaderId: parsed.data.leaderId ?? null,
    }).returning();
    await logAudit({ orgId: user.orgId, userId: user.sub, action: 'team.create', resourceType: 'team', resourceId: team.id, details: { name: team.name } });
    return c.json({ success: true, data: team });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 500);
  }
});

app.put('/teams/:id', requireMinRole('admin'), async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = teamSchema.partial().safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: '参数无效' }, 400);
    const setData: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of ['name', 'description', 'leaderId'] as const) {
      if (parsed.data[key] !== undefined) setData[key] = parsed.data[key];
    }
    const [updated] = await db.update(teams).set(setData)
      .where(and(eq(teams.id, id), eq(teams.orgId, user.orgId))).returning();
    if (!updated) return c.json({ success: false, error: '团队不存在' }, 404);
    return c.json({ success: true, data: updated });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 500);
  }
});

app.delete('/teams/:id', requireMinRole('admin'), async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');
    const [existing] = await db.select({ id: teams.id, name: teams.name })
      .from(teams).where(and(eq(teams.id, id), eq(teams.orgId, user.orgId))).limit(1);
    if (!existing) return c.json({ success: false, error: '分组不存在' }, 404);
    await db.delete(teams).where(eq(teams.id, id));
    await logAudit({ orgId: user.orgId, userId: user.sub, action: 'team.delete', resourceType: 'team', resourceId: id, details: { name: existing.name } });
    return c.json({ success: true });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 500);
  }
});

// Team members
app.get('/teams/:id/members', async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');
    const list = await db
      .select({
        userId: teamMembers.userId,
        joinedAt: teamMembers.joinedAt,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
        role: users.role,
      })
      .from(teamMembers)
      .innerJoin(users, eq(teamMembers.userId, users.id))
      .where(and(eq(teamMembers.teamId, id), eq(users.orgId, user.orgId)));
    return c.json({ success: true, data: list });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 500);
  }
});

app.post('/teams/:id/members', requireMinRole('admin'), async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');
    const { userIds } = await c.req.json() as { userIds: string[] };
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return c.json({ success: false, error: '请选择成员' }, 400);
    }
    const values = userIds.map(uid => ({ teamId: id, userId: uid }));
    await db.insert(teamMembers).values(values).onConflictDoNothing();
    return c.json({ success: true });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 500);
  }
});

app.delete('/teams/:id/members/:userId', requireMinRole('admin'), async (c) => {
  try {
    const id = c.req.param('id');
    const userId = c.req.param('userId');
    await db.delete(teamMembers).where(
      and(eq(teamMembers.teamId, id), eq(teamMembers.userId, userId))
    );
    return c.json({ success: true });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 500);
  }
});

// GET /org/my-teams — get current user's team memberships with teammate IDs
app.get('/my-teams', async (c) => {
  try {
    const { sub, orgId } = c.get('user');
    const myTeamIds = await db.select({ teamId: teamMembers.teamId })
      .from(teamMembers).where(eq(teamMembers.userId, sub));
    if (myTeamIds.length === 0) return c.json({ success: true, data: { teams: [], teammateIds: [] } });

    const ids = myTeamIds.map(t => t.teamId);
    const teamList = await db.select({ id: teams.id, name: teams.name })
      .from(teams).where(and(eq(teams.orgId, orgId), inArray(teams.id, ids)));
    const teammates = await db.select({ userId: teamMembers.userId })
      .from(teamMembers).where(inArray(teamMembers.teamId, ids));
    const teammateIds = [...new Set(teammates.map(t => t.userId))];

    return c.json({ success: true, data: { teams: teamList, teammateIds } });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 500);
  }
});

// ============================================================================
// USER PERMISSIONS (for frontend permission guards)
// ============================================================================

app.get('/my-permissions', async (c) => {
  try {
    const user = c.get('user');
    const permissions = await getUserPermissions(user.orgId, user.role);
    return c.json({ success: true, data: { role: user.role, permissions } });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 500);
  }
});

// ============================================================================
// OFFLINE CONSULTATIONS
// ============================================================================

app.get('/consultations', requireMinRole('agent'), async (c) => {
  try {
    const { orgId } = c.get('user');
    const status = c.req.query('status');
    const page = Math.max(1, parseInt(c.req.query('page') || '1'));
    const pageSize = Math.min(50, Math.max(1, parseInt(c.req.query('pageSize') || '20')));
    const offset = (page - 1) * pageSize;

    const conditions = [eq(offlineConsultations.orgId, orgId)];
    if (status && status !== 'all') {
      conditions.push(eq(offlineConsultations.status, status));
    }

    const where = and(...conditions);

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(offlineConsultations)
      .where(where);

    const items = await db
      .select({
        id: offlineConsultations.id,
        name: offlineConsultations.name,
        phone: offlineConsultations.phone,
        email: offlineConsultations.email,
        content: offlineConsultations.content,
        status: offlineConsultations.status,
        handledBy: offlineConsultations.handledBy,
        handledAt: offlineConsultations.handledAt,
        remark: offlineConsultations.remark,
        createdAt: offlineConsultations.createdAt,
        conversationId: offlineConsultations.conversationId,
      })
      .from(offlineConsultations)
      .where(where)
      .orderBy(desc(offlineConsultations.createdAt))
      .offset(offset)
      .limit(pageSize);

    return c.json({ success: true, data: { items, total, page, pageSize } });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 500);
  }
});

app.put('/consultations/:id', requireMinRole('agent'), async (c) => {
  try {
    const { orgId, sub } = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = z.object({
      status: z.enum(['pending', 'processing', 'completed', 'cancelled']).optional(),
      remark: z.string().optional(),
    }).safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: '参数无效' }, 400);

    const setData: Record<string, unknown> = {};
    if (parsed.data.status) {
      setData.status = parsed.data.status;
      if (parsed.data.status === 'completed' || parsed.data.status === 'processing') {
        setData.handledBy = sub;
        setData.handledAt = new Date();
      }
    }
    if (parsed.data.remark !== undefined) setData.remark = parsed.data.remark;

    const [updated] = await db.update(offlineConsultations).set(setData)
      .where(and(eq(offlineConsultations.id, id), eq(offlineConsultations.orgId, orgId)))
      .returning();

    if (!updated) return c.json({ success: false, error: '记录不存在' }, 404);
    return c.json({ success: true, data: updated });
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Failed' }, 500);
  }
});

// GET /org/widget-config — get widget appearance config
app.get('/widget-config', async (c) => {
  try {
    const { orgId } = c.get('user');
    const [org] = await db.select({ widgetConfig: organizations.widgetConfig }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
    return c.json({ success: true, data: org?.widgetConfig ?? {} });
  } catch (e) {
    return c.json({ success: false, error: 'Failed to load config' }, 500);
  }
});

// PUT /org/widget-config — update widget appearance config
app.put('/widget-config', requireMinRole('admin'), async (c) => {
  try {
    const { orgId } = c.get('user');
    const body = await c.req.json();
    const parsed = z.object({
      themeColor: z.string().optional(),
      position: z.enum(['bottom-right', 'bottom-left']).optional(),
      greeting: z.string().optional(),
      offlineGreeting: z.string().optional(),
      logoUrl: z.string().optional(),
      companyName: z.string().optional(),
      preChatFormEnabled: z.boolean().optional(),
      preChatFormFields: z.array(z.object({
        field: z.string(),
        label: z.string(),
        required: z.boolean(),
        type: z.string(),
      })).optional(),
      postChatSurveyEnabled: z.boolean().optional(),
      showAgentAvatar: z.boolean().optional(),
      showAgentName: z.boolean().optional(),
      autoPopupDelay: z.number().min(0).optional(),
      conversationGradeRules: z.array(z.object({
        grade: z.string(),
        minMessages: z.number(),
      })).optional(),
    }).safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: 'Invalid config' }, 400);

    const [updated] = await db.update(organizations)
      .set({ widgetConfig: parsed.data as any, updatedAt: new Date() })
      .where(eq(organizations.id, orgId))
      .returning({ widgetConfig: organizations.widgetConfig });
    return c.json({ success: true, data: updated?.widgetConfig ?? {} });
  } catch (e) {
    return c.json({ success: false, error: 'Failed to save config' }, 500);
  }
});

// PUT /org/members/:id/max-chats — set agent max concurrent chat limit
app.put('/members/:id/max-chats', requireMinRole('admin'), async (c) => {
  try {
    const { orgId } = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = z.object({ maxConcurrentChats: z.number().min(0).max(999) }).safeParse(body);
    if (!parsed.success) return c.json({ success: false, error: 'Invalid value' }, 400);

    const [updated] = await db.update(users)
      .set({ maxConcurrentChats: parsed.data.maxConcurrentChats })
      .where(and(eq(users.id, id), eq(users.orgId, orgId)))
      .returning();
    if (!updated) return c.json({ success: false, error: 'User not found' }, 404);
    return c.json({ success: true, data: { id: updated.id, maxConcurrentChats: updated.maxConcurrentChats } });
  } catch (e) {
    return c.json({ success: false, error: 'Failed to update' }, 500);
  }
});

export default app;
