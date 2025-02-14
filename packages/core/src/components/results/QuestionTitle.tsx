import classNames from 'classnames'
import React, { useContext } from 'react'
import AnsweringInstructions from '../AnsweringInstructions'
import NotificationIcon from '../NotificationIcon'
import { QuestionContext } from '../context/QuestionContext'
import { ExamComponentProps } from '../../createRenderChildNodes'
import { formatQuestionDisplayNumber } from '../../formatting'

function QuestionTitle({ element, renderChildNodes }: ExamComponentProps) {
  const { displayNumber, level, maxAnswers, childQuestions } = useContext(QuestionContext)
  const Tag = `h${Math.min(3 + level, 6)}` as 'h3' | 'h4' | 'h5' | 'h6'

  return (
    <>
      <Tag className={classNames('exam-question-title', { 'e-normal e-font-size-m': level > 0 })}>
        <strong
          className={classNames('exam-question-title__display-number', {
            'exam-question-title__display-number--indented': level > 0,
          })}
        >
          {`${formatQuestionDisplayNumber(displayNumber)} `}
        </strong>
        {renderChildNodes(element)}
      </Tag>
      {maxAnswers != null && childQuestions.length > 0 && (
        <p className="e-italic">
          <NotificationIcon />
          <AnsweringInstructions {...{ maxAnswers, childQuestions, elementType: 'question' }} />
        </p>
      )}
    </>
  )
}

export default React.memo(QuestionTitle)
