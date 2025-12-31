import { ref, shallowRef } from 'vue'
import type { ConnectionState } from '../types'
import { logger } from '../utils/logger'

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
]

// 分片大小 (16KB，安全值)
const CHUNK_SIZE = 16 * 1024

// 分片消息类型
const MSG_TYPE_CHUNK = 0x01
const MSG_TYPE_COMPLETE = 0x02

export function useWebRTC() {
  const peerConnections = shallowRef<Map<string, RTCPeerConnection>>(new Map())
  const dataChannels = shallowRef<Map<string, RTCDataChannel>>(new Map())
  const connectionState = ref<ConnectionState>('disconnected')
  const error = ref<string | null>(null)

  // 接收端：重组分片的缓冲区
  const receiveBuffers = new Map<string, Map<number, Uint8Array[]>>()

  // 回调函数
  let onDataReceived: ((peerId: string, data: ArrayBuffer) => void) | null = null
  let onIceCandidate: ((peerId: string, candidate: RTCIceCandidateInit) => void) | null = null
  let onConnectionStateChange: ((peerId: string, state: RTCPeerConnectionState) => void) | null = null
  let onDataChannelOpen: ((peerId: string) => void) | null = null

  // 消息序列号
  let messageSeq = 0

  // 清理指定连接（内部使用，不触发额外状态更新）
  function cleanupPeer(peerId: string) {
    const channel = dataChannels.value.get(peerId)
    if (channel) {
      channel.close()
      dataChannels.value.delete(peerId)
    }

    const pc = peerConnections.value.get(peerId)
    if (pc) {
      pc.close()
      peerConnections.value.delete(peerId)
    }

    receiveBuffers.delete(peerId)
  }

  // 创建 PeerConnection
  function createPeerConnection(peerId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        onIceCandidate?.(peerId, event.candidate.toJSON())
      }
    }

    pc.onconnectionstatechange = () => {
      logger.log(`Connection state with ${peerId}:`, pc.connectionState)
      onConnectionStateChange?.(peerId, pc.connectionState)

      if (pc.connectionState === 'connected') {
        connectionState.value = 'connected'
      } else if (pc.connectionState === 'failed') {
        connectionState.value = 'failed'
        error.value = '连接失败'
        cleanupPeer(peerId)
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
        connectionState.value = 'disconnected'
        cleanupPeer(peerId)
      }
    }

    pc.ondatachannel = (event) => {
      setupDataChannel(peerId, event.channel)
    }

    peerConnections.value.set(peerId, pc)
    receiveBuffers.set(peerId, new Map())
    return pc
  }

  // 设置 DataChannel
  function setupDataChannel(peerId: string, channel: RTCDataChannel) {
    channel.binaryType = 'arraybuffer'

    channel.onopen = () => {
      logger.log(`DataChannel opened with ${peerId}`)
      onDataChannelOpen?.(peerId)
    }

    channel.onclose = () => {
      logger.log(`DataChannel closed with ${peerId}`)
      dataChannels.value.delete(peerId)
      receiveBuffers.delete(peerId)
    }

    channel.onerror = (e) => {
      logger.error(`DataChannel error with ${peerId}:`, e)
    }

    channel.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        handleReceivedChunk(peerId, event.data)
      }
    }

    dataChannels.value.set(peerId, channel)
    if (!receiveBuffers.has(peerId)) {
      receiveBuffers.set(peerId, new Map())
    }
  }

  // 处理接收到的分片
  function handleReceivedChunk(peerId: string, data: ArrayBuffer) {
    const view = new DataView(data)
    const msgType = view.getUint8(0)
    const msgSeq = view.getUint32(1, true)
    const chunkIndex = view.getUint16(5, true)

    const peerBuffer = receiveBuffers.get(peerId)
    if (!peerBuffer) return

    if (msgType === MSG_TYPE_CHUNK) {
      // 分片数据
      const chunkData = new Uint8Array(data, 7)

      if (!peerBuffer.has(msgSeq)) {
        peerBuffer.set(msgSeq, [])
      }
      const chunks = peerBuffer.get(msgSeq)!
      chunks[chunkIndex] = chunkData
    } else if (msgType === MSG_TYPE_COMPLETE) {
      // 分片完成标记
      const totalChunks = view.getUint16(7, true)
      const totalSize = view.getUint32(9, true)

      const chunks = peerBuffer.get(msgSeq)
      if (!chunks) return

      // 检查是否收齐所有分片
      let complete = true
      for (let i = 0; i < totalChunks; i++) {
        if (!chunks[i]) {
          complete = false
          break
        }
      }

      if (complete) {
        // 重组数据
        const result = new Uint8Array(totalSize)
        let offset = 0
        for (let i = 0; i < totalChunks; i++) {
          const chunk = chunks[i]
          if (chunk) {
            result.set(chunk, offset)
            offset += chunk.length
          }
        }

        peerBuffer.delete(msgSeq)
        onDataReceived?.(peerId, result.buffer)
      }
    }
  }

  // 创建 Offer (发送端使用)
  async function createOffer(peerId: string): Promise<RTCSessionDescriptionInit> {
    let pc = peerConnections.value.get(peerId)
    if (!pc) {
      pc = createPeerConnection(peerId)
    }

    // 创建 DataChannel
    const channel = pc.createDataChannel('screen-share', {
      ordered: true,
      maxRetransmits: 3
    })
    setupDataChannel(peerId, channel)

    connectionState.value = 'connecting'
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    return offer
  }

  // 处理收到的 Offer (接收端使用)
  async function handleOffer(
    peerId: string,
    offer: RTCSessionDescriptionInit
  ): Promise<RTCSessionDescriptionInit> {
    let pc = peerConnections.value.get(peerId)
    if (!pc) {
      pc = createPeerConnection(peerId)
    }

    connectionState.value = 'connecting'
    await pc.setRemoteDescription(new RTCSessionDescription(offer))
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    return answer
  }

  // 处理收到的 Answer
  async function handleAnswer(peerId: string, answer: RTCSessionDescriptionInit) {
    const pc = peerConnections.value.get(peerId)
    if (!pc) {
      logger.error(`No peer connection for ${peerId}`)
      return
    }

    await pc.setRemoteDescription(new RTCSessionDescription(answer))
  }

  // 添加 ICE Candidate
  async function addIceCandidate(peerId: string, candidate: RTCIceCandidateInit) {
    const pc = peerConnections.value.get(peerId)
    if (!pc) {
      logger.error(`No peer connection for ${peerId}`)
      return
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate))
    } catch (err) {
      logger.error('Error adding ICE candidate:', err)
    }
  }

  // 发送数据（带分片）
  function sendData(peerId: string, data: ArrayBuffer): boolean {
    const channel = dataChannels.value.get(peerId)
    if (!channel || channel.readyState !== 'open') {
      return false
    }

    // 检查缓冲区，避免积压
    if (channel.bufferedAmount > 5 * 1024 * 1024) {
      return false
    }

    try {
      const seq = messageSeq++
      const dataArray = new Uint8Array(data)
      const totalChunks = Math.ceil(dataArray.length / CHUNK_SIZE)

      // 发送分片
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE
        const end = Math.min(start + CHUNK_SIZE, dataArray.length)
        const chunk = dataArray.slice(start, end)

        // 分片头: type(1) + seq(4) + chunkIndex(2) + data
        const chunkMsg = new ArrayBuffer(7 + chunk.length)
        const chunkView = new DataView(chunkMsg)
        chunkView.setUint8(0, MSG_TYPE_CHUNK)
        chunkView.setUint32(1, seq, true)
        chunkView.setUint16(5, i, true)
        new Uint8Array(chunkMsg, 7).set(chunk)

        channel.send(chunkMsg)
      }

      // 发送完成标记: type(1) + seq(4) + chunkIndex(2) + totalChunks(2) + totalSize(4)
      const completeMsg = new ArrayBuffer(13)
      const completeView = new DataView(completeMsg)
      completeView.setUint8(0, MSG_TYPE_COMPLETE)
      completeView.setUint32(1, seq, true)
      completeView.setUint16(5, totalChunks, true)
      completeView.setUint16(7, totalChunks, true)
      completeView.setUint32(9, dataArray.length, true)

      channel.send(completeMsg)
      return true
    } catch (err) {
      logger.error('Send data error:', err)
      return false
    }
  }

  // 广播数据到所有连接
  function broadcastData(data: ArrayBuffer) {
    dataChannels.value.forEach((_channel, peerId) => {
      sendData(peerId, data)
    })
  }

  // 关闭指定连接
  function closePeer(peerId: string) {
    const channel = dataChannels.value.get(peerId)
    if (channel) {
      channel.close()
      dataChannels.value.delete(peerId)
    }

    const pc = peerConnections.value.get(peerId)
    if (pc) {
      pc.close()
      peerConnections.value.delete(peerId)
    }

    receiveBuffers.delete(peerId)
  }

  // 关闭所有连接
  function closeAll() {
    dataChannels.value.forEach((channel) => channel.close())
    dataChannels.value.clear()

    peerConnections.value.forEach((pc) => pc.close())
    peerConnections.value.clear()

    receiveBuffers.clear()
    connectionState.value = 'disconnected'
  }

  // 设置回调
  function setOnDataReceived(callback: (peerId: string, data: ArrayBuffer) => void) {
    onDataReceived = callback
  }

  function setOnIceCandidate(callback: (peerId: string, candidate: RTCIceCandidateInit) => void) {
    onIceCandidate = callback
  }

  function setOnConnectionStateChange(
    callback: (peerId: string, state: RTCPeerConnectionState) => void
  ) {
    onConnectionStateChange = callback
  }

  function setOnDataChannelOpen(callback: (peerId: string) => void) {
    onDataChannelOpen = callback
  }

  // 获取连接数
  function getConnectionCount(): number {
    return peerConnections.value.size
  }

  // 获取所有已连接的 peer ID
  function getConnectedPeers(): string[] {
    const connected: string[] = []
    peerConnections.value.forEach((pc, peerId) => {
      if (pc.connectionState === 'connected') {
        connected.push(peerId)
      }
    })
    return connected
  }

  return {
    peerConnections,
    dataChannels,
    connectionState,
    error,
    createPeerConnection,
    createOffer,
    handleOffer,
    handleAnswer,
    addIceCandidate,
    sendData,
    broadcastData,
    closePeer,
    closeAll,
    setOnDataReceived,
    setOnIceCandidate,
    setOnConnectionStateChange,
    setOnDataChannelOpen,
    getConnectionCount,
    getConnectedPeers
  }
}
