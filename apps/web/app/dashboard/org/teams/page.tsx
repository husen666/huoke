'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getTeams, createTeam, updateTeam, deleteTeam,
  getTeamMembers, addTeamMembers, removeTeamMember,
  getOrgMembersDetail,
  type Team, type TeamMember, type OrgMemberDetail,
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
import { ROLE_LABELS } from '@/lib/role-config'
import {
  Plus, Pencil, Trash2, Users2, Users, UserPlus, X,
  ChevronDown, ChevronRight, Crown,
} from 'lucide-react'

export default function TeamsPage() {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const [showForm, setShowForm] = useState(false)
  const [editTeam, setEditTeam] = useState<Team | null>(null)
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null)
  const [showAddMembers, setShowAddMembers] = useState<string | null>(null)

  const { data: teamsRes, isLoading } = useQuery({
    queryKey: ['org-teams'],
    queryFn: getTeams,
  })
  const teams: Team[] = teamsRes?.data ?? []

  const { data: membersRes } = useQuery({
    queryKey: ['org-members-detail'],
    queryFn: () => getOrgMembersDetail('active'),
  })
  const orgMembers: OrgMemberDetail[] = membersRes?.data ?? []

  const createMut = useMutation({
    mutationFn: createTeam,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-teams'] })
      setShowForm(false)
      toast.success('团队已创建')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '创建失败'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateTeam>[1] }) => updateTeam(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-teams'] })
      setEditTeam(null)
      toast.success('团队已更新')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '更新失败'),
  })

  const deleteMut = useMutation({
    mutationFn: deleteTeam,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-teams'] })
      toast.success('团队已删除')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '删除失败'),
  })

  const memberMap = new Map(orgMembers.map(m => [m.id, m]))

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  if (teams.length === 0 && !showForm) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">团队管理</h2>
            <p className="text-sm text-slate-500 mt-0.5">管理组织中的协作团队</p>
          </div>
          <Button variant="primary" size="sm" onClick={() => setShowForm(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            新建团队
          </Button>
        </div>
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Users2 className="h-12 w-12 text-slate-300" />
          <p className="text-slate-500">暂无团队，点击上方按钮创建第一个团队</p>
        </div>
        {showForm && (
          <TeamFormDialog
            members={orgMembers}
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
          <h2 className="text-lg font-semibold text-slate-900">团队管理</h2>
          <p className="text-sm text-slate-500 mt-0.5">管理组织中的协作团队，共 {teams.length} 个团队</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowForm(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          新建团队
        </Button>
      </div>

      <div className="grid gap-4">
        {teams.map(team => {
          const isExpanded = expandedTeam === team.id
          const leader = team.leaderId ? memberMap.get(team.leaderId) : null

          return (
            <Card key={team.id} className="overflow-hidden">
              <div className="px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shrink-0">
                    <Users2 className="h-5 w-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-slate-900">{team.name}</h3>
                      <Badge variant="default" className="gap-1">
                        <Users className="h-3 w-3" />
                        {team.memberCount ?? 0}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{team.description || '暂无描述'}</p>
                    {leader && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <Crown className="h-3 w-3 text-amber-500" />
                        <Avatar name={leader.name} src={leader.avatarUrl} size="sm" className="!h-5 !w-5 !text-[10px]" />
                        <span className="text-xs text-slate-600">{leader.name}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-4">
                  <button
                    onClick={() => setShowAddMembers(team.id)}
                    className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                    title="添加成员"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setEditTeam(team)}
                    className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                    title="编辑"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={async () => {
                      const ok = await confirm({ title: '确认删除', description: '删除团队后无法恢复，确定继续吗？', confirmText: '删除', variant: 'danger' })
                      if (!ok) return
                      deleteMut.mutate(team.id)
                    }}
                    className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                    title="删除"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setExpandedTeam(isExpanded ? null : team.id)}
                    className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
                  >
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {isExpanded && (
                <TeamMembersPanel
                  teamId={team.id}
                  onAddMembers={() => setShowAddMembers(team.id)}
                />
              )}
            </Card>
          )
        })}
      </div>

      {(showForm || editTeam) && (
        <TeamFormDialog
          team={editTeam}
          members={orgMembers}
          onClose={() => { setShowForm(false); setEditTeam(null) }}
          onSubmit={(data) => {
            if (editTeam) {
              updateMut.mutate({ id: editTeam.id, data })
            } else {
              createMut.mutate(data as Parameters<typeof createTeam>[0])
            }
          }}
          loading={createMut.isPending || updateMut.isPending}
        />
      )}

      {showAddMembers && (
        <AddMembersDialog
          teamId={showAddMembers}
          orgMembers={orgMembers}
          onClose={() => setShowAddMembers(null)}
        />
      )}
    </div>
  )
}

function TeamMembersPanel({ teamId, onAddMembers }: { teamId: string; onAddMembers: () => void }) {
  const qc = useQueryClient()
  const confirm = useConfirm()

  const { data: tmRes, isLoading } = useQuery({
    queryKey: ['team-members', teamId],
    queryFn: () => getTeamMembers(teamId),
  })
  const teamMembers: TeamMember[] = tmRes?.data ?? []

  const removeMut = useMutation({
    mutationFn: (userId: string) => removeTeamMember(teamId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team-members', teamId] })
      qc.invalidateQueries({ queryKey: ['org-teams'] })
      toast.success('成员已移除')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '移除失败'),
  })

  return (
    <div className="border-t border-slate-100 px-5 pb-4 pt-3">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-slate-500">团队成员 ({teamMembers.length})</p>
        <button
          onClick={onAddMembers}
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          <UserPlus className="h-3 w-3" />
          添加成员
        </button>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-4">
          <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : teamMembers.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-4">暂无成员</p>
      ) : (
        <div className="space-y-2">
          {teamMembers.map(tm => (
            <div key={tm.userId} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-3">
                <Avatar name={tm.name} src={tm.avatarUrl} size="sm" />
                <div>
                  <p className="text-sm font-medium text-slate-900">{tm.name}</p>
                  <p className="text-xs text-slate-400">{tm.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="default" className="text-[10px]">{ROLE_LABELS[tm.role] ?? tm.role}</Badge>
                <button
                  onClick={async () => {
                    const ok = await confirm({ title: '移除成员', description: `确定将 ${tm.name} 从团队中移除吗？`, confirmText: '移除', variant: 'danger' })
                    if (!ok) return
                    removeMut.mutate(tm.userId)
                  }}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                  title="移除"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TeamFormDialog({ team, members, onClose, onSubmit, loading }: {
  team?: Team | null
  members: OrgMemberDetail[]
  onClose: () => void
  onSubmit: (data: { name: string; description?: string; leaderId?: string | null }) => void
  loading: boolean
}) {
  const [name, setName] = useState(team?.name ?? '')
  const [description, setDescription] = useState(team?.description ?? '')
  const [leaderId, setLeaderId] = useState(team?.leaderId ?? '')

  const leaderOptions = [
    { value: '', label: '暂不设置' },
    ...members.map(m => ({ value: m.id, label: `${m.name} (${m.email})` })),
  ]

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }} title={team ? `编辑团队 — ${team.name}` : '新建团队'}>
      <form onSubmit={e => {
        e.preventDefault()
        if (!name.trim()) { toast.error('团队名称不能为空'); return }
        onSubmit({
          name: name.trim(),
          description: description.trim() || undefined,
          leaderId: leaderId || null,
        })
      }} className="space-y-4">
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">团队名称</label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="如: 客户服务一组" required />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">团队描述</label>
          <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="简要描述团队职责" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">团队负责人</label>
          <Select value={leaderId} onChange={v => setLeaderId(v)} options={leaderOptions} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" type="button" onClick={onClose}>取消</Button>
          <Button variant="primary" size="sm" type="submit" loading={loading}>
            {team ? '保存' : '创建'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function AddMembersDialog({ teamId, orgMembers, onClose }: {
  teamId: string
  orgMembers: OrgMemberDetail[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

  const { data: tmRes } = useQuery({
    queryKey: ['team-members', teamId],
    queryFn: () => getTeamMembers(teamId),
  })
  const existingIds = new Set((tmRes?.data ?? []).map((m: TeamMember) => m.userId))

  const addMut = useMutation({
    mutationFn: () => addTeamMembers(teamId, Array.from(selected)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team-members', teamId] })
      qc.invalidateQueries({ queryKey: ['org-teams'] })
      toast.success(`已添加 ${selected.size} 名成员`)
      onClose()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '添加失败'),
  })

  const availableMembers = orgMembers.filter(m => {
    if (existingIds.has(m.id)) return false
    if (!search) return true
    const q = search.toLowerCase()
    return m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
  })

  const toggleMember = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }} title="添加团队成员">
      <div className="space-y-4">
        <Input
          placeholder="搜索成员姓名或邮箱..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        <div className="max-h-64 overflow-y-auto space-y-1 rounded-lg border border-slate-200 p-2">
          {availableMembers.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">
              {search ? '没有匹配的成员' : '所有成员已在团队中'}
            </p>
          ) : (
            availableMembers.map(m => (
              <label
                key={m.id}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors',
                  selected.has(m.id) ? 'bg-primary/5 ring-1 ring-primary/20' : 'hover:bg-slate-50'
                )}
              >
                <input
                  type="checkbox"
                  checked={selected.has(m.id)}
                  onChange={() => toggleMember(m.id)}
                  className="rounded border-slate-300 text-primary focus:ring-primary"
                />
                <Avatar name={m.name} src={m.avatarUrl} size="sm" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{m.name}</p>
                  <p className="text-xs text-slate-400 truncate">{m.email}</p>
                </div>
              </label>
            ))
          )}
        </div>

        {selected.size > 0 && (
          <p className="text-xs text-slate-500">
            已选择 <span className="font-medium text-primary">{selected.size}</span> 名成员
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" type="button" onClick={onClose}>取消</Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => addMut.mutate()}
            loading={addMut.isPending}
            disabled={selected.size === 0}
          >
            添加 {selected.size > 0 ? `(${selected.size})` : ''}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
