import React, { useContext, useEffect, useState } from 'react'
import { I18nextProvider } from 'react-i18next'
import { changeLanguage, initI18n } from '../../i18n'
import { useCached } from '../../useCached'
import { withCommonExamContext } from '../context/CommonExamContext'
import { CommonExamProps } from '../exam/Exam'
import { ResultsContext, withResultsContext } from '../context/ResultsContext'
import { GradingAnswer } from './GradingAnswer'
import { Score } from '../../types/Score'

const Results: React.FunctionComponent<CommonExamProps> = () => {
  const { answersByQuestionId } = useContext(ResultsContext)

  const i18n = useCached(() => initI18n('FI-fi'))
  useEffect(changeLanguage(i18n, 'FI-fi'))

  const answerIds = Object.keys(answersByQuestionId).map(Number)
  if (answerIds.length === 0) {
    return <div>No answers</div>
  }
  const [answerId, setAnswerId] = useState<number>(answerIds[0])

  const { questionId, type, value, displayNumber } = answersByQuestionId[answerId]

  if (type === 'choice') {
    return <div>choice answer</div>
  }
  const score: Score = {
    questionId: 3,
    answerId: 3,
    pregrading: {
      annotations: [
        {
          startIndex: 6,
          length: 10,
          message: '+1',
        },
      ],
    },
    censoring: {
      scores: [],
      annotations: [
        {
          startIndex: 9,
          length: 10,
          message: '+1',
        },
      ],
    },
  }
  function selectQuestion(id: number) {
    setAnswerId(id)
  }
  return (
    <I18nextProvider i18n={i18n}>
      <main className="e-exam">
        <div>
          {answerIds.map((id) => (
            <button onClick={() => selectQuestion(id)} key={id}>
              {id}
            </button>
          ))}
        </div>

        <div>
          Tehtävä {displayNumber} ({questionId})
        </div>
        <GradingAnswer {...{ type, value, score }} />
      </main>
    </I18nextProvider>
  )
}

export default React.memo(withResultsContext(withCommonExamContext(Results)))
