# ArrowPuzzle 关卡 JSON Schema（严格校验）

> 用途：用于**编辑器保存前校验**、**关卡导入校验**。
>
> 说明：JSON Schema 负责“结构与基础范围”；一些与玩法相关的**语义校验**（如四邻接、箭头互不重叠、可解性）更适合在业务代码里做（本文末给出建议清单）。

## 1. Schema 版本与兼容性

- Schema 标准：JSON Schema **Draft 2020-12**
- 建议把 schema 文件放到仓库：`docs/level.schema.json` 或 `schemas/level.schema.json`

## 2. Level JSON Schema（Draft 2020-12）

> 下方 schema 采取“严格”策略：
>
> - 所有对象均 `additionalProperties: false`（禁止未知字段）
> - 强制 `meta/config/arrows` 必填
> - 强约束 `meta.created` 为 `date-time`
> - 强约束 `indices` 为整数数组、最少 2 个点、且箭头内部不允许重复格子（`uniqueItems: true`）
>
> 注意：`index < width*height` 这类“动态计算”在纯 JSON Schema 里不易表达（需要乘法）。因此 schema 里只做 `minimum: 0`，把上界与邻接等语义校验放到业务校验里做（第 3 节）。

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.com/schemas/arrowpuzzle-level.schema.json",
  "title": "ArrowPuzzle Level",
  "type": "object",
  "additionalProperties": false,
  "required": ["meta", "config", "arrows"],
  "properties": {
    "meta": {
      "type": "object",
      "additionalProperties": false,
      "required": ["version", "created", "levelName", "author", "description"],
      "properties": {
        "version": {
          "type": "string",
          "pattern": "^[0-9]+\\.[0-9]+$"
        },
        "created": {
          "type": "string",
          "format": "date-time"
        },
        "levelName": {
          "type": "string",
          "minLength": 1,
          "maxLength": 100
        },
        "author": {
          "type": "string",
          "maxLength": 100
        },
        "description": {
          "type": "string",
          "maxLength": 2000
        }
      }
    },

    "config": {
      "type": "object",
      "additionalProperties": false,
      "required": ["width", "height"],
      "properties": {
        "width": {
          "type": "integer",
          "minimum": 1,
          "maximum": 64
        },
        "height": {
          "type": "integer",
          "minimum": 1,
          "maximum": 64
        },

        "rule": {
          "type": "object",
          "additionalProperties": false,
          "required": ["exitMode"],
          "properties": {
            "exitMode": {
              "type": "string",
              "enum": ["A", "B", "C"]
            }
          }
        }
      }
    },

    "arrows": {
      "type": "array",
      "minItems": 1,
      "maxItems": 512,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["indices"],
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1,
            "maxLength": 64
          },

          "indices": {
            "type": "array",
            "minItems": 2,
            "maxItems": 4096,
            "uniqueItems": true,
            "items": {
              "type": "integer",
              "minimum": 0
            }
          },

          "style": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "color": {
                "type": "string",
                "pattern": "^#([0-9a-fA-F]{6})$"
              }
            }
          }
        }
      }
    }
  },

  "$comment": "This schema validates structure & basic types. Enforce adjacency, bounds (index < width*height), no-overlap, and solvability in domain checks."
}
```

## 3. 强烈建议补充的 Domain（语义）校验清单

以下约束属于“玩法语义”，用代码校验更直观、报错定位也更精准：

### 3.1 索引上界
- 对任意 `index`：必须满足 `0 <= index < width*height`

**错误建议**：`INDEX_OUT_OF_RANGE`（携带 arrow 序号 + index 值）

### 3.2 四邻接合法性（路径连续）
对任意 arrow 的相邻点 `a = indices[i]`、`b = indices[i+1]`：

- 必须是上下左右相邻（四邻接）
- 禁止跨行的 `+1/-1`（例如从 col=width-1 到下一行 col=0 的 +1 不是相邻）

可用 `(row,col)` 判断：
- `|ra-rb| + |ca-cb| === 1`

**错误建议**：`NON_ADJACENT_STEP`

### 3.3 关卡占用不重叠
- 任意两个不同 arrow 的 `indices` 不允许有交集

**错误建议**：`CELL_OVERLAP`（携带冲突 cell index 与涉及 arrows）

### 3.4 （可选）起手可退出
根据你采用的规则（exitMode），判断初始状态下至少存在一支可退出箭头。

**错误建议**：`NO_MOVES_AT_START`

### 3.5 （可选）可解性验证
- 小棋盘（如 <= 6x6、箭头数量不大）可以 BFS/DFS 搜索验证至少一条解。
- 大棋盘可只做弱校验（例如随机模拟多次）。

**错误建议**：`UNSOLVABLE_LEVEL`

## 4. 备注：如果你必须“Schema 内”做 index 上界

纯 JSON Schema 无法直接表达 `width*height-1`（缺少乘法表达式）。常见工程解法：

1. **两段式校验**（推荐）：Schema 做结构，Domain 做上界。
2. **按关卡尺寸生成 schema**：导入时动态生成一个写死 `maxIndex = width*height-1` 的 schema，再跑校验。

---

如需我把“Domain 校验”的错误格式（错误码、路径定位 JSON Pointer、编辑器高亮策略）也整理成规范文档，我可以继续补一份 `ArrowPuzzle-Level-Validation.md`。