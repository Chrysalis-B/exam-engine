import $ from 'jquery'
import * as _ from 'lodash-es'
import * as Bacon from 'baconjs'
import * as answerAnnotationsRendering from './annotations-rendering'

$.fn.asEventStream = Bacon.$.asEventStream
const ESC = 27
const ENTER = 13
let isMouseDown = false

export function setupAnnotationEditing($containerElement, saveAnnotation, localize, isCensor) {
  setupAnnotationAddition($containerElement)
  setupAnnotationRemoval($containerElement)

  function setupAnnotationRemoval($answers) {
    $answers.on('mousedown', '.remove-annotation-area', (event) => {
      removeAnnotation($(event.target).closest('.answerAnnotation'))
      return false
    })

    function removeAnnotation($annotationElem) {
      // eslint-disable-line no-shadow
      const $answerText = $annotationElem.closest('.answerText')
      const annotationIndex = Number($annotationElem.data('index'))
      const annotations = answerAnnotationsRendering.get($answerText)
      const updatedAnnotations = _.without(annotations, annotations[annotationIndex])
      saveAnnotation(getAnswerId($answerText), updatedAnnotations)
      answerAnnotationsRendering.renderAnnotationsForElement($answerText, updatedAnnotations)
    }
  }

  function setupAnnotationAddition($containerElement) {
    preventDragSelectionFromOverlappingCensorAnswerText($containerElement)
    $containerElement
      .asEventStream('mouseup')
      .filter(hasTextSelectedInAnswerText)
      .map(() => {
        $('.remove-annotation-popup').remove()
        return getBrowserTextSelection().getRangeAt(0)
      })
      .filter((range) => {
        if (selectionHasNothingToUnderline(range)) {
          return false
        }
        const $container = $(range.commonAncestorContainer)
        return (
          !$container.hasClass('add-annotation-popup') &&
          ($container.hasClass('answerText') || $container.parents('div.answerText').toArray().length > 0) &&
          !$container.parents('.answer').hasClass('autograded')
        )
      })
      .flatMapLatest(openPopupFromRange)
      .onValue(addAnnotation)

    $containerElement
      .asEventStream('mousedown')
      .filter(
        (e) => !$(e.target).closest('.add-annotation-text').length && !$(e.target).closest('.annotation-message').length
      )
      .merge($containerElement.asEventStream('keyup').filter((e) => e.keyCode === ESC))
      .onValue(() => {
        getBrowserTextSelection().removeAllRanges()
        // Render annotations for all answers that have popup open. This clears the popup and annotation that was merged for rendering before opening popup.
        $('.add-annotation-popup').each((index, popup) => {
          answerAnnotationsRendering.renderAnnotationsForElement($(popup).closest('.answerText'))
        })
      })

    $containerElement
      .asEventStream('mousedown', 'img, .attachmentWrapper')
      .filter((e) => e.button === 0)
      .doAction(() => {
        isMouseDown = true
        return false
      })
      .flatMapLatest((se) => {
        const $target = $(se.currentTarget)
        // We have attached `mousedown` to `.attachmentWrapper` as well, so
        // the target isn't necessarily the image itself.
        const $image = $target.is('img') ? $target : $target.find('img')
        const $targetAnswerText = $image.on('dragstart', false).closest('.answerText')
        const attachmentIndex = $targetAnswerText.find('img').index($image)
        // The event will come from the topmost `.answerText`, which isn't
        // necessarily the correct one. So we need to find the correct
        // `.answerText` to add the annotation to.
        const $answerText = $targetAnswerText
          .parent()
          .children('.answerText' + (isCensor ? '.is_censor' : '.is_pregrading'))
        const $attachmentWrapper = answerAnnotationsRendering.wrapAttachment(
          $answerText.find(`img:eq(${attachmentIndex})`)
        )
        let $shape

        const bbox = $attachmentWrapper[0].getBoundingClientRect()
        const startX = clamp((se.clientX - bbox.left) / bbox.width)
        const startY = clamp((se.clientY - bbox.top) / bbox.height)

        const lineThresholdPx = 10

        const mouseUpE = $(window)
          .asEventStream('mouseup')
          .doAction(() => {
            isMouseDown = false
          })

        return $(window)
          .asEventStream('mousemove')
          .takeUntil(mouseUpE)
          .flatMapLatest((e) => {
            const currentX = clamp((e.clientX - bbox.left) / bbox.width)
            const currentY = clamp((e.clientY - bbox.top) / bbox.height)
            const isVerticalLine = Math.abs(se.clientX - e.clientX) <= lineThresholdPx
            const isHorizontalLine = Math.abs(se.clientY - e.clientY) <= lineThresholdPx
            const type = isVerticalLine || isHorizontalLine ? 'line' : 'rect'

            switch (type) {
              case 'rect': {
                return {
                  type: 'rect',
                  attachmentIndex,
                  x: Math.min(startX, currentX),
                  y: Math.min(startY, currentY),
                  width: Math.abs(currentX - startX),
                  height: Math.abs(currentY - startY),
                }
              }
              case 'line': {
                return {
                  type: 'line',
                  attachmentIndex,
                  x1: isVerticalLine ? startX : Math.min(startX, currentX),
                  y1: isHorizontalLine ? startY : Math.min(startY, currentY),
                  x2: isVerticalLine ? startX : Math.max(startX, currentX),
                  y2: isHorizontalLine ? startY : Math.max(startY, currentY),
                }
              }
            }
          })
          .doAction((shape) => {
            const doAppend = $shape == null
            $shape = answerAnnotationsRendering.renderShape(shape, $shape)
            if (doAppend) {
              $attachmentWrapper.append($shape)
            }
          })
          .last()
          .flatMapLatest((shape) => {
            const $answerText = $attachmentWrapper.closest('.answerText')
            const attachmentWrapperPosition = $attachmentWrapper.position()
            const shapePosition = $shape.position()
            const popupCss = {
              position: 'absolute',
              top: attachmentWrapperPosition.top + shapePosition.top + $shape.height() + 4,
              left: attachmentWrapperPosition.left + shapePosition.left,
            }
            return openPopup($answerText, shape, '', popupCss)
          })
      })
      .onValue(addAnnotation)

    function clamp(n) {
      return _.clamp(n, 0, 1)
    }

    function selectionHasNothingToUnderline(range) {
      const contents = range.cloneContents()
      let hasImages = _.includes(
        _.toArray(contents.childNodes).map((x) => x.tagName),
        'IMG'
      )
      return contents.textContent.length === 0 && !hasImages
    }

    function preventDragSelectionFromOverlappingCensorAnswerText($containerElem) {
      if (isCensor) {
        $containerElem.on('mousedown mouseup', (e) => {
          $('.answerText.is_censor .answerAnnotation').toggleClass('no-mouse', e.type === 'mousedown')
        })
      }
    }

    function getPopupCss(range) {
      const container = $(range.startContainer).closest('.answer-text-container').get(0)
      const boundingRect = range.getBoundingClientRect()
      if (container) {
        const containerRect = container.getBoundingClientRect()
        return {
          position: 'absolute',
          top: boundingRect.bottom - containerRect.top + 10,
          left: boundingRect.left - containerRect.left,
        }
      } else {
        return {
          position: 'absolute',
          top: 0,
          left: 0,
        }
      }
    }

    function openPopupFromRange(range) {
      const popupCss = getPopupCss(range)

      let $answerText = $(range.startContainer).closest('.answerText')
      const annotationPos = answerAnnotationsRendering.calculatePosition($answerText, range)

      if (isCensor && !$answerText.hasClass('is_censor')) {
        // render annotations to censor answer text element even if event cought via double click
        $answerText = $(range.startContainer).closest('.answer').find('.answerText.is_censor')
      }

      const messages = answerAnnotationsRendering.getOverlappingMessages(
        $answerText,
        annotationPos.startIndex,
        annotationPos.length
      )
      const renderedMessages = messages.reduceRight((msg, str) => `${str} / ${msg}`, '')

      getBrowserTextSelection().removeAllRanges()

      // Merge and render annotation to show what range it will contain if annotation gets added
      // Merged annotation not saved yet, so on cancel previous state is rendered
      const mergedAnnotations = answerAnnotationsRendering.mergeAnnotation($answerText, annotationPos)
      answerAnnotationsRendering.renderGivenAnnotations($answerText, mergedAnnotations)

      return openPopup($answerText, annotationPos, renderedMessages, popupCss)
    }

    function openPopup($answerText, annotation, message, popupCss) {
      const $popup = localize(
        $(
          '<div class="popup add-annotation-popup"><input class="add-annotation-text" type="text" value=""/><i class="fa fa-comment"></i><button data-i18n="arpa.annotate">Merkitse</button></div>'
        )
      )
      $popup.get(0).firstChild.value = message
      $answerText.append($popup)
      $popup.css(popupCss)
      $popup.find('input').focus()

      return $popup
        .find('button')
        .asEventStream('mousedown')
        .merge($popup.asEventStream('keyup').filter((e) => e.keyCode === ENTER))
        .map(() => {
          const message = $('.add-annotation-text').val().trim()
          return {
            $answerText,
            annotation: _.assign({}, annotation, { message }),
          }
        })
    }

    function addAnnotation(annotationData) {
      if (annotationData.annotation.length > 0 || annotationData.annotation.type != null) {
        const data = answerAnnotationsRendering.get(annotationData.$answerText)
        const annotations = data
          ? answerAnnotationsRendering.mergeAnnotation(annotationData.$answerText, annotationData.annotation)
          : [annotationData.annotation]
        saveAnnotation(getAnswerId(annotationData.$answerText), annotations)
        answerAnnotationsRendering.renderAnnotationsForElement(annotationData.$answerText, annotations)
      }
    }
  }
}

export function setupAnnotationDisplaying($answers, isCensor) {
  let fadeOutDelayTimeout = void 0
  $answers.on('mouseenter', '.answerAnnotation', (event) => {
    const $annotation = $(event.target)
    if (isMouseDown || addAnnotationPopupIsVisible() || hasTextSelectedInAnswerText()) {
      return
    }
    clearTimeout(fadeOutDelayTimeout)
    if (popupAlreadyShownForCurrentAnnotation(event)) {
      $annotation.find('.remove-annotation-popup').stop().show().css({ opacity: 1 })
    } else {
      clearAllRemovePopups()
      renderRemovePopup(event)
    }
  })
  $answers.on('mouseleave', '.answerAnnotation', (event) => {
    fadeOutDelayTimeout = setTimeout(() => {
      removeRemovePopup(event)
    }, 400)
  })

  function popupAlreadyShownForCurrentAnnotation(event) {
    const mouseOverAnnotationElem = $(event.target).closest('.answerAnnotation')[0]
    const popupsCurrentAnnotationElem = $('.remove-annotation-popup:visible').closest('.answerAnnotation')[0]
    return (
      event &&
      mouseOverAnnotationElem &&
      popupsCurrentAnnotationElem &&
      mouseOverAnnotationElem.isEqualNode(popupsCurrentAnnotationElem)
    )
  }

  function addAnnotationPopupIsVisible() {
    return $('.add-annotation-popup').is(':visible')
  }

  function clearAllRemovePopups() {
    $('.remove-annotation-popup').remove()
  }

  function renderRemovePopup(event) {
    const $annotation = $(event.currentTarget)
    const $popup = popupWithMessage($annotation, $annotation.attr('data-message'))
    $annotation.append($popup)

    // Calculate limits for preventing overflow on either side
    const left = inlineLeftOffset(event.currentTarget)
    const pageMargin = 8
    const leftLimit = -left + pageMargin
    const rightLimit = $(window).width() - left - $popup.outerWidth() - pageMargin

    const css = {
      left: Math.min(Math.max(mouseOffsetLeft(event) - $popup.outerWidth() / 2, leftLimit), rightLimit),
    }

    $popup.css(css)
    $popup.fadeIn()
  }

  function removeRemovePopup(event) {
    const $annotation = $(event.target).closest('.answerAnnotation')
    const popup = $annotation.find('.remove-annotation-popup')
    popup.fadeOut(100, () => {
      popup.remove()
    })
  }

  function popupWithMessage($annotation, message) {
    const $messageContainer = $(
      '<span class="popup remove-annotation-popup"><span class="annotation-message"></span></span>'
    )
    $messageContainer.find('.annotation-message').text(message || '-')
    if (isAllowedToRemoveAnnotation($annotation)) {
      $messageContainer.append('<i class="fa fa-times-circle remove-annotation-area"></i>')
    }
    return $messageContainer
  }

  function isAllowedToRemoveAnnotation($annotation) {
    return isPregradingAndScoringEnabled() || isCensorAndOwnAnnotation()

    function isPregradingAndScoringEnabled() {
      const $body = $('body')
      return $body.hasClass('is_pregrading') && !$body.hasClass('preview')
    }

    function isCensorAndOwnAnnotation() {
      return isCensor && $annotation.closest('.answerText').hasClass('is_censor')
    }
  }

  function inlineLeftOffset(element) {
    return $(element).offsetParent().offset().left + element.offsetLeft
  }

  function mouseOffsetLeft(mousemove) {
    const annotation = mousemove.target
    const annotationLeftOffsetFromPageEdge = inlineLeftOffset(annotation)

    return mousemove.pageX - annotationLeftOffsetFromPageEdge
  }
}

function getAnswerId($answerText) {
  return $answerText.closest('.answer').attr('data-answer-id')
}

function getBrowserTextSelection() {
  return typeof window.getSelection !== 'undefined'
    ? window.getSelection()
    : typeof document.selection !== 'undefined' && document.selection.type === 'Text'
    ? document.selection
    : undefined
}

function hasTextSelectedInAnswerText() {
  const selection = getBrowserTextSelection()
  return (
    selection && selectionInAnswerText(selection) && (isRangeSelection(selection) || textSelectedInRange(selection))
  )

  function selectionInAnswerText(sel) {
    if (sel.type === 'None' || sel.type === 'Caret' || sel.rangeCount === 0) return false
    const $startContainer = $(sel.getRangeAt(0).startContainer)
    return (
      sel.rangeCount &&
      $startContainer.closest('.answerText').length === 1 &&
      $startContainer.closest('.remove-annotation-popup').length === 0
    )
  }

  function isRangeSelection(sel) {
    return _.get(sel, 'type', '') === 'Range'
  }

  function textSelectedInRange(sel) {
    const range = sel.getRangeAt(0)
    return (
      _.get(sel, 'rangeCount', 0) > 0 &&
      (range.toString().length > 0 || isParentContainer(range.startContainer) || isParentContainer(range.endContainer))
    )
  }

  function isParentContainer(container) {
    return container && container.classList && container.classList.contains('answerText')
  }
}
