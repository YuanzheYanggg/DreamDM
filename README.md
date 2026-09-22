# DreamDM
使用codex+jev做实时剧情衍生，根据历史选择+状态进行逻辑推演，加强用户选择和世界反馈之间的逻辑性

一个在本地运行的奇幻 RPG 原型：玩家阅读故事并选择行动，角色状态、背包、支线约定和后续条件随之变化。

## 快速开始

需要 Node.js 24 或更新版本，不需要安装 npm 依赖。

```sh
git clone https://github.com/YuanzheYanggg/DreamDM.git
cd DreamDM
npm start
```

打开 [本地游戏页面](http://127.0.0.1:4317/)。服务器只监听本机。默认端口已占用时可以运行 `RPG_PORT=4318 npm start`。

没有模型凭证也可以玩内置的本地示例；AI 主持模式需要另外配置模型服务。

## AI 主持

1. 本机已安装并登录 Codex CLI，且账号可使用 `gpt-6-astra`。
2. 通过安全的环境变量来源设置 `TYPESAFE_API_KEY`；macOS 也可以使用钥匙串中的通用密码条目，默认服务名为 `typesafe-ai-project-test`，可用 `TYPESAFE_KEYCHAIN_SERVICE` 覆盖。
3. 启动服务器，点击页面中的「AI 主持」开始。首次准备会调用 Astra，剧情选择会调用 Jev，实际调用可能产生费用。

`.env.example` 只列出配置项，不包含凭证；`npm start` 不会自动加载 `.env`。模型凭证只在服务端读取，不传给网页。Codex 可执行文件路径可通过 `RPG_CODEX_BIN` 指定。

## 主导演与 DM 的分工

| 层级 | 职责 |
| --- | --- |
| Codex / Astra | 提前设计和审查场景、选项、后果、伏笔与合流；必要时规划未来主线 |
| Jev Score | 判断风险行动的坏／中／好分布 |
| Jev Choice | 在确定的结果档位中选择预写后果 |
| Jev Noul | 判断现有路线是否无法承接结果后的必要条件，只影响未来规划 |
| 本地运行器 | 校验资源与结果、应用一次幸运修正、保存状态和调用预算 |

一项选择可以同时改变状态、触发支线和积累后续条件；分支合流保留这些差异。已有退路能继续时就沿用预写剧情。Jev 的一致性分数不会拦住已审核的合法行动。

## 当前可以体验什么

- 六场景短篇《雾港手记》，约五至六次剧情选择、三个结局。
- HTML 界面、实时人物能力与状态、物品背包、旅程记录。
- 本地示例和真实 AI 主持两种模式，进度保存与导入／导出。
- 风险判定、早期线索回收、渡鸦支线约定和有限失败退路。
- 每局 Jev 130 次、Astra 18 次的请求上限及用途隔离；失败也计数，无自动重试。
- 经 Astra 审查后才发布的未来文案，以及罕见主线覆盖缺口的后台规划。

当前剧情图仍然固定。主线调整方案会被保存，但尚不会自动变成新的节点、分支或数值效果。约 100 次选择的长篇、通用世界包、人格建档及可下载安装的 skill bundle 尚未完成。

## 开发与数据

```sh
npm test
```

测试使用本地 fixture，不发送模型请求。游戏代码在 `rpg-prototype/`，设计和执行记录在 `docs/`。Jev 网络适配器独立放在 `rpg-prototype/live/typesafe.mjs`。

首次访问 AI 状态时会在本机创建 `runs/rpg-live/state.sqlite`。该目录保存玩家进度、生成章节和调用记录，已被 Git 忽略；仓库不包含开发者的存档、模型凭证或原始调用回执。

- [详细运行说明](rpg-prototype/README.md)
- [当前主导演与 DM 分工](docs/superpowers/specs/2026-09-22-rpg-role-boundaries.md)
- [整局预算](docs/rpg/2026-09-22-session-budget.md)
- [验证范围与历史记录](rpg-prototype/QA.md)
