/**
 * check-secrets.ts
 * Detects sensitive data (API keys, passwords, tokens, etc.) in configuration files
 */

import { readdir, stat } from 'node:fs/promises'
import { join, extname, relative } from 'node:path'

// Types
interface SecretPattern {
  name: string
  pattern: string
  context?: string[]
  description: string
}

interface SecretsConfig {
  patterns: SecretPattern[]
  ignorePatterns: string[]
  fileExtensions: string[]
}

interface SecretMatch {
  file: string
  line: number
  column: number
  pattern: string
  patternName: string
  match: string
  maskedMatch: string
  context: string
}

interface ScanResult {
  totalFiles: number
  scannedFiles: number
  secretsFound: SecretMatch[]
  hasSecrets: boolean
}

// Constants
const ROOT_DIR = import.meta.dir.replace('/scripts', '')
const CONFIG_FILE = '.secrets-patterns.json'
const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
}

/**
 * Simple glob pattern matching
 */
function minimatch(path: string, pattern: string): boolean {
  // Normalize path separators
  const normalizedPath = path.replace(/\\/g, '/')
  const normalizedPattern = pattern.replace(/\\/g, '/')

  // Convert glob pattern to regex
  const regexPattern = normalizedPattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/{{GLOBSTAR}}/g, '.*')
    .replace(/\?/g, '.')

  const regex = new RegExp(
    `^${regexPattern}$|/${regexPattern}$|^${regexPattern}/|/${regexPattern}/`,
  )
  return regex.test(normalizedPath)
}

/**
 * Load secrets patterns configuration
 */
async function loadConfig(): Promise<SecretsConfig> {
  const configPath = join(ROOT_DIR, CONFIG_FILE)
  try {
    const file = Bun.file(configPath)
    const content = await file.json()
    return content as SecretsConfig
  } catch (error) {
    console.error(
      `${COLORS.red}Error loading config: ${configPath}${COLORS.reset}`,
    )
    // Return default config if file doesn't exist
    return {
      patterns: [
        {
          name: 'Generic API Key',
          pattern:
            '[Aa][Pp][Ii][-_]?[Kk][Ee][Yy]["\']?\\s*[:=]\\s*["\'][A-Za-z0-9_-]{16,}["\']',
          description: 'Generic API Key pattern',
        },
        {
          name: 'Generic Secret',
          pattern:
            '[Ss][Ee][Cc][Rr][Ee][Tt]["\']?\\s*[:=]\\s*["\'][A-Za-z0-9_-]{8,}["\']',
          description: 'Generic Secret pattern',
        },
        {
          name: 'Generic Password',
          pattern:
            '[Pp][Aa][Ss][Ss][Ww][Oo][Rr][Dd]["\']?\\s*[:=]\\s*["\'][^"\']{4,}["\']',
          description: 'Generic Password pattern',
        },
      ],
      ignorePatterns: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
      fileExtensions: ['.json', '.yaml', '.yml', '.toml', '.env'],
    }
  }
}

/**
 * Check if a file should be ignored
 */
function shouldIgnore(filePath: string, ignorePatterns: string[]): boolean {
  const relativePath = relative(ROOT_DIR, filePath)
  return ignorePatterns.some((pattern) => minimatch(relativePath, pattern))
}

/**
 * Check if file extension is in the allowed list
 */
function hasValidExtension(filePath: string, extensions: string[]): boolean {
  const ext = extname(filePath).toLowerCase()
  // Also check for dotfiles like .env
  const fileName = filePath.split('/').pop() || ''
  return extensions.some((allowedExt) => {
    if (allowedExt.startsWith('.env')) {
      return fileName.startsWith('.env')
    }
    return ext === allowedExt
  })
}

/**
 * Mask a secret value for safe display
 */
function maskSecret(value: string): string {
  if (value.length <= 8) {
    return '*'.repeat(value.length)
  }
  const visibleStart = value.slice(0, 4)
  const visibleEnd = value.slice(-4)
  const maskedMiddle = '*'.repeat(Math.min(value.length - 8, 16))
  return `${visibleStart}${maskedMiddle}${visibleEnd}`
}

/**
 * Get context around a match (the line content)
 */
function getLineContext(
  content: string,
  matchIndex: number,
): { line: number; column: number; context: string } {
  const lines = content.slice(0, matchIndex).split('\n')
  const line = lines.length
  const column = (lines[lines.length - 1]?.length || 0) + 1
  const allLines = content.split('\n')
  const context = allLines[line - 1] || ''
  return { line, column, context: context.trim() }
}

/**
 * Scan a single file for secrets
 */
async function scanFile(
  filePath: string,
  patterns: SecretPattern[],
): Promise<SecretMatch[]> {
  const matches: SecretMatch[] = []

  try {
    const file = Bun.file(filePath)
    const content = await file.text()
    const relativePath = relative(ROOT_DIR, filePath)

    for (const patternConfig of patterns) {
      try {
        const regex = new RegExp(patternConfig.pattern, 'g')
        let match: RegExpExecArray | null

        while ((match = regex.exec(content)) !== null) {
          // If context is specified, check if any context keyword is near the match
          if (patternConfig.context && patternConfig.context.length > 0) {
            const surroundingText = content
              .slice(
                Math.max(0, match.index - 100),
                match.index + match[0].length + 100,
              )
              .toLowerCase()
            const hasContext = patternConfig.context.some((ctx) =>
              surroundingText.includes(ctx.toLowerCase()),
            )
            if (!hasContext) {
              continue
            }
          }

          const { line, column, context } = getLineContext(content, match.index)

          matches.push({
            file: relativePath,
            line,
            column,
            pattern: patternConfig.pattern,
            patternName: patternConfig.name,
            match: match[0],
            maskedMatch: maskSecret(match[0]),
            context,
          })
        }
      } catch (regexError) {
        // Invalid regex pattern, skip
        console.warn(
          `${COLORS.yellow}Warning: Invalid regex pattern "${patternConfig.name}"${COLORS.reset}`,
        )
      }
    }
  } catch (error) {
    console.warn(
      `${COLORS.yellow}Warning: Could not read file ${filePath}${COLORS.reset}`,
    )
  }

  return matches
}

/**
 * Recursively scan directory for files
 */
async function scanDirectory(
  dir: string,
  config: SecretsConfig,
): Promise<{ files: string[]; scanned: number }> {
  const files: string[] = []
  let scanned = 0

  async function walk(currentDir: string) {
    try {
      const entries = await readdir(currentDir)

      for (const entry of entries) {
        const fullPath = join(currentDir, entry)

        // Skip ignored paths early
        if (shouldIgnore(fullPath, config.ignorePatterns)) {
          continue
        }

        try {
          const stats = await stat(fullPath)

          if (stats.isDirectory()) {
            // Skip hidden directories and common non-config directories
            if (!entry.startsWith('.') || entry === '.config') {
              await walk(fullPath)
            }
          } else if (stats.isFile()) {
            scanned++
            if (hasValidExtension(fullPath, config.fileExtensions)) {
              files.push(fullPath)
            }
          }
        } catch {
          // Skip files we can't access
        }
      }
    } catch {
      // Skip directories we can't access
    }
  }

  await walk(dir)
  return { files, scanned }
}

/**
 * Print scan results
 */
function printResults(result: ScanResult): void {
  console.log('\n' + '='.repeat(60))
  console.log(`${COLORS.bold}🔍 Secrets Detection Report${COLORS.reset}`)
  console.log('='.repeat(60) + '\n')

  console.log(
    `${COLORS.cyan}Files scanned:${COLORS.reset} ${result.scannedFiles}`,
  )
  console.log(
    `${COLORS.cyan}Config files checked:${COLORS.reset} ${result.totalFiles}`,
  )

  if (result.secretsFound.length === 0) {
    console.log(`\n${COLORS.green}✅ No secrets detected!${COLORS.reset}\n`)
    return
  }

  console.log(
    `\n${COLORS.red}⚠️  Found ${result.secretsFound.length} potential secret(s):${COLORS.reset}\n`,
  )

  // Group by file
  const byFile = new Map<string, SecretMatch[]>()
  for (const secret of result.secretsFound) {
    const existing = byFile.get(secret.file) || []
    existing.push(secret)
    byFile.set(secret.file, existing)
  }

  for (const [file, secrets] of byFile) {
    console.log(`${COLORS.bold}📄 ${file}${COLORS.reset}`)

    for (const secret of secrets) {
      console.log(
        `   ${COLORS.yellow}Line ${secret.line}:${COLORS.reset} ${secret.patternName}`,
      )
      console.log(
        `   ${COLORS.dim}Matched:${COLORS.reset} ${secret.maskedMatch}`,
      )
      console.log(
        `   ${COLORS.dim}Context:${COLORS.reset} ${secret.context.slice(0, 80)}${secret.context.length > 80 ? '...' : ''}`,
      )
      console.log()
    }
  }

  console.log('-'.repeat(60))
  console.log(`${COLORS.yellow}💡 Recommendations:${COLORS.reset}`)
  console.log('   1. Move secrets to environment variables')
  console.log('   2. Use a secrets manager (e.g., 1Password, HashiCorp Vault)')
  console.log('   3. Add sensitive files to .gitignore')
  console.log('   4. Use placeholder values in committed configs')
  console.log('-'.repeat(60) + '\n')
}

/**
 * Save report to JSON file
 */
async function saveReport(result: ScanResult): Promise<void> {
  const reportPath = join(ROOT_DIR, 'secrets-report.json')
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalFiles: result.totalFiles,
      scannedFiles: result.scannedFiles,
      secretsFound: result.secretsFound.length,
      hasSecrets: result.hasSecrets,
    },
    secrets: result.secretsFound.map((s) => ({
      file: s.file,
      line: s.line,
      column: s.column,
      patternName: s.patternName,
      maskedMatch: s.maskedMatch,
    })),
  }

  await Bun.write(reportPath, JSON.stringify(report, null, 2))
  console.log(
    `${COLORS.dim}Report saved to: secrets-report.json${COLORS.reset}\n`,
  )
}

/**
 * Main function
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const saveJson = args.includes('--json') || args.includes('-j')
  const verbose = args.includes('--verbose') || args.includes('-v')
  const help = args.includes('--help') || args.includes('-h')

  if (help) {
    console.log(`
${COLORS.bold}Usage:${COLORS.reset} bun run check-secrets [options]

${COLORS.bold}Options:${COLORS.reset}
  -j, --json     Save report to secrets-report.json
  -v, --verbose  Show verbose output
  -h, --help     Show this help message

${COLORS.bold}Description:${COLORS.reset}
  Scans configuration files for potential secrets, API keys,
  passwords, and other sensitive data.

${COLORS.bold}Configuration:${COLORS.reset}
  Edit .secrets-patterns.json to customize detection patterns.
`)
    process.exit(0)
  }

  console.log(`${COLORS.cyan}🔐 Starting secrets detection...${COLORS.reset}`)

  const config = await loadConfig()

  if (verbose) {
    console.log(
      `${COLORS.dim}Loaded ${config.patterns.length} patterns${COLORS.reset}`,
    )
    console.log(
      `${COLORS.dim}Checking extensions: ${config.fileExtensions.join(', ')}${COLORS.reset}`,
    )
  }

  const { files, scanned } = await scanDirectory(ROOT_DIR, config)

  if (verbose) {
    console.log(
      `${COLORS.dim}Found ${files.length} config files to scan${COLORS.reset}`,
    )
  }

  const allMatches: SecretMatch[] = []

  for (const file of files) {
    const matches = await scanFile(file, config.patterns)
    allMatches.push(...matches)
  }

  const result: ScanResult = {
    totalFiles: files.length,
    scannedFiles: scanned,
    secretsFound: allMatches,
    hasSecrets: allMatches.length > 0,
  }

  printResults(result)

  if (saveJson) {
    await saveReport(result)
  }

  // Exit with error code if secrets found (useful for CI/CD)
  if (result.hasSecrets) {
    process.exit(1)
  }
}

// Run
main().catch((error) => {
  console.error(`${COLORS.red}Error: ${error.message}${COLORS.reset}`)
  process.exit(1)
})
