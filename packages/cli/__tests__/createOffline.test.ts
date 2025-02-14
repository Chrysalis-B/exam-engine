import * as fs from 'fs/promises'
import { exec, stripColorCodes } from './util'
import * as path from 'path'

describe('ee create-offline', () => {
  const root = path.resolve(__dirname, '../../..')
  const exams = path.resolve(__dirname, '../../exams')
  let output: string

  beforeAll(async () => {
    await removeGeneratedDirectories()
    output = await exec(`yarn ee create-offline packages/exams/SC/SC.xml`, { cwd: root })
  })

  it('logs progress', () => {
    expect(stripColorCodes(output)).toContain(`- Creating offline versions for ${exams}/SC/SC.xml...
✔ ${exams}/SC/1970-01-01_SC_fi
✔ ${exams}/SC/1970-01-01_SC_sv
✔ ${exams}/SC/1970-01-01_SC_fi_hi`)
  })

  it('creates offline', async () => {
    const index = await fs.readFile(`${exams}/SC/1970-01-01_SC_fi/index.html`, { encoding: 'utf8' })
    expect(index.replace(/(width: )(\d+)(px)/g, '$199$3')).toMatchSnapshot()
    expect(filterFileList(await fs.readdir(`${exams}/SC/1970-01-01_SC_fi`))).toEqual([
      'assets',
      'attachments',
      'index.html',
      'main-bundle.js',
    ])
    expect(filterFileList(await fs.readdir(`${exams}/SC/1970-01-01_SC_fi/assets`))).toMatchSnapshot()
    expect(filterFileList(await fs.readdir(`${exams}/SC/1970-01-01_SC_fi/attachments`))).toMatchSnapshot()
  })

  function filterFileList(fileList: Array<string>): Array<string> {
    return fileList.filter((fileName) => fileName !== '.DS_Store')
  }

  async function removeGeneratedDirectories() {
    await fs.rm(`${exams}/SC/1970-01-01_SC_fi`, { recursive: true, force: true })
    await fs.rm(`${exams}/SC/1970-01-01_SC_fi_hi`, { recursive: true, force: true })
    await fs.rm(`${exams}/SC/1970-01-01_SC_sv`, { recursive: true, force: true })
  }
})
