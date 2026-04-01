import { useTranslation } from 'react-i18next'
import { FriendListEntry, FriendListPanel, IncomingFriendRequest, OutgoingFriendRequest } from '../FriendListPanel/FriendListPanel'
import { PrivateChatMessage, PrivateChatPanel } from '../PrivateChatPanel/PrivateChatPanel'
import './HomeScreen.css'

interface OpenPrivateChat {
  friend: FriendListEntry
  messages: PrivateChatMessage[]
  minimized: boolean
  unreadCount: number
  sendBusy: boolean
}

interface Props {
  nickname: string
  coins: number
  isBusy?: boolean
  friendPanelExpanded: boolean
  friendNotificationCount: number
  friends: FriendListEntry[]
  privateUnreadByFriendId: Record<number, number>
  incomingRequests: IncomingFriendRequest[]
  outgoingRequests: OutgoingFriendRequest[]
  openPrivateChats: OpenPrivateChat[]
  friendSendBusy?: boolean
  friendSendError?: string | null
  friendSendInfo?: string | null
  friendActionBusyRequestId?: number | null
  onToggleFriendPanel: () => void
  onOpenChat: (friend: FriendListEntry) => void
  onTogglePrivateChatMinimized: (friendUserId: number) => void
  onClosePrivateChat: (friendUserId: number) => void
  onSendPrivateMessage: (friendUserId: number, body: string) => void
  onSendFriendRequest: (nickname: string, tag: string) => void
  onRespondFriendRequest: (requestId: number, action: 'accept' | 'reject') => void
  onCancelOutgoingRequest: (requestId: number) => void
  onRemoveFriend: (friendUserId: number) => void
  onEnterArena: () => void
}

export function HomeScreen({
  nickname,
  coins,
  isBusy = false,
  friendPanelExpanded,
  friendNotificationCount,
  friends,
  privateUnreadByFriendId,
  incomingRequests,
  outgoingRequests,
  openPrivateChats,
  friendSendBusy = false,
  friendSendError,
  friendSendInfo,
  friendActionBusyRequestId = null,
  onToggleFriendPanel,
  onOpenChat,
  onTogglePrivateChatMinimized,
  onClosePrivateChat,
  onSendPrivateMessage,
  onSendFriendRequest,
  onRespondFriendRequest,
  onCancelOutgoingRequest,
  onRemoveFriend,
  onEnterArena,
}: Props) {
  const { t } = useTranslation()

  return (
    <div className="home-screen">
      <div className="home-screen__glow home-screen__glow--left" />
      <div className="home-screen__glow home-screen__glow--right" />

      <aside className="home-screen__profile">
        <span className="home-screen__profile-label">{t('home.profileLabel')}</span>
        <strong className="home-screen__profile-name">{nickname}</strong>

        <div className="home-screen__coins">
          <span className="home-screen__coins-label">{t('home.coinsLabel')}</span>
          <strong className="home-screen__coins-value">{coins}</strong>
        </div>
      </aside>

      <main className="home-screen__center">
        <span className="home-screen__eyebrow">{t('home.eyebrow')}</span>
        <h1 className="home-screen__title">{t('home.title')}</h1>
        <p className="home-screen__subtitle">{t('home.subtitle')}</p>

        <button
          type="button"
          className={`home-screen__cta ${isBusy ? 'is-loading' : ''}`}
          disabled={isBusy}
          onClick={onEnterArena}
        >
          {isBusy && <span className="home-screen__spinner" aria-hidden="true" />}
          <span>{t('home.enterArena')}</span>
        </button>
      </main>

      <FriendListPanel
        expanded={friendPanelExpanded}
        unreadCount={friendNotificationCount}
        friends={friends}
        privateUnreadByFriendId={privateUnreadByFriendId}
        incomingRequests={incomingRequests}
        outgoingRequests={outgoingRequests}
        sendBusy={friendSendBusy}
        sendError={friendSendError}
        sendInfo={friendSendInfo}
        actionBusyRequestId={friendActionBusyRequestId}
        onToggleExpanded={onToggleFriendPanel}
        onOpenChat={onOpenChat}
        onSendRequest={onSendFriendRequest}
        onRespondRequest={onRespondFriendRequest}
        onCancelOutgoingRequest={onCancelOutgoingRequest}
        onRemoveFriend={onRemoveFriend}
      />

      {openPrivateChats.map((chat, index) => (
        <PrivateChatPanel
          key={chat.friend.userId}
          friendLabel={`${chat.friend.nickname}${chat.friend.tag}`}
          online={chat.friend.online}
          unreadCount={chat.unreadCount}
          minimized={chat.minimized}
          messages={chat.messages}
          sendBusy={chat.sendBusy}
          style={{ right: `${396 + index * 344}px` }}
          onToggleMinimized={() => onTogglePrivateChatMinimized(chat.friend.userId)}
          onClose={() => onClosePrivateChat(chat.friend.userId)}
          onSend={(body) => onSendPrivateMessage(chat.friend.userId, body)}
        />
      ))}
    </div>
  )
}
