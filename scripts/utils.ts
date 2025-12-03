import { readdir, stat } from "node:fs/promises"
import { join, relative, extname } from "node:path"

/**
 * Recursively get all files in a directory
 */
export async function getAllFiles(
  dir: string,
  ignorePatterns: string[] = []
): Promise<string[]> {
  const files: string[] = []

  async function walk(currentDir: string) {
    const entries = await readdir(currentDir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name)
      const relativePath = relative(process.cwd(), fullPath)

      // Check if path should be ignored
      if (shouldIgnore(relativePath, ignorePatterns)) {
        continue
      }

      if (entry.isDirectory()) {
        await walk(fullPath)
      } else if (entry.isFile()) {
        files.push(fullPath)
      }
    }
  }

  await walk(dir)
  return files
}

/**
 * Check if a path matches any ignore pattern
 */
export function shouldIgnore(path: string, patterns: string[]): boolean {
  const normalizedPath = path.replace(/\\/g, "/")

  for (const pattern of patterns) {
    if (matchGlobPattern(normalizedPath, pattern)) {
      return true
    }
  }

  return false
}

/**
 * Simple glob pattern matching
 */
export function matchGlobPattern(path: string, pattern: string): boolean {
  // Handle ** for recursive matching
  const regexPattern = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "{{GLOBSTAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/{{GLOBSTAR}}/g, ".*")
    .replace(/\?/g, ".")

  const regex = new RegExp(`^${regexPattern}$|/${regexPattern}$|^${regexPattern}/|/${regexPattern}/`)
  return regex.test(path)
}

/**
 * Get directory tree structure
 */
export async function getDirectoryTree(
  dir: string,
  ignorePatterns: string[] = [],
  prefix: string = ""
): Promise<string[]> {
  const lines: string[] = []
  const entries = await readdir(dir, { withFileTypes: true })

  // Sort entries: directories first, then files
  const sortedEntries = entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1
    if (!a.isDirectory() && b.isDirectory()) return 1
    return a.name.localeCompare(b.name)
  })

  const filteredEntries = sortedEntries.filter((entry) => {
    const fullPath = join(dir, entry.name)
    const relativePath = relative(process.cwd(), fullPath)
    return !shouldIgnore(relativePath, ignorePatterns)
  })

  for (let i = 0; i < filteredEntries.length; i++) {
    const entry = filteredEntries[i]
    const isLast = i === filteredEntries.length - 1
    const connector = isLast ? "└── " : "├── "
    const childPrefix = isLast ? "    " : "│   "

    const fullPath = join(dir, entry.name)

    if (entry.isDirectory()) {
      lines.push(`${prefix}${connector}📁 ${entry.name}/`)
      const childLines = await getDirectoryTree(
        fullPath,
        ignorePatterns,
        prefix + childPrefix
      )
      lines.push(...childLines)
    } else {
      const icon = getFileIcon(entry.name)
      lines.push(`${prefix}${connector}${icon} ${entry.name}`)
    }
  }

  return lines
}

/**
 * Get file icon based on extension
 */
export function getFileIcon(filename: string): string {
  const ext = extname(filename).toLowerCase()
  const name = filename.toLowerCase()

  const iconMap: Record<string, string> = {
    // Config files
    ".json": "📄",
    ".yaml": "📄",
    ".yml": "📄",
    ".toml": "📄",
    ".ini": "📄",
    ".conf": "⚙️",
    ".config": "⚙️",
    ".env": "🔐",
    ".properties": "📄",
    ".xml": "📄",
    ".plist": "📄",

    // Scripts
    ".ts": "📜",
    ".js": "📜",
    ".sh": "📜",
    ".bash": "📜",
    ".zsh": "📜",

    // Documentation
    ".md": "📝",
    ".txt": "📝",

    // Lock files
    ".lock": "🔒",
    ".lockb": "🔒",
  }

  // Special files
  const specialFiles: Record<string, string> = {
    ".gitignore": "🙈",
    ".gitattributes": "🙈",
    "readme.md": "📖",
    "license": "📜",
    "license.md": "📜",
    "changelog.md": "📋",
  }

  if (specialFiles[name]) {
    return specialFiles[name]
  }

  return iconMap[ext] || "📄"
}

/**
 * Format file size
 */
export function formatFileSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"]
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`
}

/**
 * Get file stats
 */
export async function getFileStats(
  filePath: string
): Promise<{ size: number; mtime: Date } | null> {
  try {
    const stats = await stat(filePath)
    return {
      size: stats.size,
      mtime: stats.mtime,
    }
  } catch {
    return null
  }
}

/**
 * Color output helpers for terminal
 */
export const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",

  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",

  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
}

export function colorize(text: string, color: keyof typeof colors): string {
  return `${colors[color]}${text}${colors.reset}`
}

/**
 * Log helpers
 */
export const log = {
  info: (msg: string) => console.log(colorize("ℹ", "blue"), msg),
  success: (msg: string) => console.log(colorize("✓", "green"), msg),
  warn: (msg: string) => console.log(colorize("⚠", "yellow"), msg),
  error: (msg: string) => console.log(colorize("✗", "red"), msg),
  title: (msg: string) =>
    console.log("\n" + colorize(colorize(msg, "bright"), "cyan")),
}

/**
 * Check if file has a config extension
 */
export function isConfigFile(filename: string, extensions: string[]): boolean {
  const ext = extname(filename).toLowerCase()
  const name = filename.toLowerCase()

  // Check extension
  if (extensions.includes(ext)) {
    return true
  }

  // Check special files
  if (name.startsWith(".env")) {
    return true
  }

  return false
}

/**
 * Parse JSON with comments (JSONC)
 */
export function parseJsonc(content: string): unknown {
  // Remove single-line comments
  const withoutSingleLine = content.replace(/^\s*\/\/.*$/gm, "")
  // Remove multi-line comments
  const withoutMultiLine = withoutSingleLine.replace(/\/\*[\s\S]*?\*\//g, "")
  // Remove trailing commas
  const withoutTrailingCommas = withoutMultiLine.replace(/,(\s*[}\]])/g, "$1")

  return JSON.parse(withoutTrailingCommas)
}

/**
 * Stringify JSON with consistent formatting
 */
export function stringifyJson(obj: unknown, indent: number = 2): string {
  return JSON.stringify(obj, null, indent)
}
