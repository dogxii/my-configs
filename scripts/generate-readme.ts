/**
 * Generate README.md
 * Automatically generates a table of contents and directory structure for the configuration repository
 * Only includes actual configuration directories, excludes scripts and project files
 */

import { readdir, stat } from 'node:fs/promises'
import { join, relative, basename, extname } from 'node:path'

interface FileInfo {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileInfo[]
  description?: string
}

// Configuration descriptions - add descriptions for your config folders here
const CONFIG_DESCRIPTIONS: Record<string, string> = {
  zed: 'Zed 编辑器配置',
  vscode: 'Visual Studio Code 配置',
  nvim: 'Neovim 配置',
  vim: 'Vim 配置',
  git: 'Git 配置',
  ssh: 'SSH 配置',
  fish: 'Fish Shell 配置',
  zsh: 'Zsh 配置',
  bash: 'Bash 配置',
  tmux: 'Tmux 终端复用器配置',
  alacritty: 'Alacritty 终端配置',
  kitty: 'Kitty 终端配置',
  wezterm: 'WezTerm 终端配置',
  starship: 'Starship 提示符配置',
  prettier: 'Prettier 代码格式化配置',
  eslint: 'ESLint 代码检查配置',
  docker: 'Docker 配置',
  karabiner: 'Karabiner-Elements 键盘映射配置',
  raycast: 'Raycast 配置',
  homebrew: 'Homebrew 包管理配置',
}

// File type icons
const FILE_ICONS: Record<string, string> = {
  '.json': '📄',
  '.yaml': '📄',
  '.yml': '📄',
  '.toml': '📄',
  '.xml': '📄',
  '.conf': '⚙️',
  '.config': '⚙️',
  '.ini': '⚙️',
  '.sh': '📜',
  '.bash': '📜',
  '.zsh': '📜',
  '.fish': '📜',
  '.lua': '🌙',
  '.vim': '📗',
  '.md': '📝',
  '.txt': '📃',
  '.plist': '📄',
}

// Directories/files to completely ignore (won't appear in README at all)
const IGNORE_PATTERNS = [
  // Project infrastructure (not user configs)
  'scripts',
  'node_modules',
  '.git',
  'dist',
  'build',
  // Project files
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'bun.lockb',
  'bun.lock',
  'README.md',
  '.gitignore',
  '.secrets-patterns.json',
  'secrets-report.json',
  // System files
  '.DS_Store',
  'Thumbs.db',
  '*.log',
]

function shouldIgnore(name: string): boolean {
  return IGNORE_PATTERNS.some((pattern) => {
    if (pattern.includes('*')) {
      const regex = new RegExp(`^${pattern.replace('*', '.*')}$`)
      return regex.test(name)
    }
    return name === pattern
  })
}

function getFileIcon(filename: string): string {
  const ext = extname(filename).toLowerCase()
  return FILE_ICONS[ext] || '📄'
}

function getFolderIcon(): string {
  return '📁'
}

async function scanDirectory(
  dirPath: string,
  rootPath: string,
  depth = 0,
): Promise<FileInfo[]> {
  const items: FileInfo[] = []

  try {
    const entries = await readdir(dirPath)

    for (const entry of entries.sort()) {
      if (shouldIgnore(entry)) continue

      const fullPath = join(dirPath, entry)
      const relativePath = relative(rootPath, fullPath)
      const stats = await stat(fullPath)

      if (stats.isDirectory()) {
        const children = await scanDirectory(fullPath, rootPath, depth + 1)
        items.push({
          name: entry,
          path: relativePath,
          type: 'directory',
          children,
          description: CONFIG_DESCRIPTIONS[entry],
        })
      } else {
        items.push({
          name: entry,
          path: relativePath,
          type: 'file',
        })
      }
    }
  } catch (error) {
    console.error(`Error scanning directory ${dirPath}:`, error)
  }

  return items
}

function generateTreeLines(items: FileInfo[], prefix = ''): string[] {
  const lines: string[] = []

  items.forEach((item, index) => {
    const isLastItem = index === items.length - 1
    const connector = isLastItem ? '└── ' : '├── '
    const icon =
      item.type === 'directory' ? getFolderIcon() : getFileIcon(item.name)

    lines.push(`${prefix}${connector}${icon} ${item.name}`)

    if (
      item.type === 'directory' &&
      item.children &&
      item.children.length > 0
    ) {
      const newPrefix = prefix + (isLastItem ? '    ' : '│   ')
      lines.push(...generateTreeLines(item.children, newPrefix))
    }
  })

  return lines
}

function generateDirectoryTree(items: FileInfo[]): string {
  if (items.length === 0) {
    return '```\n（暂无配置文件）\n```'
  }
  const lines = generateTreeLines(items)
  return ['```', '.', ...lines, '```'].join('\n')
}

function generateTableOfContents(items: FileInfo[]): string {
  const configDirs = items.filter((item) => item.type === 'directory')

  if (configDirs.length === 0) {
    return ''
  }

  const lines = [
    '## 📚 配置目录',
    '',
    '| 目录 | 描述 | 文件数 |',
    '| --- | --- | --- |',
  ]

  for (const dir of configDirs) {
    const description = dir.description || CONFIG_DESCRIPTIONS[dir.name] || '-'
    const fileCount = countFiles(dir)
    lines.push(
      `| [${dir.name}](./${dir.path}) | ${description} | ${fileCount} |`,
    )
  }

  return lines.join('\n')
}

function countFiles(item: FileInfo): number {
  if (item.type === 'file') return 1
  if (!item.children) return 0
  return item.children.reduce((count, child) => count + countFiles(child), 0)
}

function generateConfigDetails(items: FileInfo[]): string {
  const configDirs = items.filter((item) => item.type === 'directory')

  if (configDirs.length === 0) {
    return ''
  }

  const sections: string[] = ['## 📋 配置详情', '']

  for (const dir of configDirs) {
    const description = dir.description || CONFIG_DESCRIPTIONS[dir.name] || ''
    sections.push(`### ${getFolderIcon()} ${dir.name}`)
    sections.push('')
    if (description) {
      sections.push(`> ${description}`)
      sections.push('')
    }

    if (dir.children && dir.children.length > 0) {
      sections.push('文件列表：')
      sections.push('')
      for (const child of dir.children) {
        if (child.type === 'file') {
          sections.push(`- \`${child.name}\``)
        } else {
          sections.push(`- 📁 \`${child.name}/\``)
        }
      }
      sections.push('')
    }
  }

  return sections.join('\n')
}

function generateReadmeContent(items: FileInfo[], projectName: string): string {
  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })

  // Only include config directories (not loose files at root)
  const configItems = items.filter((item) => item.type === 'directory')

  const content = `# ${projectName}

> 🔧 我的应用配置文件集合，自动格式化、目录生成、敏感信息检测

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## ✨ 功能特性

- 📁 **配置集中管理** - 统一管理各种应用的配置文件
- 🎨 **自动格式化** - 支持 JSON/JSONC/YAML 等配置文件自动格式化（保留注释）
- 📝 **README 生成** - 自动生成目录结构和说明文档
- 🔒 **敏感信息检测** - 检测并提醒 API Key、密码等敏感数据

## 🚀 快速开始

### 安装依赖

\`\`\`bash
bun install
\`\`\`

### 可用命令

\`\`\`bash
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
\`\`\`

${generateTableOfContents(configItems)}

## 🗂️ 目录结构

${generateDirectoryTree(configItems)}

${generateConfigDetails(configItems)}

## 🔒 敏感信息

本仓库包含敏感信息检测功能，会自动检测以下类型的敏感数据：

- API Keys (GitHub, OpenAI, AWS, WakaTime 等)
- 密码和密钥
- Access Tokens
- Database URLs
- 私钥文件

运行 \`bun run check-secrets\` 检查是否有敏感信息泄露。

> ⚠️ **注意**：提交前请确保已移除或脱敏所有敏感信息！

## 📄 License

MIT License © ${new Date().getFullYear()}

---

<sub>🤖 README 自动生成于 ${now}</sub>
`

  return content
}

async function main() {
  const rootPath = process.cwd()

  console.log('📝 正在生成 README.md...')
  console.log(`📂 扫描目录: ${rootPath}`)

  // Scan directory structure
  const items = await scanDirectory(rootPath, rootPath)

  // Filter to only include config directories
  const configDirs = items.filter((item) => item.type === 'directory')

  // Generate README content
  const readmeContent = generateReadmeContent(items, 'My Configuration')

  // Write README.md
  const readmePath = join(rootPath, 'README.md')
  await Bun.write(readmePath, readmeContent)

  console.log('✅ README.md 生成成功！')
  console.log(`📍 位置: ${readmePath}`)

  // Print summary
  const fileCount = configDirs.reduce(
    (count, item) => count + countFiles(item),
    0,
  )
  console.log(`\n📊 统计：`)
  console.log(`   - 配置目录: ${configDirs.length} 个`)
  console.log(`   - 配置文件: ${fileCount} 个`)
}

// Export for use in other scripts
export {
  scanDirectory,
  generateReadmeContent,
  generateDirectoryTree,
  generateTableOfContents,
  CONFIG_DESCRIPTIONS,
}

// Run if executed directly
main().catch(console.error)
