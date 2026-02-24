'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getOrgMembersDetail, getConversations, getTeams, type OrgMemberDetail, type Conversation, type Team } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { Select } from '@/components/ui/select'
import { LoadingPage } from '@/components/ui/loading'
import { cn } from '@/lib/utils'
import {
  Users, Search, Circle, MessageSquare, CheckCircle,
  Star, TrendingUp, BarChart3, Headphones, AlertTriangle,
} from 'lucide-react'

const ROLE_CONFIG: Record<string, { label: string; variant: 'primary' | 'default' | 'success' | 'warning' }> = {
  owner: { label: '所有者', variant: 'primary' },
  admin: { label: '管理员', variant: 'primary' },
  agent: { label: '客服', variant: 'success' },
  viewer: { label: '只读', variant: 'default' },
}

export default function AgentsPage() {
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card')
  const [teamFilter, setTeamFilter] = useState<string>('all')

  const { data: membersRes, isLoading: membersLoading, isError: membersError } = useQuery({
    queryKey: ['org-members-detail'],
    queryFn: () => getOrgMembersDetail(),
  })
  const members: OrgMemberDetail[] = membersRes?.data ?? []

  const { data: convsRes, isError: convsError } = useQuery({
    queryKey: ['all-convs-for-agents'],
    queryFn: () => getConversations({ pageSize: '200' }),
    staleTime: 60_000,
  })
  const allConvs: Conversation[] = convsRes?.data ?? []

  const { data: teamsRes } = useQuery({ queryKey: ['teams'], queryFn: getTeams })
  const teamList: Team[] = teamsRes?.data ?? []

  const agentData = useMemo(() => members
    .filter(m => m.role !== 'viewer')
    .filter(m => !search || m.name?.toLowerCase().includes(search.toLowerCase()) || m.email.toLowerCase().includes(search.toLowerCase()))
    .filter(m => {
      if (teamFilter === 'all') return true
      if (teamFilter === '__none__') return !m.teams || m.teams.length === 0
      return m.teams?.some(t => t.id === teamFilter)
    })
    .map(m => {
      const myConvs = allConvs.filter(c => c.agentId === m.id)
      const active = myConvs.filter(c => c.status === 'active' || c.status === 'pending').length
      const resolved = myConvs.filter(c => c.status === 'resolved').length
      const total = myConvs.length
      const rated = myConvs.filter(c => c.satisfactionScore != null)
      const avgSat = rated.length > 0 ? rated.reduce((s, c) => s + (c.satisfactionScore ?? 0), 0) / rated.length : 0
      return { ...m, active, resolved, total, avgSat, rated: rated.length }
    }), [members, allConvs, search, teamFilter])

  const { totalActive, totalResolved, totalConvs } = useMemo(() => ({
    totalActive: agentData.reduce((s, a) => s + a.active, 0),
    totalResolved: agentData.reduce((s, a) => s + a.resolved, 0),
    totalConvs: agentData.reduce((s, a) => s + a.total, 0),
  }), [agentData])

  if (membersLoading) return <LoadingPage />

  if (membersError || convsError) return (
    <div className="flex flex-col items-center justify-center h-64 text-red-500">
      <AlertTriangle className="h-8 w-8 mb-2" />
      <p>数据加载失败，请刷新重试</p>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">客服管理</h2>
          <p className="text-sm text-slate-500 mt-0.5">管理客服团队成员和工作负载</p>
        </div>
      </div>

      {/* Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MiniStat icon={<Users className="h-5 w-5" />} label="客服人数" value={agentData.length} color="text-blue-600" bg="bg-blue-50" />
        <MiniStat icon={<Headphones className="h-5 w-5" />} label="服务中" value={totalActive} color="text-green-600" bg="bg-green-50" />
        <MiniStat icon={<CheckCircle className="h-5 w-5" />} label="已解决" value={totalResolved} color="text-emerald-600" bg="bg-emerald-50" />
        <MiniStat icon={<MessageSquare className="h-5 w-5" />} label="总会话" value={totalConvs} color="text-purple-600" bg="bg-purple-50" />
      </div>

      {/* Search + View */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="搜索客服姓名或邮箱..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white pl-10 pr-4 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
          />
        </div>
        {teamList.length > 0 && (
          <div className="w-[150px]">
            <Select
              value={teamFilter}
              onChange={v => setTeamFilter(v)}
              options={[
                { value: 'all', label: '全部团队' },
                { value: '__none__', label: '未分配团队' },
                ...teamList.map(t => ({ value: t.id, label: t.name })),
              ]}
            />
          </div>
        )}
        <div className="flex rounded-lg border border-slate-200 overflow-hidden ml-auto">
          <button
            onClick={() => setViewMode('card')}
            className={cn('px-3 py-2 text-sm', viewMode === 'card' ? 'bg-primary text-white' : 'bg-white text-slate-600')}
            title="卡片视图"
          >
            <BarChart3 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={cn('px-3 py-2 text-sm', viewMode === 'table' ? 'bg-primary text-white' : 'bg-white text-slate-600')}
            title="列表视图"
          >
            <Users className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Agent List */}
      {agentData.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500">暂无客服成员</p>
          </CardContent>
        </Card>
      ) : viewMode === 'card' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agentData.map(agent => (
            <Card key={agent.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start gap-3 mb-4">
                  <div className="relative">
                    <Avatar name={agent.name ?? agent.email} size="md" />
                    <span className={cn(
                      'absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white',
                      agent.onlineStatus === 'online' ? 'bg-green-500' : agent.onlineStatus === 'away' ? 'bg-amber-500' : agent.onlineStatus === 'busy' ? 'bg-red-500' : 'bg-slate-300'
                    )} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{agent.name || '未命名'}</p>
                    <p className="text-xs text-slate-500 truncate">{agent.email}</p>
                    <div className="flex flex-wrap items-center gap-1 mt-1">
                      <Badge variant={ROLE_CONFIG[agent.role]?.variant ?? 'default'} className="text-[10px]">
                        {ROLE_CONFIG[agent.role]?.label ?? agent.role}
                      </Badge>
                      {agent.departmentName && (
                        <span className="text-[10px] bg-blue-50 text-blue-600 border border-blue-200 rounded px-1.5 py-0.5">{agent.departmentName}</span>
                      )}
                    </div>
                    {agent.teams && agent.teams.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {agent.teams.map(t => (
                          <span key={t.id} className="text-[10px] bg-violet-50 text-violet-600 border border-violet-200 rounded px-1.5 py-0.5">{t.name}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-100">
                  <div className="text-center">
                    <p className="text-lg font-bold text-blue-600">{agent.active}</p>
                    <p className="text-[10px] text-slate-500">服务中</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-green-600">{agent.resolved}</p>
                    <p className="text-[10px] text-slate-500">已解决</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-0.5">
                      <Star className={cn('h-3.5 w-3.5', agent.avgSat >= 4 ? 'text-amber-400 fill-amber-400' : 'text-slate-300')} />
                      <p className="text-lg font-bold text-slate-700">{agent.avgSat > 0 ? agent.avgSat.toFixed(1) : '-'}</p>
                    </div>
                    <p className="text-[10px] text-slate-500">满意度</p>
                  </div>
                </div>

                {agent.total > 0 && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                      <span>解决率</span>
                      <span className="font-medium text-slate-700">{Math.round((agent.resolved / agent.total) * 100)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-green-500 transition-all"
                        style={{ width: `${(agent.resolved / agent.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                <p className="text-[10px] text-slate-400 mt-3">
                  加入时间: {new Date(agent.createdAt).toLocaleDateString('zh-CN')}
                  {agent.rated > 0 && ` · ${agent.rated} 条评价`}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-3 font-medium text-slate-500">客服</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500">角色</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500 hidden md:table-cell">部门 / 团队</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-500">服务中</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-500">已解决</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-500">总会话</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-500">解决率</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-500">满意度</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {agentData.map(agent => {
                    const rate = agent.total > 0 ? Math.round((agent.resolved / agent.total) * 100) : 0
                    return (
                      <tr key={agent.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Avatar name={agent.name ?? agent.email} size="sm" />
                            <div>
                              <p className="font-medium text-slate-700">{agent.name || '未命名'}</p>
                              <p className="text-xs text-slate-400">{agent.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={ROLE_CONFIG[agent.role]?.variant ?? 'default'} className="text-[10px]">
                            {ROLE_CONFIG[agent.role]?.label ?? agent.role}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <div className="space-y-1">
                            {agent.departmentName && <span className="block text-xs text-blue-600">{agent.departmentName}</span>}
                            {agent.teams && agent.teams.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {agent.teams.map(t => (
                                  <span key={t.id} className="text-[10px] bg-violet-50 text-violet-600 rounded px-1.5 py-0.5">{t.name}</span>
                                ))}
                              </div>
                            )}
                            {!agent.departmentName && (!agent.teams || agent.teams.length === 0) && <span className="text-xs text-slate-300">—</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-blue-600">{agent.active}</td>
                        <td className="px-4 py-3 text-right font-medium text-green-600">{agent.resolved}</td>
                        <td className="px-4 py-3 text-right font-medium">{agent.total}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={cn('font-medium', rate >= 80 ? 'text-green-600' : rate >= 50 ? 'text-amber-600' : 'text-slate-400')}>
                            {agent.total > 0 ? `${rate}%` : '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Star className={cn('h-3.5 w-3.5', agent.avgSat >= 4 ? 'text-amber-400 fill-amber-400' : 'text-slate-300')} />
                            <span className="font-medium">{agent.avgSat > 0 ? agent.avgSat.toFixed(1) : '-'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <Circle className={cn('h-2 w-2 fill-current', agent.onlineStatus === 'online' ? 'text-green-500' : agent.onlineStatus === 'away' ? 'text-amber-500' : agent.onlineStatus === 'busy' ? 'text-red-500' : 'text-slate-300')} />
                            <span className="text-xs">{agent.onlineStatus === 'online' ? '在线' : agent.onlineStatus === 'away' ? '离开' : agent.onlineStatus === 'busy' ? '忙碌' : '离线'}</span>
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
      )}

      {/* Workload Distribution */}
      {agentData.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> 工作负载分布
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(() => {
                const sorted = [...agentData].sort((a, b) => b.active - a.active)
                const maxActive = Math.max(...agentData.map(a => a.active), 1)
                return sorted.map(agent => (
                    <div key={agent.id} className="flex items-center gap-3">
                      <Avatar name={agent.name ?? agent.email} size="sm" />
                      <span className="text-sm font-medium w-24 truncate">{agent.name || '未命名'}</span>
                      <div className="flex-1 h-6 rounded-full bg-slate-100 overflow-hidden flex">
                        <div
                          className="h-full bg-blue-500 rounded-l flex items-center justify-end px-2"
                          style={{ width: `${maxActive > 0 ? (agent.active / maxActive) * 100 : 0}%`, minWidth: agent.active > 0 ? '40px' : '0' }}
                        >
                          {agent.active > 0 && <span className="text-[10px] text-white font-medium">{agent.active}</span>}
                        </div>
                        {agent.resolved > 0 && (
                          <div
                            className="h-full bg-green-400 flex items-center justify-end px-2"
                            style={{ width: `${maxActive > 0 ? (agent.resolved / (maxActive * 3)) * 100 : 0}%`, minWidth: '40px' }}
                          >
                            <span className="text-[10px] text-white font-medium">{agent.resolved}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
              })()}
            </div>
            <div className="flex items-center gap-6 mt-3 justify-center text-xs text-slate-500">
              <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-blue-500" /> 服务中</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-green-400" /> 已解决</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function MiniStat({ icon, label, value, color, bg }: { icon: React.ReactNode; label: string; value: number; color: string; bg: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn('p-2.5 rounded-xl', bg, color)}>{icon}</div>
        <div>
          <p className="text-xs text-slate-500">{label}</p>
          <p className="text-2xl font-bold text-slate-800">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}
