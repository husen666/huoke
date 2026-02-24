import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '在线客服',
  description: '在线客服聊天窗口',
}

export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  return children
}
