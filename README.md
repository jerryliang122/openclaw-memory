# openclaw-memory

[OpenClaw](https://docs.openclaw.ai/) 插件:为 agent 提供跨会话的**长期记忆**能力。记忆以 JSON 文件形式保存在本地磁盘,支持保存、搜索、列举、查看、更新与删除,无需任何外部数据库。

## 功能

- **6 个 agent 工具**:`memory_save` / `memory_search` / `memory_list` / `memory_get` / `memory_update` / `memory_delete`
- **文件持久化**:单个 `memories.json`,原子写入(先写临时文件再 rename),进程崩溃不会截断数据
- **轻量搜索**:标题/标签命中加权高于正文;整句子串匹配覆盖中文等无分词脚本
- **损坏自愈**:存储文件损坏时自动隔离为 `memories.json.corrupt-<时间戳>` 并从空库启动,不会拖垮 agent
- **零运行时依赖**:除 `typebox`(参数 schema)外不依赖任何包;宿主 `openclaw` 由运行环境提供

## 工具一览

| 工具 | 参数 | 说明 |
| --- | --- | --- |
| `memory_save` | `content`, `title?`, `type?`, `tags?` | 保存一条记忆,返回新 id |
| `memory_search` | `query`, `type?`, `tags?`, `limit?` | 关键词加权搜索,返回带摘要的命中列表 |
| `memory_list` | `type?` | 按更新时间倒序列出全部记忆 |
| `memory_get` | `id` | 按 id 读取完整记忆 |
| `memory_update` | `id`, `title?`, `content?`, `type?`, `tags?` | 只更新传入的字段;`tags` 整体替换 |
| `memory_delete` | `id` | 删除记忆 |

记忆类型建议使用 `fact`(事实)/ `preference`(偏好)/ `project`(项目)/ `reference`(引用),但接受任意字符串。

## 安装

发布到 ClawHub 后:

```bash
openclaw plugins install clawhub:your-org/openclaw-memory
```

本地开发安装(验证打包产物):

```bash
npm pack
openclaw plugins install npm-pack:/tmp/openclaw-memory-0.1.0.tgz --force
```

## 配置

| 配置项(manifest `configSchema`) | 环境变量覆盖 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `memoryDir` | `OPENCLAW_MEMORY_DIR` | `~/.openclaw/memory` | 存放 `memories.json` 的目录 |
| `maxSearchResults` | `OPENCLAW_MEMORY_MAX_RESULTS` | `20` | `memory_search` 未显式传 `limit` 时的结果上限 |

## 项目结构

```
openclaw-memory/
├── openclaw.plugin.json    # 插件 manifest(id、contracts.tools、configSchema)
├── index.ts                # 插件入口:definePluginEntry + registerTool 装配
├── src/
│   ├── store.ts            # MemoryStore:文件持久化、原子写入、搜索打分
│   └── tools.ts            # 工具处理器(纯函数,不依赖插件 SDK,可单测)
├── test/                   # node:test 单元测试(14 个用例)
├── types/
│   └── openclaw-plugin-sdk.d.ts  # SDK 最小类型声明(见下方说明)
├── tsconfig.host.json      # 用真实 SDK 类型编译的配置(排除 stub)
├── scripts/
│   ├── install-host.mjs    # types-only 宿主安装(npm pack + 解压)
│   └── make-icon.mjs       # 生成 assets/icon.png(零图像依赖)
└── assets/                 # icon.png(256×256)+ activity.svg(单色)
```

## 开发

要求 Node ≥ 24.16(与 OpenClaw 插件体系一致)。

```bash
npm install          # 只安装 typescript / @types/node / typebox
npm test             # 编译 + 运行测试
npm run build        # 仅编译到 dist/
npm run verify:host  # 安装 types-only 宿主,用真实 SDK 类型重新编译(防签名漂移)
npm run assets       # 重新生成 icon.png
```

CI:push / PR 触发 GitHub Actions(`.github/workflows/ci.yml`),先跑构建 + 单测 + 真实 SDK 类型检查,再在完整 openclaw 宿主上做安装与运行时冒烟验证 —— 本地禁止完整安装宿主(曾导致 OOM),端到端验证交给 CI。

### 关于可选 peer 依赖 `openclaw`

`openclaw` 包是插件**宿主**(完整安装含依赖约 200MB),已通过 `peerDependenciesMeta` 标记为可选,npm 不会自动安装。日常类型检查走 `types/openclaw-plugin-sdk.d.ts` 最小声明;`npm run verify:host` 会下载宿主 tarball 做 types-only 安装(`scripts/install-host.mjs`,无生命周期脚本、无传递依赖)并排除 stub 重新编译,用于在发布前核对真实 SDK 契约(2026.9.4 上曾借此发现 `label` 必填字段的文档遗漏)。发布产物的运行时导入路径不变,始终由宿主提供真实模块。

## 发布

```bash
npm i -g clawhub
clawhub login
clawhub package publish your-org/openclaw-memory --dry-run
clawhub package publish your-org/openclaw-memory
```

发布前检查:manifest 校验、`npm pack --dry-run` 确认 dist/assets 随包分发、SDK 导入使用聚焦子路径(`openclaw/plugin-sdk/plugin-entry`)。

## License

MIT
