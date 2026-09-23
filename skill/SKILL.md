---
name: teleagent-with-chatgpt
description: >
  把 ChatGPT 网页版变成 TeleAgent 编码会话的「规划与审查大脑」：ChatGPT
  负责思考（规划、审查），TeleAgent 保留全部执行权（编辑、shell、git、测试）。
  ChatGPT 通过 OAuth 保护的只读 MCP 连接按需读取工作区文件。当用户说
  「使用 TeleAgent with ChatGPT ...」「连接 ChatGPT」「用 ChatGPT 规划」、
  要求断开 ChatGPT、或要通过 ChatGPT 规划循环完成编码任务时使用。
name_cn: TeleAgent with ChatGPT
description_cn: 把 ChatGPT 网页版变成编码任务的规划与审查大脑，TeleAgent 负责执行；含连接配置与日常协作循环。
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: 'a0c4a0f2-666f-4e01-bddf-28c2391a387d'
  PropagateID: 'a0c4a0f2-666f-4e01-bddf-28c2391a387d'
  ReservedCode1: '489a4a00-9b8c-472b-b5cd-f97b0a2519ec'
  ReservedCode2: '489a4a00-9b8c-472b-b5cd-f97b0a2519ec'
---

# TeleAgent with ChatGPT

ChatGPT thinks. TeleAgent works.

你（TeleAgent）拥有执行权：编辑、shell、git、测试、恢复。
ChatGPT 拥有高层推理权：理解、规划、审查、调试策略。
C2C Bridge 给 ChatGPT 对当前工作区的**只读** MCP 访问，因此你与 ChatGPT
之间的控制消息保持极小（< 1 KB）——ChatGPT 自己通过 MCP 拉取它需要的数据。

**核心规则**

1. 绝不把文件内容、diff 或日志粘贴进 ChatGPT。ChatGPT 通过 MCP 自己读。
2. 绝不向用户展示技术内部细节（MCP、OAuth、PKCE、tunnel、端口、localhost）。
   只用「连接 ChatGPT / 安全连接 / 配对」这类说法。唯一例外是**手动教学配置**：
   只展示用户必须填写的确切设置字段标签与值，不解释内部原理。
3. 配对码是唯一允许输入到浏览器的凭据。绝不碰 OAuth token、cookie、
   session 存储。
4. 出问题先跑 `c2c doctor` 静默修复。只有登录、验证码、2FA、明确的授权确认
   页面或手动教学配置才找用户——而且一次只给一个动作。
   本机首次连接 ChatGPT 前，`c2c prefs --json`：
   - `setupMode` 缺失：原样转述 `setupChoicePrompt`，等用户答「1」或「2」，
     然后 `c2c prefs set --setup-mode auto|manual --json`。用户不答就不开始
     ChatGPT 配置，不要猜默认值。
   - `setupMode` 为 `manual`：从头就走手动教学配置（用户选的，不是失败）。
   - `setupMode` 为 `auto`：自动浏览器配置。同一显式配置步骤修复后仍失败两次，
     才切换手动教学。浏览器/JS 超时、页面加载/生成中、等用户登录/2FA 都
     **不算**失败。切换时不要改已保存的 `setupMode`。
   这些偏好是机器级的，不随工作区变。重连或第二个仓库不再问。
5. ChatGPT 页面操作使用当前 TeleAgent 会话实际提供的浏览器工具；先阅读工具
   说明，不假设固定工具名、输入框结构或坐标。会话没有浏览器自动化能力时，
   直接走**手动教学配置**。若用户要求在自己的浏览器里跑 ChatGPT，礼貌拒绝：
   「需要频繁操作 ChatGPT 页面，可能影响你正常浏览。ChatGPT 连接器配置请由
   我代操作或走手动教学。」
6. 会话管理只看 `c2c session --json` → `conversation.mode`，不发明第二种模式。
   - **long-chat**（旧会话文件，或用户明确不要 Project）：一个工作区**一条**
     ChatGPT 长对话，绝不悄悄开新对话。
   - **project**（新工作区，或已主动选择的工作区）：一个工作区**一个**
     ChatGPT Project（合集）。同一 TeleAgent 会话复用本线程保存的对话 URL；
     新 TeleAgent 会话从合集页开新对话——绝不直接 goto chatgpt.com，也绝不
     因为 `session.url` 存在就复用别的会话的 URL。
   每个工作区**只有一个** ChatGPT connector，不建第二个，不动别的工作区的。
7. ChatGPT 页面只访问下方「浏览器操作」列出的 URL，绝不从 chatgpt.com 首页
   点菜单导航。
8. **Doctor 门槛。** `c2c doctor --json` 本地不绿，不打开 ChatGPT、不发
   `[C2C]`——唯一例外是 `chatgptRepair.needed` 时的重连设置页。不绿的条件：
   - `report.bridge.ok` / `report.mcp.ok` 不为 true（未授权本地 `/mcp` 必须 401）
   - 该工作区曾有公网地址而 tunnel 挂了
   - `chatgptRepair.needed`（先修 connector，再 doctor）
   - `namedRepair.needed`（先登录 Cloudflare 再 doctor；**不要删 connector**）
   - `report.bridge` 显示「状态无法确认」：本地 bridge 可能还在跑。不要
     `c2c start`、不要删 connector、不要当 chatgptRepair 处理。等一等再
     doctor。
   doctor 已绿且 `chatgptRepair.needed` 为 false 时：不要 `c2c restart`、
   不要开第二个 tunnel、不要删 connector。ChatGPT/浏览器侧的错误不是折腾
   公网地址的许可。发消息后 ChatGPT 侧报 401 是另一回事：那是该修的时候，
   不代表下次可以跳过本门槛。

## 浏览器操作（ChatGPT）

使用当前 TeleAgent 会话实际提供的浏览器工具；先阅读工具说明，不假设固定
工具名、textarea 结构或坐标。没有浏览器自动化能力时走**手动教学配置**，
并为用户准备好待粘贴的文本。

1. **一个标签页。** 创建 ChatGPT 标签页后持续复用，只用 goto 切换 URL。
   标签页还在就认领它，不开第二个 ChatGPT 标签。已在目标 URL 上时不重复
   goto。
2. **保持可见。** 首次配置和 C2C 对话期间让页面保持用户可见，方便用户旁观
   和介入（登录、2FA、验证码）。任务结束**不要关闭**这个标签。
3. **只用这些 URL**（同一标签内 goto，绝不点菜单找）：
   - 开发人员模式: `https://chatgpt.com/#settings/Security`
     （`c2c prefs --json` 已有 `developerModeEnabled: true` 时跳过）
   - 插件总管: `https://chatgpt.com/plugins`
   - 加插件: `https://chatgpt.com/plugins#settings/Connectors?create-connector=true&redirectAfter=%2Fplugins`
   - 新对话（仅 long-chat 且无已保存对话时）: `https://chatgpt.com/`
   - 已保存的 C2C 对话: `conversation.chatUrl` / `session.url`
   - 已保存的 Project 合集: `conversation.projectUrl`
     （`https://chatgpt.com/g/g-p-…/project`）
   绝不点已有 connector 的 Reconnect / Refresh：旧地址已死，那页会挂在
   「无法访问此网站」。地址变了时：只 Delete 本工作区的 `connectorName`，
   再用加插件 URL 建回来（同名、新 Server URL）。绝不把公网地址写进
   Project 指令——只写 connector **名字**。
4. **不要在设置页等 8 个工具。** Connected / 授权成功 / 配对通过即可继续。
   工具可用性在对话里用 `workspace_info` 确认。
5. **表单一次填完。** 能一个脚本填完的已知表单就一次填完。每个动作后做一次
   轻量 DOM 检查，不反复截图轮询。
6. **一个对话，Chat 模式。** 每个**新**对话，若可见 Chat/Work 切换器（常在
   左上角），先确认选中 **Chat** 再发 boot prompt。是 Work 就换一个新 Chat
   对话。看不到切换器不找菜单，直接继续。发 boot prompt 后在同一对话发
   `workspace_info` 验证，回复能说出当前 workspace 名字才保存或替换会话 URL。
   验证失败保留旧 URL，不开一次性验证对话再开正式对话。
   合集或对话页只显示 Retry / 重试时是**导航错误**，不是生成失败、更不是配对
   失败：复用同一标签，Retry 一次；仍失败就 goto 本线程最后一次可用的对话
   URL（或唯一已保存的 `session.url`），然后点页面上的「打开项目」链接
   （允许这个同站跳转）。在合集页，先看到项目对话列表和新对话输入框才继续。
   替换对话没通过 workspace_info 之前，保留旧 URL / checkpoint。不要
   `session clear`。
7. **等待 ChatGPT 回复（不要长阻塞等待）。** 发送 INIT、EXECUTED、boot 或
   workspace_info 检查后：保持同一任务。每 20–30 秒做一次轻量 DOM 检查：
   - 仍在生成 → 继续等（不输入、不重发）
   - 看到 `STATE: PLAN` / `DONE` / `BLOCKED` / 验证的 workspace 名 →
     读取并继续协议
   - 可见错误 → 修复，不开新对话
   浏览器/JS 超时**不是失败**：重新认领同一标签、读页面、继续等。绝不因为
   等待超时就开第二个标签或重发 INIT/EXECUTED。

## 路径与命令

- TeleAgent with ChatGPT 检出位置：`<ACTUAL_CHECKOUT_PATH>`
  （安装/更新时必须把本行替换为实际检出路径。）
- CLI：设 `<checkout>` 为上一行的路径，运行
  `node "<checkout>/bin/c2c.js" <command>`。所有命令支持 `--json` 供解析。
- 检出目录没有 `node_modules` 或没有 `dist/` 时，先在里面执行
  `corepack pnpm install && corepack pnpm build`。
- 作用到用户项目的命令（`setup`、`doctor`、`session`、`restart`、`start`、
  `stop`、`status`、`pair`、`unpair`、`logs`、`workspace`、`record`、
  `tunnel status`、`tunnel choose`）传 `-w <workspace root>`
  （用户正在工作的项目，**不是** c2c 仓库本身）。
- 机器级命令（`update-check`、`prefs`、`tunnel login`）不加 `-w`
  （它们会忽略多余的 `-w`，不会报错）。
- `c2c sandbox-allow` 在 TeleAgent 版中是 no-op（TeleAgent 原生有工作区文件
  访问权），可以调用但无实际动作；doctor 的 sandbox 检查恒为绿。

## 每日更新检查

在每个工作流开始时先跑（便宜/有缓存；没有更新时绝口不提）：

1. `c2c update-check --json`（不加 `-w`）

- `{ "updateAvailable": false }` → 静默继续，绝不提及检查本身。
- `{ "updateAvailable": true }` → 告诉用户一句：
  「检测到 TeleAgent with ChatGPT 有新版本，我先更新一下（约 1 分钟），随后
  继续你的任务。」然后执行更新工作流，完成后**继续原任务**。

## 更新工作流（「更新 TeleAgent with ChatGPT」或每日检查触发）

在检出目录里：

1. `git pull --ff-only`（本地有改动导致失败时：`git stash && git pull --ff-only`）。
2. `corepack pnpm install && corepack pnpm build`。
3. 重新安装 Skill：把 `skill/SKILL.md` 的「检出位置」行替换为实际检出路径，
   如 Skill 已装到 TeleAgent skills 目录，把新版复制过去。
4. `c2c restart -w <workspace>` 让 bridge 跑新代码，然后
   `c2c update-check --force --json` 刷新缓存（应显示已是最新）。
5. 告诉用户「✓ 已更新到最新版本」，然后继续触发更新的任务。
   （更新的 SKILL.md 从下一个 TeleAgent 会话生效，这是预期。）

## 连接方式选择（每个工作区一次）

在公网地址产生**前**问（`c2c setup` / 第一次会开 tunnel 的 `doctor --fix`）。
不提 tunnel、wrangler、DNS、hostname，只说 临时地址 / 固定域名 / 登录
Cloudflare。

1. `c2c tunnel status -w <workspace> --json`
2. `needsChoice` 为 false：不再问。
3. `needsChoice` 为 true：原样转述 `userPrompt`，等待用户回答。
   - 没有账号 / 没有域名 / 临时 / 不用 →
     `c2c tunnel choose -w <ws> --mode quick --json`
   - 有域名（例如 example.com）→ 先转述 `loginPrompt`，再
     `c2c tunnel choose -w <ws> --mode named --zone <domain> --json`。
     这一步可能要用户登录 Cloudflare，等命令结束。有账号但没给域名：问一次
     域名。命令返回 `need: "zone"` 时问一次再重试。`fallback` 为 true：
     转述 `userMessage`，继续用临时地址，不再重试 named（除非用户主动要求）。
4. 连接凭据不进项目目录。CLI 存在 C2C 状态目录里。

## 首次配置工作流（「使用 TeleAgent with ChatGPT 完成首次配置」）

1. 自己检查环境：`node --version`（>= 20）、cloudflared 是否可用。
   cloudflared 缺失时 Windows 用 `winget install Cloudflare.cloudflared`
   自己装，不问用户。
2. c2c 仓库没有 `node_modules` 时：在里面 `pnpm install && pnpm build`。
3. **连接方式选择**，然后 `c2c setup -w <workspace> --json`
   → 返回 `{ mcpUrl, pairingCode, workspaceName, connectorName, ... }`。
   `connectorName` 是本工作区的插件标题。配对码约 5 分钟有效——**等 ChatGPT
   的 Authorize / 配对表单出现在屏幕上**再 `c2c pair --json` 拿码并立刻输入。
   doctor 不预铸配对码。
4. `c2c prefs --json`（机器级，不是工作区级）。
   - `setupMode` 为 null：原样转述 `setupChoicePrompt`，等「1」或「2」，然后
     `c2c prefs set --setup-mode auto` 或 `--setup-mode manual`。用户不答就
     不打开 ChatGPT 设置、不开始自动配置，不要默认 auto。用户以后要换：
     同一个 `c2c prefs set --setup-mode` 命令，不重问。
   - `setupMode: "manual"`：跳过第 5 步的自动配置，直接走**手动教学配置**
     （用户主动选的），开场白：「接下来用手动教学配置。一次只需要做一个操作。」
     不说「自动配置没有成功」。
   - `setupMode: "auto"`：继续第 5 步。保留两次失败才回退的规则。
5. 在一个 ChatGPT 标签上打开 ChatGPT（见「浏览器操作」）。同一标签，只 goto：
   - 开发人员模式：`developerModeEnabled: true` 时跳过
     `https://chatgpt.com/#settings/Security`。否则打开它，没开就开启
     「开发人员模式」("Developer mode")，然后 `c2c prefs set --developer-mode`。
     绝不把「已开启」记成「未开启」。之后建 connector 若提示需要开发人员模式：
     打开该页开启、保存 `--developer-mode`、重试创建——不要跳过这个恢复。
   - 已有该 `connectorName`：`https://chatgpt.com/plugins` — Delete 它
     （绝不 Reconnect），然后 goto 加插件 URL。
   - 还没有 / 刚删掉：加插件 URL，**只操作**第 3 步返回的 `connectorName`：
     - 该名字已存在：Delete 再建。绝不 Reconnect、不原地编辑、不打开旧
       Server URL。
     - 不存在：用该名字新建。
     - 绝不改名、删除、编辑别的 workspace 的 connector。
     - Description: `Securely connect ChatGPT to the current TeleAgent workspace for planning and review.`
     - Server URL: 第 3 步的 `mcpUrl`
     - Authentication: OAuth
     能一个脚本填完就一次填完。然后 Connect / Authorize。这时才
     `c2c pair --json` 拿配对码并输入。显示 Connected / authorized / 配对
     通过即继续——**不等 8 个工具**。
6. 同一标签：按**会话管理**开第一个 C2C 对话（新工作区用 Project 合集；
   long-chat 且无保存对话才用 `https://chatgpt.com/`）。确认 Chat 模式（是
   Work 就换新 Chat 对话）。发 `docs/protocol.md` §Boot Prompt，然后同一
   对话发：
   `Use the "<connectorName>" connector: call workspace_info and read hello-style top-level file. Reply with the workspace name.`
   确认回复匹配 `workspaceName`（等待方式见「浏览器操作」第 7 条）。匹配才用
   `c2c session set` 保存对话 URL；不匹配不保存。
7. 按固定格式向用户汇报（不出现内部名词）：

```
TeleAgent with ChatGPT

✓ 当前项目已识别
✓ Workspace Bridge 已启动
✓ 安全连接已建立
✓ ChatGPT 已连接
✓ 文件读取测试通过

Ready.
```

登录墙（ChatGPT、Cloudflare）出现时：停下来，告诉用户唯一要做的事
（「请登录 ChatGPT，完成后告诉我'好了'」），然后继续。

## 手动教学配置

进入条件：`setupMode` 为 `manual`（用户开始时选的），或自动浏览器配置在修复
后同一**显式**设置/重连步骤失败两次。浏览器/JS 超时、页面加载/生成中、等
登录/2FA/验证码都**不算**失败，不触发本路径。用户选的 manual 不需要等失败。

停止自动化 ChatGPT 设置。保留当前本地 C2C 状态与 `mcpUrl`、`pairingCode`、
`workspaceName`、`connectorName`。不悄悄退回纯本地执行，不永久禁用 C2C。
失败回退时不改已保存的 `setupMode`。

开场白：

- 用户选的（`setupMode: "manual"`）：「接下来用手动教学配置。一次只需要做
  一个操作。」
- 失败回退：「自动配置没有成功，我来带你手动完成。一次只需要做一个操作。」

一次一个动作，等用户说「好了」再给下一个：

1. `developerModeEnabled` 不为 true 时：请用户打开
   `https://chatgpt.com/#settings/Security` 开启「开发人员模式」。用户说
   「好了」后 `c2c prefs set --developer-mode`。已记住就跳过。
2. 请用户打开 `https://chatgpt.com/plugins`。同名的 `connectorName` 存在就
   只删它，不碰别的 workspace 的 connector。
3. 请用户打开
   `https://chatgpt.com/plugins#settings/Connectors?create-connector=true&redirectAfter=%2Fplugins`
   创建同名的 `connectorName`：
   - Description: `Securely connect ChatGPT to the current TeleAgent workspace for planning and review.`
   - Server URL: 当前 `mcpUrl`
   - Authentication: OAuth
4. 请用户 Connect / Authorize。然后 `c2c pair --json` 只把配对码给用户。
   过期就再 pair 一次。
5. 用户报告 Connected / 授权成功 / 配对通过后，回到正常配置流程的 ChatGPT
   验证步骤。若之后自动验证又在同一显式步骤失败两次：停下，报告确切的失败
   步骤，不无限循环，不在没有 C2C 的情况下继续。

## 会话管理

`c2c session -w <ws> --json` → `{ session, conversation }`。
`conversation.mode` 是唯一开关。缺 Project 字段的旧会话文件是 **long-chat**，
不主动让用户迁移；用户后来说要 Project 就走**绑定 Project**。全新工作区
（无会话文件）是 **project**。

绝不按显示名匹配 Project 或对话。绝不上传仓库到 Project sources。绝不点
分享。不重命名 ChatGPT 对话。

### long-chat（不重写此路径）

一个工作区一条 ChatGPT 长对话。

- **找到它**：`conversation.reuseSavedChat` 且 `conversation.chatUrl` 存在时
  goto 该 URL，在那继续。
- **保存它**：boot + workspace_info 后回复说出本工作区名，才
  `c2c session set -w <ws> --mode long-chat --url <url> --title "C2C <workspace name>"`。
  名字不匹配不覆盖旧 URL。
- **更新它**：每次 EXECUTED/DONE 后
  `c2c session set -w <ws> --task <id> --iteration <n> --state <STATE>`
  加编码工作流的 checkpoint 参数（`--protocol-state`、`--waiting-for`、
  `--goal`、`--next-step`、`--known-issues`，或 DONE 时 `--clear-checkpoint`）。
  这些字段不放日志、不放 diff。
- **切换**只在三种情况：(a) 用户要新对话 (b) 当前对话明显卡顿 (c) 当前对话
  是 Work。切换时：
  1. 同一标签 goto `https://chatgpt.com/`，确认 Chat 模式，发 boot prompt。
  2. 发 HANDOFF（goal、进度、状态、问题、下一步），绝不粘贴文件。
  3. workspace_info 验证；通过才 `c2c session set --url`。失败保留旧 URL。
- 保存的对话 404：当切换处理。从 `session.checkpoint` 重构 HANDOFF（goal、
  进度、问题、下一步）。没有 checkpoint 就用 `task` / `iteration` /
  `lastState` 和 `execution_summary` 元数据。绝不粘贴日志或输出正文。

### project（新工作区）

一个工作区一个 ChatGPT Project。映射：

1. 同一 TeleAgent 会话（本线程还有上下文）→ 同一个 ChatGPT 对话 URL。
   直接 goto，不开合集页。
2. 同工作区，**新** TeleAgent 会话 → 从合集页（`conversation.projectUrl`）开
   新对话。忽略 `session.url`（除非本线程早前已保存）。
3. 不同工作区 → 不同 Project 和不同 connector。

**在本线程开对话**

- 本 TeleAgent 会话早前保存过对话 URL：直接 goto 该 URL，继续。不开新对话，
  不发 HANDOFF。
- 否则 `conversation.projectReady`：goto `conversation.projectUrl`。在合集页
  用页面上的输入框（「项目名中的新聊天」/ "New chat in …"）开新对话。不用
  侧栏、不 goto chatgpt.com。确认 Chat 模式。boot prompt，然后用**确切**的
  `connectorName` 发 workspace_info 验证。回复说出本工作区名后：
  `c2c session set -w <ws> --mode project --project-url <collection> --url <chat> --connector-name "<connectorName>" --title "C2C <workspace name>"`。
  若本线程在延续之前的 C2C 任务，boot 后立刻发 HANDOFF。
- 否则：先**绑定 Project**。

**更新**：同 long-chat 的 `session set --task / --iteration / --state`。

**合集不对**：不猜别的 Project。告诉用户预期的 workspace 名，请用户打开正确
合集后说「已找到」；同时提供「继续用长对话」选项。选长对话：
`c2c session set -w <ws> --mode long-chat` 走 long-chat 路径。合集 404 或新
对话不在 Project 里：同样二选一。

**保存的对话 404**（本线程）：goto 合集页，在那开新对话，boot + HANDOFF
（从 `session.checkpoint`，无日志）+ workspace_info，通过后保存新 URL，
保留 `--project-url`。

### 绑定 Project（用户建一次合集）

新工作区，或老工作区用户主动要切 Project 时做。**不**通过 ChatGPT 侧栏点建
Project。

1. 原样告诉用户（填入 workspace 名）：

```
请在 ChatGPT 里新建一个项目，名字用「<workspaceName>」，记忆请选「仅限项目记忆」。

如果侧栏里看不到「项目」：把鼠标放在「聊天」上，点右边出现的三个点，选择「按项目整理」。

建好后会打开合集页面。看到页面后跟我说「好了」。
```

2. 等「好了」/ 合集页面。同一标签读地址栏，必须是
   `https://chatgpt.com/g/g-p-…/project`。不对就请用户打开该页面直到正确。
   然后：
   `c2c session set -w <ws> --mode project --project-url <url> --connector-name "<connectorName>"`。
3. 只在该合集页打开右上角 **… → 项目设置**。不点分享，不加来源/文件。
   - 记忆：仅限项目记忆。库访问权限保持关闭。
   - 指令：粘贴下方 **Project 指令**模板（从 `workspace_info` / setup 填
     `{{…}}`，用 setup 时的确切 `connectorName`）。绝不把公网/临时地址写进
     指令。保存关闭。
4. 还在合集页，用页面输入框建第一个对话，boot + workspace_info 验证，保存
   对话 URL。

### Project 指令（粘贴到 项目设置 → 指令）

```
You are the planning and review layer for one local workspace. TeleAgent executes.

This Project is bound only to:
- Workspace name: {{workspace_name}}
- Kind: {{project_type}} ({{languages}} / {{frameworks}})
- Connector (use this one only): {{connector_name}}

When you call tools, use ONLY that connector. Do not use any other
TeleAgent with ChatGPT connector. If workspace_info names a different
workspace, stop. Do not plan. Do not use this Project's memory.

Read code, git, diffs, and any released command output through that
connector. Never ask anyone to paste file bodies, diffs, or logs. After
EXECUTED, call execution_output (list, then read) when a readable item
exists; if status is restricted, review from git instead. Never upload
the repo into this Project's files or sources.

When facts conflict, trust this order:
1. Current code from the connector
2. A HANDOFF in this chat (this task's goal, progress, next step)
3. These instructions
4. This Project's memory (durable architecture only; stale memory loses)

This Project's memory is only for this workspace. On HANDOFF, trust the
brief, re-read code through the connector, and resume at NEXT_EXPECTED_STEP.

Be substantive: why, which file, what to test. No empty one-liners and
no 40-step epics. Use C2C control messages.
```

## 编码任务工作流（「使用 TeleAgent with ChatGPT 完成 XXX」）

发给 ChatGPT 的协议状态：`INIT → PLAN → EXECUTING → EXECUTED → REVIEW → (PLAN | DONE | BLOCKED)`。
本地 checkpoint 状态（只存 session，绝不作为 ChatGPT 的 `STATE:` 行）：
`INIT`、`PLAN_RECEIVED`、`EXECUTING`、`EXECUTED_LOCAL`、`EXECUTED_SENT`、
`DONE`、`BLOCKED`。不发明 `STATE: RESUME`。原对话没了就发 HANDOFF。所有控制
消息以 `[C2C]` 开头，TeleAgent→ChatGPT 消息 < 1 KB。ChatGPT 的回复要有实质
内容（见第 3 步）。协议细节见 `docs/protocol.md`。

0. `c2c tunnel status -w <workspace> --json`。`needsChoice` 时先走**连接方式
   选择**。然后 `c2c doctor -w <workspace> --json`（自动修复）。**Doctor
   门槛**：本地不绿不开 ChatGPT、不发 INIT。`namedRepair.needed` 时转述
   `userMessage`，跑 `c2c tunnel login --json`，再 doctor。`chatgptRepair.needed`
   时转述 `userMessage`，走**地址失效重连**，再 doctor，绿了才继续。
   生成任务 id：`c2c_` + 4 位随机 hex——checkpoint 里已有 id 就复用，不铸
   第二个。
1. `c2c session -w <workspace> --json`。按 `conversation.mode` 在同一标签打开
   ChatGPT（见**会话管理**）。新对话先确认 Chat 模式，发 `docs/protocol.md`
   的 boot prompt，再用**确切** `connectorName` 发 workspace_info 验证。回复
   说出本 workspace 名才保存会话 URL。不用浏览器重读 MCP 已提供的代码。
   发送控制消息后的等待方式见「浏览器操作」第 7 条。

   **任何 INIT 之前先恢复 `session.checkpoint`。** 没有 checkpoint（旧会话）：
   按正常新/续循环继续。浏览器/JS 超时不是丢任务——认领原标签，不 INIT、
   不重跑、不只因超时就重发 EXECUTED：
   - `EXECUTED_SENT` + `waitingFor=GPT_REVIEW`：不 INIT、不重跑、不重发
     EXECUTED。留在保存的对话里等审查。对话 404：从 checkpoint 字段发
     HANDOFF（无日志），然后等。
   - `EXECUTED_LOCAL`：本地工作已完成；只差发 EXECUTED（本轮没有 record 就
     先 record）。不重跑。
   - `EXECUTING`：没完成。还持有当前 PLAN 就继续执行；否则 HANDOFF 请
     ChatGPT 重述上一条 PLAN。不当成完成、不 INIT 新任务。
   - `PLAN_RECEIVED`：执行那个 PLAN。不 INIT。
   - `INIT` / `waitingFor=GPT_PLAN`：认领标签等待。不重发 INIT。
   - `DONE`：需要时向用户总结；`c2c session set --clear-checkpoint`。
   - `BLOCKED`：把 ChatGPT 的原因呈现给用户。不 INIT。
   恢复时绝不 re-pair、绝不重建 connector、绝不改写 Project 指令。
2. 发 INIT（checkpoint 说不用发就跳过）：

```
[C2C]
STATE: INIT
TASK_ID: c2c_f81a
ITERATION: 0

GOAL:
<user's goal, one paragraph>

INSTRUCTION:
Inspect the connected workspace through the TeleAgent with ChatGPT MCP connector.
Produce a C2C PLAN message.
```

   确认 INIT 消息已出现在该对话里（一次轻量 DOM 检查）。页面只有 Retry 时先
   按「浏览器操作」第 6 条恢复。消息可见之前不写等待 checkpoint、不等 PLAN。
   然后：
   `c2c session set -w <ws> --task <id> --iteration 0 --state INIT --protocol-state INIT --waiting-for GPT_PLAN --goal "<short goal>" --next-step "wait for PLAN"`
3. 等 ChatGPT 的 `STATE: PLAN` 回复（等待方式见「浏览器操作」第 7 条）。读
   GOAL/ACTIONS/TESTS/SUCCESS_CRITERIA。好的 PLAN 还带 RATIONALE 和逐文件的
   自然语言修改建议（哪个文件、改什么、为什么）。回复是光秃一句话、没有
   理由和文件级指引时，追问一次：
   "Please expand the plan with rationale and concrete per-file suggestions."
   然后：
   `c2c session set -w <ws> --protocol-state PLAN_RECEIVED --waiting-for none --next-step "execute PLAN"`
4. 用自己的工具执行计划（你的判断；ChatGPT 不微观管理工具调用）。
   开始前：
   `c2c session set -w <ws> --protocol-state EXECUTING --waiting-for none --next-step "finish PLAN then record"`
5. record 执行结果让 ChatGPT 能通过 MCP 读。元数据必填：
   `c2c record -w <ws> --task c2c_f81a --iteration 1 --changed-files "src/a.ts,src/b.ts" --tests "27 passed" --exit-status ok`
   本轮跑过**测试 / 构建 / lint / typecheck** 时，把 stdout/stderr 先写到本地
   临时文件再传：
   `c2c record … --command "pnpm test" --output-file <temp> --exit-code <n>`
   成功和失败都记。不记 shell history、`.env`、密钥、无关输出。绝不把该文件
   或任何日志粘贴进 ChatGPT。CLI 说输出未开放时照样发 EXECUTED；ChatGPT 从
   git 审。然后：
   `c2c session set -w <ws> --iteration 1 --state EXECUTED --protocol-state EXECUTED_LOCAL --waiting-for none --next-step "send EXECUTED"`
6. 发 EXECUTED（无 diff、无日志），让 ChatGPT 用 MCP，包括
   `execution_output`：

```
[C2C]
STATE: EXECUTED
TASK_ID: c2c_f81a
ITERATION: 1

RESULT:
Execution finished.

CHANGED_FILES:
4

TESTS:
27 passed

Please independently inspect the workspace and current git diff through MCP.
If execution_output lists a readable item for this iteration, list then read it.
If status is restricted, ignore it and review from git_diff.
```

   然后：
   `c2c session set -w <ws> --protocol-state EXECUTED_SENT --waiting-for GPT_REVIEW --next-step "wait for PLAN or DONE"`
7. ChatGPT 通过 MCP 审查（`git_diff`、`read_file`、`test_status`、
   `execution_output`），回复 DONE / PLAN（下一轮）/ BLOCKED。
8. 循环。尊重 maxIterations（`.c2c.json`，默认 12）。到上限暂停问用户：
   「已完成 12 轮协作，仍有未解决问题，是否继续？」
9. DONE：用平实语言向用户总结结果。
   `c2c session set -w <ws> --state DONE --clear-checkpoint`
10. BLOCKED：读 ChatGPT 的原因，能修就修，或把用户必须做的唯一决策呈现出来。
    `c2c session set -w <ws> --protocol-state BLOCKED --waiting-for USER --known-issues "<short reason>"`

## 断开（「断开 ChatGPT」）

1. `c2c unpair -w <workspace>`（立即吊销所有令牌）。
2. 可选：同一标签通过 `https://chatgpt.com/plugins` 移除 connector，只动本
   工作区的 `connectorName`。
3. 告诉用户：「已断开 ChatGPT 对该项目的访问。」

## 地址失效重连（全关掉以后地址失效）

这是用户退出 TeleAgent / 关机后的常态：旧公网地址没了。doctor 已自动起新的。
`connectorAction: "update"` 表示 Delete + 重建，**不是** Reconnect。

1. 原样转述 `chatgptRepair.userMessage`，然后你来修。不出登录墙就不让用户去
   点 ChatGPT。修复完成、复检 doctor 绿之前不开 C2C 对话、不发 `[C2C]`。
   绝不「先发条消息试试」。`c2c prefs --json` 已有 setup mode 就不重问；
   `setupMode` 为 `manual` 就走**手动教学配置**代替自动化。
2. 同一标签，设置页 URL 一直到 Connected，绝不点菜单：
   - 开发人员模式（`developerModeEnabled: true` 时跳过）
   - 插件总管（只用来 Delete）
   - 加插件（Delete 之后必走）
3. 只操作 `chatgptRepair.connectorName`，绝不碰别的 workspace 的 connector：
   - 同名存在：**Delete** 它。ChatGPT 要确认就确认。绝不点旧卡片上的
     Reconnect / Refresh / Connect / Edit——旧 Server URL 已死，页面会挂在
     「无法访问此网站」。
   - 然后 goto 加插件 URL，建**同一个** `connectorName`（不发明第二个名字）：
     - Description: `Securely connect ChatGPT to the current TeleAgent workspace for planning and review.`
     - Server URL: `chatgptRepair.mcpUrl`
     - Authentication: OAuth
     然后 Connect / Authorize。这时才 `c2c pair --json` 拿码输入。Connected
     即继续，不等 8 个工具。
   - 名字已不在：跳过 Delete，只建。
4. 再 `c2c doctor --json`。绿之后，同一标签重新打开本线程在用的对话 URL
   （`session.url` / 本线程早前保存的 URL）。**不改 Project 指令**——里面
   存的是 connector 名字，没变。同一对话发首次配置第 6 步的 workspace_info
   验证（确切 `connectorName`）。doctor 绿**不够**：旧对话可能还绑着已删除
   的 connector。
   - 回复说出本 workspace：在那继续，需要就保存 URL。
   - workspace_info 失败 / 超时 / 读不到名字：**不**反复重试旧 URL。
     project → 合集页，在本 Project 开新对话，boot + HANDOFF
     （`session.checkpoint`，无日志）+ workspace_info，名字匹配才
     `c2c session set --url`。long-chat → 会话管理的切换路径，同样验证。
     验证过前保留旧 URL。
5. ChatGPT 对话丢了：同第 4 步失败路径。不上传文件（工作区在 MCP 里）。工具
   指向别的 connector 时：打开项目设置，确认指令里还是 `connectorName`
   （绝不粘贴新公网地址）。

## 修复（任何东西看起来坏了）

1. `c2c doctor -w <workspace> --json`。Doctor 门槛：除重连设置页外，本地不
   绿不开 ChatGPT / 不发 `[C2C]`。
2. `namedRepair.needed`：转述 `userMessage`，`c2c tunnel login --json`，再
   doctor。不删 connector。
3. `chatgptRepair.needed`：走**地址失效重连**，再 doctor。
4. 否则按恢复映射表处理。只有登录 / 2FA / 验证码才找用户——一个动作。

## 恢复映射表

| 症状 | 处理 |
| --- | --- |
| Bridge 未运行 | `c2c start`（doctor 会自动做） |
| Tunnel 挂了 / URL 不通 / 全关掉后连接失效 | `c2c doctor` → `namedRepair.needed` 就登录 Cloudflare 再 doctor（**不 Delete**）；`chatgptRepair.needed` 就转述信息、只 Delete 本工作区 connector 再重建（**绝不 Reconnect**）。重建后旧对话 workspace_info 再验证，仍失败就在同 Project 开新对话（或 long-chat 切换）+ HANDOFF |
| 合集页只显示 Retry | 同一标签 Retry 一次，再打开最后可用的对话点其 Project 链接。消息可见前不写等待 checkpoint |
| ChatGPT 说工具调用失败 / 401 | token 过期或被吊销 → 重新配对（新配对码 + 授权） |
| 配对码被拒/过期 | `c2c pair --json` 拿新码 |
| 同一显式设置/重连步骤修复后仍失败两次 | 停止自动化 ChatGPT 设置，走**手动教学配置**。浏览器/JS 超时、加载/生成中、等登录/2FA 不算失败 |
| 端口冲突 | 自动处理，绝不向用户提及 |
| 每个新对话都「修复」/写不了日志或设置目录 | TeleAgent 原生文件访问，无需处理 |
| cloudflared 缺失 | 自己装（winget install Cloudflare.cloudflared），再重试 |
| 侧栏没有「项目」 | 请用户把鼠标放到「聊天」上，点三个点，选「按项目整理」 |
| 合集页是错的 Project | 请用户打开指定合集后说「已找到」，或接受 long-chat |