import React, { FormEvent, useLayoutEffect, useRef } from 'react'
import { Annotation } from '../..'
import {
  annotationFromMousePosition,
  hasTextSelectedInAnswerText,
  imageAnnotationMouseDownInfo,
  mergeAnnotation,
  NewImageAnnotation,
  popupPosition,
  selectionHasNothingToUnderline,
  textAnnotationFromRange,
} from './editAnnotations'
import {
  renderAnnotations,
  renderImageAnnotationByImage,
  updateImageAnnotationMarkSize,
  wrapAllImages,
} from '../../renderAnnotations'
import GradingAnswerAnnotationList from './GradingAnswerAnnotationList'
import classNames from 'classnames'
import { useExamTranslation } from '../../i18n'

type Annotations = { pregrading: Annotation[]; censoring: Annotation[] }

function preventDefaults(e: Event) {
  e.preventDefault()
  e.stopPropagation()
}

type GradingType = 'pregrading' | 'censoring'

export function GradingAnswer({
  isReadOnly,
  answerType,
  gradingRole,
  annotations,
  saveAnnotations,
  value,
}: {
  isReadOnly: boolean
  answerType: 'richText' | 'text'
  gradingRole: GradingType
  value: string
  annotations: Annotations
  saveAnnotations: (annotations: Annotations) => void
}) {
  const answerRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLFormElement>(null)
  const messageRef = useRef<HTMLInputElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  let newAnnotationObject: Annotation | undefined
  // let isMouseDown = false
  let latestSavedAnnotations: Annotations
  let mouseDownInfo: NewImageAnnotation
  let newImageAnnotationMark: HTMLElement | undefined
  let imageAtHand: HTMLImageElement | undefined
  let isPopupVisible = false
  let fadeTooltipOut: ReturnType<typeof setTimeout>
  let annotationDataForTooltip: { index: number; type: GradingType } | undefined
  useLayoutEffect(() => {
    if (answerRef.current) {
      latestSavedAnnotations = annotations
      tooltipRef.current!.style.display = 'none'
      popupRef.current!.style.display = 'none'
      renderAnswerWithAnnotations(latestSavedAnnotations)
    }
  })

  function removeAnnotation(e: React.MouseEvent<HTMLButtonElement, MouseEvent>): void {
    e.preventDefault()
    closeTooltip()
    latestSavedAnnotations[annotationDataForTooltip!.type].splice(annotationDataForTooltip!.index, 1)
    annotationDataForTooltip = undefined
    saveAnnotations(latestSavedAnnotations)
  }
  const maxLength = 100
  const answerLength = 50
  const { t } = useExamTranslation()

  return (
    <div className="e-grading-answer-wrapper">
      <div
        className="answer e-grading-answer e-line-height-l e-pad-l-2 e-mrg-b-1"
        ref={answerRef}
        onKeyUp={(e) => onKeyUp(e)}
        onMouseDown={(e) => onMouseDown(e)}
        onMouseOver={(e) => onMouseOver(e)}
      />
      <div className="answer-toolbar e-font-size-xs e-columns e-mrg-b-2">
        <div className={classNames('answer-toolbar__answer-length e-column')}>
          {t(maxLength != null ? 'answer-length-with-max-length' : 'answer-length', {
            count: answerLength,
            maxLength: maxLength,
          })}
        </div>
      </div>

      <GradingAnswerAnnotationList
        censoring={annotations.censoring}
        pregrading={annotations.pregrading}
        singleGrading={false}
      />
      <form
        style={{ display: 'none', position: 'absolute' }}
        ref={popupRef}
        className="e-grading-answer-popup e-grading-answer-add-annotation"
        onSubmit={(e) => onSubmit(e)}
      >
        <input name="message" className="e-grading-answer-add-annotation-text" type="text" ref={messageRef} />
        <button className="e-grading-answer-add-annotation-button" type="submit" data-i18n="arpa.annotate">
          Merkitse
        </button>
      </form>
      <div
        style={{ display: 'none' }}
        ref={tooltipRef}
        className="e-grading-answer-tooltip e-grading-answer-popup"
        onMouseOver={onMouseOverTooltip}
        onMouseOut={closeTooltip}
      >
        <span className="e-grading-answer-tooltip-label">tooltip text</span>
        <button onClick={(e) => removeAnnotation(e)} className="e-grading-answer-tooltip-remove">
          ×
        </button>
      </div>
    </div>
  )

  function closeTooltip() {
    fadeTooltipOut = setTimeout(() => {
      tooltipRef.current!.style.display = 'none'
    }, 400)
  }

  function onMouseOverTooltip() {
    clearTimeout(fadeTooltipOut)
  }
  function onMouseOut(e: MouseEvent) {
    const target = e.target as Element
    if (target.tagName === 'MARK') {
      clearTimeout(fadeTooltipOut)
      closeTooltip()
    }
    answerRef.current!.removeEventListener('mouseout', onMouseOut)
  }

  function showTooltip(target: HTMLElement) {
    clearTimeout(fadeTooltipOut)
    const tooltip = tooltipRef.current!
    const type = target.dataset.type as GradingType
    tooltip.querySelector<HTMLDivElement>('.e-grading-answer-tooltip-remove')!.style.display =
      isReadOnly || type !== gradingRole ? 'none' : 'initial'
    const rect = target.getBoundingClientRect()
    Object.assign(tooltip.style, popupPosition(rect, answerRef.current!), { display: 'block' })
    tooltip.querySelector('.e-grading-answer-tooltip-label')!.textContent = target.dataset.message || '–'
    annotationDataForTooltip = { index: Number(target.dataset.listIndex), type }
    answerRef.current!.addEventListener('mouseout', onMouseOut)
  }

  function onMouseOver(e: React.MouseEvent<HTMLDivElement, MouseEvent>) {
    const target = e.target as HTMLElement
    if (
      target.tagName === 'MARK' &&
      !isPopupVisible &&
      (!hasTextSelectedInAnswerText() || isReadOnly) &&
      !newImageAnnotationMark
    ) {
      showTooltip(target)
    }
  }
  function showAnnotationPopup(rect: DOMRect) {
    Object.assign(popupRef.current!.style, popupPosition(rect, answerRef.current!), {
      display: 'block',
    })
    const inputElement = messageRef.current!
    inputElement.value = ''
    inputElement.focus()
    isPopupVisible = true
  }

  function closePopupAndRefresh() {
    newAnnotationObject = undefined
    newImageAnnotationMark = undefined
    imageAtHand = undefined
    isPopupVisible = false
    popupRef.current!.style.display = 'none'
    renderAnswerWithAnnotations(latestSavedAnnotations)
  }

  function onMouseDown(e: React.MouseEvent<HTMLDivElement, MouseEvent>) {
    if (isReadOnly) {
      return
    }
    window.addEventListener('mouseup', onWindowMouseUp)

    if (e.button !== 0) {
      return
    }
    const target = e.target as Element
    imageAtHand = target.closest('.e-annotation-wrapper')?.querySelector<HTMLImageElement>('img') || undefined
    if (!imageAtHand) {
      return
    }
    imageAtHand.addEventListener('dragstart', preventDefaults)
    mouseDownInfo = imageAnnotationMouseDownInfo(e, imageAtHand)

    window.addEventListener('mousemove', onMouseMoveForImageAnnotation)
  }

  function onWindowMouseUp(e: MouseEvent) {
    imageAtHand?.removeEventListener('dragstart', preventDefaults)
    window.removeEventListener('mousemove', onMouseMoveForImageAnnotation)
    window.removeEventListener('mouseup', onWindowMouseUp)

    if (isPopupVisible && (e.target as Element).closest('.popup') === null) {
      closePopupAndRefresh()
      return
    }

    if (newImageAnnotationMark) {
      showAnnotationPopup(newImageAnnotationMark?.getBoundingClientRect()!)
      return
    }

    const selection = window.getSelection()
    if (selection && answerRef.current !== null && hasTextSelectedInAnswerText()) {
      const range = selection.getRangeAt(0)
      if (selectionHasNothingToUnderline(range)) {
        return
      }
      const position = textAnnotationFromRange(answerRef.current, range)
      newAnnotationObject = { ...position, type: 'text', message: '' }
      showAnnotationPopup(range.getBoundingClientRect())
      const newAnnotations = { ...latestSavedAnnotations }
      newAnnotations[gradingRole] = mergeAnnotation(
        answerRef.current,
        newAnnotationObject,
        latestSavedAnnotations[gradingRole]
      )
      renderAnswerWithAnnotations(newAnnotations)
    }
  }

  function onMouseMoveForImageAnnotation(e: MouseEvent) {
    preventDefaults(e)
    newAnnotationObject = annotationFromMousePosition(e, mouseDownInfo)
    if (newImageAnnotationMark) {
      updateImageAnnotationMarkSize(newImageAnnotationMark, newAnnotationObject)
    } else {
      newImageAnnotationMark = renderImageAnnotationByImage(imageAtHand!, '', newAnnotationObject, gradingRole, 999)
    }
  }

  function renderAnswerWithAnnotations(annotations: Annotations) {
    const container = answerRef.current!
    if (answerType === 'richText') {
      container.innerHTML = value
    } else {
      container.textContent = value
    }
    wrapAllImages(container)
    renderAnnotations(container, annotations.pregrading, annotations.censoring)
    //TODO make titles optional for annotation rendering
    container.querySelectorAll('mark').forEach((mark) => mark.removeAttribute('title'))
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const message = messageRef.current!.value
    latestSavedAnnotations[gradingRole] = mergeAnnotation(
      answerRef.current!,
      { ...newAnnotationObject!, message },
      latestSavedAnnotations[gradingRole] || []
    )
    popupRef.current!.style.display = 'none'
    saveAnnotations(latestSavedAnnotations)
  }

  function onKeyUp(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape' && newAnnotationObject) {
      closePopupAndRefresh()
    }
  }
}
