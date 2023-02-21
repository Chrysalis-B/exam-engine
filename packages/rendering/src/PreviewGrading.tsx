import React, { useContext, useEffect, useRef, useState } from 'react'
import { I18nextProvider } from 'react-i18next'
import { ResultsContext, withResultsContext } from '@digabi/exam-engine-core/dist/components/context/ResultsContext'
import { changeLanguage, initI18n } from '@digabi/exam-engine-core/dist/i18n'
import { Annotation } from '@digabi/exam-engine-core'
import { GradingAnswer } from '@digabi/exam-engine-core/dist/components/grading/GradingAnswer'
import { withCommonExamContext } from '@digabi/exam-engine-core/dist/components/context/CommonExamContext'

function PreviewGrading() {
  const { answersByQuestionId } = useContext(ResultsContext)

  const i18n = initI18n('FI-fi')
  useEffect(changeLanguage(i18n, 'FI-fi'))

  const answerIds = Object.keys(answersByQuestionId).map(Number)
  if (answerIds.length === 0) {
    return <div>No answers</div>
  }
  const [answerId, setAnswerId] = useState<number>(answerIds[0])

  const annotationsStorage = useRef<{ [k: string]: { pregrading: Annotation[]; censoring: Annotation[] } }>(
    Object.fromEntries(
      answerIds.map((id) => [
        id,
        {
          pregrading: [
            {
              startIndex: 2,
              length: 5,
              message: '+1',
            },
            {
              x: 0.07434944237918215,
              y: 0.8599562363238512,
              type: 'rect',
              width: 0.16604708798017348,
              height: 0.03063457330415753,
              message: '+2',
              attachmentIndex: 0,
            },
            {
              x1: 0.4035532994923858,
              x2: 0.5621827411167513,
              y1: 0.957983193277311,
              y2: 0.957983193277311,
              type: 'line',
              message: 'trk, +1',
              attachmentIndex: 0,
            },
          ],
          censoring: [],
        },
      ])
    )
  )

  const [annotations, setAnnotations] = useState<{ pregrading: Annotation[]; censoring: Annotation[] }>({
    pregrading: [],
    censoring: [],
  })

  useEffect(() => {
    setAnnotations(annotationsStorage.current[answerId])
  })

  const answer = answersByQuestionId[answerId]
  const { type, value } = answer

  if (type === 'choice') {
    return <div>choice answer</div>
  }
  const { characterCount } = answer
  function selectQuestion(e: React.MouseEvent<HTMLAnchorElement, MouseEvent>, id: number) {
    e.preventDefault()
    setAnswerId(id)
    setAnnotations(annotationsStorage.current[id])
  }

  function saveAnnotations(annotations: { pregrading: Annotation[]; censoring: Annotation[] }) {
    annotationsStorage.current[answerId] = annotations
    setAnnotations({ ...annotationsStorage.current[answerId] })
  }

  return (
    <I18nextProvider i18n={i18n}>
      <main className="e-exam">
        <div className="grading-navi">
          {answerIds.map((id) =>
            id === answerId ? (
              <span key={id} className="grading-navi-item">
                {answersByQuestionId[id].displayNumber}
              </span>
            ) : (
              <a className="grading-navi-item" href="" onClick={(e) => selectQuestion(e, id)} key={id}>
                {answersByQuestionId[id].displayNumber}
              </a>
            )
          )}
        </div>

        <GradingAnswer
          {...{
            answer: { type, characterCount, value },
            isReadOnly: false,
            gradingRole: 'censoring',
            maxLength: 100,
            annotations,
            saveAnnotations,
          }}
        />
      </main>
    </I18nextProvider>
  )
}

export default withResultsContext(withCommonExamContext(PreviewGrading))