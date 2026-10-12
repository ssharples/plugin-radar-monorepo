#!/usr/bin/env node
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { resolve, relative, dirname, join } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const toolFile = fileURLToPath(import.meta.url)
const repo = resolve(dirname(toolFile), '../../..')
const allowed = new Set(['desktop-ui'])
const roots = { 'desktop-ui': 'apps/desktop/ui' }
const toolRoot = dirname(toolFile)
const bin = (name) => join(toolRoot, 'node_modules', '.bin', name)

function die(message, report = {}) {
  console.error(`js-quality: ${message}`)
  if (report.outputDir) writeReport(report.outputDir, { ...report, status: 'error', message })
  process.exitCode = 2
}
function writeReport(outputDir, report) {
  mkdirSync(outputDir, { recursive: true })
  writeFileSync(join(outputDir, 'quality-report.json'), `${JSON.stringify(report, null, 2)}\n`)
  const reports = report.mode === 'mutate' ? [report.mutation?.reportFile].filter(Boolean) : [report.coverageFile].filter(Boolean)
  const exitStatus = report.baseline?.exitCode ?? (report.status === 'passed' ? 0 : 2)
  writeFileSync(join(outputDir, 'adapter-result.json'), `${JSON.stringify({ surface: report.surface, status: report.status, exit_status: report.status === 'passed' ? 0 : (report.mutation?.exitCode || exitStatus || 2), projectRoot: report.projectRoot, reports, commands: report.commands ?? [], error: report.message }, null, 2)}\n`)
}
function parseArgs(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) { out._.push(arg); continue }
    const [key, inline] = arg.slice(2).split('=', 2)
    out[key] = inline ?? argv[++i]
  }
  return out
}
function run(command, args, cwd, extraEnv = {}) {
  return new Promise((done) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''; let stderr = ''
    child.stdout.on('data', (x) => { stdout += x })
    child.stderr.on('data', (x) => { stderr += x })
    child.on('error', (error) => done({ code: 1, stdout, stderr: `${stderr}${error.message}` }))
    child.on('close', (code, signal) => done({ code: code ?? 1, signal, stdout, stderr }))
  })
}
function loadFiles(fileArg) {
  if (!fileArg) throw new Error('--files-json is required')
  const input = JSON.parse(readFileSync(resolve(fileArg), 'utf8'))
  if (!Array.isArray(input) || input.some((x) => typeof x !== 'string')) throw new Error('files-json must contain a JSON array of repository-relative paths')
  return [...new Set(input)]
}
function validateFiles(surface, files) {
  const root = roots[surface]
  const unknown = []; const selected = []
  for (const file of files) {
    const normal = file.replaceAll('\\', '/')
    const abs = resolve(repo, normal)
    const rel = relative(repo, abs).replaceAll('\\', '/')
    const productionPath = rel.startsWith(`${root}/src/`) && /\.(?:mjs|cjs|js|jsx|ts|tsx)$/.test(rel) && !/(?:^|\/)(?:__tests__|tests?|mocks?|fixtures?|generated)(?:\/|$)/i.test(rel) && !/\.(?:test|spec|mock|fixture|generated)\./i.test(rel) && !/\.d\.ts$/i.test(rel)
    if (rel !== normal || rel.startsWith('../') || !existsSync(abs) || !productionPath) unknown.push(file)
    else selected.push(rel)
  }
  return { selected, unknown }
}
function coverageTotals(file) {
  if (!existsSync(file)) return null
  const data = JSON.parse(readFileSync(file, 'utf8')); const totals = { statements: [0, 0], functions: [0, 0], branches: [0, 0] }
  for (const entry of Object.values(data)) for (const [kind, map] of [['statements', entry.s], ['functions', entry.f], ['branches', entry.b]]) {
    if (!map) continue
    for (const value of Object.values(map).flat()) { totals[kind][1]++; if (value > 0) totals[kind][0]++ }
  }
  return Object.fromEntries(Object.entries(totals).map(([k, [covered, total]]) => [k, { covered, total, percent: total ? covered / total * 100 : 100 }]))
}
const args = parseArgs(process.argv.slice(2)); const mode = args._[0]
if (!['coverage', 'mutate'].includes(mode)) die('usage: run.mjs coverage|mutate --surface ... --files-json ... --output-dir ...')
else if (!allowed.has(args.surface)) die(`unsupported --surface ${args.surface}`)
else {
  let files
  try { files = loadFiles(args['files-json']) } catch (error) { die(error.message, { outputDir: args['output-dir'] }) }
  if (files) {
    const outputDir = resolve(args['output-dir'] || join(repo, 'tools/quality/js/out'))
    rmSync(join(outputDir, 'coverage'), { recursive: true, force: true })
    rmSync(join(outputDir, 'mutation-report.json'), { force: true })
    rmSync(join(outputDir, 'mutation.html'), { force: true })
    const { selected, unknown } = validateFiles(args.surface, files)
    const base = { adapter: 'js-quality', mode, surface: args.surface, projectRoot: resolve(repo, roots[args.surface]), files: selected, unknownFiles: unknown, outputDir, status: 'pending', commands: [] }
    writeReport(outputDir, base)
    if (unknown.length) { die(`unknown or out-of-surface files: ${unknown.join(', ')}`, { ...base, outputDir }); }
    else if (!selected.length) { die('no production files selected', { ...base, outputDir }); }
    else {
      const surfaceRoot = resolve(repo, roots[args.surface]);
      if (!existsSync(bin('vitest'))) die('Vitest is not installed in the isolated adapter; run npm install --prefix tools/quality/js', { ...base, outputDir })
      else {
        mkdirSync(outputDir, { recursive: true })
        const coverageDir = join(outputDir, 'coverage')
        const adapterVitestConfig = join(outputDir, 'vitest.config.mjs')
        writeFileSync(adapterVitestConfig, `import base from ${JSON.stringify(resolve(surfaceRoot, 'vitest.config.ts'))};\nimport { mergeConfig, defineConfig } from ${JSON.stringify(join(toolRoot, 'node_modules/vitest/dist/config.js'))};\nexport default mergeConfig(base, defineConfig({ test: { exclude: ['**/.stryker-tmp/**'] }, resolve: { alias: { '@vitest/coverage-istanbul': ${JSON.stringify(join(toolRoot, 'node_modules/@vitest/coverage-istanbul'))} } } }));\n`)
        const testArgs = ['related', '--run', '--config', adapterVitestConfig, '--coverage.enabled', '--coverage.provider=istanbul', '--coverage.reporter=json', '--coverage.reportOnFailure', `--coverage.reportsDirectory=${coverageDir}`, '--coverage.all', ...selected.flatMap((file) => [`--coverage.include=${resolve(repo, file)}`]), ...selected.map((file) => resolve(repo, file))]
        if (args['test-filter']) testArgs.push('--testNamePattern', args['test-filter'])
        const baseline = await run(bin('vitest'), testArgs, surfaceRoot)
        writeFileSync(join(outputDir, 'baseline.stdout.log'), baseline.stdout); writeFileSync(join(outputDir, 'baseline.stderr.log'), baseline.stderr)
        const coverageFile = join(coverageDir, 'coverage-final.json')
        const report = { ...base, status: baseline.code === 0 && existsSync(coverageFile) ? 'passed' : 'baseline-failed', commands: [{ command: bin('vitest'), args: testArgs, cwd: surfaceRoot }], baseline: { exitCode: baseline.code, stdout: baseline.stdout, stderr: baseline.stderr }, coverage: coverageTotals(coverageFile), coverageFile: existsSync(coverageFile) ? coverageFile : null }
        writeReport(outputDir, report)
        if (mode === 'mutate' && report.status === 'passed') {
          const config = join(outputDir, 'stryker.config.mjs')
          const mutationFiles = selected.map((x) => relative(surfaceRoot, resolve(repo, x)).replaceAll('\\', '/'))
          writeFileSync(config, `export default { testRunner: 'vitest', cleanTempDir: 'always', coverageAnalysis: 'perTest', mutate: [${mutationFiles.map((x) => JSON.stringify(x)).join(',')}], files: ['src/**', 'vitest.config.ts'], reporters: ['json', 'html', 'clear-text'], jsonReporter: { fileName: ${JSON.stringify(join(outputDir, 'mutation-report.json'))} }, htmlReporter: { fileName: ${JSON.stringify(join(outputDir, 'mutation.html'))} }, vitest: { configFile: 'vitest.config.ts', related: true }, thresholds: { high: 80, low: 80, break: 0 }, concurrency: 3, timeoutMS: 5000, timeoutFactor: 1.5 };\n`)
          const mutation = await run(bin('stryker'), ['run', config], surfaceRoot)
          report.commands.push({ command: bin('stryker'), args: ['run', config], cwd: surfaceRoot })
          writeFileSync(join(outputDir, 'mutation.stdout.log'), mutation.stdout); writeFileSync(join(outputDir, 'mutation.stderr.log'), mutation.stderr)
          const mutationReportFile = join(outputDir, 'mutation-report.json')
          let statusCounts = {}
          if (existsSync(mutationReportFile)) {
            try { for (const entry of Object.values(JSON.parse(readFileSync(mutationReportFile, 'utf8')).files ?? {})) for (const mutant of entry.mutants ?? []) statusCounts[mutant.status] = (statusCounts[mutant.status] ?? 0) + 1 } catch { statusCounts = { unreadable: 1 } }
          }
          report.mutation = { exitCode: mutation.code, stdout: mutation.stdout, stderr: mutation.stderr, reportFile: existsSync(mutationReportFile) ? mutationReportFile : null, statusCounts, workers: 3, timeoutMS: 5000, timeoutFactor: 1.5, fileGranularity: true }
          const mutationReportExists = existsSync(mutationReportFile)
          report.status = mutation.code === 0 && mutationReportExists ? 'passed' : 'mutation-failed'; writeReport(outputDir, report); process.exitCode = mutation.code === 0 && mutationReportExists ? 0 : (mutation.code || 2)
        }
        if (mode === 'coverage') process.exitCode = report.status === 'passed' ? 0 : (baseline.code || 2)
        else if (!report.mutation) process.exitCode = baseline.code || 2
      }
    }
  }
}
