import React, { useContext } from 'react'
import { Translation } from 'react-i18next'
import { QuestionContext } from '../QuestionContext'
import { CensoringScore, InspectionScore, PregradingScore, Score } from '../types'
import ResultsExamQuestionScoresContainer from './ResultsExamQuestionScoresContainer'

export interface ResultsExamQuestionManualScoreProps {
  scores?: Score
  maxScore?: number
  displayNumber?: string
}

interface NormalizedScore {
  score: number
  shortCode: string
  type: string
}

function ResultsExamQuestionManualScore({ scores, maxScore, displayNumber }: ResultsExamQuestionManualScoreProps) {
  const { answers } = useContext(QuestionContext)
  const containerProps = { answers, displayNumber }
  const shortCode = scores?.censoring?.nonAnswerDetails?.shortCode

  return (
    <ResultsExamQuestionScoresContainer {...containerProps}>
      {renderNormalizedScores(scores, maxScore)}
      {shortCode && <NonAnswer shortCode={shortCode} />}
    </ResultsExamQuestionScoresContainer>
  )
}

function renderNormalizedScores(scores?: Score, maxScore?: number) {
  if (!scores) {
    return null
  }

  const normalizedScores = [
    scores.inspection && normalizeInspectionScore(scores.inspection),
    ...(scores.censoring ? normalizeCensoringScores(scores.censoring) : []),
    scores.pregrading && normalizePregradingScore(scores.pregrading)
  ].filter(s => s) as NormalizedScore[]

  return normalizedScores.map((score, i) => <ScoreRow key={i} {...score} latest={i === 0} maxScore={maxScore} />)
}

interface NonAnswerProps {
  shortCode: string
}

function NonAnswer({ shortCode }: NonAnswerProps) {
  return (
    <div className="e-color-darkgrey e-columns e-columns--center-v">
      <span className="e-font-size-xxxl e-light e-mrg-r-1">×</span>
      <span>{shortCode}</span>
    </div>
  )
}

interface ScoreRowProps {
  maxScore?: number
  latest: boolean
}

function ScoreRow({ score, shortCode, type, maxScore, latest }: ScoreRowProps & NormalizedScore) {
  return (
    <div className={latest ? 'e-color-black' : 'e-color-grey'}>
      <ScoreColumn className={`${latest && 'e-font-size-m'}`}>
        {latest ? <b>{score}</b> : score}
        {latest && maxScore ? ` / ${maxScore}` : ''}
        {` p.`}
      </ScoreColumn>
      <ScoreColumn>{shortCode}</ScoreColumn>
      <ScoreColumn className="e-mrg-r-0">
        <Translation>{t => t(type)}</Translation>
      </ScoreColumn>
    </div>
  )
}

interface ScoreColumnProps {
  children?: React.ReactNode
  className?: string
}

function ScoreColumn({ className, children }: ScoreColumnProps) {
  return <span className={`e-font-size-xs e-mrg-r-1 ${className || ''}`}>{children}</span>
}

function normalizePregradingScore({ score }: PregradingScore): NormalizedScore | null {
  return score ? { score, shortCode: '', type: 'va' } : null
}

function normalizeCensoringScores(score: CensoringScore): NormalizedScore[] {
  return score.scores.map((s, i) => ({
    score: s.score,
    shortCode: s.shortCode || '',
    type: `${score.scores.length - i}.s`
  }))
}

function normalizeInspectionScore(score: InspectionScore): NormalizedScore {
  return { score: score.score, shortCode: score.shortCodes ? score.shortCodes.join(', ') : '', type: 'ta' }
}

export default React.memo(ResultsExamQuestionManualScore)
