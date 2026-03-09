# CV Detection 测试报告

**说明**：ArUco 检测已移除，当前使用颜色编码（color_cv_processor）进行 CV 检测。游戏发送 `pixelData` + `colorMap`，服务端通过颜色聚类匹配 object ID。

---

## 测试计划

参见 [CV_DETECTION_TEST_PLAN.md](./CV_DETECTION_TEST_PLAN.md)。

---

## 当前流程

1. 游戏 `?cv=1` 加载，连接 WebSocket
2. 按 **S** 发送一帧：`captureColorCodedFrame` 生成 colorMap + 像素数据
3. 服务端 `process_pixel_data` / `process_color_coded_frame` 解析
4. 返回 `detections.objects` 供 CV UI 和游戏逻辑使用
