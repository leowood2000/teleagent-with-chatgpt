---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '3d38c3b6-e627-4376-9316-e20e0016a576'
  PropagateID: '3d38c3b6-e627-4376-9316-e20e0016a576'
  ReservedCode1: '48919289-2741-4af9-9e49-c6d6904a4bd3'
  ReservedCode2: '48919289-2741-4af9-9e49-c6d6904a4bd3'
---

# TeleAgent with ChatGPT

> ChatGPT thinks. TeleAgent works.
> ChatGPT 负责思考，TeleAgent 负责干活。

> [!IMPORTANT]
> **遇到问题？** 请先向 TeleAgent 发送 **「更新 TeleAgent with ChatGPT」** 并重试。更新到最新版本可以解决大多数已知问题。  
> **Having trouble?** First ask TeleAgent to **“Update TeleAgent with ChatGPT”** and try again. Updating to the latest version resolves most known issues.

## The problem · 解决什么问题

**中文** — ChatGPT 付费订阅的网页版额度大量闲置，TeleAgent 却在消耗紧张的
API 额度做规划和 Review。本项目把“思考”交给你已付费的网页版 ChatGPT，
TeleAgent 只负责执行。不用 API Key、不搞逆向代理——官方网页 + 只读 MCP 桥接。

**EN** — ChatGPT Plus/Pro web quota sits idle while your coding agent burns
scarce API tokens on planning and review. This project moves the
thinking to the subscription you already pay for; TeleAgent only executes.
No API keys, no reverse proxy — official web UI plus a read-only MCP bridge.

## What it is · 这是什么

**中文** — 把 ChatGPT 网页版变成 TeleAgent 编码会话的"规划与审查大脑"，执行权
完全保留在 TeleAgent 手里。你的仓库永远不会被上传：ChatGPT 通过一条安全的、
OAuth 保护的**只读** MCP 连接，按需读取当前工作区里它真正需要的那几行代码。

**EN** — Use the ChatGPT web app as the planning and review brain for your
TeleAgent coding sessions, while TeleAgent keeps full ownership of execution. Your
repository is never uploaded: ChatGPT reads exactly the lines it needs through
a secure, OAuth-protected, **read-only** MCP connection to your current
workspace.

Detailed docs below are in English · 详细中文文档见 **[README.zh-CN.md](README.zh-CN.md)**

## One-paste install · 一段话安装

**中文** — 不懂 git、Node、终端？完全不需要懂。把下面这段话原样复制给
TeleAgent，然后去倒杯咖啡：

```text
请帮我完整安装并配置 TeleAgent with ChatGPT，全程自动，我是不懂技术的小白，
所有事情你自己做：

1. 环境自检：需要 git 和 Node.js ≥ 20，缺什么就自动安装
  （macOS 用 Homebrew，Windows 用 winget），同时安装 cloudflared。
2. 下载：把 https://github.com/leowood2000/teleagent-with-chatgpt 克隆到
   ~/teleagent-with-chatgpt（已存在就 git pull 更新）。
3. 构建：在该目录里执行 corepack pnpm install 和 corepack pnpm build。
4. 安装技能：把仓库里的 skill/SKILL.md 复制到 TeleAgent 的技能目录
  （形如 ~/.config/TeleAgent/users/<用户ID>/skills/teleagent-with-chatgpt/SKILL.md，
  Windows 为 %USERPROFILE%\.config\TeleAgent\users\<用户ID>\skills\...），
  并把文件中「TeleAgent with ChatGPT 检出位置」一行的路径改成实际克隆路径。
  新装的技能需要在新的 TeleAgent 会话中才会生效。
5. 首次配置：按 SKILL.md 里的 first-time setup 流程执行
  （运行 c2c setup，用会话提供的浏览器工具打开 ChatGPT 配置连接器并输入
   配对码；没有浏览器工具时走 SKILL.md 的手动教学配置，一次只让我做一个动作）。
6. 只有遇到需要我登录（ChatGPT / Cloudflare）、验证码或两步验证时才叫我，
    而且一次只告诉我一个动作。
7. 完成后给我看 ✓ 清单，并确认文件读取测试通过。我不懂 MCP、OAuth、
    Tunnel、端口这些词，不要向我解释；出了问题先自己修。
```


**EN** — Don't know git, Node, or terminals? You don't need to. Copy the
paragraph below, paste it to TeleAgent, and go grab a coffee:

```text
Please install and configure "TeleAgent with ChatGPT" for me, fully automatically.
I am a non-technical user — do everything yourself:

1. Check the environment: git and Node.js >= 20 must be available. Install
    anything missing yourself (macOS: Homebrew, Windows: winget). Also install
    cloudflared.
2. Download: clone https://github.com/leowood2000/teleagent-with-chatgpt into
    ~/teleagent-with-chatgpt (if it already exists, git pull to update).
3. Build: inside that folder run `corepack pnpm install` then `corepack pnpm build`.
4. Install the skill: copy skill/SKILL.md into TeleAgent's skill directory
    (like ~/.config/TeleAgent/users/<uid>/skills/teleagent-with-chatgpt/SKILL.md;
    on Windows %USERPROFILE%\.config\TeleAgent\users\<uid>\skills\...),
    and replace the "TeleAgent with ChatGPT 检出位置" line with the actual clone
    path. Newly installed skills only appear in NEW TeleAgent sessions.
5. First-time setup: follow the SKILL.md "first-time setup" workflow
    (run c2c setup, configure the ChatGPT connector with the browser tools the
    session provides and enter the pairing code; if no browser tool is
    available, follow SKILL.md's guided manual setup — one action at a time).
6. Only interrupt me for logins (ChatGPT / Cloudflare), CAPTCHAs or 2FA —
    and give me exactly ONE action at a time.
7. When done, show me the ✓ checklist and confirm the file-read test passed.
    I don't know what MCP, OAuth, tunnels or ports are. Don't explain them.
    If anything breaks, fix it yourself first.
```


**Updates · 更新** — The Skill checks GitHub once a day and updates itself when a
new version is released; no action needed. You can also say "更新 TeleAgent with ChatGPT"
anytime. / Skill 每天自动检查一次 GitHub，有新版本会自动更新，无需任何操作；
也可以随时对 TeleAgent 说"更新 TeleAgent with ChatGPT"。

---

*The sections below are in English. 以下详细内容为英文，中文完整版见
[README.zh-CN.md](README.zh-CN.md)。*

## Install → Setup → Use (manual)

1. Install the TeleAgent skill: copy `skill/SKILL.md` into TeleAgent's skill
   directory (`~/.config/TeleAgent/users/<uid>/skills/teleagent-with-chatgpt/`),
   replace the "检出位置" line with the actual clone path, then start a NEW
   TeleAgent session.
2. Tell TeleAgent: **"Set up TeleAgent with ChatGPT."** (中文: "使用 TeleAgent with ChatGPT 完成首次配置。")
3. Use TeleAgent normally: **"Use TeleAgent with ChatGPT to implement XXX."**

That's the whole manual. You don't need to know what MCP, OAuth, tunnels,
ports or localhost are — TeleAgent configures everything automatically and you
just see:

```
TeleAgent with ChatGPT

✓ Project detected
✓ Workspace Bridge started
✓ Secure connection established
✓ ChatGPT connected
✓ File read test passed

Ready.
```

The only steps that may need you: logging into ChatGPT (and, if you want a
stable hostname, logging into Cloudflare once). A **new** workspace also asks
you to create a ChatGPT Project (collection) once — pick **project-only
memory**, name it after the workspace. If the sidebar has no Projects row,
hover **Chats**, open the … menu, and choose **Organize by project**. TeleAgent
then saves that collection link and starts chats from that page. Existing
workspaces that already have a C2C chat stay on the old one-conversation
style until you ask to switch.

### Optional stable hostname

The default public address is a temporary Cloudflare URL. It changes when the
bridge restarts, and TeleAgent repairs ChatGPT by deleting that workspace's
connector and adding it again.

If you have a Cloudflare account and a domain already on Cloudflare, first-time
setup (and the next coding session, once) will ask whether you want a stable
hostname such as `c2c-<project>.your-domain.com`. That path opens a browser so
you can authorize Cloudflare. After that, the ChatGPT connector keeps working
across restarts. If you skip it, or the login fails, TeleAgent stays on the temporary
address — same features, just a slower repair.

Credentials stay in the OS app state directory, not in the project.

## How it works

```
             ┌───────────────────────────┐
             │       ChatGPT Web         │
             │  Reason / Plan / Review   │
             └──────────┬──────────▲─────┘
                        │          │
               MCP      │          │ Computer Use
            Data Plane  │          │ Control Plane (<1 KB messages)
                        ▼          │
             ┌─────────────────────┐
             │      C2C Bridge     │   loopback-only HTTP server
             │  read-only MCP      │   OAuth 2.1 + one-time pairing code
             │  OAuth + Pairing    │   Cloudflare Quick Tunnel
             │  Tunnel Manager     │
             └──────────┬──────────┘
                        │  read-only
                        ▼
              ┌─────────────────────┐          ┌─────────────────────┐
              │   Local Workspace   │◀─────────│   TeleAgent Harness  │
              └─────────────────────┘ edit/git │ shell / tests / fix │
                                               └─────────────────────┘
```

- **Control plane (browser)**: TeleAgent and ChatGPT exchange tiny structured
  `[C2C]` state messages — `INIT → PLAN → EXECUTED → REVIEW → DONE`. No diffs,
  no logs, no file bodies are ever pasted.
- **Data plane (MCP)**: ChatGPT pulls what it needs itself through 9 read-only
  tools: `workspace_info`, `list_directory`, `read_file`, `search_workspace`,
  `git_status`, `git_diff`, `test_status`, `execution_summary`,
  `execution_output`.
- **Independent review**: after TeleAgent executes, ChatGPT inspects the actual
git diff and test records through MCP — it never trusts "all tests passed"
claims blindly.

## Security model (short version)

- **Read-only by construction**: write/delete/shell/commit tools simply do not
  exist on the server. No prompt injection can enable them.
- **One workspace = one boundary**: every token is bound to a single workspace;
  path containment uses canonical realpaths (symlink/`../`/absolute-path escapes
  are all blocked and tested).
- **Sensitive files never leave**: `.env*`, keys, SSH, credentials are denied by
  default (`.env.example` allowed); `.c2cignore` adds your own rules.
- **Knowing the URL grants nothing**: the public MCP endpoint requires OAuth 2.1
  (PKCE S256, dynamic client registration, rotating refresh tokens). Without a
  token: 401. Wrong workspace: 403.
- **The model never sees long-lived credentials**: the only secret that ever
  touches a browser is a one-time pairing code (5-minute TTL, 5 attempts,
  rate-limited, destroyed on use).

Full threat model: [docs/security.md](docs/security.md)

## For developers

```bash
pnpm install
pnpm build          # -> dist/, exposes the `c2c` bin
pnpm test           # vitest: 180 tests (path security, OAuth, pairing, MCP e2e, tunnel readiness)

c2c setup           # bridge + tunnel + pairing code, all in one
c2c sandbox-allow   # no-op on TeleAgent (native file access); kept for compatibility
c2c status / doctor / pair / unpair / logs / stop
```

Requirements: Node.js >= 20, git. `cloudflared` for the public connection
(auto-detected; the Skill installs it for you). If QUIC is blocked, set
`C2C_TUNNEL_PROTOCOL=http2` and restart the bridge.

Tunnel readiness is a four-level ladder: LOCAL_READY → TUNNEL_REGISTERED →
PUBLIC_READY / PUBLIC_UNKNOWN → CHATGPT_VERIFIED (the Skill's final gate is
ChatGPT calling `workspace_info`). On networks where `trycloudflare.com` is
slow or blocked (e.g. mainland China), a registered tunnel is accepted and the
end-to-end verdict is left to ChatGPT.

Docs: [architecture](docs/architecture.md) · [protocol](docs/protocol.md) ·
[security](docs/security.md) · [troubleshooting](docs/troubleshooting.md)

## Project layout

```
src/
  bridge/     loopback HTTP server, port recovery, admin API
  mcp/        9 read-only tools, stateless Streamable HTTP
  auth/       OAuth 2.1 (PKCE, DCR, refresh rotation, revocation)
  pairing/    one-time pairing codes (CSPRNG, TTL, rate limits)
  workspace/  path containment, sensitive-file policy, search, git
  tunnel/     TunnelProvider abstraction + Cloudflare Quick/Named Tunnel
  execution/  execution records for the review loop
  process/    daemon lifecycle
  cli/        the c2c CLI
skill/        the TeleAgent skill (the real UX layer)
tests/        unit + integration tests
docs/         architecture / protocol / security / troubleshooting
```

## Status & disclaimer

TeleAgent fork of [XiaoDuoYa/codex-with-chatgpt](https://github.com/XiaoDuoYa/codex-with-chatgpt),
re-harnessed for TeleAgent: the Codex skill is rewritten for TeleAgent's
skill/browser model, `sandbox-allow` is a no-op (TeleAgent has native file
access), and the tunnel readiness ladder tolerates networks where
`trycloudflare.com` is unreliable.

Verified end-to-end: bridge, OAuth + pairing, Cloudflare Named Tunnel with a
stable hostname, ChatGPT connector setup + `workspace_info` round-trip,
zero-touch first-run experience. 180 tests green.

**Unofficial community project. Not affiliated with or endorsed by OpenAI or
the TeleAgent team.**

### ToS risk you should know about · 条款风险提示

The control plane drives the **ChatGPT web UI** — automated messages plus
programmatic reading of replies. OpenAI's consumer terms prohibit automated
or programmatic extraction of data or output from the service. Using this
project with a paid consumer account is therefore at your own risk:
low-frequency, supervised use is far safer than long-running unattended loops.
If you are concerned, the clean alternative is the official OpenAI API route
(or keep a human in the loop: you click Send, then hand the reply to TeleAgent).

控制面驱动的是 ChatGPT 网页版（自动发消息 + 程序化读取回复）。OpenAI 个人版
条款禁止程序化提取服务输出。用付费个人版账号跑本项目请自行评估风险：低频、
有人监督的使用远比长期无人值守循环稳妥。介意条款的话，干净的替代是官方 API
路线，或保留人工点击发送的 human-in-the-loop 模式。另注意：ChatGPT 通过 MCP
读取的那部分代码会传出境外服务器，政企/客户源码场景需另行评估。

## License

[MIT](LICENSE)