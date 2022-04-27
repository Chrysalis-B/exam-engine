import * as childPromise from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(childPromise.exec)

describe('cli', () => {
  it('prints help', async () => {
    const output = await exec('yarn ee')
    expect(output).toContain(`Usage: index.js <command> [options]

Commands:
  index.js new <directory>                       Create a new exam
  index.js preview [exam] [options]              Preview an exam  [aliases: start]
  index.js create-transfer-zip [exam] [options]  Create a transfer zip that can be imported to Oma Abitti
  index.js create-offline [exam] [options]       Create a standalone offline version of the exam.
  index.js create-mex [exam] [options]           Package the exam to a .mex file that can be imported by Abitti
  index.js migrate [exam]                        Convert an exam to the latest schema.

Options:
  --help     Show help  [boolean]
  --version  Show version number  [boolean]`)
  })
  it('creates transfer.zip', async () => {
    const output = await exec('yarn ee create-transfer-zip packages/exams/SC/SC.xml')
    expect(output).toContain(`Done in `)
  })
})

const exec = async (cmd: string) => {
  try {
    return (await execAsync(cmd)).stdout
  } catch ({ stderr }) {
    return stderr
  }
}
