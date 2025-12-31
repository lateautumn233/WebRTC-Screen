import { createServer } from 'http'
import { Server, Socket } from 'socket.io'

const PORT = 3000

interface Room {
  host: string | null
  viewers: Set<string>
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
    rooms.set(roomId, { host: null, viewers: new Set() })
  }
  return rooms.get(roomId)!
}

io.on('connection', (socket: Socket) => {
  console.log(`Client connected: ${socket.id}`)

  let currentRoom: string | null = null

  // 加入房间
  socket.on('join-room', (data: { roomId: string; isHost: boolean }) => {
    const { roomId, isHost } = data
    const room = getOrCreateRoom(roomId)

    // 离开之前的房间
    if (currentRoom) {
      socket.leave(currentRoom)
      const oldRoom = rooms.get(currentRoom)
      if (oldRoom) {
        if (oldRoom.host === socket.id) {
          oldRoom.host = null
          io.to(currentRoom).emit('host-left')
        } else {
          oldRoom.viewers.delete(socket.id)
        }
      }
    }

    currentRoom = roomId
    socket.join(roomId)

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

  // 请求连接主持人 (观众 -> 主持人)
  socket.on('request-stream', () => {
    if (!currentRoom) return
    const room = rooms.get(currentRoom)
    if (room?.host) {
      io.to(room.host).emit('stream-requested', { viewerId: socket.id })
    }
  })

  // 断开连接
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`)
    if (currentRoom) {
      const room = rooms.get(currentRoom)
      if (room) {
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
  })
})

httpServer.listen(PORT, () => {
  console.log(`Signaling server running on http://localhost:${PORT}`)
})
