#!/usr/bin/env bun
/**
 * Main entry script for configuration management
 * Runs all tasks: format, generate README, and check secrets
 */

import { $ } from "bun"

interface TaskResult {
  name: string
  success: boolean
  duration: number
  message?: string
}

const COLORS = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
}

function log(message: string, color: keyof typeof COLORS = "reset"): void {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`)
}

function logHeader(title: string): void {
  const line = "═".repeat(50)
  console.log()
  log(line, "cyan")
  log(`  ${title}`, "bold")
  log(line, "cyan")
  console.log()
}

async function runTask(
  name: string,
  scriptPath: string,
  args: string[] = []
): Promise<TaskResult> {
  const startTime = performance.now()

  try {
    log(`▶ Running: ${name}...`, "blue")

    const proc = Bun.spawn(["bun", "run", scriptPath, ...args], {
      cwd: import.meta.dir.replace("/scripts", ""),
      stdout: "inherit",
      stderr: "inherit",
    })

    const exitCode = await proc.exited

    const duration = performance.now() - startTime

    if (exitCode === 0) {
      log(`✓ ${name} completed in ${duration.toFixed(0)}ms`, "green")
      return { name, success: true, duration }
    } else {
      log(`✗ ${name} failed with exit code ${exitCode}`, "red")
      return {
        name,
        success: false,
        duration,
        message: `Exit code: ${exitCode}`,
      }
    }
  } catch (error) {
    const duration = performance.now() - startTime
    const message = error instanceof Error ? error.message : String(error)
    log(`✗ ${name} failed: ${message}`, "red")
    return { name, success: false, duration, message }
  }
}

async function main(): Promise<void> {
  const startTime = performance.now()
  const args = process.argv.slice(2)

  logHeader("🔧 Configuration Management Tool")

  const tasks: { name: string; script: string; args?: string[] }[] = []

  // Parse command line arguments
  const runAll = args.length === 0 || args.includes("--all")
  const runSecrets = runAll || args.includes("--secrets") || args.includes("-s")
  const runFormat = runAll || args.includes("--format") || args.includes("-f")
  const runReadme = runAll || args.includes("--readme") || args.includes("-r")
  const showHelp = args.includes("--help") || args.includes("-h")

  if (showHelp) {
    console.log(`
${COLORS.bold}Usage:${COLORS.reset} bun run scripts/index.ts [options]

${COLORS.bold}Options:${COLORS.reset}
  --all, -a       Run all tasks (default if no options provided)
  --secrets, -s   Run secrets detection only
  --format, -f    Run formatting only
  --readme, -r    Run README generation only
  --help, -h      Show this help message

${COLORS.bold}Examples:${COLORS.reset}
  bun run all                    # Run all tasks
  bun run scripts/index.ts -s    # Check secrets only
  bun run scripts/index.ts -f -r # Format and generate README
`)
    process.exit(0)
  }

  // Build task list based on arguments
  if (runSecrets) {
    tasks.push({
      name: "Secrets Detection",
      script: "scripts/check-secrets.ts",
    })
  }

  if (runFormat) {
    tasks.push({
      name: "Format Configuration Files",
      script: "scripts/format.ts",
    })
  }

  if (runReadme) {
    tasks.push({
      name: "Generate README",
      script: "scripts/generate-readme.ts",
    })
  }

  log(`Tasks to run: ${tasks.map((t) => t.name).join(", ")}`, "cyan")
  console.log()

  const results: TaskResult[] = []

  for (const task of tasks) {
    const result = await runTask(task.name, task.script, task.args)
    results.push(result)
    console.log()
  }

  // Summary
  logHeader("📊 Summary")

  const totalDuration = performance.now() - startTime
  const successCount = results.filter((r) => r.success).length
  const failCount = results.filter((r) => !r.success).length

  for (const result of results) {
    const icon = result.success ? "✓" : "✗"
    const color = result.success ? "green" : "red"
    log(
      `  ${icon} ${result.name}: ${result.duration.toFixed(0)}ms`,
      color as keyof typeof COLORS
    )
  }

  console.log()
  log(`Total time: ${totalDuration.toFixed(0)}ms`, "cyan")
  log(`Success: ${successCount}/${results.length}`, successCount === results.length ? "green" : "yellow")

  if (failCount > 0) {
    console.log()
    log(`⚠ ${failCount} task(s) failed. Please check the output above.`, "red")
    process.exit(1)
  }

  console.log()
  log("✨ All tasks completed successfully!", "green")
}

main().catch((error) => {
  log(`Fatal error: ${error.message}`, "red")
  process.exit(1)
})
