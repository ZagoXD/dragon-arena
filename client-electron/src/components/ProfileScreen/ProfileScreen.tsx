import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import './ProfileScreen.css'

interface Props {
  nickname: string
  tag: string
  coins: number
}

const HARDCODED_LEVEL = 18

export function ProfileScreen({ nickname, tag, coins }: Props) {
  const { t } = useTranslation()
  const initials = useMemo(() => {
    const source = nickname.trim()
    if (!source) {
      return 'DA'
    }

    return source.slice(0, 2).toUpperCase()
  }, [nickname])

  return (
    <div className="profile-screen">
      <div className="profile-screen__glow profile-screen__glow--left" />
      <div className="profile-screen__glow profile-screen__glow--right" />

      <header className="profile-screen__header">
        <span className="profile-screen__eyebrow">{t('profile.eyebrow')}</span>
        <h1>{t('profile.title')}</h1>
        <p>{t('profile.subtitle')}</p>
      </header>

      <section className="profile-screen__card">
        <div className="profile-screen__avatar-shell">
          <div className="profile-screen__avatar">{initials}</div>
          <span className="profile-screen__avatar-label">{t('profile.avatarPlaceholder')}</span>
        </div>

        <div className="profile-screen__identity">
          <h2>{`${nickname}${tag}`}</h2>
          <p>{t('profile.identityHint')}</p>
        </div>

        <div className="profile-screen__stats">
          <article className="profile-screen__stat">
            <span>{t('profile.nickname')}</span>
            <strong>{nickname}</strong>
          </article>
          <article className="profile-screen__stat">
            <span>{t('profile.coins')}</span>
            <strong>{coins}</strong>
          </article>
          <article className="profile-screen__stat">
            <span>{t('profile.level')}</span>
            <strong>{HARDCODED_LEVEL}</strong>
          </article>
          <article className="profile-screen__stat">
            <span>{t('profile.tag')}</span>
            <strong>{tag}</strong>
          </article>
        </div>
      </section>
    </div>
  )
}
