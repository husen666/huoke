'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { X, Search, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

const RECENT_KEY = 'huoke-recent-emojis'
const MAX_RECENT = 20

const EMOJI_DATA: Record<string, string[]> = {
  '😀 常用': [
    '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😉','😊','😇',
    '🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪',
    '😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏',
    '😒','🙄','😬','🤥','😔','😪','🤤','😴','😷','🤒','🤕','🤢',
    '🤮','🥴','😵','🤯','🥳','🥸','😎','🤓','🧐',
  ],
  '❤️ 符号': [
    '❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','❣️','💕','💞',
    '💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉','☸','✡️',
    '🔯','🕎','☯️','☦️','🛐','⛎','♈','♉','♊','♋','♌','♍',
    '♎','♏','♐','♑','♒','♓','⭐','🌟','✨','⚡','🔥','💥',
    '☀️','🌈','👍','👎','👏','🙏','🤝','💪',
  ],
  '👋 手势': [
    '👋','🤚','🖐','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘',
    '🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛',
    '🤜','👏','🙌','👐','🤲','🤝','🙏','✍️','💅','🤳',
  ],
  '👤 人物': [
    '👶','👧','🧒','👦','👩','🧑','👨','👵','🧓','👴','👲','👳',
    '🧕','👮','👷','💂','🕵️','👩‍⚕️','👩‍🌾','👩‍🍳','👩‍🎓','👩‍🎤','👩‍🏫','👩‍🏭',
    '👩‍💻','👩‍💼','👩‍🔧','👩‍🔬','👩‍🚀','🧙','🧚','🧛','🧜','🧝','🧞','🧟',
  ],
  '🐶 动物': [
    '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁',
    '🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤',
    '🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪱','🐛','🦋',
    '🐌','🐞','🐜','🪰','🦟','🦗','🕷','🐢','🐍','🦎','🦂','🦀',
    '🦞','🦐','🦑','🐙','🐠','🐟','🐬','🐳','🐋','🦈',
  ],
  '🍕 食物': [
    '🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒',
    '🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🌶️','🫑',
    '🥒','🌽','🥕','🫒','🧄','🧅','🥔','🍠','🥐','🥯','🍞','🥖',
    '🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭',
    '🍔','🍟','🍕','🫓','🥪','🌮','🌯','🫔','🥙','🧆',
  ],
  '⚽ 活动': [
    '⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓',
    '🏸','🏒','🥍','🏑','🥅','⛳','🪁','🏹','🎣','🤿','🥊','🥋',
    '🎽','🛹','🛼','🛷','⛸','🥌','🎿','⛷','🏂','🪂','🏋️','🤸',
    '🤺','🏇','⛹️','🤾','🏌️','🧘','🧗','🚣','🏊','🤽','🚴','🚵',
  ],
  '🌍 旅行': [
    '🌍','🌎','🌏','🗺️','🧭','🏔️','⛰️','🌋','🗻','🏕️','🏖️','🏜️',
    '🏝️','🏞️','🏟️','🏛️','🏗️','🧱','🏘️','🏚️','🏠','🏡','🏢','🏣',
    '🏥','🏦','🏨','🏩','🏪','🏫','🏬','🏭','🏯','🏰','💒','🗼',
    '🗽','⛪','🕌','🛕','🕍','⛩️','🕋','⛲','⛺','🌁','🌃','🏙️',
  ],
  '💡 物品': [
    '💡','🔦','🕯️','📱','💻','⌨️','🖥️','🖨️','🖱️','🖲️','💽','💾',
    '💿','📀','📷','📸','📹','🎥','📽️','🎞️','📞','☎️','📟','📠',
    '📺','📻','🎙️','🎚️','🎛️','🧭','⏱️','⏲️','⏰','🕰️','⌛','⏳',
    '📡','🔋','🔌','🪫','💰','🪙','💴','💵','💶','💷','💎','⚖️',
  ],
}

const ALL_CATEGORIES = Object.keys(EMOJI_DATA)
const CATEGORY_ICONS = ALL_CATEGORIES.map(k => k.split(' ')[0])

function getRecentEmojis(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveRecentEmoji(emoji: string) {
  try {
    const prev = getRecentEmojis().filter(e => e !== emoji)
    const next = [emoji, ...prev].slice(0, MAX_RECENT)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
    return next
  } catch {
    return [emoji]
  }
}

interface EmojiPickerProps {
  onSelect: (emoji: string) => void
  onClose: () => void
}

export function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState(0)
  const [recentEmojis, setRecentEmojis] = useState<string[]>([])
  const ref = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const categoryRefs = useRef<Map<number, HTMLDivElement | null>>(new Map())

  useEffect(() => {
    setRecentEmojis(getRecentEmojis())
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const handleSelect = useCallback((emoji: string) => {
    const updated = saveRecentEmoji(emoji)
    setRecentEmojis(updated)
    onSelect(emoji)
  }, [onSelect])

  const scrollToCategory = useCallback((idx: number) => {
    setActiveCategory(idx)
    categoryRefs.current.get(idx)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const filteredEmojis = useMemo(() => {
    if (!search) return null
    const q = search.toLowerCase()
    const result: string[] = []
    for (const emojis of Object.values(EMOJI_DATA)) {
      for (const emoji of emojis) {
        if (emoji.includes(q)) result.push(emoji)
      }
    }
    return result
  }, [search])

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 mb-2 w-[320px] bg-white rounded-xl shadow-xl border border-slate-200 z-50 flex flex-col overflow-hidden"
      style={{ maxHeight: '360px' }}
    >
      {/* Search */}
      <div className="px-3 pt-3 pb-2 border-b border-slate-100">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索表情..."
            className="w-full pl-8 pr-8 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary transition-all"
            autoFocus
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Category tabs */}
      {!search && (
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-slate-100 overflow-x-auto shrink-0">
          {recentEmojis.length > 0 && (
            <button
              onClick={() => scrollToCategory(-1)}
              className={cn(
                'p-1.5 rounded-md text-sm hover:bg-slate-100 transition-colors shrink-0',
                activeCategory === -1 && 'bg-primary/10'
              )}
              title="最近使用"
            >
              <Clock className="h-3.5 w-3.5 text-slate-500" />
            </button>
          )}
          {CATEGORY_ICONS.map((icon, idx) => (
            <button
              key={idx}
              onClick={() => scrollToCategory(idx)}
              className={cn(
                'p-1.5 rounded-md text-sm hover:bg-slate-100 transition-colors shrink-0',
                activeCategory === idx && 'bg-primary/10'
              )}
              title={ALL_CATEGORIES[idx]}
            >
              {icon}
            </button>
          ))}
        </div>
      )}

      {/* Emoji grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 py-2 min-h-0">
        {search ? (
          filteredEmojis && filteredEmojis.length > 0 ? (
            <div className="grid grid-cols-8 gap-0.5">
              {filteredEmojis.map((emoji, i) => (
                <EmojiButton key={i} emoji={emoji} onClick={handleSelect} />
              ))}
            </div>
          ) : (
            <p className="text-center text-xs text-slate-400 py-6">未找到匹配的表情</p>
          )
        ) : (
          <>
            {recentEmojis.length > 0 && (
              <div ref={el => { categoryRefs.current.set(-1, el) }}>
                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider px-1 mb-1">🕐 最近使用</p>
                <div className="grid grid-cols-8 gap-0.5 mb-3">
                  {recentEmojis.map((emoji, i) => (
                    <EmojiButton key={`recent-${i}`} emoji={emoji} onClick={handleSelect} />
                  ))}
                </div>
              </div>
            )}
            {ALL_CATEGORIES.map((category, idx) => (
              <div key={category} ref={el => { categoryRefs.current.set(idx, el) }}>
                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider px-1 mb-1">{category}</p>
                <div className="grid grid-cols-8 gap-0.5 mb-3">
                  {EMOJI_DATA[category].map((emoji, i) => (
                    <EmojiButton key={`${idx}-${i}`} emoji={emoji} onClick={handleSelect} />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function EmojiButton({ emoji, onClick }: { emoji: string; onClick: (emoji: string) => void }) {
  return (
    <button
      onClick={() => onClick(emoji)}
      className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-slate-100 active:scale-90 transition-all text-lg leading-none"
      title={emoji}
    >
      {emoji}
    </button>
  )
}
