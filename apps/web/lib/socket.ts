'use client'

import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('huoke_token')
}

export function getSocket(): Socket {
  if (!socket) {
    const url = typeof window !== 'undefined'
      ? window.location.origin.replace(':3000', ':4000')
      : 'http://localhost:4000'
    const token = getToken()
    socket = io(url, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      autoConnect: false,
      auth: token ? { token } : {},
    })
  }
  return socket
}

export function connectSocket() {
  const s = getSocket()
  const token = getToken()
  if (token) s.auth = { token }
  if (!s.connected) s.connect()
  return s
}

export function disconnectSocket() {
  if (socket?.connected) socket.disconnect()
}

export function resetSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
