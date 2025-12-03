#!/usr/bin/env bun

/**
 * Format script - Auto-formats configuration files
 * Supports JSON/JSONC, YAML, TOML formats
 * Preserves comments in JSONC files
 */

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, extname, relative } from 'node:path'

// Configuration
const ROOT_DIR = import.meta.dir.replace('/scripts', '')
const SUPPORTED_EXTENSIONS = ['.json', '.yaml', '.yml', '.toml']
const IGNORED_DIRS = ['node_modules', '.git', 'dist', 'scripts']
const IGNORED_FILES = ['package-lock.json', 'bun.lockb', 'bun.lock']

interface FormatResult {
  file: string
  status: 'formatted' | 'unchanged' | 'error'
  message?: string
}

// Check if running in check mode (--check flag)
const isCheckMode = process.argv.includes('--check')

/**
 * Format JSONC content - preserves comments while fixing indentation
 * This is a line-based formatter that maintains comment structure
 */
function formatJSONC(content: string): string {
  const lines = content.split(/\r?\n/)
  const formattedLines: string[] = []
  let indentLevel = 0
  const indentStr = '  ' // 2 spaces

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Skip empty lines but preserve them
    if (trimmed === '') {
      formattedLines.push('')
      continue
    }

    // Handle pure comment lines
    if (
      trimmed.startsWith('//') ||
      trimmed.startsWith('/*') ||
      trimmed.startsWith('*')
    ) {
      formattedLines.push(indentStr.repeat(indentLevel) + trimmed)
      continue
    }

    // Check if line starts with closing bracket/brace
    const startsWithClosing = /^[}\]]/.test(trimmed)
    if (startsWithClosing) {
      indentLevel = Math.max(0, indentLevel - 1)
    }

    // Build the formatted line
    const currentIndent = indentStr.repeat(indentLevel)

    // Check if line has inline comment
    const inlineCommentMatch = trimmed.match(/^(.+?)\s*(\/\/.*)$/)
    if (inlineCommentMatch) {
      const [, code, comment] = inlineCommentMatch
      formattedLines.push(currentIndent + code.trim() + ' ' + comment)
    } else {
      formattedLines.push(currentIndent + trimmed)
    }

    // Check if line ends with opening bracket/brace (excluding arrays on same line)
    const endsWithOpening =
      /[{\[]$/.test(trimmed) &&
      !/\[.*\]/.test(trimmed) &&
      !/\{.*\}/.test(trimmed)
    if (endsWithOpening) {
      indentLevel++
    }

    // Handle case where line has both opening and closing on different elements
    const openCount = (trimmed.match(/[{\[]/g) || []).length
    const closeCount = (trimmed.match(/[}\]]/g) || []).length

    // Adjust for inline objects/arrays like ["a", "b"]
    if (!startsWithClosing && closeCount > openCount) {
      // More closes than opens, probably closing a previous block
    }
  }

  // Ensure single trailing newline
  let output = formattedLines.join('\n')
  output = output.replace(/\n+$/, '\n')
  if (!output.endsWith('\n')) {
    output += '\n'
  }

  return output
}

/**
 * Format pure JSON content (no comments)
 */
function formatPureJSON(content: string): string {
  const parsed = JSON.parse(content)
  return JSON.stringify(parsed, null, 2) + '\n'
}

/**
 * Format JSON/JSONC - detects if file has comments
 */
function formatJSON(content: string): string {
  // Check if content has comments
  const hasComments = /^\s*\/\/|\/\*/.test(content) || /[^:"]\/\//.test(content)

  if (hasComments) {
    return formatJSONC(content)
  }

  // Try pure JSON first
  try {
    return formatPureJSON(content)
  } catch {
    // Fall back to JSONC formatter for malformed JSON
    return formatJSONC(content)
  }
}

/**
 * Format YAML content (basic formatting)
 */
function formatYAML(content: string): string {
  const lines = content.split(/\r?\n/)
  const formattedLines = lines.map((line) => {
    // Remove trailing whitespace
    return line.trimEnd()
  })

  // Remove multiple consecutive empty lines
  const result: string[] = []
  let prevEmpty = false
  for (const line of formattedLines) {
    const isEmpty = line.trim() === ''
    if (isEmpty && prevEmpty) {
      continue
    }
    result.push(line)
    prevEmpty = isEmpty
  }

  // Ensure single trailing newline
  let output = result.join('\n')
  if (!output.endsWith('\n')) {
    output += '\n'
  }
  return output
}

/**
 * Format TOML content (basic formatting)
 */
function formatTOML(content: string): string {
  const lines = content.split(/\r?\n/)
  const formattedLines = lines.map((line) => {
    // Remove trailing whitespace
    let formatted = line.trimEnd()

    // Normalize spacing around equals signs in key-value pairs
    if (formatted.includes('=') && !formatted.trim().startsWith('#')) {
      const [key, ...valueParts] = formatted.split('=')
      const value = valueParts.join('=')
      if (key && value !== undefined) {
        formatted = `${key.trimEnd()} = ${value.trimStart()}`
      }
    }

    return formatted
  })

  // Remove multiple consecutive empty lines
  const result: string[] = []
  let prevEmpty = false
  for (const line of formattedLines) {
    const isEmpty = line.trim() === ''
    if (isEmpty && prevEmpty) {
      continue
    }
    result.push(line)
    prevEmpty = isEmpty
  }

  // Ensure single trailing newline
  let output = result.join('\n')
  if (!output.endsWith('\n')) {
    output += '\n'
  }
  return output
}

/**
 * Format file based on its extension
 */
function formatContent(content: string, ext: string): string {
  switch (ext.toLowerCase()) {
    case '.json':
      return formatJSON(content)
    case '.yaml':
    case '.yml':
      return formatYAML(content)
    case '.toml':
      return formatTOML(content)
    default:
      return content
  }
}

/**
 * Check if a path should be ignored
 */
function shouldIgnore(path: string): boolean {
  const parts = path.split('/')
  return (
    parts.some((part) => IGNORED_DIRS.includes(part)) ||
    IGNORED_FILES.some((ignored) => path.endsWith(ignored))
  )
}

/**
 * Recursively get all files in a directory
 */
async function getAllFiles(dir: string): Promise<string[]> {
  const files: string[] = []

  async function walk(currentDir: string) {
    const entries = await readdir(currentDir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name)
      const relativePath = relative(ROOT_DIR, fullPath)

      if (shouldIgnore(relativePath)) {
        continue
      }

      if (entry.isDirectory()) {
        await walk(fullPath)
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase()
        if (SUPPORTED_EXTENSIONS.includes(ext)) {
          files.push(fullPath)
        }
      }
    }
  }

  await walk(dir)
  return files
}

/**
 * Format a single file
 */
async function formatFile(filePath: string): Promise<FormatResult> {
  const relativePath = relative(ROOT_DIR, filePath)

  try {
    const content = await readFile(filePath, 'utf-8')
    const ext = extname(filePath)
    const formatted = formatContent(content, ext)

    if (content === formatted) {
      return { file: relativePath, status: 'unchanged' }
    }

    if (isCheckMode) {
      return {
        file: relativePath,
        status: 'error',
        message: 'File needs formatting',
      }
    }

    await writeFile(filePath, formatted, 'utf-8')
    return { file: relativePath, status: 'formatted' }
  } catch (error) {
    return {
      file: relativePath,
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🔧 Configuration File Formatter')
  console.log('================================')
  console.log(`Mode: ${isCheckMode ? 'Check' : 'Format'}`)
  console.log('')

  const files = await getAllFiles(ROOT_DIR)

  if (files.length === 0) {
    console.log('No configuration files found.')
    return
  }

  console.log(`Found ${files.length} configuration file(s)`)
  console.log('')

  const results: FormatResult[] = []

  for (const file of files) {
    const result = await formatFile(file)
    results.push(result)
  }

  // Summary
  const formatted = results.filter((r) => r.status === 'formatted')
  const unchanged = results.filter((r) => r.status === 'unchanged')
  const errors = results.filter((r) => r.status === 'error')

  console.log('Results:')
  console.log('--------')

  for (const result of results) {
    const icon =
      result.status === 'formatted'
        ? '✅'
        : result.status === 'unchanged'
          ? '⏭️ '
          : '❌'
    const status =
      result.status === 'formatted'
        ? 'Formatted'
        : result.status === 'unchanged'
          ? 'Unchanged'
          : 'Error'
    console.log(
      `${icon} ${result.file} - ${status}${result.message ? `: ${result.message}` : ''}`,
    )
  }

  console.log('')
  console.log('Summary:')
  console.log(`  ✅ Formatted: ${formatted.length}`)
  console.log(`  ⏭️  Unchanged: ${unchanged.length}`)
  console.log(`  ❌ Errors: ${errors.length}`)

  // Exit with error code if in check mode and files need formatting
  if (isCheckMode && (formatted.length > 0 || errors.length > 0)) {
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
