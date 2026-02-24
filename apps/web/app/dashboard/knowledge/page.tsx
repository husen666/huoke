'use client'

import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getKnowledgeBases,
  getKnowledgeBase,
  createKnowledgeBase,
  createDocument,
  queryKnowledge,
  deleteKnowledgeBase,
  deleteDocument,
  getFaqs,
  createFaq,
  updateFaq,
  deleteFaq,
  uploadDocument,
  type KnowledgeBase,
  type KBDocument,
} from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { LoadingPage } from '@/components/ui/loading'
import { Plus, FileText, BookOpen, Sparkles, Send, Bot, Trash2, HelpCircle, Eye, Search, Pencil, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { usePlan, UpgradeBanner, handlePlanError } from '@/components/plan-guard'

const statusLabel: Record<string, string> = {
  pending: '待处理', processing: '处理中', completed: '已处理', failed: '失败',
}
const statusVariant: Record<string, 'success' | 'warning' | 'default' | 'danger'> = {
  completed: 'success', processing: 'warning', pending: 'default', failed: 'danger',
}

export default function KnowledgePage() {
  const queryClient = useQueryClient()
  const { isAtLimit } = usePlan()
  const [selectedBaseId, setSelectedBaseId] = useState<string | null>(null)
  const [showCreateKb, setShowCreateKb] = useState(false)
  const [showCreateDoc, setShowCreateDoc] = useState(false)
  const [previewDoc, setPreviewDoc] = useState<KBDocument | null>(null)
  const [showCreateFaq, setShowCreateFaq] = useState(false)
  const [activeTab, setActiveTab] = useState<'docs' | 'faqs'>('docs')
  const [deleteKbTarget, setDeleteKbTarget] = useState<string | null>(null)
  const [deleteDocTarget, setDeleteDocTarget] = useState<string | null>(null)
  const [question, setQuestion] = useState('')
  const [aiAnswer, setAiAnswer] = useState<string | null>(null)
  const [docSearch, setDocSearch] = useState('')
  const [editFaq, setEditFaq] = useState<{ id: string; question: string; answer: string; category?: string } | null>(null)

  const { data: kbRes, isLoading: kbLoading, isError: kbError } = useQuery({
    queryKey: ['knowledge-bases'],
    queryFn: () => getKnowledgeBases(),
    staleTime: 5 * 60_000,
  })
  const bases: KnowledgeBase[] = kbRes?.data ?? []

  const selectedId = selectedBaseId ?? bases[0]?.id ?? null

  const { data: kbDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['knowledge-base', selectedId],
    queryFn: () => getKnowledgeBase(selectedId!),
    enabled: !!selectedId,
    staleTime: 2 * 60_000,
  })

  const currentKb = kbDetail?.data as (KnowledgeBase & { documents: KBDocument[] }) | undefined
  const docs = currentKb?.documents ?? []
  const filteredDocs = useMemo(() =>
    docs.filter(d => !docSearch || d.title.toLowerCase().includes(docSearch.toLowerCase())),
    [docs, docSearch]
  )

  const deleteKbMut = useMutation({
    mutationFn: (id: string) => deleteKnowledgeBase(id),
    onSuccess: () => {
      toast.success('删除成功')
      setDeleteKbTarget(null)
      setSelectedBaseId(null)
      queryClient.invalidateQueries({ queryKey: ['knowledge-bases'] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '操作失败'),
  })

  const deleteDocMut = useMutation({
    mutationFn: ({ kbId, docId }: { kbId: string; docId: string }) => deleteDocument(kbId, docId),
    onSuccess: () => {
      toast.success('文档删除成功')
      queryClient.invalidateQueries({ queryKey: ['knowledge-base', selectedId] })
      queryClient.invalidateQueries({ queryKey: ['knowledge-bases'] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '操作失败'),
  })

  const queryMutation = useMutation({
    mutationFn: ({ kbId, q }: { kbId: string; q: string }) => queryKnowledge(kbId, q),
    onSuccess: (res) => {
      toast.success('查询成功')
      setAiAnswer(res.data?.answer ?? '无法回答')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '操作失败'),
  })

  const handleAsk = () => {
    if (!question.trim() || !selectedId) return
    setAiAnswer(null)
    queryMutation.mutate({ kbId: selectedId, q: question.trim() })
  }

  return (
    <div className="space-y-6">
      {isAtLimit('knowledgeBases') && <UpgradeBanner resource="knowledgeBases" label="知识库数量" />}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">知识库</h1>
          <p className="text-sm text-muted-foreground mt-0.5">管理知识库、文档和FAQ，支持 AI 智能检索</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" onClick={() => setShowCreateKb(true)}>
            <Plus className="h-4 w-4" />
            新建知识库
          </Button>
          {selectedId && (
            <Button variant="primary" onClick={() => setShowCreateDoc(true)}>
              <FileText className="h-4 w-4" />
              添加文档
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar */}
        <div className="w-full lg:w-60 shrink-0">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                知识库列表
                {bases.length > 0 && <Badge variant="outline" className="text-[10px] ml-auto">{bases.length}</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {kbLoading ? (
                <div className="p-4"><LoadingPage /></div>
              ) : kbError ? (
                <div className="p-4 text-center text-sm text-red-500">
                  <AlertTriangle className="h-6 w-6 mx-auto mb-2 text-red-400" />
                  加载失败，请刷新重试
                </div>
              ) : bases.length === 0 ? (
                <div className="p-6 text-center">
                  <BookOpen className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm text-slate-500">暂无知识库</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowCreateKb(true)}>
                    <Plus className="h-3.5 w-3.5" /> 创建第一个
                  </Button>
                </div>
              ) : (
                <ul className="py-1">
                  {bases.map((b) => (
                    <li key={b.id}>
                      <div className={cn(
                        'flex items-center justify-between px-3 py-2.5 mx-1 rounded-lg text-sm transition-all cursor-pointer group',
                        selectedId === b.id
                          ? 'bg-primary/10 text-primary shadow-sm'
                          : 'hover:bg-slate-50 text-slate-700'
                      )}>
                        <button onClick={() => setSelectedBaseId(b.id)} className="flex-1 text-left min-w-0">
                          <p className="truncate font-medium">{b.name}</p>
                          <p className={cn('text-xs mt-0.5', selectedId === b.id ? 'text-primary/60' : 'text-slate-400')}>
                            {b.documentCount ?? 0} 篇文档
                          </p>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteKbTarget(b.id) }}
                          className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 p-1 shrink-0 rounded-md hover:bg-red-50 transition-all"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Main area */}
        <div className="flex-1 space-y-6">
          {/* AI Question */}
          {selectedId && (
            <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.02] to-transparent">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <div className="rounded-lg bg-primary/10 p-1.5">
                    <Sparkles className="h-4 w-4 text-primary" />
                  </div>
                  AI 智能问答
                  <span className="text-xs font-normal text-slate-400 ml-1">基于知识库内容回答</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2 items-center">
                  <Input
                    placeholder="输入问题，AI 将基于知识库回答..."
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAsk() }}
                    className="flex-1 min-w-0"
                  />
                  <Button variant="primary" onClick={handleAsk} loading={queryMutation.isPending} className="shrink-0 whitespace-nowrap">
                    <Send className="h-4 w-4" />
                    提问
                  </Button>
                </div>
                {aiAnswer && (
                  <div className="mt-4 rounded-xl bg-white border border-primary/20 p-4 shadow-sm">
                    <div className="flex items-center gap-1.5 mb-2 text-sm font-medium text-primary">
                      <Bot className="h-4 w-4" />
                      AI 回答
                    </div>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{aiAnswer}</p>
                  </div>
                )}
                {queryMutation.error && (
                  <p className="mt-2 text-sm text-red-600">
                    {queryMutation.error instanceof Error ? queryMutation.error.message : '查询失败'}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Tabs */}
          {selectedId && (
            <div className="flex gap-1 border-b border-slate-200">
              <button
                onClick={() => setActiveTab('docs')}
                className={cn('flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
                  activeTab === 'docs' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'
                )}
              >
                <FileText className="h-4 w-4" />
                文档
                {docs.length > 0 && <span className={cn('text-xs rounded-full px-1.5 py-0.5', activeTab === 'docs' ? 'bg-primary/10' : 'bg-slate-100')}>{docs.length}</span>}
              </button>
              <button
                onClick={() => setActiveTab('faqs')}
                className={cn('flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
                  activeTab === 'faqs' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'
                )}
              >
                <HelpCircle className="h-4 w-4" />
                FAQ
              </button>
            </div>
          )}

          {/* FAQ list */}
          {selectedId && activeTab === 'faqs' && (
            <FaqSection
              kbId={selectedId}
              onCreateFaq={() => setShowCreateFaq(true)}
              onEditFaq={(faq) => { setEditFaq(faq); setShowCreateFaq(true) }}
            />
          )}

          {/* Document list */}
          {activeTab === 'docs' && <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                文档列表
                {docs.length > 0 && <span className="text-xs font-normal text-slate-400">({filteredDocs.length}/{docs.length})</span>}
              </CardTitle>
              {selectedId && docs.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => setShowCreateDoc(true)}>
                  <Plus className="h-3.5 w-3.5" /> 添加文档
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {!selectedId ? (
                <div className="py-16 text-center">
                  <BookOpen className="h-12 w-12 text-slate-200 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium">请选择知识库</p>
                  <p className="text-sm text-slate-400 mt-1">从左侧列表选择一个知识库查看文档</p>
                </div>
              ) : detailLoading ? (
                <div className="py-12"><LoadingPage /></div>
              ) : docs.length === 0 ? (
                <div className="py-16 text-center">
                  <FileText className="h-12 w-12 text-slate-200 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium">暂无文档</p>
                  <p className="text-sm text-slate-400 mt-1">添加文档后 AI 可基于文档内容回答问题</p>
                  <Button variant="outline" className="mt-4" onClick={() => setShowCreateDoc(true)}>
                    <Plus className="h-4 w-4" />
                    添加第一个文档
                  </Button>
                </div>
              ) : (
                <>
                  {docs.length > 3 && (
                    <div className="mb-4">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                          placeholder="按标题搜索文档..."
                          value={docSearch}
                          onChange={(e) => setDocSearch(e.target.value)}
                          className="pl-9"
                        />
                      </div>
                    </div>
                  )}
                  {filteredDocs.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-6">未找到匹配的文档</p>
                  ) : (
                    <ul className="space-y-2">
                      {filteredDocs.map((d) => (
                        <li
                          key={d.id}
                          className="flex items-center gap-3 rounded-lg border border-slate-200/80 p-3 hover:bg-slate-50/80 hover:border-slate-300/80 transition-all group"
                        >
                          <div className={cn(
                            'h-10 w-10 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold uppercase',
                            d.fileType === 'pdf' ? 'bg-red-50 text-red-500'
                              : d.fileType === 'docx' || d.fileType === 'doc' ? 'bg-blue-50 text-blue-500'
                              : d.fileType === 'md' ? 'bg-slate-100 text-slate-600'
                              : d.fileType === 'csv' ? 'bg-green-50 text-green-600'
                              : d.fileType === 'json' ? 'bg-amber-50 text-amber-600'
                              : 'bg-slate-50 text-slate-400'
                          )}>
                            {d.fileType ? d.fileType.slice(0, 4) : <FileText className="h-5 w-5" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate text-sm">{d.title}</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {new Date(d.createdAt).toLocaleDateString('zh-CN')}
                              {d.chunkCount != null && d.chunkCount > 0 && ` · ${d.chunkCount} 个分块`}
                            </p>
                          </div>
                          <Badge variant={statusVariant[d.processingStatus] ?? 'default'}>
                            {statusLabel[d.processingStatus] ?? d.processingStatus}
                          </Badge>
                          <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="sm" onClick={() => setPreviewDoc(d)} title="预览">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500 hover:text-red-600"
                              onClick={() => setDeleteDocTarget(d.id)}
                              title="删除"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </CardContent>
          </Card>}
        </div>
      </div>

      {/* Document preview dialog */}
      <Dialog open={!!previewDoc} onOpenChange={() => setPreviewDoc(null)} title={previewDoc?.title ?? '文档预览'}>
        {previewDoc && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Badge variant="outline">{previewDoc.fileType || '文本'}</Badge>
              {previewDoc.chunkCount != null && (
                <span className="text-slate-500">{previewDoc.chunkCount} 个分块</span>
              )}
              <Badge variant={statusVariant[previewDoc.processingStatus] ?? 'default'}>
                {statusLabel[previewDoc.processingStatus] ?? previewDoc.processingStatus}
              </Badge>
              <span className="text-slate-400 text-xs ml-auto">
                {new Date(previewDoc.createdAt).toLocaleDateString('zh-CN')}
              </span>
            </div>
            <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50 p-4">
              <pre className="whitespace-pre-wrap text-sm text-slate-700 font-sans leading-relaxed">
                {previewDoc.content || '暂无内容'}
              </pre>
            </div>
          </div>
        )}
      </Dialog>

      {/* Create KB dialog */}
      <CreateKbDialog
        open={showCreateKb}
        onClose={() => setShowCreateKb(false)}
        onSuccess={() => {
          setShowCreateKb(false)
          queryClient.invalidateQueries({ queryKey: ['knowledge-bases'] })
        }}
      />

      {/* Create document dialog */}
      {selectedId && (
        <CreateDocDialog
          open={showCreateDoc}
          kbId={selectedId}
          onClose={() => setShowCreateDoc(false)}
          onSuccess={() => {
            setShowCreateDoc(false)
            queryClient.invalidateQueries({ queryKey: ['knowledge-base', selectedId] })
            queryClient.invalidateQueries({ queryKey: ['knowledge-bases'] })
          }}
        />
      )}

      {/* Create / Edit FAQ dialog */}
      {selectedId && (
        <CreateFaqDialog
          open={showCreateFaq}
          kbId={selectedId}
          editFaq={editFaq}
          onClose={() => { setShowCreateFaq(false); setEditFaq(null) }}
          onSuccess={() => {
            setShowCreateFaq(false)
            setEditFaq(null)
            queryClient.invalidateQueries({ queryKey: ['faqs', selectedId] })
          }}
        />
      )}

      {/* Delete KB confirmation */}
      <Dialog open={!!deleteKbTarget} onOpenChange={() => setDeleteKbTarget(null)} title="删除知识库">
        <div className="flex items-start gap-3 mb-4">
          <div className="shrink-0 h-10 w-10 rounded-full bg-red-50 flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-red-500" />
          </div>
          <div>
            <p className="text-sm text-slate-700 font-medium">确定要删除该知识库吗？</p>
            <p className="text-sm text-slate-500 mt-1">此操作将同时删除所有关联文档和 FAQ，不可恢复。</p>
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeleteKbTarget(null)}>取消</Button>
          <Button variant="danger" onClick={() => deleteKbTarget && deleteKbMut.mutate(deleteKbTarget)} loading={deleteKbMut.isPending}>确认删除</Button>
        </div>
      </Dialog>

      {/* Delete document confirmation */}
      <Dialog open={!!deleteDocTarget} onOpenChange={() => setDeleteDocTarget(null)} title="删除文档">
        <div className="flex items-start gap-3 mb-4">
          <div className="shrink-0 h-10 w-10 rounded-full bg-red-50 flex items-center justify-center">
            <Trash2 className="h-5 w-5 text-red-500" />
          </div>
          <div>
            <p className="text-sm text-slate-700 font-medium">确定要删除该文档吗？</p>
            <p className="text-sm text-slate-500 mt-1">文档及其分块数据将被永久删除，不可恢复。</p>
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeleteDocTarget(null)}>取消</Button>
          <Button
            variant="danger"
            loading={deleteDocMut.isPending}
            onClick={() => {
              if (deleteDocTarget && selectedId) {
                deleteDocMut.mutate({ kbId: selectedId, docId: deleteDocTarget }, {
                  onSuccess: () => setDeleteDocTarget(null),
                })
              }
            }}
          >
            确认删除
          </Button>
        </div>
      </Dialog>
    </div>
  )
}

function CreateKbDialog({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')

  const mutation = useMutation({
    mutationFn: () => createKnowledgeBase({ name, description: desc || undefined }),
    onSuccess: () => {
      toast.success('知识库创建成功')
      onSuccess(); setName(''); setDesc('')
    },
    onError: (e) => { if (!handlePlanError(e)) toast.error(e instanceof Error ? e.message : '操作失败') },
  })

  return (
    <Dialog open={open} onOpenChange={onClose} title="新建知识库">
      <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) mutation.mutate() }} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">名称 *</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="知识库名称" required />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">描述</label>
          <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="简要描述" />
        </div>
        {mutation.error && (
          <p className="text-sm text-red-600">{mutation.error instanceof Error ? mutation.error.message : '创建失败'}</p>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>取消</Button>
          <Button type="submit" variant="primary" loading={mutation.isPending}>创建</Button>
        </div>
      </form>
    </Dialog>
  )
}

function FaqSection({ kbId, onCreateFaq, onEditFaq }: { kbId: string; onCreateFaq: () => void; onEditFaq: (faq: { id: string; question: string; answer: string; category?: string }) => void }) {
  const queryClient = useQueryClient()
  const [faqSearch, setFaqSearch] = useState('')
  const { data: faqRes, isLoading } = useQuery({
    queryKey: ['faqs', kbId],
    queryFn: () => getFaqs(kbId),
    staleTime: 2 * 60_000,
  })
  const faqList = (faqRes?.data ?? []) as { id: string; question: string; answer: string; category?: string }[]
  const filteredFaqs = useMemo(() => faqList.filter((f) => {
    if (!faqSearch) return true
    const q = faqSearch.toLowerCase()
    return f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q) || (f.category ?? '').toLowerCase().includes(q)
  }), [faqList, faqSearch])

  const delMut = useMutation({
    mutationFn: (faqId: string) => deleteFaq(kbId, faqId),
    onSuccess: () => {
      toast.success('删除成功')
      queryClient.invalidateQueries({ queryKey: ['faqs', kbId] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '操作失败'),
  })

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-primary" /> FAQ 管理
          {faqList.length > 0 && <span className="text-xs font-normal text-slate-400">({filteredFaqs.length}/{faqList.length})</span>}
        </CardTitle>
        <Button size="sm" variant="outline" onClick={onCreateFaq}>
          <Plus className="h-3.5 w-3.5" /> 添加 FAQ
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingPage />
        ) : faqList.length === 0 ? (
          <div className="py-8 text-center">
            <HelpCircle className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">暂无 FAQ</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={onCreateFaq}>
              <Plus className="h-3 w-3" /> 添加第一个 FAQ
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {faqList.length > 3 && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  value={faqSearch}
                  onChange={(e) => setFaqSearch(e.target.value)}
                  placeholder="搜索问题、答案或分类..."
                  className="pl-9"
                />
              </div>
            )}
            {filteredFaqs.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">未找到匹配的 FAQ</p>
            ) : (
              filteredFaqs.map((faq) => (
                <div key={faq.id} className="rounded-lg border border-slate-200/80 p-4 hover:bg-slate-50/80 hover:border-slate-300/60 transition-all group">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2">
                        <span className="shrink-0 mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">Q</span>
                        <p className="font-medium text-sm text-slate-800">{faq.question}</p>
                      </div>
                      <div className="flex items-start gap-2 mt-2">
                        <span className="shrink-0 mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-50 text-green-600 text-xs font-bold">A</span>
                        <p className="text-sm text-slate-600 leading-relaxed">{faq.answer}</p>
                      </div>
                      {faq.category && <Badge variant="default" className="mt-2.5 ml-7 text-xs">{faq.category}</Badge>}
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-slate-500 hover:text-slate-700"
                        onClick={() => onEditFaq(faq)}
                        title="编辑"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-600"
                        onClick={() => delMut.mutate(faq.id)}
                        loading={delMut.isPending}
                        title="删除"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function CreateFaqDialog({ open, kbId, editFaq, onClose, onSuccess }: { open: boolean; kbId: string; editFaq: { id: string; question: string; answer: string; category?: string } | null; onClose: () => void; onSuccess: () => void }) {
  const [faqQuestion, setFaqQuestion] = useState('')
  const [faqAnswer, setFaqAnswer] = useState('')
  const [faqCategory, setFaqCategory] = useState('')

  const isEdit = !!editFaq
  const mutation = useMutation({
    mutationFn: () => {
      const payload = { question: faqQuestion, answer: faqAnswer, category: faqCategory || undefined }
      return isEdit && editFaq ? updateFaq(kbId, editFaq.id, payload) : createFaq(kbId, payload)
    },
    onSuccess: () => {
      toast.success(isEdit ? 'FAQ 更新成功' : 'FAQ创建成功')
      onSuccess(); setFaqQuestion(''); setFaqAnswer(''); setFaqCategory('')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '操作失败'),
  })

  useEffect(() => {
    if (open && editFaq) {
      setFaqQuestion(editFaq.question)
      setFaqAnswer(editFaq.answer)
      setFaqCategory(editFaq.category ?? '')
    } else if (open && !editFaq) {
      setFaqQuestion('')
      setFaqAnswer('')
      setFaqCategory('')
    }
  }, [open, editFaq])

  return (
    <Dialog open={open} onOpenChange={onClose} title={isEdit ? '编辑 FAQ' : '添加 FAQ'}>
      <form onSubmit={(e) => { e.preventDefault(); if (faqQuestion.trim() && faqAnswer.trim()) mutation.mutate() }} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">问题 *</label>
          <Input value={faqQuestion} onChange={(e) => setFaqQuestion(e.target.value)} placeholder="常见问题" required />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">答案 *</label>
          <textarea
            value={faqAnswer}
            onChange={(e) => setFaqAnswer(e.target.value)}
            placeholder="标准答案"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm min-h-[100px] resize-y focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">分类</label>
          <Input value={faqCategory} onChange={(e) => setFaqCategory(e.target.value)} placeholder="分类（可选）" />
        </div>
        {mutation.error && <p className="text-sm text-red-600">{mutation.error instanceof Error ? mutation.error.message : (isEdit ? '更新失败' : '创建失败')}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>取消</Button>
          <Button type="submit" variant="primary" loading={mutation.isPending}>{isEdit ? '保存' : '添加'}</Button>
        </div>
      </form>
    </Dialog>
  )
}

function CreateDocDialog({ open, kbId, onClose, onSuccess }: { open: boolean; kbId: string; onClose: () => void; onSuccess: () => void }) {
  const [mode, setMode] = useState<'text' | 'file'>('text')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [dragActive, setDragActive] = useState(false)

  const textMutation = useMutation({
    mutationFn: () => createDocument(kbId, { title, content: content || undefined }),
    onSuccess: () => {
      toast.success('文档创建成功')
      onSuccess(); setTitle(''); setContent(''); setFile(null)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '操作失败'),
  })

  const fileMutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('请选择文件')
      return uploadDocument(kbId, file, title || undefined)
    },
    onSuccess: (res) => {
      if (res.success) {
        toast.success('文档上传成功')
        onSuccess(); setTitle(''); setContent(''); setFile(null)
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : '操作失败'),
  })

  const isPending = textMutation.isPending || fileMutation.isPending
  const error = textMutation.error || fileMutation.error

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (mode === 'file') fileMutation.mutate()
    else if (title.trim()) textMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={() => { onClose(); setFile(null) }} title="添加文档">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode('text')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${mode === 'text' ? 'bg-primary text-white' : 'text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
          >
            手动输入
          </button>
          <button
            type="button"
            onClick={() => setMode('file')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${mode === 'file' ? 'bg-primary text-white' : 'text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
          >
            上传文件
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">标题{mode === 'text' ? ' *' : '（可选）'}</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="文档标题" required={mode === 'text'} />
        </div>

        {mode === 'text' ? (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">内容</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="输入文档内容，系统会自动分块用于 AI 检索..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm min-h-[150px] resize-y focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors leading-relaxed"
            />
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">选择文件</label>
            <div
              className={cn(
                'rounded-lg border-2 border-dashed p-6 text-center transition-all',
                dragActive ? 'border-primary bg-primary/5 scale-[1.01]'
                  : file ? 'border-primary/50 bg-primary/5'
                  : 'border-slate-300 hover:border-slate-400'
              )}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragActive(false)
                const droppedFile = e.dataTransfer.files?.[0]
                if (droppedFile) setFile(droppedFile)
              }}
            >
              <input
                type="file"
                accept=".txt,.md,.csv,.json,.pdf,.docx"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="hidden"
                id="doc-upload"
              />
              <label htmlFor="doc-upload" className="cursor-pointer block">
                {file ? (
                  <div className="flex items-center justify-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-medium text-slate-700">{file.name}</p>
                      <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); setFile(null) }}
                      className="ml-2 text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <FileText className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                    <p className="text-sm text-slate-600">{dragActive ? '松开以上传文件' : '拖拽文件到此处，或点击选择'}</p>
                    <p className="text-xs text-slate-400 mt-1">支持 .txt, .md, .csv, .json, .pdf, .docx</p>
                  </>
                )}
              </label>
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600">{error instanceof Error ? error.message : '操作失败'}</p>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => { onClose(); setFile(null) }}>取消</Button>
          <Button type="submit" variant="primary" loading={isPending} disabled={(mode === 'file' && !file) || isPending}>
            {isPending ? '处理中...' : mode === 'file' ? '上传' : '添加'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
