<div align="center">
  <img src="https://raw.githubusercontent.com/Truthan49/Antigravity-Everywhere/main/public/logo.png" width="120" alt="Antigravity Logo" />
  <h1>Antigravity Mobility | 你的私人 AI 智能体控制台</h1>
  <p>一个专为开发者打造的 Web 界面，帮你统一管理本地所有的 AI 助手（Agent）、大模型配置、工具插件和知识库数据。</p>
  
  <p>
    <a href="https://github.com/Truthan49/Antigravity-Everywhere/issues"><img alt="Issues" src="https://img.shields.io/github/issues/Truthan49/Antigravity-Everywhere" /></a>
    <a href="https://github.com/Truthan49/Antigravity-Everywhere/pulls"><img alt="Pull Requests" src="https://img.shields.io/github/issues-pr/Truthan49/Antigravity-Everywhere" /></a>
    <a href="https://github.com/Truthan49/Antigravity-Everywhere/blob/main/LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-blue.svg" /></a>
  </p>
</div>

---

## 🌟 为什么需要 Antigravity？ (能帮你解决什么问题？)

如今，我们经常会在电脑上跑各种不同的 AI 助手或是写各种脚本自动化任务。但这会带来很多麻烦：
1. **纯命令行太难用**：大部分本地 Agent 都在终端里跑，满屏代码滚动，你根本看不清 AI 到底在干什么。
2. **不同的代码项目无法隔离**：你在开发 A 项目时写了一个专属的 AI 提示词，到了 B 项目又得重新配置一遍。
3. **给 AI 安装工具太麻烦**：想让本地的 AI 帮你自动搜网页、读日历，你得手写几百行 Python 代码。
4. **必须坐在电脑前**：下班走在路上想起来代码有个 Bug，没法让办公桌上的 AI 帮你提前跑一跑报错日志。

**Antigravity 就是为了解决这些痛点而诞生的。** 它把你的电脑变成了一个“AI 服务器”，并给你提供了一个极其好用的可视化网页控制台，让你像管理系统 App 一样轻松管理所有的大模型和 AI 任务。

---

## ✨ 核心大白话功能介绍 (Features)

### 1. 💻 桌面级可视化 Agent 工作台 (告别枯燥的命令行)
你在浏览器里打开 Antigravity 后，就能看到一个清爽的聊天界面，这实际上是你电脑后台 AI 进程的监控中心。
* **不再是黑盒**：你可以清晰地看到 AI 的“思考过程（Thoughts）”，以及它正在偷偷**调用了什么工具**（比如正在读取你的哪个文件）。
* **内置黑色终端**：如果 AI 自动帮你执行了 `npm run build` 之类的命令，命令行里报出的红绿相间的文字，会直接完整地显示在前端聊天流里。
* **随时切换大模型**：通过顶部下拉菜单，你可以随时在 OpenAI、Claude 3.5、DeepSeek 之间一键切换（前提是你配置了各自的 API Key）。

### 2. 📁 多工作区隔离 (管理你几十个不同的代码项目)
* **挂载你的文件夹**：你可以把 `C:\Projects\电商网站` 和 `C:\Projects\内部后台` 分别挂载进来。
* **项目间互不干扰**：你在“电商网站”这个界面的所有对话、让 AI 读过的代码上下文，永远不会和“内部后台”混在一起。每个项目都有一个自己专属的跑在后台的 AI 管家。

### 3. ☁️ 云端插件商店 (内置腾讯 SkillHub，一键安装工具)
不要再自己给大模型手写工具库了！
* **2.5万+ 现成工具**：我们在左侧边栏内置了一个和腾讯 SkillHub 打通的插件应用商店。你可以直接搜索“Github操作”、“网页爬虫”、“PDF阅读器”。
* **一键安装体验**：点一下安装，这个功能立刻就会下载到你电脑里。下次你再和 AI 对话时，AI 就能自动借助刚才装的工具去帮你提取网页数据了。
* **极速秒开**：不用担心商店卡顿，我们在你电脑本地做了一套缓存，点开商店保证 0 延迟。

### 4. 🧠 全局通用知识库 (上传一次，终身复用)
* **共享文件夹**：你可以把你公司的《代码规范.pdf》、《API 接口设计图.md》上传到左侧的“知识库”里。
* **全系统互通**：以后无论你打开了多少个不同的代码项目，那些项目里的 AI 都可以直接随时调取这些文档的内容，再也不用你每个项目都挨个复制粘贴一次提示词了。

### 5. 📱 飞书移动端协同 (用手机遥控你工位上的电脑)
想象一下：你已经下班离开公司了，办公桌上的电脑没关。你在地铁上突然接到报错处理通知。
* **远程使唤 AI**：打开你手机上的企业飞书，找到绑定的机器人，直接发文字：“帮我看看电商网站那个目录里 user.ts 最新报的错误是什么？”。
* **内网穿透**：这句话会通过网络打回你公司工位电脑上的 Antigravity 系统，调用本地强大的代码读取能力和计算资源。
* **富文本回传卡片**：AI 处理完后，会在你的飞书手机端弹出一张非常漂亮的卡片（带代码高亮和折叠），把你电脑本地那份文件的报错分析展示给你看。

### 6. 📊 花费与 Token 监控大屏 (管好你的钱包)
每天让 AI 在后台跑自动化脚本，万一 Token 跑超了怎么办？
* 我们做了一个全局的大盘仪表盘（Analytics），清晰展示出：昨天你用 Claude 跑了多少词、用了 DeepSeek 跑了多少词，今天一共失败了多少次 API 访问。
* 看折线图和统计数据一目了然，再也不怕 API 费用变成糊涂账。

### 7. 📝 用户自定义工作流 (一键执行标准动作)
* 总有一些固定的研发流程：比如“先看 README -> 再运行依赖安装 -> 再构建”。你可以在界面里把这些写成通用的流程脚本（Workflows）。
* 下次你要做这件事，只需点个按钮，AI 就会像流水线的机器一样，严格按照你定好的 1, 2, 3 步老老实实地去执行。

---

## 📦 新手一键安装 (Quick Start)

我们去掉了所有繁琐的配置选项，提供了一个最简单的一键安装方式。

打开你 Mac 或 Linux 电脑的终端，复制粘贴并回车运行下面这行命令：

```bash
curl -fsSL https://raw.githubusercontent.com/Truthan49/Antigravity-Everywhere/main/install.sh | bash
```

> *(这个脚本会自动帮你下载最新代码、安装 Node.js 库，并为你建好所有必要的配置文件夹。)*

等终端提示成功后，在浏览器中打开 **`http://localhost:3000`** 即可开始使用！

---

## 🗑️ 一键彻底卸载 (Uninstall)

如果您需要卸载 Antigravity 并清理所有残留文件，可以打开 Mac / Linux 终端运行下面这行命令：

```bash
curl -fsSL https://raw.githubusercontent.com/Truthan49/Antigravity-Everywhere/main/uninstall.sh | bash
```

*(这会自动引导您安全地清理冗余的项目代码与缓存系统，同时您可以自由选择是否保留历史产生的配置文件供未来恢复时使用。)*

---

## 🤝 欢迎反馈与参与共建

我们非常欢迎开发者一起探讨 Agent 的未来！如果您在使用期间发现 Bug，或是希望我们接入更多的平台（例如微信企业版/钉钉推送），欢迎提交 Issue 或是发起 Pull Request！

* [提交问题 (Issues)](#)
* [许可协议 MIT License](LICENSE)
