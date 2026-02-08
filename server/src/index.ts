import { createServer } from 'http'
import { Server, Socket } from 'socket.io'

const PORT = 3000

interface ParticipantInfo {
  id: string
  isSharing: boolean
}

interface Room {
  host: string | null
  viewers: Set<string>
  mode: 'classic' | 'conference'
  participants: Map<string, ParticipantInfo>
}

const rooms = new Map<string, Room>()

const httpServer = createServer()
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
})

function getOrCreateRoom(roomId: string): Room {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      host: null,
      viewers: new Set(),
      mode: 'classic',
      participants: new Map()
    })
  }
  return rooms.get(roomId)!
}

io.on('connection', (socket: Socket) => {
  console.log(`Client connected: ${socket.id}`)

  let currentRoom: string | null = null

  // 加入房间
  socket.on('join-room', (data: { roomId: string; isHost: boolean; mode?: 'classic' | 'conference' }) => {
    const { roomId, isHost, mode } = data
    const room = getOrCreateRoom(roomId)

    // 离开之前的房间
    if (currentRoom) {
      socket.leave(currentRoom)
      const oldRoom = rooms.get(currentRoom)
      if (oldRoom) {
        if (oldRoom.mode === 'conference') {
          const wasSharing = oldRoom.participants.get(socket.id)?.isSharing
          oldRoom.participants.delete(socket.id)
          if (wasSharing) {
            io.to(currentRoom).emit('sharer-stopped', { sharerId: socket.id })
          }
          io.to(currentRoom).emit('participant-left', { participantId: socket.id })
          io.to(currentRoom).emit('conference-state', {
            participants: Array.from(oldRoom.participants.values())
          })
          if (oldRoom.participants.size === 0) {
            rooms.delete(currentRoom)
          }
        } else {
          if (oldRoom.host === socket.id) {
            oldRoom.host = null
            io.to(currentRoom).emit('host-left')
          } else {
            oldRoom.viewers.delete(socket.id)
          }
        }
      }
    }

    currentRoom = roomId
    socket.join(roomId)

    // 如果房间是新的（无人），设置模式
    if (room.host === null && room.viewers.size === 0 && room.participants.size === 0) {
      room.mode = mode || 'classic'
    }

    if (room.mode === 'conference') {
      // 会议模式：所有人都是参与者
      room.participants.set(socket.id, { id: socket.id, isSharing: false })
      console.log(`Participant ${socket.id} joined conference room ${roomId}`)

      socket.emit('joined', {
        role: 'participant',
        roomId,
        mode: 'conference',
        participants: Array.from(room.participants.values())
      })

      // 广播更新的参与者列表
      io.to(roomId).emit('conference-state', {
        participants: Array.from(room.participants.values())
      })
    } else {
      // 经典模式：保持现有逻辑
      if (isHost) {
        if (room.host && room.host !== socket.id) {
          socket.emit('error', { message: '房间已有主持人' })
          return
        }
        room.host = socket.id
        console.log(`Host ${socket.id} joined room ${roomId}`)
        socket.emit('joined', { role: 'host', roomId })
        // 通知观众主持人加入
        socket.to(roomId).emit('host-joined')
      } else {
        room.viewers.add(socket.id)
        console.log(`Viewer ${socket.id} joined room ${roomId}`)
        socket.emit('joined', { role: 'viewer', roomId, hasHost: room.host !== null })
        // 如果有主持人，通知主持人有新观众
        if (room.host) {
          io.to(room.host).emit('viewer-joined', { viewerId: socket.id })
        }
      }

      // 广播房间状态
      io.to(roomId).emit('room-state', {
        hostId: room.host,
        viewerCount: room.viewers.size
      })
    }
  })

  // WebRTC 信令: Offer
  socket.on('offer', (data: { targetId: string; offer: RTCSessionDescriptionInit }) => {
    console.log(`Offer from ${socket.id} to ${data.targetId}`)
    io.to(data.targetId).emit('offer', {
      senderId: socket.id,
      offer: data.offer
    })
  })

  // WebRTC 信令: Answer
  socket.on('answer', (data: { targetId: string; answer: RTCSessionDescriptionInit }) => {
    console.log(`Answer from ${socket.id} to ${data.targetId}`)
    io.to(data.targetId).emit('answer', {
      senderId: socket.id,
      answer: data.answer
    })
  })

  // WebRTC 信令: ICE Candidate
  socket.on('ice-candidate', (data: { targetId: string; candidate: RTCIceCandidateInit }) => {
    io.to(data.targetId).emit('ice-candidate', {
      senderId: socket.id,
      candidate: data.candidate
    })
  })

  // 请求连接主持人 (观众 -> 主持人，经典模式)
  socket.on('request-stream', () => {
    if (!currentRoom) return
    const room = rooms.get(currentRoom)
    if (room?.host) {
      io.to(room.host).emit('stream-requested', { viewerId: socket.id })
    }
  })

  // 会议模式：开始共享
  socket.on('start-sharing', () => {
    if (!currentRoom) return
    const room = rooms.get(currentRoom)
    if (!room || room.mode !== 'conference') return

    const participant = room.participants.get(socket.id)
    if (participant) {
      participant.isSharing = true
      socket.to(currentRoom).emit('sharer-started', { sharerId: socket.id })
      io.to(currentRoom).emit('conference-state', {
        participants: Array.from(room.participants.values())
      })
      console.log(`Participant ${socket.id} started sharing in room ${currentRoom}`)
    }
  })

  // 会议模式：停止共享
  socket.on('stop-sharing', () => {
    if (!currentRoom) return
    const room = rooms.get(currentRoom)
    if (!room || room.mode !== 'conference') return

    const participant = room.participants.get(socket.id)
    if (participant) {
      participant.isSharing = false
      socket.to(currentRoom).emit('sharer-stopped', { sharerId: socket.id })
      io.to(currentRoom).emit('conference-state', {
        participants: Array.from(room.participants.values())
      })
      console.log(`Participant ${socket.id} stopped sharing in room ${currentRoom}`)
    }
  })

  // 会议模式：请求连接特定共享者
  socket.on('request-peer-stream', (data: { targetId: string }) => {
    console.log(`Peer stream request from ${socket.id} to ${data.targetId}`)
    io.to(data.targetId).emit('peer-stream-requested', { viewerId: socket.id })
  })

  // 断开连接
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`)
    if (currentRoom) {
      const room = rooms.get(currentRoom)
      if (room) {
        if (room.mode === 'conference') {
          const wasSharing = room.participants.get(socket.id)?.isSharing
          room.participants.delete(socket.id)

          if (wasSharing) {
            io.to(currentRoom).emit('sharer-stopped', { sharerId: socket.id })
          }
          io.to(currentRoom).emit('participant-left', { participantId: socket.id })
          io.to(currentRoom).emit('conference-state', {
            participants: Array.from(room.participants.values())
          })

          if (room.participants.size === 0) {
            rooms.delete(currentRoom)
            console.log(`Conference room ${currentRoom} deleted`)
          }
        } else {
          if (room.host === socket.id) {
            room.host = null
            io.to(currentRoom).emit('host-left')
            console.log(`Host left room ${currentRoom}`)
          } else {
            room.viewers.delete(socket.id)
          }

          // 广播更新的房间状态
          io.to(currentRoom).emit('room-state', {
            hostId: room.host,
            viewerCount: room.viewers.size
          })

          // 清理空房间
          if (room.host === null && room.viewers.size === 0) {
            rooms.delete(currentRoom)
            console.log(`Room ${currentRoom} deleted`)
          }
        }
      }
    }
  })
})

httpServer.listen(PORT, () => {
  console.log(`Signaling server running on http://localhost:${PORT}`)
})
