import { FormEvent, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import './FriendListPanel.css'

export interface FriendListEntry {
  userId: number
  nickname: string
  tag: string
  online: boolean
}

export interface IncomingFriendRequest {
  requestId: number
  requesterId: number
  nickname: string
  tag: string
}

export interface OutgoingFriendRequest {
  requestId: number
  addresseeId: number
  nickname: string
  tag: string
}

interface Props {
  expanded: boolean
  unreadCount: number
  friends: FriendListEntry[]
  privateUnreadByFriendId?: Record<number, number>
  incomingRequests: IncomingFriendRequest[]
  outgoingRequests: OutgoingFriendRequest[]
  sendBusy?: boolean
  sendError?: string | null
  sendInfo?: string | null
  actionBusyRequestId?: number | null
  onToggleExpanded: () => void
  onSendRequest: (nickname: string, tag: string) => void
  onRespondRequest: (requestId: number, action: 'accept' | 'reject') => void
  onCancelOutgoingRequest: (requestId: number) => void
  onRemoveFriend: (friendUserId: number) => void
  onOpenChat: (friend: FriendListEntry) => void
}

export function FriendListPanel({
  expanded,
  unreadCount,
  friends,
  privateUnreadByFriendId = {},
  incomingRequests,
  outgoingRequests,
  sendBusy = false,
  sendError,
  sendInfo,
  actionBusyRequestId = null,
  onToggleExpanded,
  onSendRequest,
  onRespondRequest,
  onCancelOutgoingRequest,
  onRemoveFriend,
  onOpenChat,
}: Props) {
  const { t } = useTranslation()
  const [nickname, setNickname] = useState('')
  const [tag, setTag] = useState('')
  const [pendingModalOpen, setPendingModalOpen] = useState(false)
  const [friendMenu, setFriendMenu] = useState<{ x: number, y: number, friend: FriendListEntry } | null>(null)
  const [removeFriendTarget, setRemoveFriendTarget] = useState<FriendListEntry | null>(null)

  const visibleRequests = useMemo(() => incomingRequests.slice(0, 2), [incomingRequests])

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    onSendRequest(nickname.trim(), tag.trim().toUpperCase())
  }

  const overlayRoot = typeof document !== 'undefined' ? document.body : null

  return (
    <aside className={`friend-panel ${expanded ? 'is-expanded' : 'is-collapsed'}`}>
      <button type="button" className="friend-panel__toggle" onClick={onToggleExpanded}>
        <span>{t('friends.title')}</span>
        {unreadCount > 0 && <span className="friend-panel__badge">{unreadCount}</span>}
        <span className={`friend-panel__chevron ${expanded ? 'is-open' : ''}`}>⌃</span>
      </button>

      {expanded && (
        <div className="friend-panel__body">
          <form className="friend-panel__request-form" onSubmit={handleSubmit}>
            <div className="friend-panel__inputs">
              <input
                className="friend-panel__input"
                type="text"
                placeholder={t('friends.nicknamePlaceholder')}
                value={nickname}
                maxLength={20}
                onChange={event => setNickname(event.target.value)}
              />
              <input
                className="friend-panel__input friend-panel__input--tag"
                type="text"
                placeholder={t('friends.tagPlaceholder')}
                value={tag}
                maxLength={4}
                onChange={event => setTag(event.target.value.startsWith('#') ? event.target.value : `#${event.target.value.replace(/^#/, '')}`)}
              />
            </div>
            <div className="friend-panel__actions-row">
              <button type="submit" className={`friend-panel__send ${sendBusy ? 'is-loading' : ''}`} disabled={sendBusy}>
                {sendBusy && <span className="friend-panel__spinner" aria-hidden="true" />}
                <span>{t('friends.sendRequest')}</span>
              </button>
              <button
                type="button"
                className="friend-panel__pending-button"
                onClick={() => setPendingModalOpen(true)}
              >
                <span>{t('friends.pendingButton')}</span>
                {outgoingRequests.length > 0 && (
                  <span className="friend-panel__pending-badge">{outgoingRequests.length}</span>
                )}
              </button>
            </div>
          </form>

          {(sendError || sendInfo) && (
            <div className={`friend-panel__feedback ${sendError ? 'is-error' : 'is-success'}`}>
              {sendError || sendInfo}
            </div>
          )}

          <div className="friend-panel__requests">
            {visibleRequests.map(request => (
              <div key={request.requestId} className="friend-panel__request-card">
                <span className="friend-panel__request-eyebrow">{t('friends.requestTitle')}</span>
                <strong className="friend-panel__request-name">{`${request.nickname}${request.tag}`}</strong>
                <p className="friend-panel__request-text">{t('friends.requestText')}</p>
                <div className="friend-panel__request-actions">
                  <button
                    type="button"
                    className="friend-panel__action friend-panel__action--accept"
                    disabled={actionBusyRequestId === request.requestId}
                    onClick={() => onRespondRequest(request.requestId, 'accept')}
                  >
                    {t('friends.accept')}
                  </button>
                  <button
                    type="button"
                    className="friend-panel__action friend-panel__action--reject"
                    disabled={actionBusyRequestId === request.requestId}
                    onClick={() => onRespondRequest(request.requestId, 'reject')}
                  >
                    {t('friends.reject')}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="friend-panel__list">
            {friends.length === 0 ? (
              <div className="friend-panel__empty">{t('friends.empty')}</div>
            ) : (
              friends.map(friend => (
                <div
                  key={`${friend.userId}-${friend.tag}`}
                  className="friend-panel__friend"
                  onDoubleClick={() => onOpenChat(friend)}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    setFriendMenu({ x: event.clientX, y: event.clientY, friend })
                  }}
                >
                  <span className={`friend-panel__status ${friend.online ? 'is-online' : 'is-offline'}`} />
                  {(privateUnreadByFriendId[friend.userId] || 0) > 0 && (
                    <span className="friend-panel__friend-badge">{privateUnreadByFriendId[friend.userId]}</span>
                  )}
                  <div className="friend-panel__friend-meta">
                    <strong>{`${friend.nickname}${friend.tag}`}</strong>
                    <span>{friend.online ? t('friends.online') : t('friends.offline')}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {overlayRoot && expanded && pendingModalOpen && createPortal(
        <div className="friend-panel__modal-backdrop" onClick={() => setPendingModalOpen(false)}>
          <div
            className="friend-panel__modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="friend-panel-pending-title"
            onClick={event => event.stopPropagation()}
          >
            <div className="friend-panel__modal-header">
              <div>
                <span className="friend-panel__modal-eyebrow">{t('friends.pendingEyebrow')}</span>
                <h3 id="friend-panel-pending-title" className="friend-panel__modal-title">
                  {t('friends.pendingTitle')}
                </h3>
              </div>
              <button
                type="button"
                className="friend-panel__modal-close"
                onClick={() => setPendingModalOpen(false)}
                aria-label={t('friends.pendingClose')}
              >
                ×
              </button>
            </div>

            <div className="friend-panel__modal-list">
              {outgoingRequests.length === 0 ? (
                <div className="friend-panel__modal-empty">{t('friends.pendingEmpty')}</div>
              ) : (
                outgoingRequests.map(request => (
                  <div key={request.requestId} className="friend-panel__modal-row">
                    <div className="friend-panel__modal-meta">
                      <strong>{`${request.nickname}${request.tag}`}</strong>
                      <span>{t('friends.pendingWaiting')}</span>
                    </div>
                    <button
                      type="button"
                      className="friend-panel__cancel"
                      disabled={actionBusyRequestId === request.requestId}
                      onClick={() => onCancelOutgoingRequest(request.requestId)}
                      aria-label={t('friends.pendingCancel')}
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>,
        overlayRoot,
      )}

      {overlayRoot && expanded && friendMenu && createPortal(
        <div className="friend-panel__context-backdrop" onClick={() => setFriendMenu(null)}>
          <div
            className="friend-panel__context-menu"
            style={{ left: friendMenu.x, top: friendMenu.y }}
            onClick={event => event.stopPropagation()}
          >
            <button
              type="button"
              className="friend-panel__context-item"
              onClick={() => {
                onOpenChat(friendMenu.friend)
                setFriendMenu(null)
              }}
            >
              {t('friends.messageAction')}
            </button>
            <button
              type="button"
              className="friend-panel__context-item friend-panel__context-item--danger"
              onClick={() => {
                setRemoveFriendTarget(friendMenu.friend)
                setFriendMenu(null)
              }}
            >
              {t('friends.removeAction')}
            </button>
          </div>
        </div>,
        overlayRoot,
      )}

      {overlayRoot && expanded && removeFriendTarget && createPortal(
        <div className="friend-panel__modal-backdrop" onClick={() => setRemoveFriendTarget(null)}>
          <div
            className="friend-panel__modal friend-panel__modal--compact"
            role="dialog"
            aria-modal="true"
            aria-labelledby="friend-panel-remove-title"
            onClick={event => event.stopPropagation()}
          >
            <div className="friend-panel__modal-header">
              <div>
                <span className="friend-panel__modal-eyebrow">{t('friends.removeEyebrow')}</span>
                <h3 id="friend-panel-remove-title" className="friend-panel__modal-title">
                  {t('friends.removeTitle')}
                </h3>
              </div>
              <button
                type="button"
                className="friend-panel__modal-close"
                onClick={() => setRemoveFriendTarget(null)}
                aria-label={t('friends.removeCancel')}
              >
                ×
              </button>
            </div>

            <p className="friend-panel__modal-copy">
              {t('friends.removeText', { name: `${removeFriendTarget.nickname}${removeFriendTarget.tag}` })}
            </p>

            <div className="friend-panel__confirm-actions">
              <button
                type="button"
                className="friend-panel__confirm-button"
                onClick={() => setRemoveFriendTarget(null)}
              >
                {t('friends.removeCancel')}
              </button>
              <button
                type="button"
                className="friend-panel__confirm-button friend-panel__confirm-button--danger"
                disabled={actionBusyRequestId === removeFriendTarget.userId}
                onClick={() => {
                  onRemoveFriend(removeFriendTarget.userId)
                  setRemoveFriendTarget(null)
                }}
              >
                {t('friends.removeConfirm')}
              </button>
            </div>
          </div>
        </div>,
        overlayRoot,
      )}
    </aside>
  )
}
