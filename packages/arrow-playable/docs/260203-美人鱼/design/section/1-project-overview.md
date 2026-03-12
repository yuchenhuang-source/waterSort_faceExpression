# 1. 项目概述
当前项目是一个基于 Phaser 3 + TypeScript 开发的 Arrow2 箭头消除玩法游戏。玩家需要在限定操作次数内，通过点击或拖拽的方式，将方向或类型一致的箭头进行连接与消除，完成关卡目标。

# 2. 技术架构
- 游戏引擎：Phaser 3
- 开发语言：TypeScript
- 构建工具：Vite
- 项目结构：
  ```
  src/
  ├── game/
  │   ├── scenes/         # 游戏场景
  │   ├── components/     # 游戏组件
  │   └── EventBus.ts     # 事件系统
  ├── assets/            # 资源文件
  └── config/           # 配置文件