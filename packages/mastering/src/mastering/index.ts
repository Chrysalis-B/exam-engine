import { GradingStructure } from '@digabi/exam-engine-core'
import crypto from 'crypto'
import { readFileSync } from 'fs'
import { Document, Element, parseXml, SyntaxError, Text } from 'libxmljs2'
import _ from 'lodash'
import path from 'path'
import { initI18n } from '../i18n'
import { currentExamSchemaVersion } from '../migrations'
import { createGradingStructure } from './createGradingStructure'
import { createTranslationFile } from './createTranslationFile'
import {
  Answer,
  answerTypes,
  attachmentTypes,
  choiceAnswerOptionTypes,
  choiceAnswerTypes,
  Exam,
  ns,
  Question,
  Section,
} from './schema'
import {
  byAttribute,
  byLocalName as byName,
  getAttribute,
  getNumericAttribute,
  hasAttribute,
  queryAncestors,
  xpathOr,
} from './utils'

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÅÄÖ'

const schemaDir = path.resolve(__dirname, '../../schema')
const schema = parseXml(readFileSync(path.resolve(schemaDir, 'exam.xsd')).toString(), {
  baseUrl: `${schemaDir}/`,
})

interface VideoMetadata {
  width: number
  height: number
}
interface ImageMetadata {
  width: number
  height: number
}
interface AudioMetadata {
  duration: number
}

export type ExamType = 'normal' | 'visually-impaired' | 'hearing-impaired'

export type GenerateUuid = (metadata?: {
  examCode: string
  date: string
  language: string
  type: ExamType
}) => Promise<string> | string

// TODO: Try to figure out a way to make this overloading be typed more accurately.
export type GetMediaMetadata = (
  src: string,
  type: 'image' | 'video' | 'audio'
) => Promise<ImageMetadata | VideoMetadata | AudioMetadata>

export interface MasteringOptions {
  /**
   * A secret salt-like value used in shuffling multi choice answers
   * deterministically. This value should be kept secret, otherwise an attacker
   * could reverse engineer the original order of <e:choice-answer-option>` or
   * `<e:dropdown-answer-option>` elements.
   *
   * If set to `undefined`, multichoice answers will not be shuffled.
   */
  multiChoiceShuffleSecret?: string
  /**
   * Remove elements that reveal correct answers to the student. By default, this is set to true, but in some contexts
   * (such as when generating grading instructions) we want to preserve more content in the XML.
   */
  removeCorrectAnswers?: boolean
  /**
   * Throws an error if encountering an invalid LaTeX formula in an
   * `<e:formula>…</e:formula>` element.
   */
  throwOnLatexError?: boolean

  /**
   * Group sibling choice-answer elements under one choicegroup question.
   * This enables minus point handling within a single choicegroup.
   */
  groupChoiceAnswers?: boolean
}

const defaultOptions = {
  multiChoiceShuffleSecret: 'tJXjzAhY3dT4B26aikG2tPmPRlWRTKXF5eVpOR2eDFz3Aj4a3FHF1jB3tswVWPhc',
  removeCorrectAnswers: true,
  throwOnLatexError: true,
}

function assertExamIsValid(doc: Document): Document {
  if (!doc.validate(schema)) {
    // The Exam and XHTML schemas import each other, which causes libxml to add some extra warnings as error messages.
    // Filter them out, they aren't interesting.
    const error = doc.validationErrors.find((err) => err.level! > 1)!

    if (error.message.includes(`is not an element of the set {'${currentExamSchemaVersion}'}.`)) {
      // Throw a more user-friendly error if exam-schema-version doesn't match.
      error.message = `This exam uses an outdated schema. Use the \`ee migrate\` tool to convert it to the current schema.

    $ ee migrate path/to/exam.xml
`
    }

    throw error
  }

  for (const answer of doc.find<Element>(xpathOr(answerTypes), ns)) {
    // Ensure that the each answer element is directly within a question,
    // ignoring a few special HTML-like exam elements.
    const htmlLikeExamElements = ['hints', 'scored-text-answers', 'localization', 'attachment', 'audio-group']
    const maybeParentQuestion = queryAncestors(
      answer,
      (e) => e.namespace()?.href() === ns.e && !htmlLikeExamElements.includes(e.name())
    )

    if (maybeParentQuestion?.name() !== 'question') {
      throw mkError('All answers must be within a question.', answer)
    }

    // Ensure that the question containing the answer doesn't have any child questions.
    const maybeChildQuestion = maybeParentQuestion.get<Element>('.//e:question', ns)
    if (maybeChildQuestion != null) {
      throw mkError('A question may not contain both answer elements and child questions', maybeChildQuestion)
    }

    // Ensure that scored-text-answer has either max-score or accepted-answers.
    if (answer.name() === 'scored-text-answer') {
      const maxScore = getNumericAttribute('max-score', answer, null)
      const acceptedAnswers = answer.find<Element>('./e:accepted-answer', ns)
      if (maxScore == null && acceptedAnswers.length === 0) {
        throw mkError(
          'A scored-text-answer element must contain either a max-score attribute or contain accepted-answers',
          answer
        )
      } else if (
        maxScore != null &&
        acceptedAnswers.some((acceptedAnswer) => getNumericAttribute('score', acceptedAnswer) > maxScore)
      ) {
        throw mkError(
          'The max-score of a scored-text-answer cannot be smaller than the score of some of its accepted-answers',
          answer
        )
      }
    }
  }

  const root = doc.root()!
  const examCode = getAttribute('exam-code', root, '')
  const dayCode = getAttribute('day-code', root, '')
  const examCodesRequiringDayCode = ['A', 'O']
  if (dayCode) {
    if (!examCodesRequiringDayCode.includes(examCode)) {
      throw mkError(`Invalid exam-code ${examCode} for day-code ${dayCode}`, doc.root()!)
    }
  } else {
    if (examCodesRequiringDayCode.includes(examCode)) {
      throw mkError(`Invalid empty day-code for exam-code ${examCode}`, doc.root()!)
    }
  }

  // Ensure that audio tags have no times attribute when presented in external material
  const audiosInExternalMaterialWithTimes = doc.find<Element>('//e:external-material//e:audio[@times]', ns)
  if (audiosInExternalMaterialWithTimes.length > 0) {
    throw mkError(`External material must not contain audio with times attribute`, audiosInExternalMaterialWithTimes[0])
  }

  return doc
}
/**
 * Parse an exam XML file. This should be the only function used for parsing
 * exam XML files, since it sets libxmljs2 options that are necessary for
 * security purposes.
 */
export function parseExam(xml: string, validate = false): Document {
  const doc = parseXml(xml, { noent: false, nonet: true })
  if (validate) {
    assertExamIsValid(doc)
  }
  return doc
}

export interface Attachment {
  filename: string
  restricted: boolean
  visibleInGradingInstructions: boolean
  withinGradingInstruction: boolean
}

export interface MasteringResult {
  /** The attachments used by this exam version. */
  attachments: Attachment[]
  /** The date of the exam. */
  date: string | null
  /** The optional day code of the exam. Only used in YO exams. */
  dayCode: string | null
  /** The optional exam code of the exam. Only used in YO exams. */
  examCode: string | null
  /** An UUID that uniquely identifies this exam version. */
  examUuid: string
  /** The data structure used by Abitti to grade this exam version. */
  gradingStructure: GradingStructure
  /** Strings in the exam to be sent to the translator. */
  translation: string
  /** The language of this exam version. Defined in the `<e:languages>` element of the XML. */
  language: string
  /** The optional title of this exam */
  title: string | null
  /** The type of the exam */
  type: ExamType
  /** The mastered XML. */
  xml: string
}

export type GenerateId = () => number

/**
 * Master an exam.
 */
export async function masterExam(
  xml: string,
  generateUuid: GenerateUuid,
  getMediaMetadata: GetMediaMetadata,
  options?: MasteringOptions
): Promise<MasteringResult[]> {
  const doc = parseExam(xml, true)
  const examVersions = doc.find<Element>('./e:exam-versions/e:exam-version', ns).map((examVersion) => ({
    language: getAttribute('lang', examVersion),
    type: getAttribute('exam-type', examVersion, 'normal') as ExamType,
  }))
  const memoizedGetMediaMetadata = _.memoize(getMediaMetadata, _.join)
  const optionsWithDefaults = { ...defaultOptions, ...options }

  return Promise.all(
    examVersions.map(({ language, type }) =>
      masterExamVersion(parseExam(xml), language, type, generateUuid, memoizedGetMediaMetadata, optionsWithDefaults)
    )
  )
}

async function masterExamVersion(
  doc: Document,
  language: string,
  type: ExamType,
  generateUuid: GenerateUuid,
  getMediaMetadata: GetMediaMetadata,
  options: MasteringOptions
): Promise<MasteringResult> {
  const root = doc.root()!
  const generateId = mkGenerateId()
  const translation = createTranslationFile(doc)

  await addExamMetadata(root, generateUuid, language, type)
  // Add question ids before removing questions in wrong language and for other exam-types
  // in order to keep question ids same within different exam versions
  // It helps when grading productive questions.
  addQuestionIds(root, generateId)
  applyLocalizations(root, language, type)

  const exam = parseExamStructure(root)

  addYoCustomizations(root, language, type)
  addSectionNumbers(exam)
  addQuestionNumbers(exam)
  addAnswerNumbers(exam)
  addAttachmentNumbers(exam)

  // Perform shuffling before adding answer options ids, so the student can't guess the original order.
  if (options.multiChoiceShuffleSecret) shuffleAnswerOptions(exam, options.multiChoiceShuffleSecret)
  addAnswerOptionIds(exam, generateId)

  updateMaxScoresToAnswers(exam)
  countSectionMaxAndMinAnswers(exam)

  const gradingStructure = createGradingStructure(exam, generateId, { groupChoiceAnswers: options.groupChoiceAnswers })

  countMaxScores(exam)
  removeComments(root)
  removeTableWhitespaceNodes(root)

  if (options.removeCorrectAnswers) {
    removeCorrectAnswers(exam)
    removeHiddenElements(root)
    removeHvpMetadata(root)
  }

  const attachments = root.find<Element>(xpathOr(attachmentTypes), ns)
  addRestrictedAudioMetadata(attachments)
  await renderFormulas(root, options.throwOnLatexError)
  await addMediaMetadata(attachments, getMediaMetadata)

  return {
    attachments: collectAttachments(root, attachments),
    date: getAttribute('date', root, null),
    dayCode: getAttribute('day-code', root, null),
    examCode: getAttribute('exam-code', root, null),
    examUuid: getAttribute('exam-uuid', root),
    gradingStructure,
    translation,
    language,
    title: root.get<Element>('//e:exam-title', ns)?.text().trim() ?? null,
    type,
    xml: doc.toString(false),
  }
}

async function addMediaMetadata(attachments: Element[], getMediaMetadata: GetMediaMetadata) {
  for (const attachment of attachments) {
    const name = attachment.name()
    if (name === 'audio' || name === 'video' || name === 'image' || name === 'audio-test') {
      const type = name === 'audio-test' ? 'audio' : name
      const metadata = await getMediaMetadata(getAttribute('src', attachment), type)
      if (type === 'audio') {
        const audioMetadata = metadata as AudioMetadata
        attachment.attr('duration', String(audioMetadata.duration))
      } else {
        const imageOrVideoMetadata = metadata as ImageMetadata | VideoMetadata
        attachment.attr('width', String(imageOrVideoMetadata.width))
        attachment.attr('height', String(imageOrVideoMetadata.height))
      }
    }
  }
}

function collectAttachments(exam: Element, attachments: Element[]): Attachment[] {
  const mkAttachment = (
    filename: string,
    restricted = false,
    visibleInGradingInstructions = false,
    withinGradingInstruction = false
  ): Attachment => ({
    filename,
    restricted,
    visibleInGradingInstructions,
    withinGradingInstruction,
  })
  const maybeCustomStylesheet = getAttribute('exam-stylesheet', exam, null)

  return _.uniqWith(
    [
      ...attachments.map((a) =>
        mkAttachment(
          getAttribute('src', a),
          a.attr('times') != null,
          isVisibleInGradingInstructions(a),
          isWithinGradingInstructions(a)
        )
      ),
      ...(maybeCustomStylesheet ? [mkAttachment(maybeCustomStylesheet)] : []),
    ],
    _.isEqual
  )
}

function isVisibleInGradingInstructions(attachment: Element) {
  return !!queryAncestors(attachment, (e) =>
    [
      // Keep in sync with lists in core's GradingInstructions.tsx
      'answer-grading-instruction',
      'choice-answer-option',
      'dropdown-answer-option',
      'exam-grading-instruction',
      'question-grading-instruction',
      'hint',
      'question-title',
      'question-instruction',
    ].includes(e.name())
  )
}

function isWithinGradingInstructions(attachment: Element) {
  return !!queryAncestors(attachment, (e) =>
    ['exam-grading-instruction', 'question-grading-instruction', 'answer-grading-instruction'].includes(e.name())
  )
}

async function addExamMetadata(exam: Element, generateUuid: GenerateUuid, language: string, type: ExamType) {
  const examCode = getAttribute('exam-code', exam, null)
  const date = getAttribute('date', exam, null)
  const metadata = examCode != null && date != null ? { examCode, date, language, type } : undefined
  const examUuid = await generateUuid(metadata)

  exam
    .attr('exam-uuid', examUuid)
    .attr('exam-lang', language)
    .attr('exam-type', type)
    // From the point of view of the exam server, the schema version hasn't
    // changed, so we don't have to update it in the mastered XML (yet, anyway).
    .attr('exam-schema-version', '0.1')
}

function addYoCustomizations(exam: Element, language: string, type: ExamType) {
  const examCode = getAttribute('exam-code', exam, null)

  // If the exam doesn't have an exam code, it is not an YO exam.
  if (!examCode) {
    return
  }

  const i18n = initI18n(language)
  const dayCode = getAttribute('day-code', exam, null)
  const key = dayCode ? `${examCode}_${dayCode}` : examCode

  const examLang = getAttribute('lang', exam, null)
  if (!examLang) {
    const subjectLanguages: Record<string, string> = {
      BA: 'sv-FI',
      BB: 'sv_FI',
      CA: 'fi-FI',
      CB: 'fi-FI',
      EA: 'en-GB',
      EC: 'en-GB',
      FA: 'fr-FR',
      FC: 'fr-FR',
      GC: 'pt-PT',
      L1: 'la',
      L7: 'la',
      PA: 'es-ES',
      PC: 'es-ES',
      SA: 'de-DE',
      SC: 'de-DE',
      TC: 'it-IT',
      IC: 'smn-FI',
      DC: 'sme-FI',
      QC: 'sms-FI',
      VA: 'ru-RU',
      VC: 'ru-RU',
    }
    const maybeLang = subjectLanguages[key]
    if (maybeLang) {
      exam.attr('lang', maybeLang)
    }
  }

  const examTitle = exam.get('./e:exam-title', ns)
  if (!examTitle) {
    const title = i18n.t(key, { ns: 'exam-title' })
    if (title) {
      const suffix = i18n.t(type, { ns: 'exam-title', defaultValue: '' })
      const fullTitle = title + (suffix ? ` ${suffix}` : '')
      const firstChild = exam.child(0) as Element
      firstChild.addPrevSibling(
        exam
          .node('exam-title')
          .namespace(ns.e)
          .addChild(exam.node('span', fullTitle).attr('lang', language).namespace(ns.xhtml))
      )
    } else {
      throw new Error(`No exam title defined for ${examCode}`)
    }
  }

  const examFooter = exam.get('./e:exam-footer', ns)
  if (!examFooter) {
    const footerText = i18n.t([key, 'default'], { ns: 'exam-footer' })
    exam
      .node('exam-footer')
      .namespace(ns.e)
      .node('p', footerText)
      .attr('lang', language)
      .attr('class', 'e-text-center e-semibold')
  }
}

function removeComments(exam: Element) {
  exam.find('//comment()').forEach((e) => e.remove())
}

function removeHiddenElements(exam: Element) {
  exam.find('//e:*[@hidden=true()]', ns).forEach((e) => e.remove())
}

function removeHvpMetadata(exam: Element) {
  exam
    .find(
      xpathOr([
        'exam-grading-instruction',
        'question-grading-instruction',
        'answer-grading-instruction',
        'audio-transcription',
      ]),
      ns
    )
    .forEach((e) => e.remove())
}

function updateMaxScoresToAnswers(exam: Exam) {
  for (const { element } of exam.answers) {
    switch (element.name()) {
      case 'choice-answer':
      case 'dropdown-answer':
      case 'scored-text-answer': {
        if (element.attr('max-score') == null) {
          const scores = element
            .find<Element>('./e:choice-answer-option | ./e:dropdown-answer-option | ./e:accepted-answer', ns)
            .map((option) => getNumericAttribute('score', option, 0))
          const maxScore = _.max(scores)
          element.attr('max-score', String(maxScore))
        }
      }
    }
  }
}

function removeCorrectAnswers(exam: Exam) {
  for (const { element } of exam.answers) {
    switch (element.name()) {
      case 'choice-answer':
      case 'dropdown-answer':
        {
          for (const option of element.find<Element>('//e:choice-answer-option | //e:dropdown-answer-option', ns)) {
            option.attr('score')?.remove()
          }
        }
        break
      case 'scored-text-answer': {
        element.find('.//e:accepted-answer', ns).forEach((e) => e.remove())
      }
    }
  }
}

/**
 * React doesn't like whitespace nodes inside table elements. To reduce noise
 * in the browser console, remove them during mastering.
 */
function removeTableWhitespaceNodes(exam: Element) {
  const tableElements = ['table', 'thead', 'tbody', 'tr'].map((e) => `self::xhtml:${e}`).join(' or ')
  for (const textNode of exam.find<Text>(`//*[${tableElements}]/text()`, ns)) {
    if (textNode.text().trim() === '') {
      textNode.remove()
    }
  }
}

function applyLocalizations(exam: Element, language: string, type: ExamType) {
  exam.get('./e:exam-versions', ns)?.remove()

  for (const localization of exam.find<Element>('//e:localization', ns)) {
    if (
      getAttribute('lang', localization, language) !== language ||
      !getAttribute('exam-type', localization, type).includes(type) ||
      localization.childNodes().every((c) => c instanceof Text && c.text().trim().length === 0)
    ) {
      localization.remove()
    } else {
      localization.name('span').namespace(ns.xhtml).attr('exam-type')?.remove()
    }
  }

  exam
    .find(`//e:*[(@lang and @lang!='${language}') or (@exam-type and not(contains(@exam-type, '${type}')))]`, ns)
    .forEach((element) => element.remove())
}

function addSectionNumbers(exam: Exam) {
  exam.sections.forEach((section, i) => section.element.attr('display-number', String(i + 1)))
}

function addQuestionNumbers(exam: Exam) {
  function addQuestionNumber(question: Question, index: number, prefix = '') {
    const displayNumber = `${prefix ? `${prefix}.` : ''}${index + 1}`
    question.element.attr('display-number', displayNumber)
    question.childQuestions.forEach((q, i) => addQuestionNumber(q, i, displayNumber))
  }

  exam.topLevelQuestions.forEach((q, i) => addQuestionNumber(q, i))
}

function addAnswerNumbers(exam: Exam) {
  function addAnswerNumber(question: Question) {
    const questionNumber = getAttribute('display-number', question.element)
    question.answers.forEach((answer, i, answers) => {
      answer.element.attr('display-number', answers.length === 1 ? questionNumber : `${questionNumber}.${i + 1}`)
    })
    question.childQuestions.forEach(addAnswerNumber)
  }

  exam.topLevelQuestions.forEach(addAnswerNumber)
}

function addAttachmentNumbers(exam: Exam) {
  // Exam-specific external material
  exam.element.find<Element>('./e:external-material/e:attachment', ns).forEach((attachment, i) => {
    attachment.attr('display-number', alphabet[i])
  })

  // Question external-material
  for (const question of exam.questions) {
    const questionDisplayNumber = getAttribute('display-number', question.element)!
    // Only number external attachments for now, since you can't refer to internal
    // attachments. This also makes the numbering less confusing for users,
    // since it will always start at "A".
    question.element.find<Element>('./e:external-material/e:attachment', ns).forEach((attachment, i) => {
      const displayNumber = `${questionDisplayNumber}.${alphabet[i]}`
      attachment.attr('display-number', String(displayNumber))
    })
  }
}

function addQuestionIds(root: Element, generateId: GenerateId) {
  const exam = parseExamStructure(root)
  for (const answer of exam.answers) {
    answer.element.attr('question-id', String(generateId()))
  }
}

function countSectionMaxAndMinAnswers(exam: Exam) {
  const examMaxAnswers = getNumericAttribute('max-answers', exam.element, null)
  if (!examMaxAnswers) {
    return
  }

  for (const section of exam.sections) {
    if (getNumericAttribute('max-answers', section.element, null) == null) {
      section.element.attr('max-answers', String(Math.min(section.questions.length, examMaxAnswers)))
    }
  }

  for (const section of exam.sections) {
    const maxAnswers = getNumericAttribute('max-answers', section.element)
    const otherSectionMaxAnswers = _.sumBy(
      exam.sections.filter((s) => s !== section),
      (otherSection) => getNumericAttribute('max-answers', otherSection.element)
    )
    const minAnswers = _.clamp(maxAnswers, 0, examMaxAnswers - otherSectionMaxAnswers)
    section.element.attr('min-answers', String(minAnswers))
  }
}

function countMaxScores(exam: Exam) {
  function countMaxScore(answerables: Array<Question | Answer>, maxAnswers: number | null) {
    const maxScores = answerables.map((a) => getNumericAttribute('max-score', a.element))
    return _.sum(_.take(_.orderBy(maxScores, _.identity, 'desc'), maxAnswers ?? answerables.length))
  }

  function countQuestionMaxScores(question: Question) {
    question.childQuestions.forEach(countQuestionMaxScores)
    const maxAnswers = getNumericAttribute('max-answers', question.element, null)
    const answerables = question.childQuestions.length ? question.childQuestions : question.answers
    const maxScore = countMaxScore(answerables, maxAnswers)
    question.element.attr('max-score', String(maxScore ?? 0))
  }

  function countSectionMaxScores() {
    for (const section of exam.sections) {
      section.questions.forEach(countQuestionMaxScores)
      const maxAnswers = getNumericAttribute('max-answers', section.element, null)
      const maxScore = countMaxScore(section.questions, maxAnswers)
      section.element.attr('max-score', String(maxScore ?? 0))
    }
  }

  function countExamMaxScore() {
    const examMaxAnswers = getNumericAttribute('max-answers', exam.element, null)
    const questionsWithHighestMaxScoresPerSection = _.flatMap(exam.sections, (section) => {
      const sectionMaxAnswers = getNumericAttribute('max-answers', section.element, null)
      const questions = section.questions
      return _.take(
        _.orderBy(questions, (question) => getNumericAttribute('max-score', question.element), 'desc'),
        sectionMaxAnswers ?? questions.length
      )
    })
    const maxScore = countMaxScore(questionsWithHighestMaxScoresPerSection, examMaxAnswers)
    exam.element.attr('max-score', String(maxScore ?? 0))
  }

  countSectionMaxScores()
  countExamMaxScore()
}

function addAnswerOptionIds(exam: Exam, generateId: GenerateId) {
  for (const { element } of exam.answers) {
    if (_.includes(choiceAnswerTypes, element.name())) {
      element.find<Element>(xpathOr(choiceAnswerOptionTypes), ns).forEach((answerOption) => {
        answerOption.attr('option-id', String(generateId()))
      })
    }
  }
}

function addRestrictedAudioMetadata(attachments: Element[]) {
  attachments
    .filter(byName('audio'))
    .filter(hasAttribute('times'))
    .forEach((audio, i) => audio.attr('restricted-audio-id', String(i)))
}

function shuffleAnswerOptions(exam: Exam, multichoiceShuffleSecret: string) {
  const createHash = (value: string) => {
    const hash = crypto.createHash('sha256')
    hash.update(value)
    return hash.digest('hex')
  }
  return exam.answers
    .map((a) => a.element)
    .filter(byName(...choiceAnswerTypes))
    .filter(_.negate(byAttribute('ordering', 'fixed')))
    .forEach((answer) => {
      const options = answer.find<Element>('./e:choice-answer-option | ./e:dropdown-answer-option', ns)
      const answerKey = String(options.length) + getAttribute('question-id', answer)
      const sortedOptions = _.sortBy(options, (option) =>
        createHash(answerKey + String(options.indexOf(option)) + multichoiceShuffleSecret)
      )
      for (const option of sortedOptions) {
        answer.addChild(option)
      }

      // A no-answer option should always be the last
      const noAnswerOption = options.find((option) => getAttribute('type', option, 'normal') === 'no-answer')
      if (noAnswerOption) answer.addChild(noAnswerOption)
    })
}

async function renderFormulas(exam: Element, throwOnLatexError?: boolean) {
  for (const formula of exam.find<Element>('//e:formula', ns)) {
    try {
      // Load render-formula lazily, since initializing mathjax-node is very expensive.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-assignment
      const svg = (await require('./render-formula')(
        formula.text(),
        getAttribute('mode', formula, null),
        throwOnLatexError
      )) as string
      formula.attr('svg', svg)
    } catch (errors) {
      if (Array.isArray(errors) && errors.every(_.isString)) {
        throw mkError(errors.join(', '), formula)
      }
    }
  }
}

/** Creates an error object with line number information. */
function mkError(message: string, element: Element): SyntaxError {
  const err = new Error(message) as any as SyntaxError
  err.domain = 999
  err.line = element.line() // FIXME: libxmljs2 typings don't define `element.line()` right now.
  err.column = 0
  return err
}

function parseExamStructure(element: Element): Exam {
  const sections = element.find<Element>('//e:section', ns).map(parseSection)
  const topLevelQuestions = sections.flatMap((s) => s.questions)
  const questions: Question[] = []
  const answers: Answer[] = []

  const collect = (question: Question) => {
    questions.push(question)
    if (question.answers.length) answers.push(...question.answers)
    else question.childQuestions.forEach(collect)
  }

  topLevelQuestions.forEach(collect)

  return { element, sections, questions, topLevelQuestions, answers }
}

function parseSection(element: Element): Section {
  const questions = element.find<Element>('./e:question', ns).map(parseQuestion)
  return { element, questions }
}

function parseAnswer(element: Element, question: Element) {
  return { element, question }
}

function parseQuestion(question: Element): Question {
  const childQuestions = question
    .find<Element>('.//e:question', ns)
    .filter((childQuestion) => childQuestion.get('./ancestor::e:question[1]', ns) === question)
    .map(parseQuestion)
  if (childQuestions.length) {
    return { element: question, childQuestions, answers: [] }
  } else {
    const answers = question.find<Element>(xpathOr(answerTypes), ns).map((element) => parseAnswer(element, question))
    return { element: question, childQuestions: [], answers }
  }
}

function mkGenerateId(): GenerateId {
  let current = 1
  return () => current++
}
