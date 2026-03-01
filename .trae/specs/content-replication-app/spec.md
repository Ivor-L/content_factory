# 爆款内容复刻 Web 应用 Spec

## Why

用户目前使用飞书作为前端，通过 n8n 后端服务进行爆款内容复刻（包括产品分析、脚本拆解、视频生成）。为了提供更好的交互体验和更专业的功能，用户希望搭建一个基于 Next.js 的 Web 应用来替代飞书前端。

## What Changes

* 构建基于 Next.js (App Router) + TypeScript + Tailwind CSS 的前端应用。

* 实现三个核心模块：产品库、脚本库、爆款复刻。

* 实现两个额外的生成页面：基于卖点生成视频、基于脚本生成视频。

* 实现与 n8n 后端的 API 对接。

* 设计并实现 6 个主要页面。

## Impact

* **Affected specs**: 新增 Web 应用规范。

* **Affected code**: `app/`, `components/`, `lib/` 等目录。

## ADDED Requirements

### Requirement: 核心布局

系统应包含统一的导航栏或侧边栏，方便用户在不同模块间切换。

### Requirement: 产品库 (Product Library)

#### Scenario: 产品列表

* **WHEN** 用户进入产品库

* **THEN** 展示已上传的产品列表（图片、名称、卖点摘要）。

#### Scenario: 上传与分析产品

* **WHEN** 用户点击“添加产品”

* **THEN** 进入上传页面，支持上传产品图片/信息，输入产品卖点（可选）。

* **WHEN** 用户提交

* **THEN** 调用后端 n8n 服务进行产品分析，自动提取卖点及详细说明，并保存结果。

### Requirement: 脚本库 (Script Library)

#### Scenario: 脚本列表

* **WHEN** 用户进入脚本库

* **THEN** 展示已拆解的爆款脚本列表（视频缩略图、标题、逻辑摘要）。

#### Scenario: 上传与拆解视频

* **WHEN** 用户点击“添加脚本”

* **THEN** 进入上传页面，支持上传爆款视频文件或链接。

* **WHEN** 用户提交

* **THEN** 调用后端 n8n 服务进行爆款拆解，自动分析爆款逻辑，并保存结果。

### Requirement: 爆款复刻 (Content Replication)

#### Scenario: 创建复刻任务

* **WHEN** 用户进入爆款复刻页面

* **THEN** 展示复刻任务创建表单。

* **WHEN** 用户选择一个“爆款脚本”和一个“产品”

* **THEN** 系统根据所选产品的卖点和脚本的逻辑，调用后端 n8n 服务。

* **THEN** 后端自动撰写提示词并调用大模型生成视频（或返回生成结果）。

### Requirement: 基于卖点生成视频 (Generate from Selling Points)

#### Scenario: 创建生成任务

* **WHEN** 用户进入“卖点生成”页面

* **THEN** 展示输入表单（选择产品或直接输入卖点）。

* **WHEN** 用户提交

* **THEN** 调用后端 n8n 服务，根据卖点直接生成视频。

### Requirement: 基于脚本生成视频 (Generate from Script)

#### Scenario: 创建生成任务

* **WHEN** 用户进入“脚本生成”页面

* **THEN** 展示输入表单（选择脚本或直接输入脚本内容）。

* **WHEN** 用户提交

* **THEN** 调用后端 n8n 服务，根据脚本直接生成视频。

### Requirement: 结果查看 (Result View)

#### Scenario: 查看生成结果

* **WHEN** 生成完成（无论是哪种生成方式）

* **THEN** 展示生成的视频或提示词结果，支持下载或进一步编辑。

