import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const repo = new URL('../../../', import.meta.url).pathname
const adapter = join(repo, 'tools/quality/js/run.mjs')
const run = (args) => new Promise((resolveResult) => {
  const child = spawn(process.execPath, [adapter, ...args], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', (chunk) => { stderr += chunk })
  child.on('close', (code) => resolveResult({ code, stderr }))
})

describe('js quality adapter contract', () => {
  it('propagates invalid input as a nonzero subprocess result with a report', async () => {
    const output = await mkdtemp(join(tmpdir(), 'js-quality-test-'))
    const result = await run(['coverage', '--surface', 'desktop-ui', '--files-json', join(output, 'missing.json'), '--output-dir', output])
    expect(result.code).toBe(2)
    expect(result.stderr).toContain('ENOENT')
    expect(await readFile(join(output, 'adapter-result.json'), 'utf8')).toContain('"exit_status": 2')
  })

  it('rejects a test file as a production scope input', async () => {
    const output = await mkdtemp(join(tmpdir(), 'js-quality-test-'))
    const files = join(output, 'files.json')
    await import('node:fs/promises').then(({ writeFile }) => writeFile(files, JSON.stringify(['apps/desktop/ui/src/stores/__tests__/usageStore.test.ts'])))
    const result = await run(['coverage', '--surface', 'desktop-ui', '--files-json', files, '--output-dir', output])
    expect(result.code).toBe(2)
    expect(result.stderr).toContain('unknown or out-of-surface files')
  })

  it('uses Vitest related graph mode for selected production files', async () => {
    const output = await mkdtemp(join(tmpdir(), 'js-quality-test-'))
    const files = join(output, 'files.json')
    await import('node:fs/promises').then(({ writeFile }) => writeFile(files, JSON.stringify(['apps/desktop/ui/src/stores/usageStore.ts'])))
    const result = await run(['coverage', '--surface', 'desktop-ui', '--files-json', files, '--output-dir', output])
    expect(result.code).toBe(0)
    const report = JSON.parse(await readFile(join(output, 'adapter-result.json'), 'utf8'))
    expect(report.commands[0].args[0]).toBe('related')
    expect(report.commands[0].args.some((arg) => arg.endsWith('/apps/desktop/ui/src/stores/usageStore.ts'))).toBe(true)
  })
})
