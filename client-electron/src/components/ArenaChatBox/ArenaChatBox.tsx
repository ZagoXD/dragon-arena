import { KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArenaChatMessage } from '../../hooks/useSocket'
import './ArenaChatBox.css'

interface ReplyTarget {
  userId: number
  label: string
}

interface Props {
  messages: ArenaChatMessage[]
  localUserId: number | null
  replyTarget: ReplyTarget | null
  onSend: (body: string) => void
  onInputActiveChange: (active: boolean) => void
}

export function ArenaChatBox({
  messages,
  localUserId,
  replyTarget,
  onSend,
  onInputActiveChange,
}: Props) {
  const { t } = useTranslation()
  const [isInputActive, setIsInputActive] = useState(false)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const commandSuggestions = useMemo(() => ([
    {
      command: '/add',
      usage: '/add Nick#TAG',
      description: t('chat.arena.commands.add'),
    },
    {
      command: '/w',
      usage: '/w Nick#TAG mensagem',
      description: t('chat.arena.commands.whisper'),
    },
    {
      command: '/r',
      usage: '/r mensagem',
      description: t('chat.arena.commands.reply'),
    },
  ]), [t])

  const visibleMessages = useMemo(
    () => messages.slice(isInputActive ? -100 : -6),
    [isInputActive, messages],
  )
  const trimmedValue = value.trimStart()
  const showCommandSuggestions = isInputActive && trimmedValue.startsWith('/')
  const filteredCommandSuggestions = useMemo(() => {
    if (!showCommandSuggestions) {
      return []
    }

    const typedCommand = trimmedValue.split(/\s+/)[0].toLowerCase()
    return commandSuggestions.filter(suggestion => suggestion.command.startsWith(typedCommand))
  }, [commandSuggestions, showCommandSuggestions, trimmedValue])

  useEffect(() => {
    onInputActiveChange(isInputActive)
  }, [isInputActive, onInputActiveChange])

  useEffect(() => {
    if (!isInputActive) {
      return
    }

    inputRef.current?.focus()
  }, [isInputActive])

  useEffect(() => {
    if (!listRef.current) {
      return
    }

    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [visibleMessages, isInputActive])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent | globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const editingTextField = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA'

      if (event.key === 'Enter' && !isInputActive && !editingTextField) {
        event.preventDefault()
        setIsInputActive(true)
        return
      }

      if (event.key === 'Escape' && isInputActive) {
        event.preventDefault()
        setIsInputActive(false)
        setValue('')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isInputActive])

  const handleSubmit = () => {
    const nextValue = value.trim()
    if (!nextValue) {
      return
    }

    onSend(nextValue)
    setValue('')
    setIsInputActive(false)
  }

  return (
    <div className={`arena-chat-box ${isInputActive ? 'is-active' : ''}`}>
      <div ref={listRef} className="arena-chat-box__messages">
        {visibleMessages.map((message, index) => {
          const messageKey = `${message.createdAt}-${index}-${message.type}`
          const isLocalPublicMessage = message.type === 'public'
            && localUserId !== null
            && message.senderUserId === localUserId
          const label = message.type === 'public'
            ? (isLocalPublicMessage
              ? `${t('chat.arena.youLabel')}: `
              : `${message.senderNickname}${message.senderTag}: `)
            : message.type === 'whisper_in'
              ? `${t('chat.arena.whisperPrefix')} ${message.senderNickname}${message.senderTag}: `
              : message.type === 'whisper_out'
                ? `${t('chat.arena.whisperPrefix')} ${t('chat.arena.youLabel')} ${t('chat.arena.whisperOutLabel')} ${message.targetLabel}: `
                : ''

          return (
            <div key={messageKey} className={`arena-chat-box__line arena-chat-box__line--${message.type}`}>
              {label && <strong>{label}</strong>}
              <span>{message.body}</span>
            </div>
          )
        })}
      </div>

      {isInputActive && (
        <div className="arena-chat-box__input-shell">
          {filteredCommandSuggestions.length > 0 && (
            <div className="arena-chat-box__command-list">
              {filteredCommandSuggestions.map((suggestion) => (
                <div key={suggestion.command} className="arena-chat-box__command-item">
                  <div className="arena-chat-box__command-topline">
                    <strong>{suggestion.command}</strong>
                    <span>{suggestion.usage}</span>
                  </div>
                  <p>{suggestion.description}</p>
                </div>
              ))}
            </div>
          )}
          <input
            ref={inputRef}
            type="text"
            maxLength={400}
            value={value}
            placeholder={replyTarget ? t('chat.arena.placeholderReply', { target: replyTarget.label }) : t('chat.arena.placeholder')}
            onChange={event => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                handleSubmit()
                return
              }

              if (event.key === 'Tab' && replyTarget && value.trim().startsWith('/r')) {
                event.preventDefault()
                if (value.trim() === '/r') {
                  setValue(`/r ${replyTarget.label} `)
                }
              }
            }}
          />
        </div>
      )}
    </div>
  )
}
