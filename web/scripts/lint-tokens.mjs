#!/usr/bin/env node
/**
 * Token enforcement — blocks raw hex literals and default Tailwind color scales
 * inside web/src/components/**. Ignores web/src/legacy.css and .tokens/* files.
 *
 * Banned (in component source):
 *   - Raw hex literals: #fff, #ffffff, #E07A3B, etc.
 *   - Default Tailwind color scales: bg-blue-500, text-slate-400, border-zinc-200, ...
 *   - text-black / text-white / bg-black / bg-white
 *   - Arbitrary color values: bg-[#...], text-[#...], etc.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../src/components', import.meta.url))
const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url))

const DEFAULT_TW_COLORS = [
  'slate', 'gray', 'zinc', 'stone',
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
  'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
].join('|')

const PATTERNS = [
  {
    name: 'raw-hex',
    // #abc or #abcdef in string-literal context (inside ', ", or `)
    re: /(['"`])[^'"`]*#[0-9a-fA-F]{3,8}[^'"`]*\1/,
  },
  {
    name: 'tailwind-default-color',
    re: new RegExp(
      `\\b(?:bg|text|border|ring|fill|stroke|from|to|via|decoration|divide|outline|accent|caret|placeholder|shadow)-(?:${DEFAULT_TW_COLORS})-(?:50|1\\d{2}|[2-9]\\d{2})\\b`,
    ),
  },
  {
    name: 'text-black-white',
    re: /\b(?:bg|text|border|ring|fill|stroke)-(?:black|white)\b/,
  },
  {
    name: 'arbitrary-hex-class',
    re: /\b(?:bg|text|border|ring|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]/,
  },
]

const EXTENSIONS = new Set(['.ts', '.tsx', '.jsx', '.js', '.css'])

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const s = statSync(full)
    if (s.isDirectory()) out.push(...walk(full))
    else if (EXTENSIONS.has(full.slice(full.lastIndexOf('.')))) out.push(full)
  }
  return out
}

const files = walk(ROOT)
const violations = []

for (const file of files) {
  const rel = relative(PROJECT_ROOT, file)
  const src = readFileSync(file, 'utf8')
  const lines = src.split('\n')
  lines.forEach((line, i) => {
    for (const { name, re } of PATTERNS) {
      if (re.test(line)) {
        violations.push({ file: rel, line: i + 1, rule: name, text: line.trim() })
      }
    }
  })
}

if (violations.length) {
  console.error(`\n✖ ${violations.length} token violation(s) in web/src/components/**:\n`)
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.rule}]`)
    console.error(`    ${v.text}\n`)
  }
  console.error('See web/CLAUDE.md and src/tokens/semantic.json for allowed tokens.')
  process.exit(1)
}

console.log(`✓ Token check passed (${files.length} files scanned).`)
