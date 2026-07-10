// NAT 类型检测服务：原生实现 https://github.com/lateautumn233/webrtc_check_nat 的双服务器探测协议，
// 不再依赖外部 Python 进程。协议细节（STUN 报文字段布局、主动探测时序）与该项目的 netcheck.py 保持一致，
// 以便与仍在跑 Python 版本的 secondary/primary 节点互相兼容。
import dgram from 'node:dgram'
import type { Server as HttpServer } from 'node:http'
import { createHmac, randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'

// buffer-crc32 只发布了 CJS 风格的 `export =` 类型声明，其自带的 .d.mts 拷贝在 ESM 下会被
// TS 判定为没有默认导出（上游打包脚本的疏漏）。用 createRequire 走 CJS 入口绕开这个问题。
const require = createRequire(import.meta.url)
const crc32 = require('buffer-crc32') as {
  unsigned: (input: Buffer, previousCrc?: Buffer | number) => number
}

const STUN_MAGIC_COOKIE = 0x2112a442
const FINGERPRINT_XOR = 0x5354554e

export type NatCheckMode = 'primary' | 'secondary'

interface SrflxCandidate {
  ip: string
  port: number
}

interface AnalyzeRequestBody {
  localIPs?: string[]
  srflx?: SrflxCandidate[]
  browser_ufrag?: string
  browser_pwd?: string
  server_ufrag?: string
}

interface AnalyzeResult {
  type: string
  ext_ip: string
  ext_port: number
  all_ports: number[]
}

interface ProbeRequestBody {
  target_ip: string
  target_port: number
  req_ufrag: string
  req_pwd: string
  server_ufrag: string
}

// ─── STUN 报文构造/解析 ────────────────────────────────────────────────────

function buildStunHeader(msgType: number, msgLen: number, transactionId: Buffer): Buffer {
  const header = Buffer.alloc(20)
  header.writeUInt16BE(msgType, 0)
  header.writeUInt16BE(msgLen, 2)
  header.writeUInt32BE(STUN_MAGIC_COOKIE, 4)
  transactionId.copy(header, 8)
  return header
}

function packAttribute(type: number, value: Buffer): Buffer {
  const header = Buffer.alloc(4)
  header.writeUInt16BE(type, 0)
  header.writeUInt16BE(value.length, 2)
  return Buffer.concat([header, value])
}

function ipv4ToUint32(ip: string): number {
  const parts = ip.split('.').map(Number)
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
}

// 构造一个伪装成 ICE 连通性检查的 STUN Binding Request：
// USERNAME(bUfrag:sUfrag) + PRIORITY + USE-CANDIDATE + MESSAGE-INTEGRITY(HMAC-SHA1, key=bPwd) + FINGERPRINT(CRC32)
// 用浏览器自己的 ufrag/pwd 签名，使浏览器的 ICE 协议栈认为这是合法的连通性检查而回应。
function makeIceBindingRequest(bUfrag: string, sUfrag: string, bPwd: string): Buffer {
  const transactionId = randomBytes(12)

  const usernameRaw = Buffer.from(`${bUfrag}:${sUfrag}`, 'utf-8')
  const padLen = (4 - (usernameRaw.length % 4)) % 4
  const paddedUsername = Buffer.concat([usernameRaw, Buffer.alloc(padLen)])
  const attrUsername = packAttribute(0x0006, paddedUsername)

  const priorityValue = Buffer.alloc(4)
  priorityValue.writeUInt32BE(1853824767, 0)
  const attrPriority = packAttribute(0x0024, priorityValue)

  const attrUseCandidate = packAttribute(0x0025, Buffer.alloc(0))

  // MESSAGE-INTEGRITY 计算前，STUN 头部长度字段需按“已包含该属性”计算（RFC5389 §15.4）
  const msgLenBeforeIntegrity = attrUsername.length + attrPriority.length + attrUseCandidate.length + 24
  const headerForMac = buildStunHeader(0x0001, msgLenBeforeIntegrity, transactionId)
  const msgPreMac = Buffer.concat([headerForMac, attrUsername, attrPriority, attrUseCandidate])
  const mac = createHmac('sha1', bPwd).update(msgPreMac).digest()
  const attrIntegrity = packAttribute(0x0008, mac)

  const msgLenBeforeFingerprint = msgLenBeforeIntegrity + 8
  const headerFinal = buildStunHeader(0x0001, msgLenBeforeFingerprint, transactionId)
  const msgPreFingerprint = Buffer.concat([headerFinal, attrUsername, attrPriority, attrUseCandidate, attrIntegrity])

  const crc = (crc32.unsigned(msgPreFingerprint) ^ FINGERPRINT_XOR) >>> 0
  const crcValue = Buffer.alloc(4)
  crcValue.writeUInt32BE(crc, 0)
  const attrFingerprint = packAttribute(0x8028, crcValue)

  return Buffer.concat([msgPreFingerprint, attrFingerprint])
}

function parseStunTransactionId(data: Buffer): Buffer | null {
  if (data.length < 20) return null
  if (data.readUInt16BE(0) !== 0x0001) return null
  if (data.readUInt32BE(4) !== STUN_MAGIC_COOKIE) return null
  return data.subarray(8, 20)
}

function buildStunBindingResponse(transactionId: Buffer, ip: string, port: number): Buffer {
  const ipXor = (ipv4ToUint32(ip) ^ STUN_MAGIC_COOKIE) >>> 0
  const portXor = (port ^ (STUN_MAGIC_COOKIE >>> 16)) & 0xffff
  const value = Buffer.alloc(8)
  value.writeUInt8(0, 0)
  value.writeUInt8(1, 1) // family: IPv4
  value.writeUInt16BE(portXor, 2)
  value.writeUInt32BE(ipXor, 4)
  const attr = packAttribute(0x0020, value) // XOR-MAPPED-ADDRESS
  const header = buildStunHeader(0x0101, attr.length, transactionId)
  return Buffer.concat([header, attr])
}

function isBindingResponse(data: Buffer): boolean {
  if (data.length < 20) return false
  const msgType = data.readUInt16BE(0)
  return msgType === 0x0101 || msgType === 0x0111
}

// ─── 被动 STUN 反射服务（供浏览器做 srflx 候选发现） ────────────────────────

function startStunReflector(port: number): dgram.Socket {
  const socket = dgram.createSocket('udp4')
  socket.on('message', (data, rinfo) => {
    const transactionId = parseStunTransactionId(data)
    if (!transactionId) return
    socket.send(buildStunBindingResponse(transactionId, rinfo.address, rinfo.port), rinfo.port, rinfo.address)
  })
  socket.on('error', (err) => {
    console.error(`NAT check: STUN reflector on :${port} error:`, err)
  })
  socket.bind(port)
  return socket
}

// ─── 主动探测：向浏览器已暴露的 srflx ip:port 发一个非请求的连通性检查包，
// 看 NAT 是否放行——收到 Binding Response 即说明放行 ───────────────────────

function sendActiveProbe(
  targetIp: string,
  targetPort: number,
  bUfrag: string,
  bPwd: string,
  sUfrag: string
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4')
    let resolved = false
    let timer: ReturnType<typeof setTimeout>

    const finish = (result: boolean) => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      socket.close()
      resolve(result)
    }

    socket.on('message', (data) => {
      if (isBindingResponse(data)) finish(true)
    })
    socket.on('error', () => finish(false))

    timer = setTimeout(() => finish(false), 1000)

    socket.bind(0, () => {
      socket.send(makeIceBindingRequest(bUfrag, sUfrag, bPwd), targetPort, targetIp)
    })
  })
}

// 请求 secondary 节点代为发起主动探测（Full Cone 检测：探测源 IP 与浏览器已知的 primary 不同）
async function requestSecondaryProbe(
  secondaryUrl: string,
  payload: ProbeRequestBody
): Promise<boolean> {
  try {
    const res = await fetch(`${secondaryUrl.replace(/\/$/, '')}/api/probe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000)
    })
    const json = (await res.json()) as { success?: boolean }
    return json.success === true
  } catch (err) {
    console.error(`NAT check: secondary probe to ${secondaryUrl} failed:`, err)
    return false
  }
}

// ─── Primary: /api/analyze ──────────────────────────────────────────────

async function analyzeNatType(body: AnalyzeRequestBody, secondaryUrl?: string): Promise<AnalyzeResult> {
  const localIPs = new Set(body.localIPs ?? [])
  const srflx = body.srflx ?? []

  const seenPorts = new Set<number>()
  for (const candidate of srflx) seenPorts.add(candidate.port)
  const allPorts = [...seenPorts].sort((a, b) => a - b)

  const extIp = srflx[0]?.ip ?? ''
  const extPort = srflx[0]?.port ?? 0
  const base = { ext_ip: extIp, ext_port: extPort, all_ports: allPorts }

  if (seenPorts.size === 0) {
    return { ...base, type: 'blocked' }
  }
  if (seenPorts.size > 1) {
    return { ...base, type: 'symmetric' }
  }
  if (localIPs.has(extIp)) {
    return { ...base, type: 'open' }
  }
  if (!secondaryUrl) {
    return { ...base, type: 'cone' }
  }

  const bUfrag = body.browser_ufrag ?? ''
  const bPwd = body.browser_pwd ?? ''
  const sUfrag = body.server_ufrag ?? ''

  // Test 1: 经 secondary 节点（不同公网 IP）主动探测 —— 成功即 Full Cone
  const fullCone = await requestSecondaryProbe(secondaryUrl, {
    target_ip: extIp,
    target_port: extPort,
    req_ufrag: bUfrag,
    req_pwd: bPwd,
    server_ufrag: sUfrag
  })
  if (fullCone) {
    return { ...base, type: 'full_cone' }
  }

  // Test 2: 本机换一个新端口主动探测（同 IP 不同端口）—— 成功即 Address-Restricted Cone
  const addressRestricted = await sendActiveProbe(extIp, extPort, bUfrag, bPwd, sUfrag)
  if (addressRestricted) {
    return { ...base, type: 'addr_rest_cone' }
  }

  // 都不通 —— Port-Restricted Cone
  return { ...base, type: 'port_rest_cone' }
}

// ─── Secondary: /api/probe ───────────────────────────────────────────────

async function handleProbeRequest(body: ProbeRequestBody): Promise<{ success: boolean }> {
  const success = await sendActiveProbe(body.target_ip, body.target_port, body.req_ufrag, body.req_pwd, body.server_ufrag)
  return { success }
}

// ─── 对外接口：由 index.ts 按 NAT_CHECK_MODE 调用 ─────────────────────────

export function startNatCheckStunListeners(mode: NatCheckMode): void {
  startStunReflector(3478)
  if (mode === 'primary') {
    startStunReflector(3479)
  }
}

export function registerNatCheckHttpRoutes(httpServer: HttpServer, mode: NatCheckMode, secondaryUrl?: string): void {
  const routePath = mode === 'primary' ? '/api/analyze' : '/api/probe'

  httpServer.on('request', (req, res) => {
    if (!req.url || req.url !== routePath) return // 不是我们的路径，交给 Socket.IO 或其他监听器处理

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      })
      res.end()
      return
    }

    if (req.method !== 'POST') {
      res.writeHead(405, { 'Access-Control-Allow-Origin': '*' })
      res.end()
      return
    }

    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      void (async () => {
        try {
          const parsed = JSON.parse(body)
          const result = mode === 'primary'
            ? await analyzeNatType(parsed, secondaryUrl)
            : await handleProbeRequest(parsed)
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
          res.end(JSON.stringify(result))
        } catch (err) {
          console.error('NAT check: request handling failed:', err)
          res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
          res.end(JSON.stringify({ error: 'internal error' }))
        }
      })()
    })
  })
}
