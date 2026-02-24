import { Shield, ShieldCheck, UserCog, Headphones, Eye } from 'lucide-react'

export const ROLE_LABELS: Record<string, string> = {
  owner: '所有者',
  admin: '管理员',
  manager: '主管',
  agent: '客服',
  viewer: '查看者',
}

export const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-amber-100 text-amber-700',
  admin: 'bg-purple-100 text-purple-700',
  manager: 'bg-blue-100 text-blue-700',
  agent: 'bg-emerald-100 text-emerald-700',
  viewer: 'bg-slate-100 text-slate-600',
}

export const ROLE_ICONS: Record<string, typeof Shield> = {
  owner: Shield,
  admin: ShieldCheck,
  manager: UserCog,
  agent: Headphones,
  viewer: Eye,
}

export const ROLE_LEVELS: Record<string, number> = {
  owner: 100,
  admin: 80,
  manager: 60,
  agent: 40,
  viewer: 10,
}
