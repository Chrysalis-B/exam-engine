import chai, { assert } from 'chai'
import chaiJestDiff from 'chai-jest-diff'
import { promises as fs } from 'fs'
import path from 'path'
import sinon, { assert as sinonAssert } from 'sinon'
import { assertEqualsExamFixture, readFixture } from '../../../../test/fixtures'
import { listExams } from '@digabi/mexamples'
import { masterExam, GetMediaMetadata, GenerateUuid } from '@digabi/mex'
import _ from 'lodash'

chai.use(chaiJestDiff)

const generateUuid: GenerateUuid = () => '00000000-0000-0000-0000-000000000000'
const getMediaMetadata: GetMediaMetadata = async (_, type) =>
  type === 'audio' ? { duration: 999 } : { width: 999, height: 999 }

describe('Exam mastering', () => {
  it('throws an error if XML is invalid', async () => {
    const xml = await readFixture('not_xml.xml')
    return assertRejected(masterExam(xml, generateUuid, getMediaMetadata), "Start tag expected, '<' not found\n")
  })

  it('validates the XML against a schema', async () => {
    const xml = await readFixture('does_not_validate.xml')
    return assertRejected(
      masterExam(xml, generateUuid, getMediaMetadata),
      "Element '{http://ylioppilastutkinto.fi/exam.xsd}exam-title': This element is not expected. Expected is ( {http://ylioppilastutkinto.fi/exam.xsd}languages ).\n"
    )
  })

  it('score is required for accepted-answer', async () => {
    const xml = await readFixture('accepted_answer_without_score.xml')
    return assertRejected(
      masterExam(xml, generateUuid, getMediaMetadata),
      "Element '{http://ylioppilastutkinto.fi/exam.xsd}accepted-answer': The attribute 'score' is required but missing.\n"
    )
  })

  it('does not substitute entities', async () => {
    const xml = await readFixture('has_entities.xml')
    return assertRejected(
      masterExam(xml, generateUuid, getMediaMetadata),
      'Internal error: xmlSchemaVDocWalk, there is at least one entity reference in the node-tree currently being validated. Processing of entities with this XML Schema processor is not supported (yet). Please substitute entities before validation..\n'
    )
  })

  it('calls generateUuid with exam metadata if it is an yo exam', async () => {
    const xml = await readFixture('minimal_yo_exam.xml')
    const spy = sinon.spy(generateUuid)
    await masterExam(xml, spy, getMediaMetadata)
    sinonAssert.callCount(spy, 2)
    sinonAssert.calledWith(spy.firstCall, {
      examCode: 'A',
      date: '2020-01-01',
      language: 'fi-FI',
      type: 'normal'
    })
    sinonAssert.calledWith(spy.secondCall, {
      examCode: 'A',
      date: '2020-01-01',
      language: 'sv-FI',
      type: 'normal'
    })
  })

  for (const exam of listExams()) {
    it(`masters ${path.basename(exam)} exam correctly`, async () => {
      const source = await fs.readFile(exam, 'utf-8')
      const results = await masterExam(source, generateUuid, getMediaMetadata)
      for (const result of results) {
        await assertEqualsExamFixture(exam, result.language, 'mastering-result.json', _.omit(result, 'xml', 'hvp'))
        await assertEqualsExamFixture(exam, result.language, 'mastering-result.xml', result.xml)
        await assertEqualsExamFixture(exam, result.language, 'hvp.txt', result.hvp)
      }
    })
  }
})

async function assertRejected<T>(promise: Promise<T>, message?: string) {
  try {
    await promise
  } catch (err) {
    // Everything ok, it threw.
    if (message) {
      return assert.equal(message, err.message)
    } else {
      return
    }
  }

  throw new Error(`Promise ${promise} was not rejected`)
}
