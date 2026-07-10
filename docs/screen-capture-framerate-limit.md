# 屏幕捕获帧率限制排查报告

## 问题

设置面板支持选择 120fps，但共享整个屏幕或窗口时，观看端实际帧率始终只有 45-55fps 左右，与请求的帧率（60/120）无关。

## 结论

Chromium 的整屏/窗口共享（`displaySurface: 'monitor'` / `'window'`）在当前架构下存在一个**无法从应用层或浏览器参数关闭**的帧丢弃机制，会把交付帧率限制在约 45-55fps，与显示器刷新率、请求帧率、捕获分辨率均无关。这是 Chromium 的架构限制，不是本项目代码的 bug。

## 根因（有 `chrome://tracing` 实测数据支撑）

Chromium 源码 `content/browser/media/capture/desktop_capture_device.cc` 的 `DesktopCaptureDevice::Core::OnCaptureResult()` 中有一段"零赫兹"（zero-hertz）省电优化逻辑：

```cpp
const bool zero_hertz_is_active =
    zero_hertz_is_supported() && !first_ref_time_.is_null() &&
    !frame_is_refresh && frame->updated_region().is_empty();

if (zero_hertz_is_active) {
  ScheduleNextCaptureFrame();
  return;   // 判定"和上一帧没区别"，直接丢弃，不进入后续投递管线
}
```

用 `chrome://tracing` 抓取本项目实际共享 testufo.com 满帧动画时的 trace，过滤 `cat=="webrtc"` 且 `name=="operator()"`（即被内联的 `OnCaptureResult`）事件，按 `frame_is_refresh`/`is_refresh_frame` 参数区分真实捕获与周期性刷新轮询后得到：

| 阶段 | 事件数 | 平均帧间隔 | 折合帧率 |
|---|---|---|---|
| `OnCaptureResult`（原生捕获完成，浏览器进程内） | 2836 | 8.89ms | ~112.5fps |
| `VideoCaptureDeviceClient::OnIncomingCapturedData`（真正投递进管线） | 1083 | 23.04ms | ~43.4fps |

同一线程（`tid=182264`）内，2836 次成功捕获里有 **62%** 被判定为"零变化"直接丢弃，只有 1083 次真正流向下游——与应用层日志实测的 ~43-50fps 完全吻合。这层判断发生在"选哪个捕获后端（DXGI/WGC）""CPU 占用节流系数"等机制生效**之前**，因此调整那些设置均无效。

第三方独立验证：GitHub `steveseguin/problems-with-webRTC` 记录了几乎相同的现象（"Variable frame frames in screen sharing; 57/43 fps; not 60."），说明这是被广泛观察到的已知 Chromium 行为，不是单台机器的个例。

## 已排查、确认无效的方向

| 方向 | 操作 | 结果 |
|---|---|---|
| 分辨率带宽假设 | `getDisplayMedia` 加 `width`/`height` 约束，1440p 降到 1080p | 无效，排除带宽瓶颈 |
| CPU 节流系数假设 | 命令行参数 `--webrtc-max-cpu-consumption-percentage=100`（已通过 `chrome://version` 确认生效） | 无效，排除 `kDefaultMaximumCpuConsumptionPercentage=50` 是瓶颈 |
| 捕获后端假设 | `chrome://flags` 搜索 `wgc`，启用 "Use Windows WGC API for screen capture" | 无效，DXGI 与 WGC 结果一致 |
| 零赫兹开关 | 搜索是否存在独立的 `chrome://flags` 或 `--disable-features` 开关 | 未找到公开的用户可调开关 |

## 决定性证据：零赫兹开关在源码里是硬编码，没有 feature flag 包裹

在 `desktop_capture_device.cc` 中构造 `DesktopCaptureOptions` 的位置找到了赋值语句：

```cpp
if (source.type == DesktopMediaID::TYPE_SCREEN) {
  options.set_allow_wgc_zero_hertz(true);
}
options.set_allow_wgc_window_capturer(true);
if (source.type == DesktopMediaID::TYPE_WINDOW) {
  options.set_allow_wgc_zero_hertz(true);
}
options.set_allow_wgc_using_texture(
    base::FeatureList::IsEnabled(features::kWebRtcAllowWgcUsingTexture));
options.set_wgc_require_border(
    base::FeatureList::IsEnabled(features::kWebRtcWgcRequireBorder));
```

同一段代码里可以直接对比：`allow_wgc_using_texture`、`wgc_require_border` 都是通过 `base::FeatureList::IsEnabled(...)` 读取 feature flag 决定的，可以用 `--enable-features`/`--disable-features` 或 `chrome://flags` 调整；而 **`allow_wgc_zero_hertz` 只要捕获类型是屏幕或窗口就无条件 `set(true)`，没有被任何 `FeatureList::IsEnabled` 判断包裹**。也就是说官方 Chrome 发行版里根本不存在对应的 feature flag 开关可以覆盖它——不是没搜到，是代码里确实没有留这个口子。除非自行编译修改这一行的定制版 Chromium，否则无法在应用层或浏览器参数层面关闭。至此可以确认排查已到边界，无需再找。

## 唯一确认有效的路径：标签页捕获

共享**浏览器标签页**（`getDisplayMedia` 的 `displaySurface: 'browser'`）走的是 Chromium 合成器直取路径，不经过 `DesktopCaptureDevice` 这套省电判定逻辑，可以真正跑到 120fps。代价是只能共享单个标签页内容，无法共享整个桌面或其他应用窗口，是功能取舍而非参数调整。

## 代码现状

- `client/src/composables/useScreenCapture.ts`：`startCapture` 支持按 `EncoderSettings.resolution` 约束捕获分辨率（`width`/`height` 的 `ideal` 约束），减少捕获层开销，逻辑合理，予以保留。
- `client/src/composables/useWebCodecs.ts`：编码循环内置诊断日志，每 5 秒打印一次 `capture fps` / `backpressure-skipped fps` / `encodeQueueSize`，用于区分瓶颈在捕获层还是编码层。
- `client/src/composables/useWebRTC.ts`：`sendData` 内置诊断日志，DataChannel 缓冲区满导致丢帧时打印统计（5 秒节流），用于判断网络传输是否为瓶颈。
- `client/src/components/SettingsPanel.vue`：120fps 选项下方标注提示——"120 fps 仅共享浏览器标签页时可达到；共享整个屏幕或窗口会被 Chrome 引擎限制在约 50-60 fps（与分辨率、显示器刷新率无关）"，如实反映本次排查结论。

## 诊断方法留档（供后续复现/排查用）

1. 在共享端 Chrome 控制台观察三行诊断日志：
   - `Capture started: WxH@FPSfps (requested Nfps, surface: ...)` —— 捕获协商结果（注意：`getSettings().frameRate` 只是协商约束回显，不代表真实交付帧率）
   - `Encode pipeline: capture Xfps, backpressure-skipped Yfps, queue=Z` —— 每 5 秒一次，X 是真实捕获层交付帧率，Y 是编码器背压丢帧率
   - `DataChannel buffer full: dropped N frames in last Xs` —— 出现即说明网络/码率是瓶颈
2. 如需更深入定位，用 `chrome://tracing` 录制，手动选择分类勾选 `webrtc`、`gpu`、`gpu.capture`、`toplevel`，共享过程中录制 8-10 秒，导出 JSON 后按 `cat=="webrtc"` 过滤分析 `OnCaptureResult`（呈现为 `operator()`）与 `VideoCaptureDeviceClient::OnIncomingCapturedData` 两级事件的帧间隔，对比两者差异即可判断是否命中"零赫兹"丢帧。
