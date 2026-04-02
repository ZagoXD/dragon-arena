import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import './ReportModal.css'

export type ReportReasonCode =
  | 'cheating'
  | 'griefing'
  | 'feeding'
  | 'toxicity'
  | 'spam'
  | 'offensive_name'
  | 'other'

interface Props {
  open: boolean
  busy: boolean
  error: string | null
  initialNickname?: string
  initialTag?: string
  onClose: () => void
  onSubmit: (nickname: string, tag: string, reasonCodes: ReportReasonCode[], description: string) => void
}

const REPORT_REASON_CODES: ReportReasonCode[] = [
  'cheating',
  'griefing',
  'feeding',
  'toxicity',
  'spam',
  'offensive_name',
  'other',
]

export function ReportModal({
  open,
  busy,
  error,
  initialNickname = '',
  initialTag = '',
  onClose,
  onSubmit,
}: Props) {
  const { t } = useTranslation()
  const [nickname, setNickname] = useState(initialNickname)
  const [tag, setTag] = useState(initialTag)
  const [description, setDescription] = useState('')
  const [reasonCodes, setReasonCodes] = useState<ReportReasonCode[]>([])

  useEffect(() => {
    if (!open) {
      return
    }

    setNickname(initialNickname)
    setTag(initialTag)
    setDescription('')
    setReasonCodes([])
  }, [initialNickname, initialTag, open])

  const canSubmit = useMemo(() => (
    nickname.trim().length > 0
    && tag.trim().length > 0
    && description.trim().length > 0
    && reasonCodes.length > 0
    && reasonCodes.length <= 3
  ), [description, nickname, reasonCodes, tag])

  const toggleReason = (reasonCode: ReportReasonCode) => {
    setReasonCodes(current => {
      if (current.includes(reasonCode)) {
        return current.filter(item => item !== reasonCode)
      }
      if (current.length >= 3) {
        return current
      }
      return [...current, reasonCode]
    })
  }

  if (!open) {
    return null
  }

  return (
    <div className="report-modal__backdrop" onClick={onClose}>
      <div className="report-modal" onClick={event => event.stopPropagation()}>
        <span className="report-modal__eyebrow">{t('report.eyebrow')}</span>
        <h3>{t('report.title')}</h3>
        <p>{t('report.subtitle')}</p>

        <div className="report-modal__target-grid">
          <input
            className="report-modal__input"
            value={nickname}
            onChange={event => setNickname(event.target.value)}
            placeholder={t('friends.nicknamePlaceholder')}
          />
          <input
            className="report-modal__input report-modal__input--tag"
            value={tag}
            onChange={event => setTag(event.target.value)}
            placeholder={t('friends.tagPlaceholder')}
          />
        </div>

        <div className="report-modal__reason-block">
          <span className="report-modal__label">{t('report.reasonLabel')}</span>
          <div className="report-modal__reasons">
            {REPORT_REASON_CODES.map(reasonCode => (
              <label key={reasonCode} className={`report-modal__checkbox ${reasonCodes.includes(reasonCode) ? 'is-selected' : ''}`}>
                <input
                  type="checkbox"
                  checked={reasonCodes.includes(reasonCode)}
                  onChange={() => toggleReason(reasonCode)}
                />
                <span>{t(`report.reasons.${reasonCode}`)}</span>
              </label>
            ))}
          </div>
          <small>{t('report.reasonHint', { count: reasonCodes.length, max: 3 })}</small>
        </div>

        <textarea
          className="report-modal__textarea"
          maxLength={500}
          value={description}
          onChange={event => setDescription(event.target.value)}
          placeholder={t('report.descriptionPlaceholder')}
        />

        {error && <div className="report-modal__error">{error}</div>}

        <div className="report-modal__actions">
          <button type="button" className="report-modal__ghost" onClick={onClose}>
            {t('report.cancel')}
          </button>
          <button
            type="button"
            className="report-modal__submit"
            disabled={busy || !canSubmit}
            onClick={() => onSubmit(nickname, tag, reasonCodes, description)}
          >
            {busy ? t('report.sending') : t('report.submit')}
          </button>
        </div>
      </div>
    </div>
  )
}
