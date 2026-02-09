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

  // 编码输出回调
  let onEncodedFrame: ((data: EncodedFrameData) => void) | null = null
  // 解码输出回调
  let onDecodedFrame: ((frame: VideoFrame) => void) | null = null

  // 检查编解码器支持
  async function checkCodecSupport(codec: CodecType): Promise<boolean> {
    const codecString = CODEC_MAP[codec]
    try {
      const result = await VideoEncoder.isConfigSupported({
        codec: codecString,
        width: 1920,
        height: 1080,
        bitrate: 4_000_000,
        framerate: 30
      })
      return result.supported ?? false
    } catch {
      return false
    }
  }

  // 获取支持的编解码器列表
  async function getSupportedCodecs(): Promise<CodecType[]> {
    const codecs: CodecType[] = ['h264', 'hevc', 'vp8', 'vp9', 'av1']
    const supported: CodecType[] = []

    for (const codec of codecs) {
      if (await checkCodecSupport(codec)) {
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
      const codecString = CODEC_MAP[encoderSettings.codec]

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
        hardwareAcceleration: 'prefer-hardware'
      }

      // H.264 特定配置
      if (encoderSettings.codec === 'h264') {
        (config as VideoEncoderConfig & { avc?: { format: string } }).avc = { format: 'annexb' }
      }

      encoder.value = new VideoEncoder({
        output: (chunk, metadata) => {
          const data = new ArrayBuffer(chunk.byteLength)
          chunk.copyTo(data)

          const frameData: EncodedFrameData = {
            type: 'video',
            timestamp: chunk.timestamp,
            duration: chunk.duration ?? undefined,
            data,
            isKeyFrame: chunk.type === 'key'
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
  async function initDecoder(onOutput: (frame: VideoFrame) => void) {
    try {
      error.value = null
      onDecodedFrame = onOutput

      decoder.value = new VideoDecoder({
        output: (frame) => {
          onDecodedFrame?.(frame)
        },
        error: (e) => {
          error.value = `解码器错误: ${e.message}`
          logger.error('Decoder error:', e)
        }
      })

      isDecoding.value = true
      logger.log('Decoder initialized, waiting for config...')
    } catch (err) {
      error.value = `解码器初始化失败: ${(err as Error).message}`
      logger.error('Decoder init error:', err)
    }
  }

  // 处理接收到的编码数据
  function decodeFrame(frameData: EncodedFrameData) {
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

      decoderConfig = {
        codec: frameData.codec,
        codedWidth: frameData.width,
        codedHeight: frameData.height,
        description: frameData.data.byteLength > 0 ? new Uint8Array(frameData.data) : undefined
      }

      try {
        decoder.value.configure(decoderConfig)
        logger.log(`Decoder configured: ${frameData.codec} ${frameData.width}x${frameData.height}`)
      } catch (err) {
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
    decoderConfig = null
  }

  // 序列化帧数据用于传输
  function serializeFrame(frameData: EncodedFrameData): ArrayBuffer {
    const headerSize = 32 // 固定头部大小
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

    view.setUint32(0, frameData.type === 'video' ? 0 : frameData.type === 'audio' ? 1 : 2, true)
    view.setFloat64(4, frameData.timestamp, true)
    view.setFloat64(12, frameData.duration ?? 0, true)
    view.setUint32(20, frameData.isKeyFrame ? 1 : 0, true)
    view.setUint32(24, codecBytes.length, true)
    view.setUint16(28, frameData.width ?? 0, true)
    view.setUint16(30, frameData.height ?? 0, true)

    // codec string
    uint8.set(codecBytes, headerSize)
    // data
    uint8.set(new Uint8Array(frameData.data), headerSize + codecBytes.length)

    return buffer
  }

  // 反序列化帧数据
  function deserializeFrame(buffer: ArrayBuffer): EncodedFrameData {
    const headerSize = 32
    const view = new DataView(buffer)
    const uint8 = new Uint8Array(buffer)

    const typeNum = view.getUint32(0, true)
    const type = typeNum === 0 ? 'video' : typeNum === 1 ? 'audio' : 'config'
    const timestamp = view.getFloat64(4, true)
    const duration = view.getFloat64(12, true)
    const isKeyFrame = view.getUint32(20, true) === 1
    const codecLength = view.getUint32(24, true)
    const width = view.getUint16(28, true)
    const height = view.getUint16(30, true)

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
      height: height || undefined
    }
  }

  return {
    encoder,
    decoder,
    isEncoding,
    isDecoding,
    error,
    settings,
    checkCodecSupport,
    getSupportedCodecs,
    initEncoder,
    stopEncoder,
    requestKeyFrame,
    initDecoder,
    decodeFrame,
    stopDecoder,
    serializeFrame,
    deserializeFrame
  }
}
