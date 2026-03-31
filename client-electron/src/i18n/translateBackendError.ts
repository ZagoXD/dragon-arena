import { TFunction } from 'i18next'

const authErrorKeyByCode: Record<string, string> = {
  invalid_email: 'errors.auth.invalid_email',
  invalid_username: 'errors.auth.invalid_username',
  invalid_nickname: 'errors.auth.invalid_nickname',
  invalid_password: 'errors.auth.invalid_password',
  email_taken: 'errors.auth.email_taken',
  username_taken: 'errors.auth.username_taken',
  nickname_taken: 'errors.auth.nickname_taken',
  invalid_identifier: 'errors.auth.invalid_identifier',
  invalid_credentials: 'errors.auth.invalid_credentials',
  invalid_payload: 'errors.auth.invalid_payload',
  password_hash_failed: 'errors.auth.password_hash_failed',
  password_verification_failed: 'errors.auth.password_verification_failed',
  database_error: 'errors.auth.database_error',
  auth_error: 'errors.auth.auth_error'
}

const genericErrorKeyByCode: Record<string, string> = {
  not_authenticated: 'errors.generic.not_authenticated',
  not_joined: 'errors.generic.not_joined',
  already_joined: 'errors.generic.already_joined',
  move_rejected: 'errors.generic.move_rejected',
  cooldown_or_state: 'errors.generic.cooldown_or_state',
  respawn_locked: 'errors.generic.respawn_locked',
  invalid_json: 'errors.generic.invalid_json',
  invalid_payload: 'errors.generic.invalid_payload',
  unknown_event: 'errors.generic.unknown_event',
  unknown_error: 'errors.generic.unknown_error',
  missing_event: 'errors.generic.missing_event',
  user_not_found: 'errors.generic.user_not_found',
  profile_not_found: 'errors.generic.profile_not_found'
}

export function translateBackendError(t: TFunction, code?: string, reason?: string) {
  if (code) {
    const authKey = authErrorKeyByCode[code]
    if (authKey) {
      return t(authKey)
    }

    const genericKey = genericErrorKeyByCode[code]
    if (genericKey) {
      return t(genericKey)
    }
  }

  return reason || t('app.authFailed')
}
