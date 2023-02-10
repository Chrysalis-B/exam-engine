import React, { useContext, useEffect, useRef, useState } from 'react'
import { I18nextProvider } from 'react-i18next'
import { changeLanguage, initI18n } from '../../i18n'
import { useCached } from '../../useCached'
import { withCommonExamContext } from '../context/CommonExamContext'
import { CommonExamProps } from '../exam/Exam'
import { ResultsContext, withResultsContext } from '../context/ResultsContext'
import { GradingAnswer } from './GradingAnswer'
import { Annotation } from '../../types/Score'

const Results: React.FunctionComponent<CommonExamProps> = () => {
  const { answersByQuestionId } = useContext(ResultsContext)

  const i18n = useCached(() => initI18n('FI-fi'))
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
          ],
          censoring: [],
        },
      ])
    )
  )

  const [savedAnnotations, setSavedAnnotations] = useState<{ pregrading: Annotation[]; censoring: Annotation[] }>({
    pregrading: [],
    censoring: [],
  })

  const { questionId, type, value, displayNumber } = answersByQuestionId[answerId]

  if (type === 'choice') {
    return <div>choice answer</div>
  }
  function selectQuestion(id: number) {
    setAnswerId(id)
    setSavedAnnotations({
      pregrading: annotationsStorage.current[id].pregrading,
      censoring: annotationsStorage.current[id].censoring,
    })
  }
  function saveAnnotations(annotations: { pregrading: Annotation[]; censoring: Annotation[] }) {
    annotationsStorage.current[answerId] = annotations
    console.log('saving: ', annotationsStorage.current)
  }
  return (
    <I18nextProvider i18n={i18n}>
      <main className="e-exam">
        <div>
          {answerIds.map((id) => (
            <button onClick={() => selectQuestion(id)} key={id}>
              {answersByQuestionId[id].displayNumber}
            </button>
          ))}
        </div>

        <div>
          Tehtävä {displayNumber} ({questionId})
        </div>
        <GradingAnswer
          {...{
            type,
            value,
            savedAnnotations,
            saveAnnotations,
          }}
        />
      </main>
    </I18nextProvider>
  )
}

export default React.memo(withResultsContext(withCommonExamContext(Results)))
