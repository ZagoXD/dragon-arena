import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import './AdminScreen.css'

export interface AdminLookupResult {
  user: {
    id: number
    nickname: string
    tag: string
    username: string
    email: string
    role: string
    online: boolean
    alreadyFriends: boolean
  }
  profile: {
    userId: number
    level: number
    xp: number
    coins: number
  }
  activeBan: null | {
    id: number
    reason: string
    isPermanent: boolean
    createdAtMs: number
    bannedUntilMs: number
    bannedByDisplay: string
  }
}

interface Props {
  result: AdminLookupResult | null
  searchBusy: boolean
  actionBusy: boolean
  feedbackError: string | null
  feedbackInfo: string | null
  onSearch: (nickname: string, tag: string) => void
  onForceAddFriend: (targetUserId: number) => void
  onBan: (targetUserId: number, reason: string, durationMs: number | null, isPermanent: boolean) => void
  onUnban: (targetUserId: number) => void
}

const BAN_DURATION_OPTIONS = [
  { key: '1d', label: 'admin.banDurations.oneDay', durationMs: 24 * 60 * 60 * 1000 },
  { key: '2d', label: 'admin.banDurations.twoDays', durationMs: 2 * 24 * 60 * 60 * 1000 },
  { key: '1w', label: 'admin.banDurations.oneWeek', durationMs: 7 * 24 * 60 * 60 * 1000 },
  { key: '15d', label: 'admin.banDurations.fifteenDays', durationMs: 15 * 24 * 60 * 60 * 1000 },
  { key: '1m', label: 'admin.banDurations.oneMonth', durationMs: 30 * 24 * 60 * 60 * 1000 },
  { key: '3m', label: 'admin.banDurations.threeMonths', durationMs: 90 * 24 * 60 * 60 * 1000 },
  { key: '1y', label: 'admin.banDurations.oneYear', durationMs: 365 * 24 * 60 * 60 * 1000 },
  { key: 'forever', label: 'admin.banDurations.forever', durationMs: null },
] as const

export function AdminScreen({
  result,
  searchBusy,
  actionBusy,
  feedbackError,
  feedbackInfo,
  onSearch,
  onForceAddFriend,
  onBan,
  onUnban,
}: Props) {
  const { t, i18n } = useTranslation()
  const [nickname, setNickname] = useState('')
  const [tag, setTag] = useState('')
  const [banModalOpen, setBanModalOpen] = useState(false)
  const [banReason, setBanReason] = useState('')
  const [banDurationKey, setBanDurationKey] = useState<(typeof BAN_DURATION_OPTIONS)[number]['key']>('1d')
  const [unbanConfirmOpen, setUnbanConfirmOpen] = useState(false)

  const activeDuration = useMemo(
    () => BAN_DURATION_OPTIONS.find(option => option.key === banDurationKey) || BAN_DURATION_OPTIONS[0],
    [banDurationKey]
  )

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSearch(nickname, tag)
  }

  const formattedBanUntil = result?.activeBan && !result.activeBan.isPermanent && result.activeBan.bannedUntilMs > 0
    ? new Intl.DateTimeFormat(i18n.language, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(result.activeBan.bannedUntilMs)
    : null

  return (
    <div className="admin-screen">
      <header className="admin-screen__header">
        <span className="admin-screen__eyebrow">{t('admin.eyebrow')}</span>
        <h1>{t('admin.title')}</h1>
        <p>{t('admin.subtitle')}</p>
      </header>

      <section className="admin-screen__search-card">
        <form className="admin-screen__search-form" onSubmit={handleSubmit}>
          <input
            className="admin-screen__input"
            value={nickname}
            onChange={event => setNickname(event.target.value)}
            placeholder={t('friends.nicknamePlaceholder')}
          />
          <input
            className="admin-screen__input admin-screen__input--tag"
            value={tag}
            onChange={event => setTag(event.target.value)}
            placeholder={t('friends.tagPlaceholder')}
          />
          <button type="submit" className="admin-screen__search-button" disabled={searchBusy}>
            {searchBusy ? t('admin.searching') : t('admin.search')}
          </button>
        </form>

        {(feedbackError || feedbackInfo) && (
          <div className={`admin-screen__feedback ${feedbackError ? 'is-error' : 'is-success'}`}>
            {feedbackError || feedbackInfo}
          </div>
        )}
      </section>

      {result && (
        <section className="admin-screen__result-card">
          <div className="admin-screen__result-topline">
            <div>
              <span className="admin-screen__label">{t('admin.resultLabel')}</span>
              <h2>{`${result.user.nickname}${result.user.tag}`}</h2>
            </div>
            <span className={`admin-screen__presence ${result.user.online ? 'is-online' : 'is-offline'}`}>
              {result.user.online ? t('friends.online') : t('friends.offline')}
            </span>
          </div>

          <div className="admin-screen__grid">
            <article className="admin-screen__stat"><span>{t('admin.username')}</span><strong>{result.user.username}</strong></article>
            <article className="admin-screen__stat"><span>{t('admin.email')}</span><strong>{result.user.email}</strong></article>
            <article className="admin-screen__stat"><span>{t('admin.coins')}</span><strong>{result.profile.coins}</strong></article>
            <article className="admin-screen__stat"><span>{t('admin.role')}</span><strong>{result.user.role}</strong></article>
          </div>

          <div className="admin-screen__moderation">
            <span className="admin-screen__label">{t('admin.moderationStatus')}</span>
            {result.activeBan ? (
              <div className="admin-screen__ban-status is-active">
                <strong>
                  {result.activeBan.isPermanent
                    ? t('admin.banActivePermanent')
                    : t('admin.banActiveUntil', { date: formattedBanUntil || '-' })}
                </strong>
                <span>{t('admin.banReasonLabel', { reason: result.activeBan.reason })}</span>
                <span>{t('admin.banByLabel', { admin: result.activeBan.bannedByDisplay || '-' })}</span>
              </div>
            ) : (
              <div className="admin-screen__ban-status">{t('admin.noActiveBan')}</div>
            )}
          </div>

          <div className="admin-screen__actions">
            <button
              type="button"
              className="admin-screen__action"
              disabled={actionBusy || result.user.alreadyFriends}
              onClick={() => onForceAddFriend(result.user.id)}
            >
              {result.user.alreadyFriends ? t('admin.alreadyFriends') : t('admin.forceAddFriend')}
            </button>

            {!result.activeBan ? (
              <button
                type="button"
                className="admin-screen__action admin-screen__action--danger"
                disabled={actionBusy}
                onClick={() => setBanModalOpen(true)}
              >
                {t('admin.banAction')}
              </button>
            ) : (
              <button
                type="button"
                className="admin-screen__action admin-screen__action--warn"
                disabled={actionBusy}
                onClick={() => setUnbanConfirmOpen(true)}
              >
                {t('admin.unbanAction')}
              </button>
            )}
          </div>
        </section>
      )}

      {banModalOpen && result && (
        <div className="admin-screen__modal-backdrop" onClick={() => setBanModalOpen(false)}>
          <div className="admin-screen__modal" onClick={event => event.stopPropagation()}>
            <span className="admin-screen__modal-eyebrow">{t('admin.banModalEyebrow')}</span>
            <h3>{t('admin.banModalTitle')}</h3>
            <p>{t('admin.banModalTarget', { name: `${result.user.nickname}${result.user.tag}` })}</p>

            <textarea
              className="admin-screen__textarea"
              value={banReason}
              onChange={event => setBanReason(event.target.value)}
              placeholder={t('admin.reasonPlaceholder')}
            />

            <select
              className="admin-screen__select"
              value={banDurationKey}
              onChange={event => setBanDurationKey(event.target.value as (typeof BAN_DURATION_OPTIONS)[number]['key'])}
            >
              {BAN_DURATION_OPTIONS.map(option => (
                <option key={option.key} value={option.key}>
                  {t(option.label)}
                </option>
              ))}
            </select>

            <div className="admin-screen__modal-actions">
              <button type="button" className="admin-screen__ghost" onClick={() => setBanModalOpen(false)}>
                {t('admin.cancel')}
              </button>
              <button
                type="button"
                className="admin-screen__danger"
                disabled={actionBusy || !banReason.trim()}
                onClick={() => {
                  onBan(result.user.id, banReason, activeDuration.durationMs, activeDuration.durationMs === null)
                  setBanModalOpen(false)
                  setBanReason('')
                  setBanDurationKey('1d')
                }}
              >
                {t('admin.confirmBan')}
              </button>
            </div>
          </div>
        </div>
      )}

      {unbanConfirmOpen && result && (
        <div className="admin-screen__modal-backdrop" onClick={() => setUnbanConfirmOpen(false)}>
          <div className="admin-screen__modal admin-screen__modal--compact" onClick={event => event.stopPropagation()}>
            <span className="admin-screen__modal-eyebrow">{t('admin.unbanModalEyebrow')}</span>
            <h3>{t('admin.unbanModalTitle')}</h3>
            <p>{t('admin.unbanModalTarget', { name: `${result.user.nickname}${result.user.tag}` })}</p>
            <div className="admin-screen__modal-actions">
              <button type="button" className="admin-screen__ghost" onClick={() => setUnbanConfirmOpen(false)}>
                {t('admin.cancel')}
              </button>
              <button
                type="button"
                className="admin-screen__warn"
                disabled={actionBusy}
                onClick={() => {
                  onUnban(result.user.id)
                  setUnbanConfirmOpen(false)
                }}
              >
                {t('admin.confirmUnban')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
