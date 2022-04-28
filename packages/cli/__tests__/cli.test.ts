import * as childPromise from 'child_process'
const exec = childPromise.exec

describe('cli', () => {
  it('creates transfer.zip', () =>
    new Promise<void>((resolve) => {
      const chunks: string[] = []
      const ee = exec('yarn ee create-transfer-zip packages/exams/SC/SC.xml', {
        encoding: 'utf8',
      })
      ee.stdout?.on('data', (chunk: string) => {
        chunks.push(chunk)
      })
      ee.stdout?.on('end', () => {
        const output = chunks.join('')
        expect(output).toContain(`Done in `)
        resolve()
      })
    }))
})
