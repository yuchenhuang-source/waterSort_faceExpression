# 图片导入功能迁移至 Editor 可行性评估

## 1. 现状概览

| 项目 | 说明 |
|------|------|
| **现有实现** | `scripts/image_import.py`（约 1200 行，v6 路径优先架构） |
| **目标环境** | 前端 Editor：TypeScript + React (EditorUI) + Phaser (Editor 场景) |
| **数据兼容性** | ✅ 脚本输出的 JSON 与 `LevelData` 结构兼容（config.width/height、arrows 含 id/indices/style.color） |

---

## 2. Python 依赖与浏览器替代方案

### 2.1 依赖清单

| Python 依赖 | 用途 | 浏览器/TS 可行性 |
|-------------|------|------------------|
| **PIL (Pillow)** | 读图 → RGBA 数组 | ✅ **Canvas + ImageData**：`createImageBitmap` / `drawImage` + `getImageData()` 可得 `Uint8ClampedArray`，等价 RGBA |
| **numpy** | 数组运算、roll/pad、布尔掩码、histogram、argmax、bincount 等 | ⚠️ **TypedArray + 手写循环**：逻辑可完全用 TS 实现，大图时性能会差一些；或考虑 `ndarray` 等轻量库 |
| **scipy.ndimage** | `binary_closing`、`distance_transform_edt` | ❌ **无直接替代**，需自实现或找库 |
| **sklearn.cluster.KMeans** | 颜色聚类 + 肘部法选 k | ⚠️ **可替代**：npm 如 `ml-kmeans` 或自写简单 KMeans |
| **numpy.fft** | 自相关求网格周期 | ⚠️ **可替代**：用 `fft.js` / `kiss-fft` 等，或不用 FFT 的 O(n²) 自相关（小信号可接受） |

### 2.2 关键算法迁移难度

| 算法/步骤 | 实现特点 | 迁移难度 | 说明 |
|-----------|----------|----------|------|
| 读图 + 亮度/alpha 掩码 | 简单数组/像素遍历 | 🟢 低 | 直接 TS + ImageData |
| 形态学闭运算 `binary_closing` | 依赖 scipy 结构元 | 🟡 中 | 用圆盘结构元在 TS 里两遍遍历实现，或简化成矩形 |
| **距离变换 EDT** | 用于线宽估计、网格偏移、路径上色 | 🟠 中高 | 无现成库；可实现 Felzenszwalb 两遍线性 EDT，或近似（如 Chamfer 迭代） |
| **Zhang-Suen 骨架化** | 仅用 numpy 的 roll/pad/比较 | 🟢 低 | 纯逻辑，用 TypedArray 在 TS 里重写即可 |
| 自相关 + 周期检测 | numpy.fft + 找峰 | 🟡 中 | 用 JS FFT 库或暴力自相关 |
| KMeans + 肘部法 | sklearn | 🟡 中 | `ml-kmeans` 或自写，肘部法为简单数值比较 |
| 骨架 DFS 路径追踪 | 纯 Python set/dict/list | 🟢 低 | 直接翻译为 TS |
| Douglas-Peucker、网格吸附、路径合并 | 纯数学/逻辑 | 🟢 低 | 直接翻译为 TS |
| 箭头头密度检测 | 局部窗口 + numpy.median | 🟡 中 | 用 JS 数组排序取中位数即可 |

---

## 3. 迁移方案对比

### 方案 A：全前端 TypeScript 重写（纯浏览器）

- **做法**：将整条 pipeline 用 TS 实现，依赖 Canvas/ImageData、TypedArray、可选 npm（如 `ml-kmeans`、`fft.js`），EDT 与形态学自实现。
- **优点**：无后端、无部署、离线可用、与现有 Editor 同仓库同语言。
- **缺点**：工作量大（约 2–4 周）；大图（如 768×1344）在主流设备上可能 5–15 秒，需 **Web Worker** 避免卡顿；EDT/形态学需自己保证正确性。
- **可行性**：✅ **可行**，算法均为确定性、无不可替代的底层库。

### 方案 B：保留 Python 后端，Editor 仅调用

- **做法**：本地或服务器跑小型 Python 服务（Flask/FastAPI），提供「上传图片 → 返回 LevelData JSON」接口；EditorUI 增加「选择图片 → 请求接口 → 应用结果」。
- **优点**：迁移量小（1–3 天），行为与当前脚本完全一致，性能好。
- **缺点**：需要 Python 环境或部署后端；本地开发需起服务；无法做纯静态/离线编辑。
- **可行性**：✅ **可行**，适合「先上线、再考虑纯前端」的策略。

### 方案 C：混合（前端简单预处理 + 后端重算）

- **做法**：前端只做裁剪/缩放/压缩后上传，复杂处理仍在 Python。
- **优点**：后端逻辑不变，前端只多一层交互。
- **缺点**：与「全在 Editor 里」的体验仍有差距，仍需后端。
- **可行性**：✅ 可行，但不如 B 简单直接。

---

## 4. 与 Editor 的集成点（与方案无关）

以下无论选哪种迁移方案都会用到：

1. **EditorUI**  
   - 增加入口：如「从图片导入」按钮。  
   - 选择本地文件（`<input type="file" accept="image/*">`）。  
   - 方案 A：把 `File` 交给 Worker 或主线程的 TS 流水线，得到 `LevelData`。  
   - 方案 B：上传到后端，接收 JSON，再当作「加载关卡」处理。

2. **数据格式**  
   - 脚本当前输出已包含：`config`（width/height）、`arrows`（id、indices、style.color）、顶层 `cellSizeX`/`cellSizeY`。  
   - 与 `LevelData` 一致；如需 `meta`/`rule` 可在前端补默认值。  
   - 应用导入结果时：更新 `config`、`cellSizeX/Y`、`arrows`，并触发现有「加载关卡」或「替换当前关卡」逻辑（EventBus + Editor 场景重绘）。

3. **Editor 场景 (Editor.ts)**  
   - 已有 `loadCurrentConfigAsync`、网格与箭头创建逻辑；只需提供「用导入的 LevelData + 可选 cellSize 覆盖当前关卡」的接口（例如 EventBus 事件 `editor-apply-import` 带 `{ levelData, cellSizeX?, cellSizeY? }`），无需改核心绘制逻辑。

---

## 5. 结论与建议

| 结论 | 说明 |
|------|------|
| **迁移可行性** | **可行**。无论是「全 TS 重写」还是「Editor 调 Python 后端」，都能把现有图片导入能力集成进 Editor。 |
| **数据与 UI** | 输出格式已兼容 LevelData；集成点明确（EditorUI 入口 + 应用导入结果到现有加载流程）。 |
| **推荐路径** | **短期**：采用 **方案 B**（Python 后端 + Editor 调用），快速在 Editor 里用上「选图 → 得关卡」；**长期**：若需要纯前端/离线，再按 **方案 A** 分阶段用 TS 替换（先做骨架化与路径追踪，再做 EDT/KMeans/FFT）。 |
| **若选方案 A** | 建议顺序：① 读图 + mask；② Zhang-Suen + 路径追踪 + 网格吸附 + 路径合并（纯逻辑）；③ 简单线宽/网格估计（可先写死或粗估）；④ 再补 EDT、形态学、KMeans、自相关，并接入 Web Worker。 |

---

## 6. 附录：Python 中各步骤与 TS 的对应关系

| 步骤 | image_import.py 中的函数/逻辑 | TS 侧建议 |
|------|-------------------------------|------------|
| 读图 | `load_image` (PIL) | `createImageBitmap` + Canvas `getImageData` |
| 掩码 | alpha ≥ threshold、filter_dark_borders | 遍历 ImageData，建 `Uint8Array` mask |
| 线宽 | `estimate_line_width` (EDT) | 自实现 EDT 或 Chamfer 近似 |
| 闭运算 | `preprocess_mask` (ndi.binary_closing) | 自实现圆盘/矩形结构元闭运算 |
| 颜色 | `auto_cluster_colors` (KMeans + elbow) | `ml-kmeans` + 肘部法 |
| 骨架 | `zhang_suen_thinning` | 按当前实现用 TypedArray 重写 |
| 网格步长 | `estimate_grid_step` (FFT 自相关) | FFT 库或暴力自相关 |
| 网格偏移 | `estimate_offset` + 穷搜 | 相位直方图 + 循环，纯 TS |
| 路径追踪 | `trace_skeleton_paths_v6` | 直接翻译 DFS |
| 简化/吸附 | `douglas_peucker_simplify`, `snap_path_to_grid_v6` | 直接翻译 |
| 上色/箭头头 | `assign_path_color`, `detect_arrow_head_at_endpoint` | 数组遍历 + 中位数/投票 |
| 合并/分段 | `try_merge_adjacent_paths`, `split_at_gaps` | 直接翻译 |

上述对应关系说明：**整条 pipeline 没有依赖只能在 Python 里实现的不可替代算法**，迁移到 TypeScript/浏览器在技术上完全可行，主要成本是工时与性能优化（含 Worker）。
