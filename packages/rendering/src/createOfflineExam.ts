import { getMediaMetadataFromLocalFile, masterExam } from '@digabi/exam-engine-mastering'
import { promises as fs } from 'fs'
import path from 'path'
import puppeteer from 'puppeteer'
import uuid from 'uuid'
import webpack from 'webpack'
import { getOfflineWebpackConfig } from './getOfflineWebpackConfig'

export async function createOfflineExam(examFile: string, outputDirectory: string): Promise<string[]> {
  const resolveAttachment = (filename: string) => path.resolve(path.dirname(examFile), 'attachments', filename)
  const source = await fs.readFile(examFile, 'utf-8')
  const examOutputDirectories: string[] = []

  for (const result of await masterExam(source, () => uuid.v4(), getMediaMetadataFromLocalFile(resolveAttachment))) {
    const { examCode, dayCode, date, language } = result
    const shortLanguageCode = language.replace(/-.*$/, '')
    const dirname = examCode
      ? `${date && date + '_'}${examCode}${dayCode ? '_' + dayCode : ''}_${shortLanguageCode}`
      : `${path.basename(path.dirname(examFile))}_${language}_offline`
    const examOutputDirectory = path.resolve(outputDirectory, dirname)
    const resolveOutputFile = (...filename: string[]) => path.resolve(examOutputDirectory, ...filename)
    const config = getOfflineWebpackConfig(result, examOutputDirectory)
    await new Promise<string>((resolve, reject) => {
      webpack(config, (err, stats) => {
        if (err || stats.hasErrors()) {
          reject(err || stats.toString({ colors: true }))
        } else {
          resolve()
        }
      })
    })

    for (const { filename } of result.attachments) {
      await fs.copyFile(resolveAttachment(filename), resolveOutputFile('attachments', filename))
    }

    examOutputDirectories.push(examOutputDirectory)
  }

  const browser = await puppeteer.launch()
  try {
    const context = await browser.createIncognitoBrowserContext()
    const page = await context.newPage()
    await page.setViewport({ width: 1280, height: 800 })
    for (const examOutputDirectory of examOutputDirectories) {
      for (const htmlFile of [
        path.resolve(examOutputDirectory, 'index.html'),
        path.resolve(examOutputDirectory, 'attachments/index.html')
      ]) {
        await page.goto('file://' + htmlFile, { waitUntil: 'networkidle0' })
        await page.evaluate(() => {
          // Remove rich-text-editor injected styles
          document.head.querySelectorAll(':scope > style').forEach(e => e.remove())
          // Remove rich-text-editor injected HTML.
          document.body.querySelectorAll(':scope > :not(main)').forEach(e => e.remove())
        })
        const prerenderedContent = await page.content()
        await fs.writeFile(htmlFile, prerenderedContent, 'utf-8')
      }
    }
  } finally {
    await browser.close()
  }

  return examOutputDirectories
}
