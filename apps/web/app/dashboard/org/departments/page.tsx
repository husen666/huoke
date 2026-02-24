'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getDepartments, createDepartment, updateDepartment, deleteDepartment,
  getOrgMembersDetail,
  type Department, type OrgMemberDetail,
} from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog } from '@/components/ui/dialog'
import { Select } from '@/components/ui/select'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Plus, Pencil, Trash2, Building2, Users, ChevronRight, ChevronDown, FolderTree,
} from 'lucide-react'

interface DeptNode extends Department {
  children: DeptNode[]
  depth: number
}

function buildTree(departments: Department[]): DeptNode[] {
  const map = new Map<string, DeptNode>()
  const roots: DeptNode[] = []

  departments.forEach(d => map.set(d.id, { ...d, children: [], depth: 0 }))

  map.forEach(node => {
    if (node.parentId && map.has(node.parentId)) {
      const parent = map.get(node.parentId)!
      node.depth = parent.depth + 1
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  })

  const sortNodes = (nodes: DeptNode[]) => {
    nodes.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
    nodes.forEach(n => sortNodes(n.children))
  }
  sortNodes(roots)
  return roots
}

function flattenTree(nodes: DeptNode[], expanded: Set<string>): DeptNode[] {
  const result: DeptNode[] = []
  const walk = (list: DeptNode[]) => {
    list.forEach(node => {
      result.push(node)
      if (node.children.length > 0 && expanded.has(node.id)) {
        walk(node.children)
      }
    })
  }
  walk(nodes)
  return result
}

export default function DepartmentsPage() {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const [showForm, setShowForm] = useState(false)
  const [editDept, setEditDept] = useState<Department | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const { data: deptRes, isLoading } = useQuery({
    queryKey: ['org-departments'],
    queryFn: getDepartments,
  })
  const departments: Department[] = deptRes?.data ?? []

  const { data: membersRes } = useQuery({
    queryKey: ['org-members-detail'],
    queryFn: () => getOrgMembersDetail('active'),
  })
  const members: OrgMemberDetail[] = membersRes?.data ?? []

  const createMut = useMutation({
    mutationFn: createDepartment,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-departments'] })
      setShowForm(false)
      toast.success('部门已创建')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '创建失败'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateDepartment>[1] }) => updateDepartment(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-departments'] })
      setEditDept(null)
      toast.success('部门已更新')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '更新失败'),
  })

  const deleteMut = useMutation({
    mutationFn: deleteDepartment,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-departments'] })
      toast.success('部门已删除')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '删除失败'),
  })

  const tree = buildTree(departments)
  const flat = flattenTree(tree, expanded)
  const memberMap = new Map(members.map(m => [m.id, m]))

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const expandAll = () => {
    setExpanded(new Set(departments.filter(d => departments.some(c => c.parentId === d.id)).map(d => d.id)))
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  if (departments.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">部门管理</h2>
            <p className="text-sm text-slate-500 mt-0.5">管理组织的部门架构</p>
          </div>
          <Button variant="primary" size="sm" onClick={() => setShowForm(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            新建部门
          </Button>
        </div>
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Building2 className="h-12 w-12 text-slate-300" />
          <p className="text-slate-500">暂无部门，点击上方按钮创建第一个部门</p>
        </div>
        {showForm && (
          <DeptFormDialog
            departments={departments}
            members={members}
            onClose={() => setShowForm(false)}
            onSubmit={(data) => createMut.mutate(data)}
            loading={createMut.isPending}
          />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">部门管理</h2>
          <p className="text-sm text-slate-500 mt-0.5">管理组织的部门架构，共 {departments.length} 个部门</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={expandAll} className="gap-1.5 text-slate-500">
            <FolderTree className="h-4 w-4" />
            展开全部
          </Button>
          <Button variant="primary" size="sm" onClick={() => setShowForm(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            新建部门
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">部门名称</th>
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3 hidden md:table-cell">描述</th>
                  <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">负责人</th>
                  <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">成员数</th>
                  <th className="text-right text-xs font-medium text-slate-500 px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {flat.map(node => {
                  const hasChildren = node.children.length > 0
                  const isExpanded = expanded.has(node.id)
                  const leader = node.leaderId ? memberMap.get(node.leaderId) : null

                  return (
                    <tr key={node.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1" style={{ paddingLeft: `${node.depth * 24}px` }}>
                          {hasChildren ? (
                            <button
                              onClick={() => toggleExpand(node.id)}
                              className="p-0.5 rounded hover:bg-slate-100 text-slate-400 transition-colors"
                            >
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                          ) : (
                            <span className="w-5" />
                          )}
                          <div className={cn(
                            'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                            node.depth === 0 ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-500'
                          )}>
                            <Building2 className="h-3.5 w-3.5" />
                          </div>
                          <span className="text-sm font-medium text-slate-900 ml-1.5">{node.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-xs text-slate-500 line-clamp-1">{node.description || '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        {leader ? (
                          <div className="flex items-center gap-2">
                            <Avatar name={leader.name} src={leader.avatarUrl} size="sm" />
                            <span className="text-sm text-slate-700">{leader.name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">未设置</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant="default" className="gap-1">
                          <Users className="h-3 w-3" />
                          {node.memberCount}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setEditDept(node)}
                            className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                            title="编辑"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={async () => {
                              const hasChildDepts = departments.some(d => d.parentId === node.id)
                              const msg = hasChildDepts
                                ? '该部门下有子部门，删除后子部门将变为顶级部门。确定继续吗？'
                                : '删除后无法恢复，确定继续吗？'
                              const ok = await confirm({ title: '确认删除', description: msg, confirmText: '删除', variant: 'danger' })
                              if (!ok) return
                              deleteMut.mutate(node.id)
                            }}
                            className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                            title="删除"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {(showForm || editDept) && (
        <DeptFormDialog
          dept={editDept}
          departments={departments}
          members={members}
          onClose={() => { setShowForm(false); setEditDept(null) }}
          onSubmit={(data) => {
            if (editDept) {
              updateMut.mutate({ id: editDept.id, data })
            } else {
              createMut.mutate(data as Parameters<typeof createDepartment>[0])
            }
          }}
          loading={createMut.isPending || updateMut.isPending}
        />
      )}
    </div>
  )
}

function DeptFormDialog({ dept, departments, members, onClose, onSubmit, loading }: {
  dept?: Department | null
  departments: Department[]
  members: OrgMemberDetail[]
  onClose: () => void
  onSubmit: (data: { name: string; description?: string; parentId?: string | null; leaderId?: string | null; sort?: number }) => void
  loading: boolean
}) {
  const [name, setName] = useState(dept?.name ?? '')
  const [description, setDescription] = useState(dept?.description ?? '')
  const [parentId, setParentId] = useState(dept?.parentId ?? '')
  const [leaderId, setLeaderId] = useState(dept?.leaderId ?? '')
  const [sort, setSort] = useState(dept?.sort ?? 0)

  const parentOptions = [
    { value: '', label: '无（顶级部门）' },
    ...departments
      .filter(d => d.id !== dept?.id)
      .map(d => ({ value: d.id, label: d.name })),
  ]

  const leaderOptions = [
    { value: '', label: '暂不设置' },
    ...members.map(m => ({ value: m.id, label: `${m.name} (${m.email})` })),
  ]

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }} title={dept ? `编辑部门 — ${dept.name}` : '新建部门'}>
      <form onSubmit={e => {
        e.preventDefault()
        if (!name.trim()) { toast.error('部门名称不能为空'); return }
        onSubmit({
          name: name.trim(),
          description: description.trim() || undefined,
          parentId: parentId || null,
          leaderId: leaderId || null,
          sort,
        })
      }} className="space-y-4">
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">部门名称</label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="如: 技术部" required />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">部门描述</label>
          <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="简要描述部门职责" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">上级部门</label>
            <Select value={parentId} onChange={v => setParentId(v)} options={parentOptions} />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">排序权重</label>
            <Input type="number" min={0} value={sort} onChange={e => setSort(Number(e.target.value))} />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">部门负责人</label>
          <Select value={leaderId} onChange={v => setLeaderId(v)} options={leaderOptions} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" type="button" onClick={onClose}>取消</Button>
          <Button variant="primary" size="sm" type="submit" loading={loading}>
            {dept ? '保存' : '创建'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
