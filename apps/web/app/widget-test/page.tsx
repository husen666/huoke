'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function WidgetTestInner() {
  const params = useSearchParams()
  const token = params.get('token') || ''
  const color = params.get('color') || '#4F46E5'
  const position = params.get('position') || 'right'
  const title = params.get('title') || '在线客服'
  const embed = params.get('embed') === '1'

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500">缺少 token 参数</p>
      </div>
    )
  }

  const scriptSrc = `/widget.js`
  const attrs = `data-site-token="${token}" data-color="${color}" data-position="${position}" data-title="${title}" data-pre-chat="true"`

  return (
    <div className={embed ? 'min-h-full bg-gradient-to-br from-slate-50 to-white' : 'min-h-screen bg-gradient-to-br from-slate-100 to-white'}>
      {!embed && (
        <div className="max-w-2xl mx-auto pt-12 px-6 text-center">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">客服挂件测试页</h1>
          <p className="text-sm text-slate-500 mb-4">
            这是一个模拟的客户网站页面，右下角的客服气泡即为实际嵌入效果
          </p>
          <div className="text-left bg-white rounded-xl border border-slate-200 p-6 space-y-3">
            <div className="h-5 w-48 bg-slate-200 rounded" />
            <div className="h-4 w-72 bg-slate-100 rounded" />
            <div className="h-4 w-56 bg-slate-100 rounded" />
            <div className="h-32 w-full bg-slate-50 rounded-lg mt-4" />
          </div>
        </div>
      )}
      {embed && (
        <div className="p-6 space-y-3">
          <div className="h-4 w-48 bg-slate-200 rounded" />
          <div className="h-3 w-64 bg-slate-100 rounded" />
          <div className="h-3 w-40 bg-slate-100 rounded" />
          <div className="h-20 w-full bg-slate-50 rounded mt-3" />
          <p className="text-xs text-slate-400 pt-4 text-center">点击右下角气泡开始对话</p>
        </div>
      )}
      <script
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: `
            (function(){
              if(document.getElementById('huoke-widget-btn')) return;
              var s = document.createElement('script');
              s.src = '${scriptSrc}';
              s.setAttribute('data-site-token', '${token}');
              s.setAttribute('data-color', '${color}');
              s.setAttribute('data-position', '${position}');
              s.setAttribute('data-title', '${title}');
              s.setAttribute('data-pre-chat', 'true');
              document.body.appendChild(s);
            })();
          `,
        }}
      />
    </div>
  )
}

export default function WidgetTestPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p className="text-slate-400">加载中...</p></div>}>
      <WidgetTestInner />
    </Suspense>
  )
}
