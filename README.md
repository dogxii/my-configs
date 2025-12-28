# My Configuration

> 🔧 我的应用配置文件集合，自动格式化、目录生成、敏感信息检测

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## ✨ 功能特性

- 📁 **配置集中管理** - 统一管理各种应用的配置文件
- 🎨 **自动格式化** - 支持 JSON/JSONC/YAML 等配置文件自动格式化（保留注释）
- 📝 **README 生成** - 自动生成目录结构和说明文档
- 🔒 **敏感信息检测** - 检测并提醒 API Key、密码等敏感数据

## 🚀 快速开始

### 安装依赖

```bash
bun install
```

### 可用命令

```bash
# 格式化所有配置文件
bun run format

# 生成 README 文档
bun run readme

# 检测敏感信息
bun run check-secrets

# 验证（敏感信息检测 + 格式检查）
bun run validate

# 运行所有任务
bun run all
```

## 📚 配置目录

| 目录 | 描述 | 文件数 |
| --- | --- | --- |
| [zed](./zed) | Zed 编辑器配置 | 2 |

## 🗂️ 目录结构

```
.
└── 📁 zed
    ├── 📄 Dogxi_theme.json
    └── 📄 setting.json
```

## 📋 配置详情

### 📁 zed

> Zed 编辑器配置

文件列表：

- `Dogxi_theme.json`
- `setting.json`


## 🔒 敏感信息

本仓库包含敏感信息检测功能，会自动检测以下类型的敏感数据：

- API Keys (GitHub, OpenAI, AWS, WakaTime 等)
- 密码和密钥
- Access Tokens
- Database URLs
- 私钥文件

运行 `bun run check-secrets` 检查是否有敏感信息泄露。

> ⚠️ **注意**：提交前请确保已移除或脱敏所有敏感信息！

## 📄 License

MIT License © 2025

---

<sub>🤖 README 自动生成于 2025/12/28 14:08:16</sub>
