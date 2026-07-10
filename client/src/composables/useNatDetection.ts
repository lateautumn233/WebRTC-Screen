import { ref, computed } from 'vue'
import type { NatType } from '../types'
import { logger } from '../utils/logger'

// NAT 类型检测服务（可选）。真正的 NAT1-4 精确分类需要服务器主动向浏览器的 NAT 映射端口
// 发送非请求探测包，浏览器 JS 无法自行完成，因此复用外部工具而非在本仓库重新实现：
// https://github.com/lateautumn233/webrtc_check_nat
const NAT_CHECK_URL = (import.meta.env.VITE_NAT_CHECK_URL as string | undefined) || undefined
const NAT_CHECK_SECONDARY_HOST = (import.meta.env.VITE_NAT_CHECK_SECONDARY_HOST as string | undefined) || undefined

// ICE candidate 收集超时（对齐检测服务前端参考实现）
const PROBE_GATHER_TIMEOUT_MS = 3500
// /api/analyze 请求超时：服务端最坏情况下需要依次做 Full Cone（经 secondary 节点，3s）+
// Address-Restricted（本机新端口，1s）两轮主动探测，10s 留有充足余量
const ANALYZE_FETCH_TIMEOUT_MS = 10000

interface SrflxCandidate {
  ip: string
  port: number
}

interface NatProbePayload {
  localIPs: string[]
  srflx: SrflxCandidate[]
  browser_ufrag: string
  browser_pwd: string
  server_ufrag: string
}

interface NatAnalyzeResponse {
  type: string
  label?: string
  details?: string
}

// 模块级单例状态：整个页面会话内，无论多少个视图调用 useNatDetection()，探测只会真正执行一次
const localNatType = ref<NatType>('unknown')
const detecting = ref(false)
let detectPromise: Promise<void> | null = null

// 移植自检测服务内嵌前端 JS 的 gatherCandidates()：
// 用伪造的 SDP answer（篡改 ice-ufrag/ice-pwd/setup，附加一个假的远端 host candidate）把 ICE agent
// 推入 checking 状态，使其在不建立真实连接的情况下持续响应 STUN Binding Request，
// 从而收集 host/srflx candidate 交给检测服务判断 NAT 映射行为。
// 这个探测用的 RTCPeerConnection 与 useWebRTC.ts 中管理的实际投屏连接完全独立，互不干扰。
function gatherIceProbe(primaryHost: string, secondaryHost?: string): Promise<NatProbePayload> {
  const iceServers: RTCIceServer[] = [
    { urls: `stun:${primaryHost}:3478` },
    { urls: `stun:${primaryHost}:3479` }
  ]
  if (secondaryHost) {
    iceServers.push({ urls: `stun:${secondaryHost}:3478` })
  }

  const pc = new RTCPeerConnection({ iceServers })
  pc.createDataChannel('nat-probe')

  const hostIPs = new Set<string>()
  const srflxMap = new Map<string, SrflxCandidate>()
  let resolved = false

  let bUfrag = ''
  let bPwd = ''
  const sUfrag = Math.random().toString(36).substring(2, 10)
  const sPwd = (Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2) + 'abcdefghijklmnop').substring(0, 26)

  return new Promise((resolve, reject) => {
    const complete = () => {
      if (resolved) return
      resolved = true
      pc.close()
      resolve({
        localIPs: [...hostIPs],
        srflx: [...srflxMap.values()],
        browser_ufrag: bUfrag,
        browser_pwd: bPwd,
        server_ufrag: sUfrag
      })
    }

    pc.onicecandidate = (event) => {
      if (!event.candidate) {
        complete()
        return
      }
      const parts = event.candidate.candidate.split(' ')
      const ip = parts[4]
      const port = parseInt(parts[5] ?? '', 10)
      const typ = parts[7]
      if (typ === 'host' && ip && !ip.startsWith('169.254') && ip !== '0.0.0.0' && !ip.includes(':')) {
        hostIPs.add(ip)
      }
      if (typ === 'srflx' && ip) {
        srflxMap.set(`${ip}:${port}`, { ip, port })
      }
    }

    pc.createOffer()
      .then(async (offer) => {
        await pc.setLocalDescription(offer)

        const sdp = offer.sdp || ''
        const uMatch = sdp.match(/a=ice-ufrag:(.+)/)
        const pMatch = sdp.match(/a=ice-pwd:(.+)/)
        bUfrag = uMatch?.[1]?.trim() ?? ''
        bPwd = pMatch?.[1]?.trim() ?? ''

        const ansLines: string[] = []
        for (let line of sdp.split('\n')) {
          line = line.trim()
          if (!line) continue
          if (line.startsWith('a=setup:')) ansLines.push('a=setup:active')
          else if (line.startsWith('a=ice-ufrag:')) ansLines.push(`a=ice-ufrag:${sUfrag}`)
          else if (line.startsWith('a=ice-pwd:')) ansLines.push(`a=ice-pwd:${sPwd}`)
          else if (line.includes('candidate:')) continue
          else if (line.startsWith('a=ice-options:')) continue
          else ansLines.push(line)
        }
        // 附加伪造的远端 host candidate，促使 ICE agent 进入 checking 状态
        ansLines.push('a=candidate:1 1 udp 2113937151 192.0.2.1 9 typ host')

        await pc.setRemoteDescription({ type: 'answer', sdp: ansLines.join('\r\n') + '\r\n' })
      })
      .catch((err) => {
        pc.close()
        reject(err)
      })

    setTimeout(complete, PROBE_GATHER_TIMEOUT_MS)
  })
}

// 检测服务返回的原始 type 字段 -> 本仓库展示用的 NatType
function mapRawNatType(raw: string): NatType {
  switch (raw) {
    case 'open': return 'open'
    case 'full_cone': return 'nat1'
    case 'addr_rest_cone': return 'nat2'
    case 'port_rest_cone': return 'nat3'
    case 'symmetric': return 'nat4'
    case 'cone': return 'cone_unknown'
    case 'blocked': return 'blocked'
    default: return 'unknown'
  }
}

async function runDetection(): Promise<void> {
  if (!NAT_CHECK_URL) {
    localNatType.value = 'unknown'
    return
  }

  detecting.value = true
  try {
    const primaryHost = new URL(NAT_CHECK_URL).hostname
    const probe = await gatherIceProbe(primaryHost, NAT_CHECK_SECONDARY_HOST)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), ANALYZE_FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(`${NAT_CHECK_URL.replace(/\/$/, '')}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(probe),
        signal: controller.signal
      })
      const json = await res.json() as NatAnalyzeResponse
      localNatType.value = mapRawNatType(json.type)
    } finally {
      clearTimeout(timeoutId)
    }
  } catch (err) {
    logger.error('NAT type detection failed:', err)
    localNatType.value = 'unknown'
  } finally {
    detecting.value = false
  }
}

// 触发本机 NAT 类型检测。同一页面会话内重复调用只会执行一次（除非 force = true）
function detectLocalNat(force = false): Promise<void> {
  if (detectPromise && !force) return detectPromise
  detectPromise = runDetection()
  return detectPromise
}

export function useNatDetection() {
  return {
    localNatType,
    detecting,
    natCheckConfigured: computed(() => !!NAT_CHECK_URL),
    detectLocalNat
  }
}
