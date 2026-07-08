import { ref } from 'vue'
import type { EncodedFrameData } from '../types'
import { useWebCodecs } from './useWebCodecs'
import { logger } from '../utils/logger'

export function useConferenceWebCodecs() {
  // 复用现有 useWebCodecs 的编码器和序列化逻辑
  const baseCodecs = useWebCodecs()

  // 多解码器管理：sharerId -> VideoDecoder
  const decoders = new Map<string, VideoDecoder>()
  const decoderConfigs = new Map<string, VideoDecoderConfig>()
  const activeDecoders = ref<Set<string>>(new Set())

  // 解码延迟测量：sharerId -> (timestamp -> performance.now())
  const decoderStartTimes = new Map<string, Map<number, number>>()

  // 编码器：直接委托给 baseCodecs
  const initEncoder = baseCodecs.initEncoder
  const stopEncoder = baseCodecs.stopEncoder
  const requestKeyFrame = baseCodecs.requestKeyFrame
  const serializeFrame = baseCodecs.serializeFrame
  const deserializeFrame = baseCodecs.deserializeFrame
  const isEncoding = baseCodecs.isEncoding
  const hardwareFallback = baseCodecs.hardwareFallback
  const error = baseCodecs.error

  // 为特定共享者初始化解码器
  async function initDecoderForSharer(
    sharerId: string,
    onOutput: (frame: VideoFrame, decodeLatencyMs: number) => void
  ) {
    // 如果已存在，先停止
    await stopDecoderForSharer(sharerId)

    const startTimes = new Map<number, number>()
    decoderStartTimes.set(sharerId, startTimes)

    const decoder = new VideoDecoder({
      output: (frame) => {
        const decodeStart = startTimes.get(frame.timestamp)
        const decodeLatencyMs = decodeStart ? performance.now() - decodeStart : 0
        startTimes.delete(frame.timestamp)
        onOutput(frame, decodeLatencyMs)
      },
      error: (e) => {
        logger.error(`Decoder error for sharer ${sharerId}:`, e)
      }
    })

    decoders.set(sharerId, decoder)
    activeDecoders.value.add(sharerId)
    logger.log(`Decoder initialized for sharer ${sharerId}`)
  }

  // 为特定共享者解码帧
  async function decodeFrameForSharer(sharerId: string, frameData: EncodedFrameData) {
    const decoder = decoders.get(sharerId)
    if (!decoder) {
      return
    }

    // 处理配置数据
    if (frameData.type === 'config') {
      if (!frameData.codec || !frameData.width || !frameData.height) {
        logger.error(`Invalid config data for sharer ${sharerId}:`, frameData)
        return
      }

      const description = frameData.data.byteLength > 0 ? new Uint8Array(frameData.data) : undefined
      const hardwareAcceleration = await baseCodecs.resolveDecoderHardwareAcceleration(frameData.codec, frameData.width, frameData.height, description)
      if (!decoders.has(sharerId)) return // 探测期间该共享者的解码器可能已被停止

      if (hardwareAcceleration === null) {
        error.value = `共享者 ${sharerId} 的画面无法显示：当前浏览器/硬件不支持解码 ${frameData.codec}（${frameData.width}x${frameData.height}）`
        logger.error(error.value)
        return
      }

      if (hardwareAcceleration === 'prefer-software') {
        hardwareFallback.value = '解码器未检测到可用硬件加速，已切换为软件解码，可能增加 CPU 占用'
        logger.warn(hardwareFallback.value)
      }

      const config: VideoDecoderConfig = {
        codec: frameData.codec,
        codedWidth: frameData.width,
        codedHeight: frameData.height,
        description,
        hardwareAcceleration
      }

      decoderConfigs.set(sharerId, config)

      try {
        decoder.configure(config)
        error.value = null
        logger.log(`Decoder configured for sharer ${sharerId}: ${frameData.codec} ${frameData.width}x${frameData.height} (${hardwareAcceleration})`)
      } catch (err) {
        error.value = `共享者 ${sharerId} 的画面无法显示：解码器初始化失败（${(err as Error).message}）`
        logger.error(`Decoder config error for sharer ${sharerId}:`, err)
      }
      return
    }

    // 解码视频帧
    if (frameData.type === 'video' && decoder.state === 'configured') {
      try {
        const chunk = new EncodedVideoChunk({
          type: frameData.isKeyFrame ? 'key' : 'delta',
          timestamp: frameData.timestamp,
          duration: frameData.duration,
          data: frameData.data
        })
        const startTimes = decoderStartTimes.get(sharerId)
        if (startTimes) {
          startTimes.set(frameData.timestamp, performance.now())
          // 防止内存泄漏
          if (startTimes.size > 100) {
            const oldest = startTimes.keys().next().value
            if (oldest !== undefined) startTimes.delete(oldest)
          }
        }
        decoder.decode(chunk)
      } catch (err) {
        logger.error(`Decode error for sharer ${sharerId}:`, err)
      }
    }
  }

  // 停止特定共享者的解码器
  async function stopDecoderForSharer(sharerId: string) {
    const decoder = decoders.get(sharerId)
    if (decoder) {
      try {
        await decoder.flush()
        decoder.close()
      } catch {}
      decoders.delete(sharerId)
      decoderConfigs.delete(sharerId)
      decoderStartTimes.delete(sharerId)
      activeDecoders.value.delete(sharerId)
      logger.log(`Decoder stopped for sharer ${sharerId}`)
    }
  }

  // 停止所有解码器
  async function stopAllDecoders() {
    const sharerIds = Array.from(decoders.keys())
    for (const sharerId of sharerIds) {
      await stopDecoderForSharer(sharerId)
    }
  }

  // 检查是否有特定共享者的解码器
  function hasDecoder(sharerId: string): boolean {
    return decoders.has(sharerId)
  }

  return {
    // 编码器（复用 baseCodecs）
    initEncoder,
    stopEncoder,
    requestKeyFrame,
    serializeFrame,
    deserializeFrame,
    isEncoding,
    hardwareFallback,
    error,
    // 多解码器管理
    activeDecoders,
    initDecoderForSharer,
    decodeFrameForSharer,
    stopDecoderForSharer,
    stopAllDecoders,
    hasDecoder
  }
}
