import React, { useEffect, useRef } from 'react'
import { Score } from '../..'
import { useTranslation } from 'react-i18next'
import { ScreenReaderOnly } from '../ScreenReaderOnly'
import { renderAnnotations } from '../../renderAnnotations'

function ResultsSingleLineAnswer({
  displayNumber,
  score,
  value,
  children,
}: {
  answers: Element[]
  score?: Score
  displayNumber?: string
  value: string | undefined
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  const answerRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (answerRef.current) {
      renderAnnotations(answerRef.current, score?.pregrading?.annotations ?? [], '#00f2')
      renderAnnotations(answerRef.current, score?.censoring?.annotations ?? [], '#f002')
    }
  })

  return (
    <>
      {displayNumber && <sup>{displayNumber}</sup>}
      <span className="text-answer text-answer--single-line">
        <ScreenReaderOnly>{t('screen-reader.answer-begin')}</ScreenReaderOnly>
        <span className="e-inline-block" ref={answerRef}>
          {value}
        </span>
        <ScreenReaderOnly>{t('screen-reader.answer-end')}</ScreenReaderOnly>
      </span>
      {children}
    </>
  )
}

export default React.memo(ResultsSingleLineAnswer)
