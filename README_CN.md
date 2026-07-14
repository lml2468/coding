<p align="center">
<picture>
<source srcset="assets/coding.png" media="(prefers-color-scheme: dark)">
<source srcset="assets/coding.png" media="(prefers-color-scheme: light)">
<img src="assets/coding.png" alt="coding Logo" width="500" style="image-rendering: -webkit-optimize-contrast; image-rendering: crisp-edges;">
</picture>
</p>

<p align="center">
<strong>开箱即用的 Claude Code 工程化框架</strong><br/>
<sub>AI 写代码很快，但它每次会话都从零开始理解项目，记不住你的规范，也记不住团队级别的需求。coding 会把规范、任务、记忆沉淀进仓库，让 Claude Code 按你的工程标准来实践。</sub>
</p>

<p align="center">
<a href="./README.md">English</a>
</p>

<p align="center">
<a href="https://github.com/lml2468/coding/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-16a34a.svg?style=flat-square" alt="license" /></a>
<a href="https://github.com/lml2468/coding/stargazers"><img src="https://img.shields.io/github/stars/lml2468/coding?style=flat-square&color=eab308" alt="stars" /></a>
<a href="https://github.com/lml2468/coding/issues"><img src="https://img.shields.io/github/issues/lml2468/coding?style=flat-square&color=e67e22" alt="open issues" /></a>
</p>

## 为什么用 coding？

`coding` 是 [Trellis](https://github.com/mindfold-ai/Trellis) 的 Claude Code 专用分支，裁剪为单一平台，并围绕 Claude Code 原生子代理工作流做了简化。

| 能力 | 带来的改变 |
| --- | --- |
| **自动注入规范** | 将规范沉淀到 `.coding/spec/` 之后，coding 会在每次会话中按当前任务自动按需注入相关上下文，无需反复说明。 |
| **任务驱动工作流** | PRD、实现上下文、审查上下文与任务状态统一存放于 `.coding/tasks/`，AI 开发过程保持结构化、可追溯。 |
| **项目记忆** | `.coding/workspace/` 中的工作日志（journal）会保留上一次会话的脉络，因此每次新会话都能基于真实上下文开始。 |
| **团队共享标准** | Spec 随仓库一同版本化，个人总结出的规则与流程可以直接成为整个团队的基础设施。 |
| **Claude 原生循环** | 基于 Claude Code 子代理与 skill 的 Plan → Implement → Verify → Finish 四阶段循环。 |

## 前置要求

- **Node.js** >= 18
- **Python** >= 3.9
- **Claude Code**

## 快速开始

```bash
# 1. 安装 coding
npm install -g @limenglin/coding@latest

# 2. 在仓库中初始化
coding init -u your-name
```

## 如何使用

使用流程非常简单：

1. **用自然语言描述你的需求。**
2. **与 AI 一起头脑风暴**，一次只回答一个问题，直到 PRD 足够清晰，然后开始实现。
3. **交由 AI 自主推进** —— AI 会调用 `coding-implement` 编写代码，并自动依据 Spec、lint、type-check 与测试进行校验。
4. **当工作完成或会话上下文接近上限时，输入 `/coding:finish-work`**。coding 会归档任务并更新工作日志。

## 工作原理

coding 内部运行一个 4 阶段循环，skill 与子代理均由系统自动调用：

1. **Plan（规划）** —— `coding-brainstorm` 逐题梳理需求并写入 `prd.md`；涉及资料调研的部分派发给 `coding-research` 子代理处理。阶段产出为一组精选的 Spec 与研究文件，由 `implement.jsonl` / `check.jsonl` 编排。
2. **Implement（实现）** —— `coding-implement` 子代理依据 PRD 编写代码，所需上下文已按 `implement.jsonl` 自动注入，不会执行 git commit。
3. **Verify（验证）** —— `coding-check` 子代理基于 diff 对照 Spec 逐项核查，并运行 lint、type-check 与测试，在能力范围内自动修复。
4. **Finish（收尾）** —— 执行最终检查后，`coding-update-spec` 将本轮新增的认知沉淀回 `.coding/spec/`，为下一次会话积累上下文。

## 常见问题

<details>
<summary><strong>coding 与 <code>CLAUDE.md</code> 有何区别？</strong></summary>

`CLAUDE.md` 本身是有用的入口，但容易在长期使用中变得冗长臃肿。coding 在此之上补充了：作用域明确的 Spec、按任务划分的 PRD、工作流关卡与工作区记忆。

</details>

<details>
<summary><strong>coding 是否支持其他 AI 平台？</strong></summary>

不支持。coding 有意只面向 Claude Code。如果你需要多平台支持，请使用上游的 [Trellis](https://github.com/mindfold-ai/Trellis) 项目。

</details>

<details>
<summary><strong>coding 适合个人开发者还是团队？</strong></summary>

两者皆可。个人开发者主要受益于记忆机制与可复用的工作流；团队使用收益更大——标准统一、任务边界清晰、上下文可审查。

</details>

<details>
<summary><strong>是否需要手动编写每一个 Spec 文件？</strong></summary>

并不需要。多数团队的做法是先由 AI 基于现有代码生成初稿，再人工收紧关键规则。coding 的效果取决于是否将高价值规则显式化并纳入版本管理。

</details>

## 致谢

`coding` 是 Mindfold LLC 的 [Trellis](https://github.com/mindfold-ai/Trellis) 项目的分支，遵循 AGPL-3.0 许可。本分支由 [lml2468](https://github.com/lml2468) 维护，同样遵循 AGPL-3.0。

<p align="center">
<a href="https://github.com/lml2468/coding">官方仓库</a> •
<a href="https://github.com/lml2468/coding/blob/main/LICENSE">AGPL-3.0 License</a> •
Fork 自 <a href="https://github.com/mindfold-ai/Trellis">Trellis</a>
</p>
