import { ref, onUnmounted } from 'vue'
import { io, Socket } from 'socket.io-client'
import type { RoomState, SignalingEvents } from '../types'
import { logger } from '../utils/logger'

const SIGNALING_SERVER = import.meta.env.VITE_SIGNALING_SERVER || 'http://localhost:3000'

export function useSignaling() {
  const socket = ref<Socket | null>(null)
  const connected = ref(false)
  const roomState = ref<RoomState>({
    roomId: null,
    role: null,
    hostId: null,
    viewerCount: 0,
    connected: false
  })
  const error = ref<string | null>(null)

  // 事件回调
  const callbacks = {
    onHostJoined: null as (() => void) | null,
    onHostLeft: null as (() => void) | null,
    onViewerJoined: null as ((viewerId: string) => void) | null,
    onOffer: null as ((senderId: string, offer: RTCSessionDescriptionInit) => void) | null,
    onAnswer: null as ((senderId: string, answer: RTCSessionDescriptionInit) => void) | null,
    onIceCandidate: null as ((senderId: string, candidate: RTCIceCandidateInit) => void) | null,
    onStreamRequested: null as ((viewerId: string) => void) | null
  }

  function connect() {
    if (socket.value?.connected) return

    socket.value = io(SIGNALING_SERVER, {
      transports: ['websocket', 'polling']
    })

    socket.value.on('connect', () => {
      connected.value = true
      roomState.value.connected = true
      error.value = null
      logger.log('Connected to signaling server')
    })

    socket.value.on('disconnect', () => {
      connected.value = false
      roomState.value.connected = false
      logger.log('Disconnected from signaling server')
    })

    socket.value.on('connect_error', (err) => {
      error.value = `连接失败: ${err.message}`
      logger.error('Connection error:', err)
    })

    socket.value.on('joined', (data: SignalingEvents['joined']) => {
      roomState.value.roomId = data.roomId
      roomState.value.role = data.role
      logger.log(`Joined room ${data.roomId} as ${data.role}`)
    })

    socket.value.on('room-state', (data: SignalingEvents['room-state']) => {
      roomState.value.hostId = data.hostId
      roomState.value.viewerCount = data.viewerCount
    })

    socket.value.on('host-joined', () => {
      callbacks.onHostJoined?.()
    })

    socket.value.on('host-left', () => {
      roomState.value.hostId = null
      callbacks.onHostLeft?.()
    })

    socket.value.on('viewer-joined', (data: SignalingEvents['viewer-joined']) => {
      callbacks.onViewerJoined?.(data.viewerId)
    })

    socket.value.on('offer', (data: { senderId: string; offer: RTCSessionDescriptionInit }) => {
      callbacks.onOffer?.(data.senderId, data.offer)
    })

    socket.value.on('answer', (data: { senderId: string; answer: RTCSessionDescriptionInit }) => {
      callbacks.onAnswer?.(data.senderId, data.answer)
    })

    socket.value.on('ice-candidate', (data: { senderId: string; candidate: RTCIceCandidateInit }) => {
      callbacks.onIceCandidate?.(data.senderId, data.candidate)
    })

    socket.value.on('stream-requested', (data: SignalingEvents['stream-requested']) => {
      callbacks.onStreamRequested?.(data.viewerId)
    })

    socket.value.on('error', (data: SignalingEvents['error']) => {
      error.value = data.message
    })
  }

  function disconnect() {
    socket.value?.disconnect()
    socket.value = null
    connected.value = false
    roomState.value = {
      roomId: null,
      role: null,
      hostId: null,
      viewerCount: 0,
      connected: false
    }
  }

  function joinRoom(roomId: string, isHost: boolean) {
    if (!socket.value?.connected) {
      error.value = '未连接到服务器'
      return
    }
    socket.value.emit('join-room', { roomId, isHost })
  }

  function sendOffer(targetId: string, offer: RTCSessionDescriptionInit) {
    socket.value?.emit('offer', { targetId, offer })
  }

  function sendAnswer(targetId: string, answer: RTCSessionDescriptionInit) {
    socket.value?.emit('answer', { targetId, answer })
  }

  function sendIceCandidate(targetId: string, candidate: RTCIceCandidateInit) {
    socket.value?.emit('ice-candidate', { targetId, candidate })
  }

  function requestStream() {
    socket.value?.emit('request-stream')
  }

  function onHostJoined(callback: () => void) {
    callbacks.onHostJoined = callback
  }

  function onHostLeft(callback: () => void) {
    callbacks.onHostLeft = callback
  }

  function onViewerJoined(callback: (viewerId: string) => void) {
    callbacks.onViewerJoined = callback
  }

  function onOffer(callback: (senderId: string, offer: RTCSessionDescriptionInit) => void) {
    callbacks.onOffer = callback
  }

  function onAnswer(callback: (senderId: string, answer: RTCSessionDescriptionInit) => void) {
    callbacks.onAnswer = callback
  }

  function onIceCandidate(callback: (senderId: string, candidate: RTCIceCandidateInit) => void) {
    callbacks.onIceCandidate = callback
  }

  function onStreamRequested(callback: (viewerId: string) => void) {
    callbacks.onStreamRequested = callback
  }

  onUnmounted(() => {
    disconnect()
  })

  return {
    socket,
    connected,
    roomState,
    error,
    connect,
    disconnect,
    joinRoom,
    sendOffer,
    sendAnswer,
    sendIceCandidate,
    requestStream,
    onHostJoined,
    onHostLeft,
    onViewerJoined,
    onOffer,
    onAnswer,
    onIceCandidate,
    onStreamRequested
  }
}
