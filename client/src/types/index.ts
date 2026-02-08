// 编码器类型
export type CodecType = 'h264' | 'hevc' | 'vp8' | 'vp9' | 'av1'

// 分辨率预设
export type ResolutionPreset = '720p' | '1080p' | '1440p' | 'original'

// 帧率预设
export type FrameratePreset = 15 | 30 | 60

// 编码设置
export interface EncoderSettings {
  codec: CodecType
  resolution: ResolutionPreset
  framerate: FrameratePreset
  bitrate: number // Mbps
}

// 分辨率映射
export const RESOLUTION_MAP: Record<ResolutionPreset, { width: number; height: number } | null> = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '1440p': { width: 2560, height: 1440 },
  'original': null
}

// 编码器字符串映射
// H.264: avc1.640028 = High Profile, Level 4.0 (更好压缩率)
// HEVC: hvc1.1.6.L120.90 = Main Profile, Level 4.0
export const CODEC_MAP: Record<CodecType, string> = {
  'h264': 'avc1.640028',
  'hevc': 'hvc1.1.6.L120.90',
  'vp8': 'vp8',
  'vp9': 'vp09.00.10.08',
  'av1': 'av01.0.04M.08'
}

// 默认编码设置
export const DEFAULT_ENCODER_SETTINGS: EncoderSettings = {
  codec: 'h264',
  resolution: '1080p',
  framerate: 30,
  bitrate: 4
}

// 连接状态
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'failed'

// 房间模式
export type RoomMode = 'classic' | 'conference'

// 房间角色
export type RoomRole = 'host' | 'viewer' | 'participant'

// 房间状态（经典模式）
export interface RoomState {
  roomId: string | null
  role: RoomRole | null
  hostId: string | null
  viewerCount: number
  connected: boolean
}

// 会议模式参与者信息
export interface ParticipantInfo {
  id: string
  isSharing: boolean
}

// 会议模式房间状态
export interface ConferenceRoomState {
  roomId: string | null
  myId: string | null
  participants: ParticipantInfo[]
  connected: boolean
}

// 信令消息类型
export interface SignalingEvents {
  'join-room': { roomId: string; isHost: boolean; mode?: RoomMode }
  'joined': { role: RoomRole; roomId: string; hasHost?: boolean; mode?: RoomMode; participants?: ParticipantInfo[] }
  'room-state': { hostId: string | null; viewerCount: number }
  'host-joined': void
  'host-left': void
  'viewer-joined': { viewerId: string }
  'offer': { senderId?: string; targetId?: string; offer: RTCSessionDescriptionInit }
  'answer': { senderId?: string; targetId?: string; answer: RTCSessionDescriptionInit }
  'ice-candidate': { senderId?: string; targetId?: string; candidate: RTCIceCandidateInit }
  'stream-requested': { viewerId: string }
  'request-stream': void
  'error': { message: string }
  // 会议模式事件
  'conference-state': { participants: ParticipantInfo[] }
  'start-sharing': void
  'stop-sharing': void
  'sharer-started': { sharerId: string }
  'sharer-stopped': { sharerId: string }
  'request-peer-stream': { targetId: string }
  'peer-stream-requested': { viewerId: string }
  'participant-left': { participantId: string }
}

// 编码帧数据 (用于 DataChannel 传输)
export interface EncodedFrameData {
  type: 'video' | 'audio' | 'config'
  timestamp: number
  duration?: number
  data: ArrayBuffer
  isKeyFrame?: boolean
  codec?: string
  width?: number
  height?: number
}
