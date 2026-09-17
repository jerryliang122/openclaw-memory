# AGENTS.md — openclaw-memory

给在本仓库工作的 coding agent 的说明。项目本身是 OpenClaw 工具插件:文件持久化的长期记忆,向 agent 注册 6 个工具(`memory_save/search/list/get/update/delete`)。

## 常用命令

```bash
npm install          # 只装 typescript / @types/node / typebox,秒级完成
npm test             # 编译到 dist/ 并运行 node:test(14 个用例)
npm run build        # 仅 tsc 编译
npm run verify:host  # 安装 types-only 宿主并用真实 SDK 类型重新编译(防签名漂移)
npm run assets       # 重新生成 assets/icon.png
```

## 架构

| 路径 | 职责 |
| --- | --- |
| `openclaw.plugin.json` | manifest:插件 id、`contracts.tools`、`configSchema` |
| `index.ts` | 插件入口:`definePluginEntry` + `registerTool` 装配,typebox 参数 schema |
| `src/store.ts` | `MemoryStore`:JSON 文件持久化、原子写入、搜索打分 |
| `src/tools.ts` | 工具处理器,纯函数 `(params, store) => result`,不依赖 SDK |
| `types/openclaw-plugin-sdk.d.ts` | SDK 最小类型声明,使无宿主也能通过编译 |
| `test/` | node:test 单元测试,针对 dist/ 运行 |

数据流:`index.ts` 只做装配;业务逻辑全部在 `src/`,通过单元测试保证正确性。

## CI(.github/workflows/ci.yml)

push 到 main 或 PR 时触发,两个 job:

1. **build-test**:轻量安装 → `npm test` → `npm run verify:host`(真实 SDK 类型编译)→ `npm pack` 并断言包内容(manifest / dist / assets 齐全)。
2. **integration**:在 `/tmp/openclaw-host` 完整安装 openclaw 宿主(版本从 `package.json` 的 `openclaw.build.openclawVersion` 动态读取,勿在 workflow 里硬编码)→ 用 npm pack 产物执行 `openclaw plugins install --force` → `openclaw plugins inspect memory --runtime --json`,断言 6 个 `memory_*` 工具全部注册。

规则:完整宿主安装、网关运行等重操作**只能在 CI 做**,本地禁止(见硬性约束 1);新增/改名工具时,同步更新 integration job 的断言列表;本地改完可用 `gh run watch` 观察运行结果。

## 硬性约束

1. **不要完整安装 `openclaw` 包。** 它是插件宿主,完整安装(含传递依赖约 200MB)曾导致本机 OOM。保持 `peerDependenciesMeta` 中 optional 标记;需要核对真实 SDK 类型时运行 `npm run verify:host` —— 它通过 `npm pack` 只下载宿主自身 tarball 解压到 `node_modules/openclaw`(types-only,无脚本、无传递依赖),再用 `tsconfig.host.json`(排除手写 stub)编译。日常编译走 `types/openclaw-plugin-sdk.d.ts` 声明文件,两者必须同步修改。
2. **新增/改名工具必须三处同步**:`index.ts` 的 `registerTool`、`openclaw.plugin.json` 的 `contracts.tools`、工具描述文案。漏掉 contracts 会导致工具无法被发现。
3. `src/store.ts` 与 `src/tools.ts` **不得 import openclaw SDK**(保持无宿主可单测);新增依赖 SDK 的装配代码放 `index.ts`。
4. 存储写入必须走 `MemoryStore.persist()` 的"写临时文件 + rename"原子路径,不得直接 `writeFileSync` 目标文件。
5. 运行时新增 npm 依赖要慎重:本插件零运行时依赖(typebox 除外),发布体积是卖点。
6. 环境:Node ≥ 24.16、TS strict、ESM(NodeNext —— 相对导入必须带 `.js` 后缀)。

## 行为规范

- 修改存储/搜索逻辑前先读 `test/store.test.ts`:排序平局规则(同一毫秒内按插入顺序倒序)、损坏文件隔离、CJK 子串匹配等行为已被测试锁定,变更需连测试一起改。
- `memory_*` 工具的返回结构(`content` 文本 + `details` 结构体)是对 agent 的契约,`memory_save` 有 `outputSchema`,改动需同步。
- 提交信息用英文祈使句,格式沿用 `Initial commit: ...` 的简短风格。
