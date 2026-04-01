import { CSSProperties, FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import './PrivateChatPanel.css'

export interface PrivateChatMessage {
  id: number
  direction: 'in' | 'out'
  body: string
  createdAt: number
  read: boolean
}

interface Props {
  friendLabel: string
  online: boolean
  unreadCount: number
  minimized: boolean
  messages: PrivateChatMessage[]
  sendBusy?: boolean
  style?: CSSProperties
  onToggleMinimized: () => void
  onClose: () => void
  onSend: (body: string) => void
}

export function PrivateChatPanel({
  friendLabel,
  online,
  unreadCount,
  minimized,
  messages,
  sendBusy = false,
  style,
  onToggleMinimized,
  onClose,
  onSend,
}: Props) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const listRef = useRef<HTMLDivElement | null>(null)

  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => a.createdAt - b.createdAt),
    [messages],
  )

  useEffect(() => {
    if (minimized || !listRef.current) {
      return
    }

    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [minimized, sortedMessages])

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const nextValue = value.trim()
    if (!nextValue) {
      return
    }

    onSend(nextValue)
    setValue('')
  }

  return (
    <aside className={`private-chat-panel ${minimized ? 'is-minimized' : ''}`} style={style}>
      <header className="private-chat-panel__header">
        <div className="private-chat-panel__identity">
          <span className={`private-chat-panel__status ${online ? 'is-online' : 'is-offline'}`} />
          <div>
            <strong>{friendLabel}</strong>
            <span>{online ? t('chat.private.online') : t('chat.private.offline')}</span>
          </div>
        </div>

        <div className="private-chat-panel__controls">
          {unreadCount > 0 && <span className="private-chat-panel__badge">{unreadCount}</span>}
          <button type="button" onClick={onToggleMinimized} aria-label={t('chat.private.minimize')}>
            {minimized ? '▢' : '—'}
          </button>
          <button type="button" onClick={onClose} aria-label={t('chat.private.close')}>
            ×
          </button>
        </div>
      </header>

      {!minimized && (
        <>
          <div ref={listRef} className="private-chat-panel__messages">
            {sortedMessages.length === 0 ? (
              <div className="private-chat-panel__empty">{t('chat.private.empty')}</div>
            ) : (
              sortedMessages.map(message => (
                <div
                  key={message.id}
                  className={`private-chat-panel__message private-chat-panel__message--${message.direction}`}
                >
                  <p>{message.body}</p>
                </div>
              ))
            )}
          </div>

          <form className="private-chat-panel__composer" onSubmit={handleSubmit}>
            <input
              type="text"
              value={value}
              maxLength={400}
              placeholder={t('chat.private.placeholder')}
              onChange={event => setValue(event.target.value)}
            />
            <button type="submit" disabled={sendBusy}>
              {t('chat.private.send')}
            </button>
          </form>
        </>
      )}
    </aside>
  )
}
