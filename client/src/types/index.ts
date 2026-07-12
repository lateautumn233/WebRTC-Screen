// 编码器类型
export type CodecType = 'h264' | 'hevc' | 'vp8' | 'vp9' | 'av1'

// 分辨率预设
export type ResolutionPreset = '720p' | '1080p' | '1440p' | 'original'

// 帧率预设（120 为 Chromium 屏幕捕获上限，需高刷新率显示器才能实际达到）
export type FrameratePreset = 15 | 30 | 60 | 120

// 码率模式
export type BitrateMode = 'cbr' | 'vbr'

// 编码设置
export interface EncoderSettings {
  codec: CodecType
  resolution: ResolutionPreset
  framerate: FrameratePreset
  bitrate: number // Mbps
  bitrateMode: BitrateMode
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
  bitrate: 4,
  bitrateMode: 'cbr'
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
  username?: string
  // 该参与者上报的本机 NAT 类型（经信令服务器广播，加入房间后无需建立 P2P 连接即可获得）
  natType?: NatType
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
  'join-room': { roomId: string; isHost: boolean; mode?: RoomMode; username?: string }
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
  'update-nat-type': { natType: NatType }
}

// NAT 类型（探测结果由外部 NAT 检测服务给出，本仓库不重新实现探测逻辑）
// open: 公网直连；nat1-4: 依次对应 Full Cone / Address-Restricted / Port-Restricted / Symmetric
// cone_unknown: 已知是锥形但子类型未知（检测服务未配置双节点架构）；blocked: UDP 被屏蔽；unknown: 未检测/检测失败
export type NatType = 'open' | 'nat1' | 'nat2' | 'nat3' | 'nat4' | 'cone_unknown' | 'blocked' | 'unknown'

// NAT 类型显示文案
export const NAT_TYPE_LABEL_MAP: Record<NatType, string> = {
  open: '公网直连',
  nat1: 'NAT1（全锥形）',
  nat2: 'NAT2（地址限制）',
  nat3: 'NAT3（端口限制）',
  nat4: 'NAT4（对称型）',
  cone_unknown: '锥形（子类型未知）',
  blocked: 'UDP 受限',
  unknown: '未检测'
}

// NAT 类型短文案（用于参与者列表等空间受限处，只保留 NAT1-4 简写）
export const NAT_TYPE_SHORT_LABEL_MAP: Record<NatType, string> = {
  open: '公网',
  nat1: 'NAT1',
  nat2: 'NAT2',
  nat3: 'NAT3',
  nat4: 'NAT4',
  cone_unknown: '锥形',
  blocked: '受限',
  unknown: '未知'
}

// NAT 类型徽章样式（延续 emerald=最佳/teal-sky=良好/amber=谨慎/rose=较差/indigo=不确定/slate=未知 的配色语义）
export const NAT_TYPE_BADGE_CLASS_MAP: Record<NatType, string> = {
  open: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  nat1: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
  nat2: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  nat3: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  nat4: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  cone_unknown: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  blocked: 'bg-slate-700/60 text-slate-300 border-slate-600/50',
  unknown: 'bg-slate-800/60 text-slate-500 border-slate-700/50'
}

// NAT 类型 <-> 单字节编码（用于 DataChannel 二进制协议传输，见 useWebRTC.ts 的 MSG_TYPE_NAT_INFO）
export const NAT_TYPE_BYTE_MAP: Record<NatType, number> = {
  unknown: 0,
  open: 1,
  nat1: 2,
  nat2: 3,
  nat3: 4,
  nat4: 5,
  cone_unknown: 6,
  blocked: 7
}

export const NAT_TYPE_BYTE_TO_TYPE: Record<number, NatType> = {
  0: 'unknown',
  1: 'open',
  2: 'nat1',
  3: 'nat2',
  4: 'nat3',
  5: 'nat4',
  6: 'cone_unknown',
  7: 'blocked'
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
  encodeLatencyMs?: number
}
