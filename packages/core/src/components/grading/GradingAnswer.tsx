import React, { FormEvent, useLayoutEffect, useRef } from 'react'
import { Annotation } from '../..'
import {
  annotationFromMousePosition,
  hasTextSelectedInAnswerText,
  imageAnnotationMouseDownInfo,
  mergeAnnotation,
  NewImageAnnotation,
  selectionHasNothingToUnderline,
  showAndPositionElement,
  textAnnotationFromRange,
} from './editAnnotations'
import {
  renderAnnotations,
  renderImageAnnotationByImage,
  updateImageAnnotationMarkSize,
  wrapAllImages,
} from '../../renderAnnotations'
import GradingAnswerAnnotationList from './GradingAnswerAnnotationList'
import { useExamTranslation } from '../../i18n'
import { updateLargeImageWarnings } from './largeImageDetector'

type Annotations = { pregrading: Annotation[]; censoring: Annotation[] }

type GradingType = 'pregrading' | 'censoring'
export function GradingAnswer({
  answer: { type, characterCount, value },
  isReadOnly,
  gradingRole,
  annotations,
  saveAnnotations,
  maxLength,
}: {
  answer: { type: 'richText' | 'text'; characterCount: number; value: string }
  isReadOnly: boolean
  gradingRole: GradingType
  maxLength?: number
  annotations: Annotations
  saveAnnotations: (annotations: Annotations) => void
}) {
  const answerRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLFormElement>(null)
  const messageRef = useRef<HTMLInputElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  let newAnnotationObject: Annotation | undefined
  let savedAnnotations: Annotations
  const imgAnnotationState: {
    start: NewImageAnnotation | undefined
    element: HTMLElement | undefined
    img: HTMLImageElement | undefined
  } = { start: undefined, element: undefined, img: undefined }
  let isEditAnnotationPopupVisible = false
  let closeTooltipTimeout: ReturnType<typeof setTimeout>
  let annotationDataForTooltip: { index: number; type: GradingType; message: string } | undefined
  let windowResizeTimeout: ReturnType<typeof setTimeout>
  let tooltipPosition: DOMRect

  function onAnnotationClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target instanceof HTMLElement && e.target.tagName === 'MARK') {
      showTooltip(e.target)
    } else {
      if (annotationDataForTooltip) {
        closeTooltip()
      }
    }
  }

  function editExistingAnnotation(e: React.MouseEvent<HTMLSpanElement>) {
    if ((e.target as HTMLElement).closest('.editable')) {
      toggle(tooltipRef.current, false)
      showOldAnnotationPopup(tooltipPosition)
    }
  }

  useLayoutEffect(() => {
    if (answerRef.current) {
      savedAnnotations = annotations
      toggle(tooltipRef.current, false)
      toggle(popupRef.current, false)
      renderAnswerWithAnnotations(savedAnnotations)
    }

    window.onresize = () => {
      clearTimeout(windowResizeTimeout)
      windowResizeTimeout = setTimeout(() => updateLargeImageWarnings(answerRef.current!), 1000)
    }
  })

  const { t } = useExamTranslation()
  const percentage = countSurplusPercentage(characterCount, maxLength)

  return (
    <div className="e-grading-answer-wrapper">
      <div
        className="e-grading-answer e-line-height-l e-mrg-b-1"
        ref={answerRef}
        onClick={(e) => onAnnotationClick(e)}
        onMouseDown={(e) => onMouseDown(e)}
        onMouseOver={(e) => onMouseOver(e.target as HTMLElement)}
      />
      <div className="e-font-size-xs e-grading-answer-length">
        {t('answer-length', {
          count: characterCount,
        })}
        {percentage > 0 ? (
          <span className="e-grading-answer-max-length-surplus">
            {t('max-length-surplus', {
              maxLength,
              percentage,
            })}
          </span>
        ) : (
          ''
        )}
      </div>
      <GradingAnswerAnnotationList
        censoring={annotations.censoring}
        pregrading={annotations.pregrading}
        singleGrading={false}
      />
      <form
        style={{ display: 'none' }}
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
        <span onClick={(e) => editExistingAnnotation(e)} className="e-grading-answer-tooltip-label">
          tooltip text
        </span>
        <button onClick={(e) => removeAnnotation(e)} className="e-grading-answer-tooltip-remove">
          ×
        </button>
      </div>
    </div>
  )

  function removeAnnotation(e: React.MouseEvent<HTMLButtonElement, MouseEvent>): void {
    e.preventDefault()
    closeTooltip()
    savedAnnotations[annotationDataForTooltip!.type].splice(annotationDataForTooltip!.index, 1)
    annotationDataForTooltip = undefined
    saveAnnotations(savedAnnotations)
  }
  function closeTooltip() {
    closeTooltipTimeout = setTimeout(() => {
      toggle(tooltipRef.current, false)
    }, 400)
  }

  function onMouseOverTooltip() {
    clearTimeout(closeTooltipTimeout)
  }
  function onMouseOut(e: MouseEvent) {
    const target = e.target as Element
    if (target.tagName === 'MARK') {
      clearTimeout(closeTooltipTimeout)
      closeTooltip()
    }
    answerRef.current!.removeEventListener('mouseout', onMouseOut)
  }

  function showTooltip(target: HTMLElement) {
    clearTimeout(closeTooltipTimeout)
    const tooltip = tooltipRef.current!
    const { type, listIndex, message } = target.dataset
    tooltip.classList.toggle('editable', !isReadOnly && type === gradingRole)
    tooltipPosition = target.getBoundingClientRect()
    Object.assign(tooltip.style, showAndPositionElement(tooltipPosition, answerRef.current!))
    tooltip.querySelector('.e-grading-answer-tooltip-label')!.textContent = message || '–'
    annotationDataForTooltip = { index: Number(listIndex), type: type as GradingType, message: message || '' }
    answerRef.current!.addEventListener('mouseout', onMouseOut)
  }

  function onMouseOver(target: HTMLElement) {
    if (
      target.tagName === 'MARK' &&
      !isEditAnnotationPopupVisible &&
      (!hasTextSelectedInAnswerText() || isReadOnly) &&
      !imgAnnotationState.element
    ) {
      showTooltip(target)
    }
  }
  function showAnnotationPopup(rect: DOMRect) {
    annotationDataForTooltip = undefined
    setupAnnotationPopup(rect, '')
  }
  function showOldAnnotationPopup(rect: DOMRect) {
    setupAnnotationPopup(rect, annotationDataForTooltip!.message)
  }
  function setupAnnotationPopup(rect: DOMRect, message: string) {
    Object.assign(popupRef.current!.style, showAndPositionElement(rect, answerRef.current!))
    const inputElement = messageRef.current!
    inputElement.value = message
    inputElement.focus()
    isEditAnnotationPopupVisible = true
    window.addEventListener('keydown', onKeyUp)
  }

  function closePopupAndRefresh() {
    newAnnotationObject = undefined
    imgAnnotationState.element = undefined
    imgAnnotationState.img = undefined
    isEditAnnotationPopupVisible = false
    window.removeEventListener('keydown', onKeyUp)
    toggle(popupRef.current, false)
    renderAnswerWithAnnotations(savedAnnotations)
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
    const img = target.closest('.e-annotation-wrapper')?.querySelector<HTMLImageElement>('img') || undefined
    if (!img) {
      return
    }
    img.addEventListener('dragstart', preventDefaults)
    imgAnnotationState.start = imageAnnotationMouseDownInfo(e, img)
    imgAnnotationState.img = img

    window.addEventListener('mousemove', onMouseMoveForImageAnnotation)
  }

  function onWindowMouseUp(e: MouseEvent) {
    imgAnnotationState.img?.removeEventListener('dragstart', preventDefaults)
    window.removeEventListener('mousemove', onMouseMoveForImageAnnotation)
    window.removeEventListener('mouseup', onWindowMouseUp)

    if (isEditAnnotationPopupVisible && (e.target as Element).closest('.popup') === null) {
      closePopupAndRefresh()
      return
    }

    if (imgAnnotationState.element) {
      showAnnotationPopup(imgAnnotationState.element?.getBoundingClientRect()!)
      return
    }

    if (isEditAnnotationPopupVisible) {
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
      const newAnnotations = { ...savedAnnotations }
      newAnnotations[gradingRole] = mergeAnnotation(
        answerRef.current,
        newAnnotationObject,
        savedAnnotations[gradingRole]
      )
      renderAnswerWithAnnotations(newAnnotations)
    }
  }

  function onMouseMoveForImageAnnotation(e: MouseEvent) {
    preventDefaults(e)
    newAnnotationObject = annotationFromMousePosition(e, imgAnnotationState.start!)
    if (imgAnnotationState.element) {
      updateImageAnnotationMarkSize(imgAnnotationState.element, newAnnotationObject)
    } else {
      imgAnnotationState.element = renderImageAnnotationByImage(
        imgAnnotationState.img!,
        '',
        newAnnotationObject,
        gradingRole,
        999
      )
    }
  }

  function renderAnswerWithAnnotations(annotations: Annotations) {
    const container = answerRef.current!
    if (type === 'richText') {
      container.innerHTML = value
      wrapAllImages(container)
      updateLargeImageWarnings(container)
    } else {
      container.textContent = value
    }
    renderAnnotations(container, annotations.pregrading, annotations.censoring, false)
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const message = messageRef.current!.value
    if (annotationDataForTooltip) {
      savedAnnotations[annotationDataForTooltip.type][annotationDataForTooltip.index].message = message
    } else {
      savedAnnotations[gradingRole] = mergeAnnotation(
        answerRef.current!,
        { ...newAnnotationObject!, message },
        savedAnnotations[gradingRole] || []
      )
    }
    toggle(popupRef.current, false)
    saveAnnotations(savedAnnotations)
  }

  function onKeyUp(e: KeyboardEvent) {
    if (e.key === 'Escape' && isEditAnnotationPopupVisible) {
      closePopupAndRefresh()
    }
  }
}

function preventDefaults(e: Event) {
  e.preventDefault()
  e.stopPropagation()
}

function countSurplusPercentage(characters: number, maxCharacters: number | undefined | null): number {
  if (!maxCharacters || characters <= maxCharacters) {
    return 0
  }
  return Math.floor((100 * characters) / maxCharacters - 100)
}

function toggle(element: HTMLElement | null, isVisible: boolean): void {
  if (element instanceof HTMLElement) {
    element.style.display = isVisible ? 'initial' : 'none'
  }
}
