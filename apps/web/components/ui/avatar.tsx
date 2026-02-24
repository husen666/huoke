'use client'

import { memo, useState } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => s[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null
  alt?: string
  name?: string
  size?: 'sm' | 'md' | 'lg'
}

const sizeClasses = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
}

const sizePx = { sm: 32, md: 40, lg: 48 }

const Avatar = memo(function Avatar({ src, alt, name, size = 'md', className, ...props }: AvatarProps) {
  const [imgErr, setImgErr] = useState(false)
  const initials = name ? getInitials(name) : (alt ? alt.slice(0, 2).toUpperCase() : '?')
  return (
    <div
      className={cn(
        'relative flex items-center justify-center shrink-0 overflow-hidden rounded-full bg-slate-200 font-medium text-slate-600',
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {src && !imgErr ? (
        <Image
          src={src}
          alt={alt ?? name ?? ''}
          width={sizePx[size]}
          height={sizePx[size]}
          className="aspect-square h-full w-full object-cover"
          onError={() => setImgErr(true)}
          unoptimized
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  )
})

export { Avatar }
