import { ref, onUnmounted } from 'vue'
import { io, Socket } from 'socket.io-client'
import type { ConferenceRoomState, ParticipantInfo } from '../types'
import { logger } from '../utils/logger'

const SIGNALING_SERVER = import.meta.env.VITE_SIGNALING_SERVER || 'http://localhost:3000'

export function useConferenceSignaling() {
  const socket = ref<Socket | null>(null)
  const connected = ref(false)
  const roomState = ref<ConferenceRoomState>({
    roomId: null,
    myId: null,
    participants: [],
    connected: false
  })
  const error = ref<string | null>(null)

  // 事件回调
  const callbacks = {
    onSharerStarted: null as ((sharerId: string) => void) | null,
    onSharerStopped: null as ((sharerId: string) => void) | null,
    onPeerStreamRequested: null as ((viewerId: string) => void) | null,
    onParticipantLeft: null as ((participantId: string) => void) | null,
    onOffer: null as ((senderId: string, offer: RTCSessionDescriptionInit) => void) | null,
    onAnswer: null as ((senderId: string, answer: RTCSessionDescriptionInit) => void) | null,
    onIceCandidate: null as ((senderId: string, candidate: RTCIceCandidateInit) => void) | null,
    onJoined: null as ((participants: ParticipantInfo[]) => void) | null,
  }

  function connect() {
    if (socket.value?.connected) return

    socket.value = io(SIGNALING_SERVER, {
      transports: ['websocket', 'polling']
    })

    socket.value.on('connect', () => {
      connected.value = true
      roomState.value.connected = true
      roomState.value.myId = socket.value?.id ?? null
      error.value = null
      logger.log('Conference: Connected to signaling server')
    })

    socket.value.on('disconnect', () => {
      connected.value = false
      roomState.value.connected = false
      logger.log('Conference: Disconnected from signaling server')
    })

    socket.value.on('connect_error', (err) => {
      error.value = `连接失败: ${err.message}`
      logger.error('Conference: Connection error:', err)
    })

    socket.value.on('joined', (data: { role: string; roomId: string; mode?: string; participants?: ParticipantInfo[] }) => {
      roomState.value.roomId = data.roomId
      roomState.value.myId = socket.value?.id ?? null
      if (data.participants) {
        roomState.value.participants = data.participants
      }
      logger.log(`Conference: Joined room ${data.roomId}`)
      if (data.participants) {
        callbacks.onJoined?.(data.participants)
      }
    })

    socket.value.on('conference-state', (data: { participants: ParticipantInfo[] }) => {
      roomState.value.participants = data.participants
    })

    socket.value.on('sharer-started', (data: { sharerId: string }) => {
      logger.log(`Conference: Sharer started: ${data.sharerId}`)
      callbacks.onSharerStarted?.(data.sharerId)
    })

    socket.value.on('sharer-stopped', (data: { sharerId: string }) => {
      logger.log(`Conference: Sharer stopped: ${data.sharerId}`)
      callbacks.onSharerStopped?.(data.sharerId)
    })

    socket.value.on('peer-stream-requested', (data: { viewerId: string }) => {
      logger.log(`Conference: Peer stream requested by: ${data.viewerId}`)
      callbacks.onPeerStreamRequested?.(data.viewerId)
    })

    socket.value.on('participant-left', (data: { participantId: string }) => {
      logger.log(`Conference: Participant left: ${data.participantId}`)
      callbacks.onParticipantLeft?.(data.participantId)
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

    socket.value.on('error', (data: { message: string }) => {
      error.value = data.message
    })
  }

  function disconnect() {
    socket.value?.disconnect()
    socket.value = null
    connected.value = false
    roomState.value = {
      roomId: null,
      myId: null,
      participants: [],
      connected: false
    }
  }

  function joinRoom(roomId: string) {
    if (!socket.value?.connected) {
      error.value = '未连接到服务器'
      return
    }
    socket.value.emit('join-room', { roomId, isHost: false, mode: 'conference' })
  }

  function startSharing() {
    socket.value?.emit('start-sharing')
  }

  function stopSharing() {
    socket.value?.emit('stop-sharing')
  }

  function requestPeerStream(targetId: string) {
    socket.value?.emit('request-peer-stream', { targetId })
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

  function onSharerStarted(callback: (sharerId: string) => void) {
    callbacks.onSharerStarted = callback
  }

  function onSharerStopped(callback: (sharerId: string) => void) {
    callbacks.onSharerStopped = callback
  }

  function onPeerStreamRequested(callback: (viewerId: string) => void) {
    callbacks.onPeerStreamRequested = callback
  }

  function onParticipantLeft(callback: (participantId: string) => void) {
    callbacks.onParticipantLeft = callback
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

  function onJoined(callback: (participants: ParticipantInfo[]) => void) {
    callbacks.onJoined = callback
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
    startSharing,
    stopSharing,
    requestPeerStream,
    sendOffer,
    sendAnswer,
    sendIceCandidate,
    onSharerStarted,
    onSharerStopped,
    onPeerStreamRequested,
    onParticipantLeft,
    onOffer,
    onAnswer,
    onIceCandidate,
    onJoined
  }
}
