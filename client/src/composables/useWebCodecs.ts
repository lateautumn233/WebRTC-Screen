import { ref, shallowRef } from 'vue'
import type { EncoderSettings, CodecType, EncodedFrameData } from '../types'
import { CODEC_MAP, RESOLUTION_MAP, DEFAULT_ENCODER_SETTINGS } from '../types'
import { logger } from '../utils/logger'

// MediaStreamTrackProcessor 类型声明
declare class MediaStreamTrackProcessor {
  constructor(init: { track: MediaStreamTrack })
  readable: ReadableStream<VideoFrame>
}

export function useWebCodecs() {
  const encoder = shallowRef<VideoEncoder | null>(null)
  const decoder = shallowRef<VideoDecoder | null>(null)
  const isEncoding = ref(false)
  const isDecoding = ref(false)
  const error = ref<string | null>(null)
  const settings = ref<EncoderSettings>({ ...DEFAULT_ENCODER_SETTINGS })
  // 硬件编/解码不可用、已回退到软件编/解码时的提示信息（非阻断性）
  const hardwareFallback = ref<string | null>(null)

  // 编码输出回调
  let onEncodedFrame: ((data: EncodedFrameData) => void) | null = null
  // 解码输出回调
  let onDecodedFrame: ((frame: VideoFrame, decodeLatencyMs: number) => void) | null = null
  // 解码器出错回调（解码器会自动进入 closed 状态，无法继续使用，需要调用方重新 initDecoder 并请求关键帧）
  let onDecoderError: (() => void) | null = null

  // 编码延迟测量：帧 timestamp -> performance.now()
  const encodeStartTimes = new Map<number, number>()
  // 解码延迟测量：帧 timestamp -> performance.now()
  const decodeStartTimes = new Map<number, number>()

  // 各编解码器的 profile/level 字符串本身限定了最大分辨率*帧率编码能力
  // （如 avc1.640028 = H.264 High Profile Level 4.0，硬上限约 1920x1080@30fps）。
  // 固定用一个 level 会导致 1440p 或高帧率组合被浏览器判定为不支持，即使编解码器本身能处理。
  // 按 level 从低到高依次探测，取浏览器认可的、能满足当前分辨率/帧率的最低 level。
  // VP8 编码字符串没有 level 字段，不需要阶梯。
  const LEVEL_LADDER: Partial<Record<CodecType, string[]>> = {
    h264: [
      'avc1.640028', // Level 4.0
      'avc1.640029', // Level 4.1
      'avc1.64002A', // Level 4.2
      'avc1.640032', // Level 5.0
      'avc1.640033', // Level 5.1
      'avc1.640034', // Level 5.2
      'avc1.64003C', // Level 6.0
      'avc1.64003D', // Level 6.1
      'avc1.64003E'  // Level 6.2
    ],
    hevc: [
      'hvc1.1.6.L120.90', // Level 4.0
      'hvc1.1.6.L123.90', // Level 4.1
      'hvc1.1.6.L150.90', // Level 5.0
      'hvc1.1.6.L153.90', // Level 5.1
      'hvc1.1.6.L156.90', // Level 5.2
      'hvc1.1.6.L180.90', // Level 6.0
      'hvc1.1.6.L183.90', // Level 6.1
      'hvc1.1.6.L186.90'  // Level 6.2
    ],
    vp9: [
      'vp09.00.10.08', // Level 1.0
      'vp09.00.11.08', // Level 1.1
      'vp09.00.20.08', // Level 2.0
      'vp09.00.21.08', // Level 2.1
      'vp09.00.30.08', // Level 3.0
      'vp09.00.31.08', // Level 3.1
      'vp09.00.40.08', // Level 4.0
      'vp09.00.41.08', // Level 4.1
      'vp09.00.50.08', // Level 5.0
      'vp09.00.51.08', // Level 5.1
      'vp09.00.52.08', // Level 5.2
      'vp09.00.60.08', // Level 6.0
      'vp09.00.61.08', // Level 6.1
      'vp09.00.62.08'  // Level 6.2
    ],
    av1: [
      'av01.0.04M.08', // Level 3.0
      'av01.0.05M.08', // Level 3.1
      'av01.0.08M.08', // Level 4.0
      'av01.0.09M.08', // Level 4.1
      'av01.0.10M.08', // Level 4.2
      'av01.0.11M.08', // Level 4.3
      'av01.0.12M.08', // Level 5.0
      'av01.0.13M.08', // Level 5.1
      'av01.0.14M.08', // Level 5.2
      'av01.0.16M.08'  // Level 6.0
    ]
  }

  async function isEncoderConfigSupported(
    codecString: string,
    width: number,
    height: number,
    framerate: number,
    hardwareAcceleration: HardwareAcceleration
  ): Promise<boolean> {
    try {
      const result = await VideoEncoder.isConfigSupported({
        codec: codecString,
        width,
        height,
        bitrate: 4_000_000,
        framerate,
        hardwareAcceleration
      })
      return result.supported ?? false
    } catch {
      return false
    }
  }

  interface ResolvedEncoderConfig {
    codecString: string
    hardwareAcceleration: HardwareAcceleration
    isSoftwareFallback: boolean
  }

  // 探测能满足目标分辨率/帧率的编解码器字符串：优先尝试硬件编码（按 level 由低到高），
  // 硬件全部不支持时再尝试软件编码，命中软件时标记 isSoftwareFallback 供调用方提示用户。
  // 没有 level 阶梯的编解码器（VP8）直接用固定值探测。
  const encoderConfigCache = new Map<string, ResolvedEncoderConfig | null>()
  async function resolveEncoderConfig(codec: CodecType, width: number, height: number, framerate: number): Promise<ResolvedEncoderConfig | null> {
    const cacheKey = `${codec}:${width}x${height}@${framerate}`
    const cached = encoderConfigCache.get(cacheKey)
    if (cached !== undefined) return cached

    const candidates = LEVEL_LADDER[codec] ?? [CODEC_MAP[codec]]

    for (const hardwareAcceleration of ['prefer-hardware', 'prefer-software'] as const) {
      for (const codecString of candidates) {
        if (await isEncoderConfigSupported(codecString, width, height, framerate, hardwareAcceleration)) {
          const resolved: ResolvedEncoderConfig = {
            codecString,
            hardwareAcceleration,
            isSoftwareFallback: hardwareAcceleration === 'prefer-software'
          }
          encoderConfigCache.set(cacheKey, resolved)
          return resolved
        }
      }
    }
    encoderConfigCache.set(cacheKey, null)
    return null
  }

  // 检查编解码器支持，探测时使用调用方实际打算使用的分辨率/帧率组合，
  // 避免固定 1080p@30fps 探测结果与用户真实配置（如 120fps、1440p）不一致
  async function checkCodecSupport(
    codec: CodecType,
    width = 1920,
    height = 1080,
    framerate = 30
  ): Promise<boolean> {
    return (await resolveEncoderConfig(codec, width, height, framerate)) !== null
  }

  // 获取支持的编解码器列表
  async function getSupportedCodecs(width = 1920, height = 1080, framerate = 30): Promise<CodecType[]> {
    const codecs: CodecType[] = ['h264', 'hevc', 'vp8', 'vp9', 'av1']
    const supported: CodecType[] = []

    for (const codec of codecs) {
      if (await checkCodecSupport(codec, width, height, framerate)) {
        supported.push(codec)
      }
    }
    return supported
  }

  // 初始化编码器
  async function initEncoder(
    track: MediaStreamTrack,
    encoderSettings: EncoderSettings,
    onOutput: (data: EncodedFrameData) => void
  ) {
    try {
      error.value = null
      settings.value = encoderSettings
      onEncodedFrame = onOutput

      const trackSettings = track.getSettings()
      const resolution = RESOLUTION_MAP[encoderSettings.resolution]

      const width = resolution?.width ?? trackSettings.width ?? 1920
      const height = resolution?.height ?? trackSettings.height ?? 1080
      const resolved = await resolveEncoderConfig(encoderSettings.codec, width, height, encoderSettings.framerate)
      if (!resolved) {
        throw new Error(`当前浏览器/硬件不支持 ${encoderSettings.codec} 编码 ${width}x${height}@${encoderSettings.framerate}fps`)
      }
      const codecString = resolved.codecString

      // 软件编码回退已经在 SettingsPanel 选择编码组合时提前提示过，共享画面下方不再重复展示，
      // 只保留控制台日志方便排查
      if (resolved.isSoftwareFallback) {
        logger.warn(`${encoderSettings.codec.toUpperCase()} 未检测到可用硬件编码器，已切换为软件编码，可能增加 CPU 占用`)
      }

      // 缓存的 config 数据，用于新观众加入时重发
      let cachedConfigData: EncodedFrameData | null = null

      // 配置编码器
      const config: VideoEncoderConfig = {
        codec: codecString,
        width,
        height,
        bitrate: encoderSettings.bitrate * 1_000_000,
        bitrateMode: encoderSettings.bitrateMode === 'vbr' ? 'variable' : 'constant',
        framerate: encoderSettings.framerate,
        latencyMode: 'realtime',
        hardwareAcceleration: resolved.hardwareAcceleration
      }

      // H.264 特定配置
      if (encoderSettings.codec === 'h264') {
        (config as VideoEncoderConfig & { avc?: { format: string } }).avc = { format: 'annexb' }
      }

      encoder.value = new VideoEncoder({
        output: (chunk, metadata) => {
          const data = new ArrayBuffer(chunk.byteLength)
          chunk.copyTo(data)

          // 计算编码延迟
          const encodeStart = encodeStartTimes.get(chunk.timestamp)
          const encodeLatencyMs = encodeStart ? performance.now() - encodeStart : undefined
          encodeStartTimes.delete(chunk.timestamp)
          // 防止内存泄漏
          if (encodeStartTimes.size > 100) {
            const oldest = encodeStartTimes.keys().next().value
            if (oldest !== undefined) encodeStartTimes.delete(oldest)
          }

          const frameData: EncodedFrameData = {
            type: 'video',
            timestamp: chunk.timestamp,
            duration: chunk.duration ?? undefined,
            data,
            isKeyFrame: chunk.type === 'key',
            encodeLatencyMs
          }

          // 发送配置信息 (每个关键帧都发送)
          if (chunk.type === 'key') {
            // 如果有新的 decoderConfig，更新缓存
            if (metadata?.decoderConfig) {
              cachedConfigData = {
                type: 'config',
                timestamp: chunk.timestamp,
                data: new ArrayBuffer(0),
                codec: codecString,
                width,
                height
              }

              // 如果有 description，添加到配置中
              if (metadata.decoderConfig.description) {
                const desc = metadata.decoderConfig.description
                if (desc instanceof ArrayBuffer) {
                  cachedConfigData.data = desc
                } else if (ArrayBuffer.isView(desc)) {
                  const arrayBuffer = desc.buffer.slice(desc.byteOffset, desc.byteOffset + desc.byteLength) as ArrayBuffer
                  cachedConfigData.data = arrayBuffer
                }
              }
            }

            // 每个关键帧都发送 config（使用缓存的配置）
            if (cachedConfigData) {
              onEncodedFrame?.({ ...cachedConfigData, timestamp: chunk.timestamp })
            }
          }

          onEncodedFrame?.(frameData)
        },
        error: (e) => {
          error.value = `编码器错误: ${e.message}`
          logger.error('Encoder error:', e)
        }
      })

      await encoder.value.configure(config)
      isEncoding.value = true

      // 开始从轨道读取帧
      startEncodingFromTrack(track, encoderSettings.framerate)

      logger.log(`Encoder initialized: ${codecString} ${width}x${height}@${encoderSettings.framerate}fps`)
    } catch (err) {
      error.value = `编码器初始化失败: ${(err as Error).message}`
      logger.error('Encoder init error:', err)
    }
  }

  // 从轨道读取帧并编码
  let frameReader: ReadableStreamDefaultReader<VideoFrame> | null = null
  let encodingActive = false
  let forceNextKeyFrame = false

  async function startEncodingFromTrack(track: MediaStreamTrack, framerate: number) {
    encodingActive = true

    // 使用 MediaStreamTrackProcessor 获取帧
    const processor = new MediaStreamTrackProcessor({ track })
    frameReader = processor.readable.getReader()

    let frameCount = 0
    const keyFrameInterval = framerate * 2 // 每2秒一个关键帧

    try {
      while (encodingActive && encoder.value && frameReader) {
        const { value: frame, done } = await frameReader.read()
        if (done || !frame) break

        if (encoder.value.state === 'configured') {
          // 背压控制：编码器队列积压时跳帧，避免延迟累积
          if (encoder.value.encodeQueueSize > 2) {
            frame.close()
            continue
          }

          // 检查是否需要强制关键帧
          const keyFrame = frameCount % keyFrameInterval === 0 || forceNextKeyFrame
          if (forceNextKeyFrame) {
            forceNextKeyFrame = false
            logger.log('Forcing keyframe for new viewer')
          }
          encodeStartTimes.set(frame.timestamp, performance.now())
          encoder.value.encode(frame, { keyFrame })
          frameCount++
        }
        frame.close()
      }
    } catch (err) {
      logger.error('Frame encoding error:', err)
    }
  }

  // 请求发送关键帧（新观众加入时调用）
  function requestKeyFrame() {
    if (isEncoding.value) {
      forceNextKeyFrame = true
      logger.log('Keyframe requested')
    }
  }

  // 停止编码
  async function stopEncoder() {
    encodingActive = false

    if (frameReader) {
      try {
        await frameReader.cancel()
      } catch {}
      frameReader = null
    }

    if (encoder.value) {
      try {
        await encoder.value.flush()
        encoder.value.close()
      } catch {}
      encoder.value = null
    }

    isEncoding.value = false
    onEncodedFrame = null
  }

  // 存储解码器配置
  let decoderConfig: VideoDecoderConfig | null = null

  // 初始化解码器
  async function initDecoder(
    onOutput: (frame: VideoFrame, decodeLatencyMs: number) => void,
    onError?: () => void
  ) {
    try {
      error.value = null
      onDecodedFrame = onOutput
      onDecoderError = onError ?? null

      decoder.value = new VideoDecoder({
        output: (frame) => {
          const decodeStart = decodeStartTimes.get(frame.timestamp)
          const decodeLatencyMs = decodeStart ? performance.now() - decodeStart : 0
          decodeStartTimes.delete(frame.timestamp)
          onDecodedFrame?.(frame, decodeLatencyMs)
        },
        error: (e) => {
          error.value = `解码器错误: ${e.message}`
          logger.error('Decoder error:', e)
          // VideoDecoder 出错后会自动转入 closed 状态，无法继续 decode，通知调用方重建解码器并请求关键帧恢复
          onDecoderError?.()
        }
      })

      isDecoding.value = true
      logger.log('Decoder initialized, waiting for config...')
    } catch (err) {
      error.value = `解码器初始化失败: ${(err as Error).message}`
      logger.error('Decoder init error:', err)
    }
  }

  // 探测解码该 codec/分辨率能否硬件解码，不行再探测能否软件解码；两者都不支持时返回 null，
  // 调用方需要据此提醒用户（否则会直接黑屏且没有任何提示）。结果按 codec+分辨率缓存，
  // 避免同一路流后续每个关键帧的 config 消息都重新探测一次
  const decoderHwPrefCache = new Map<string, HardwareAcceleration | null>()
  async function resolveDecoderHardwareAcceleration(
    codec: string,
    width: number,
    height: number,
    description?: BufferSource
  ): Promise<HardwareAcceleration | null> {
    const cacheKey = `${codec}:${width}x${height}`
    const cached = decoderHwPrefCache.get(cacheKey)
    if (cached !== undefined) return cached

    let resolved: HardwareAcceleration | null = null
    for (const preference of ['prefer-hardware', 'prefer-software'] as const) {
      try {
        const result = await VideoDecoder.isConfigSupported({
          codec,
          codedWidth: width,
          codedHeight: height,
          description,
          hardwareAcceleration: preference
        })
        if (result.supported) {
          resolved = preference
          break
        }
      } catch {
        // 继续尝试下一个 preference
      }
    }
    decoderHwPrefCache.set(cacheKey, resolved)
    return resolved
  }

  // 处理接收到的编码数据
  async function decodeFrame(frameData: EncodedFrameData) {
    if (!decoder.value) {
      logger.warn('Decoder not initialized')
      return
    }

    // 处理配置数据
    if (frameData.type === 'config') {
      logger.log('Received config:', frameData)

      if (!frameData.codec || !frameData.width || !frameData.height) {
        logger.error('Invalid config data:', frameData)
        return
      }

      const description = frameData.data.byteLength > 0 ? new Uint8Array(frameData.data) : undefined
      const hardwareAcceleration = await resolveDecoderHardwareAcceleration(frameData.codec, frameData.width, frameData.height, description)
      if (!decoder.value) return // 探测期间解码器可能已被停止

      if (hardwareAcceleration === null) {
        error.value = `当前浏览器/硬件不支持解码 ${frameData.codec}（${frameData.width}x${frameData.height}），画面无法显示`
        logger.error(error.value)
        return
      }

      if (hardwareAcceleration === 'prefer-software') {
        hardwareFallback.value = '解码器未检测到可用硬件加速，已切换为软件解码，可能增加 CPU 占用'
        logger.warn(hardwareFallback.value)
      }

      decoderConfig = {
        codec: frameData.codec,
        codedWidth: frameData.width,
        codedHeight: frameData.height,
        description,
        hardwareAcceleration
      }

      try {
        decoder.value.configure(decoderConfig)
        error.value = null
        logger.log(`Decoder configured: ${frameData.codec} ${frameData.width}x${frameData.height} (${hardwareAcceleration})`)
      } catch (err) {
        error.value = `解码器初始化失败: ${(err as Error).message}，画面无法显示`
        logger.error('Decoder config error:', err)
      }
      return
    }

    // 解码视频帧
    if (frameData.type === 'video' && decoder.value.state === 'configured') {
      try {
        const chunk = new EncodedVideoChunk({
          type: frameData.isKeyFrame ? 'key' : 'delta',
          timestamp: frameData.timestamp,
          duration: frameData.duration,
          data: frameData.data
        })
        decodeStartTimes.set(frameData.timestamp, performance.now())
        // 防止内存泄漏
        if (decodeStartTimes.size > 100) {
          const oldest = decodeStartTimes.keys().next().value
          if (oldest !== undefined) decodeStartTimes.delete(oldest)
        }
        decoder.value.decode(chunk)
      } catch (err) {
        logger.error('Decode error:', err)
      }
    }
  }

  // 停止解码
  async function stopDecoder() {
    if (decoder.value) {
      try {
        await decoder.value.flush()
        decoder.value.close()
      } catch {}
      decoder.value = null
    }

    isDecoding.value = false
    onDecodedFrame = null
    onDecoderError = null
    decoderConfig = null
  }

  // 序列化帧数据用于传输
  function serializeFrame(frameData: EncodedFrameData): ArrayBuffer {
    const headerSize = 36 // 固定头部大小
    const codecBytes = new TextEncoder().encode(frameData.codec ?? '')
    const totalSize = headerSize + codecBytes.length + frameData.data.byteLength

    const buffer = new ArrayBuffer(totalSize)
    const view = new DataView(buffer)
    const uint8 = new Uint8Array(buffer)

    // 头部结构:
    // 0-3: type (0=video, 1=audio, 2=config)
    // 4-11: timestamp (float64)
    // 12-19: duration (float64)
    // 20-23: flags (bit 0 = isKeyFrame)
    // 24-27: codec string length
    // 28-31: width/height packed (16bit each)
    // 32-35: encodeLatencyMs (float32)

    view.setUint32(0, frameData.type === 'video' ? 0 : frameData.type === 'audio' ? 1 : 2, true)
    view.setFloat64(4, frameData.timestamp, true)
    view.setFloat64(12, frameData.duration ?? 0, true)
    view.setUint32(20, frameData.isKeyFrame ? 1 : 0, true)
    view.setUint32(24, codecBytes.length, true)
    view.setUint16(28, frameData.width ?? 0, true)
    view.setUint16(30, frameData.height ?? 0, true)
    view.setFloat32(32, frameData.encodeLatencyMs ?? 0, true)

    // codec string
    uint8.set(codecBytes, headerSize)
    // data
    uint8.set(new Uint8Array(frameData.data), headerSize + codecBytes.length)

    return buffer
  }

  // 反序列化帧数据
  function deserializeFrame(buffer: ArrayBuffer): EncodedFrameData {
    const view = new DataView(buffer)
    const uint8 = new Uint8Array(buffer)
    // 兼容旧版 32 字节头和新版 36 字节头
    const hasExtendedHeader = buffer.byteLength >= 36

    const typeNum = view.getUint32(0, true)
    const type = typeNum === 0 ? 'video' : typeNum === 1 ? 'audio' : 'config'
    const timestamp = view.getFloat64(4, true)
    const duration = view.getFloat64(12, true)
    const isKeyFrame = view.getUint32(20, true) === 1
    const codecLength = view.getUint32(24, true)
    const width = view.getUint16(28, true)
    const height = view.getUint16(30, true)
    const encodeLatencyMs = hasExtendedHeader ? view.getFloat32(32, true) : 0

    const headerSize = hasExtendedHeader ? 36 : 32
    const codecBytes = uint8.slice(headerSize, headerSize + codecLength)
    const codec = new TextDecoder().decode(codecBytes)
    const data = buffer.slice(headerSize + codecLength)

    return {
      type,
      timestamp,
      duration: duration || undefined,
      data,
      isKeyFrame,
      codec: codec || undefined,
      width: width || undefined,
      height: height || undefined,
      encodeLatencyMs: encodeLatencyMs || undefined
    }
  }

  return {
    encoder,
    decoder,
    isEncoding,
    isDecoding,
    error,
    hardwareFallback,
    settings,
    checkCodecSupport,
    getSupportedCodecs,
    resolveEncoderConfig,
    initEncoder,
    stopEncoder,
    requestKeyFrame,
    initDecoder,
    decodeFrame,
    resolveDecoderHardwareAcceleration,
    stopDecoder,
    serializeFrame,
    deserializeFrame
  }
}
