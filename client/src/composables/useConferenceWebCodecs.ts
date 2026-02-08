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

  // 编码器：直接委托给 baseCodecs
  const initEncoder = baseCodecs.initEncoder
  const stopEncoder = baseCodecs.stopEncoder
  const requestKeyFrame = baseCodecs.requestKeyFrame
  const serializeFrame = baseCodecs.serializeFrame
  const deserializeFrame = baseCodecs.deserializeFrame
  const isEncoding = baseCodecs.isEncoding

  // 为特定共享者初始化解码器
  async function initDecoderForSharer(
    sharerId: string,
    onOutput: (frame: VideoFrame) => void
  ) {
    // 如果已存在，先停止
    await stopDecoderForSharer(sharerId)

    const decoder = new VideoDecoder({
      output: (frame) => {
        onOutput(frame)
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
  function decodeFrameForSharer(sharerId: string, frameData: EncodedFrameData) {
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

      const config: VideoDecoderConfig = {
        codec: frameData.codec,
        codedWidth: frameData.width,
        codedHeight: frameData.height,
        description: frameData.data.byteLength > 0 ? new Uint8Array(frameData.data) : undefined
      }

      decoderConfigs.set(sharerId, config)

      try {
        decoder.configure(config)
        logger.log(`Decoder configured for sharer ${sharerId}: ${frameData.codec} ${frameData.width}x${frameData.height}`)
      } catch (err) {
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
    // 多解码器管理
    activeDecoders,
    initDecoderForSharer,
    decodeFrameForSharer,
    stopDecoderForSharer,
    stopAllDecoders,
    hasDecoder
  }
}
