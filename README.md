# 芯途抉择 · 工程伦理联机桌游

<img src="img/mascot.svg" width="96" align="right" alt="吉祥物小芯">

一款关于成长与选择的工程师桌游。玩家扮演半导体行业的新人工程师，沿 **芯片设计 → 晶圆制造 → 封装测试 → 终端应用** 产业链成长，在真实行业事件与没有标准答案的伦理困境中做出抉择。

**制作小组：** 蒙浩煦、文俊杰、林龙鑫、罗家宇、杨帆、罗富元

- 3–6 人联机，手机、电脑浏览器打开网址即可，不用下载；人不够可以加机器人
- 一人「创建房间」，其他人输入 4 位房间码或扫二维码加入
- 首次进入有 12 步交互式新手教程（可跳过），吉祥物「小芯」全程提示
- 设计说明与规则：[docs/design-and-rules.pdf](docs/design-and-rules.pdf)（两页）

## 和课程内容的对应

| 课程要求 | 游戏里的体现 |
| --- | --- |
| 角色卡 ≥ 4 张 | 6 个岗位角色，起始资源与专属技能各不相同 |
| 事件卡 ≥ 12 张 | 12 张行业事件（芯片断供、双碳政策、AI 算力爆发等，注明改编来源）+ 8 张机遇卡 |
| 伦理困境卡 ≥ 6 张 | 12 张，「情境—选项A/B—后果与资源增减」结构，无标准答案 |
| 《工程思维的特点》 | 每张困境卡标注系统 / 辩证 / 价值思维透镜，并列出牵动的利益相关方 |
| 棋盘 | 24 格 3D 棋盘，沿产业链四个环节 |
| 4F 复盘 | 结算页回顾自己的每个抉择，给出 Feeling / Fact / Finding / Future 讨论题 |

创新机制：

- **行业信任**：所有人共享。有人走捷径信任下降，降到 0 全员受罚；保持得好全员有红利。个人选择，集体后果
- **选择的回响**：困境中的选择两轮后可能回来，带来奖励或惩罚。伦理后果往往是迟到的
- **猜一猜 + 聊天**：别人做选择时可以猜，结算后一键聊理由
- **你是哪种工程师**：结算时按选择给出守护者 / 务实派 / 冒险家，并展示同一张卡大家各选了什么

## 发布到 GitHub（得到一个所有人都能打开的网址）

1. 在 [github.com/new](https://github.com/new) 新建一个 **Public（公开）** 仓库，例如 `ethics-boardgame`，什么都不要勾选。
2. 在本文件夹打开终端，运行（把 `你的用户名` 换成自己的）：
   ```bash
   git commit -m "芯途抉择：工程伦理联机桌游"
   git remote add origin https://github.com/你的用户名/ethics-boardgame.git
   git push -u origin main
   ```
   第一次推送会弹出浏览器窗口让你登录 GitHub。
3. 打开仓库的 **Settings → Pages**，在 **Source** 里选择 **GitHub Actions**。仓库里已经带了自动发布脚本（`.github/workflows/pages.yml`），推送后一两分钟就会发布好。
4. 网址是 `https://你的用户名.github.io/ethics-boardgame/`，发给同学就能一起联机。房主的大厅页面会显示二维码，扫码即可加入。

以后修改了文件，再 `git add -A && git commit -m "说明" && git push` 一次，网站会自动更新。

## 本地试玩

直接双击 `index.html` 即可单机试玩（联机也能用，但二维码和系统分享只在网址形式下出现）。

## 技术说明

纯静态网页（HTML / CSS / JavaScript + Three.js），不需要服务器。联机通过公共 MQTT 服务器（broker.emqx.io，失败时依次尝试 HiveMQ、Mosquitto）的 WebSocket 转发消息，房主浏览器负责运行游戏逻辑。公共服务器没有密码保护，仅适合课堂娱乐使用，聊天里不要发送个人隐私。

- 修改 `js/board3d.js` 后需要重新打包 3D 棋盘：`bash tools/build-3d.sh`
- 修改 `docs/design-and-rules.tex` 后重新生成 PDF：在 `docs` 目录运行 `xelatex design-and-rules.tex`

## 素材与协议

图标：[Lucide](https://lucide.dev)（ISC）；头像：[DiceBear](https://www.dicebear.com) Big Smile，作者 Ashley Seo（CC BY 4.0）；字体：站酷快乐体、Fredoka（SIL OFL）；3D：[three.js](https://threejs.org)（MIT）；二维码：qrcode-generator（MIT）。行业事件卡为基于公开报道的改编，仅用于教学。
