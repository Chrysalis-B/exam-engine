import { faPlay } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import classNames from 'classnames'
import React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { RestrictedAudioId } from '../../../index'
import { useExamTranslation } from '../../../i18n'
import { playAudio } from '../../../store/audio/actions'
import { getAudioState, getDurationRemaining, getPlaybackTimesRemaining } from '../../../store/selectors'

function RestrictedAudioPlayer({
  src,
  restrictedAudioId,
  duration,
  times,
  labelId,
}: {
  src: string
  restrictedAudioId: RestrictedAudioId
  duration: number
  times: number
  labelId: string
}) {
  const audioState = useSelector(getAudioState(src, restrictedAudioId))
  const durationRemaining = useSelector(getDurationRemaining(src, restrictedAudioId))
  const playbackTimesRemaining = useSelector(getPlaybackTimesRemaining(restrictedAudioId, times))
  const { i18n } = useExamTranslation()
  const dispatch = useDispatch()
  const playing = audioState === 'playing'
  const stopped = audioState === 'stopped'
  const disabled = !stopped || playbackTimesRemaining === 0
  const remainingLabelId = `audio-remaining-${restrictedAudioId}`
  const labels = playing ? [] : [remainingLabelId, labelId]

  return (
    <div
      className={classNames(
        'restricted-audio-player e-column e-column--narrow e-columns e-columns--inline e-columns--center-v e-pad-1',
        { 'restricted-audio-player--disabled': disabled }
      )}
      lang={i18n.language}
    >
      <button
        className={classNames('restricted-audio-player__play e-column e-column--narrow', {
          'restricted-audio-player__play--playing': playing,
        })}
        disabled={disabled}
        onClick={() => stopped && dispatch(playAudio({ src, restrictedAudioId, duration }))}
        aria-labelledby={labels.join(' ')}
      >
        {!playing && <FontAwesomeIcon icon={faPlay} fixedWidth />}
      </button>
      <span className="restricted-audio-player__duration e-column e-text-right" id={remainingLabelId}>
        {formatDuration(durationRemaining ?? duration)}
      </span>
    </div>
  )
}

export default React.memo(RestrictedAudioPlayer)

function formatDuration(duration: number): string {
  const minutes = Math.floor(duration / 60)
  const seconds = duration % 60

  return `${padWithZeroes(minutes)}:${padWithZeroes(seconds)}`
}

function padWithZeroes(num: number) {
  return num.toString().padStart(2, '0')
}
