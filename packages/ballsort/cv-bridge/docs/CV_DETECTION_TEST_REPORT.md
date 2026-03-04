# CV Detection 测试报告

执行时间：按 CV_DETECTION_TEST_PLAN.md 执行

---

## L1: 单元测试 ✅ PASS

```
cv-bridge/test_cv_processor.py::test_process_frame_with_tubes PASSED
cv-bridge/test_cv_processor.py::test_process_frame_with_balls PASSED
cv-bridge/test_cv_processor.py::test_process_frame_invalid_base64 PASSED
cv-bridge/test_cv_processor.py::test_process_frame_empty_or_no_aruco PASSED
cv-bridge/test_cv_processor.py::test_process_frame_data_url_format PASSED
cv-bridge/test_cv_processor.py::test_process_frame_decode_failure PASSED

6 passed in 0.16s
```

---

## L2: 合成帧 WebSocket 测试 ✅ PASS

```
Response: status=ok, tubes=[{id:0, x:93.5, y:93.5}], processingMs=1.16
E2E OK: CV Bridge received frame and returned detections
```

- 连接 ws://localhost:8765 ✅
- 响应 status=ok ✅
- detections.tubes 非空 ✅
- processingMs < 500ms ✅

---

## L3: 游戏端到端 ⚠️ 部分通过

| 步骤 | 预期 | 实际 |
|-----|------|------|
| 1 游戏加载 | "CV: Paused - Press S to step" | ✅ |
| 2 按 C 进入 CV 模式 | ArUco 显示 | ✅ |
| 3 按 S 发送帧 | 发送成功 | ✅ |
| 4 CV UI 显示帧 | 显示游戏画面 | ⚠️ 帧区域黑屏 |
| 5 tubes 非空 | 含 0–13 | ❌ tubes: [] |
| 6 balls 非空 | 若有球 | ❌ balls: [] |
| 7 processingMs 合理 | < 500ms | ✅ 15.31 ms |
| 8 overlay 标注 | 绿/橙框 | ❌ 无检测则无框 |

**观察**：
- CV UI 已连接，Frames 计数增加（138），说明收到广播
- frameSize: 2160x1080，数据格式正常
- **tubes/balls 为空**：游戏帧中 ArUco 未被检测到（可能未在 CV 模式、标记过小或 JPEG 压缩）
- **帧区域黑屏**：需按排查计划检查（见 CV_DETECTION_TEST_PLAN.md）

---

## L4: 边界测试 ✅ 部分执行

| 用例 | 结果 |
|-----|------|
| 无效 base64 | ✅ PASS（status: error, 含 error 字段） |
| 无 OpenCV 环境 | 未执行（会破坏环境） |
| 小/大分辨率 | 未执行（手动） |

---

## 总结

| 层级 | 结果 |
|-----|------|
| L1 | ✅ 6/6 通过 |
| L2 | ✅ 通过 |
| L3 | ⚠️ 帧接收正常，检测为空，帧区黑屏 |
| L4 | ✅ 无效 base64 通过 |

**Console 排查结果**（Cursor 内置浏览器）：
- 游戏：`[CV] captureFrame w=2160 h=1080 dataLen=19395` — dataLen 偏小（正常约 100–300KB），疑为黑/暗帧
- CV UI：`[CV-UI] img onload ok 2160 x 1080` — 图像加载成功，无 onerror
- **结论**：传输与显示链路正常，黑屏可能因**捕获到的 canvas 内容为黑**（如暂停时未渲染、标签页在后台等）

**待排查**：
1. L3 游戏帧检测为空 → 确认按 C 后画面为 ArUco，或调大标记/提高质量
2. CV UI 帧区黑屏 → 图像内容为黑；尝试在游戏主窗口（非 simulator）、标签页聚焦时按 S
