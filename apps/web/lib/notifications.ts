'use client'

const SOUND_ENABLED_KEY = 'huoke-sound-enabled'

// ─── Desktop Notifications ─────────────────────────────────────────────────

export function sendDesktopNotification(
  title: string,
  body: string,
  onClick?: () => void,
) {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (document.hasFocus()) return

  if (Notification.permission === 'granted') {
    const n = new Notification(title, {
      body,
      icon: '/favicon.ico',
      tag: 'huoke-' + Date.now(),
    })
    if (onClick) {
      n.onclick = () => {
        window.focus()
        onClick()
      }
    }
    setTimeout(() => n.close(), 5000)
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission()
  }
}

export function requestNotificationPermission(): Promise<NotificationPermission | null> {
  if (typeof window === 'undefined' || !('Notification' in window)) return Promise.resolve(null)
  if (Notification.permission === 'granted') return Promise.resolve('granted')
  if (Notification.permission === 'denied') return Promise.resolve('denied')
  return Notification.requestPermission()
}

export function getNotificationPermission(): NotificationPermission | null {
  if (typeof window === 'undefined' || !('Notification' in window)) return null
  return Notification.permission
}

// ─── Sound Alerts (Web Audio API chime) ─────────────────────────────────────

let audioCtx: AudioContext | null = null

export function playNotificationSound() {
  if (!isSoundEnabled()) return
  try {
    if (!audioCtx) audioCtx = new AudioContext()
    const oscillator = audioCtx.createOscillator()
    const gainNode = audioCtx.createGain()
    oscillator.connect(gainNode)
    gainNode.connect(audioCtx.destination)
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime)
    oscillator.frequency.setValueAtTime(1047, audioCtx.currentTime + 0.1)
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3)
    oscillator.start(audioCtx.currentTime)
    oscillator.stop(audioCtx.currentTime + 0.3)
  } catch {
    /* AudioContext may not be available */
  }
}

// ─── Sound Toggle (persisted in localStorage) ──────────────────────────────

export function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true
  try {
    const v = localStorage.getItem(SOUND_ENABLED_KEY)
    return v !== 'false'
  } catch {
    return true
  }
}

export function setSoundEnabled(enabled: boolean) {
  try {
    localStorage.setItem(SOUND_ENABLED_KEY, String(enabled))
  } catch {
    /* ignore */
  }
}
