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

const socialErrorKeyByCode: Record<string, string> = {
  friend_target_not_found: 'errors.social.friend_target_not_found',
  friend_self_add: 'errors.social.friend_self_add',
  friend_already_added: 'errors.social.friend_already_added',
  friend_request_pending: 'errors.social.friend_request_pending',
  friend_request_not_found: 'errors.social.friend_request_not_found',
  friend_not_found: 'errors.social.friend_not_found'
}

const chatErrorKeyByCode: Record<string, string> = {
  chat_not_friends: 'errors.chat.chat_not_friends',
  chat_invalid_target: 'errors.chat.chat_invalid_target',
  chat_empty_message: 'errors.chat.chat_empty_message',
  chat_message_too_long: 'errors.chat.chat_message_too_long',
  chat_rate_limited: 'errors.chat.chat_rate_limited',
  chat_reply_target_missing: 'errors.chat.chat_reply_target_missing'
}

const moderationErrorKeyByCode: Record<string, string> = {
  admin_forbidden: 'errors.moderation.admin_forbidden',
  admin_target_not_found: 'errors.moderation.admin_target_not_found',
  admin_self_ban_forbidden: 'errors.moderation.admin_self_ban_forbidden',
  admin_ban_reason_required: 'errors.moderation.admin_ban_reason_required',
  admin_ban_already_active: 'errors.moderation.admin_ban_already_active',
  admin_ban_not_found: 'errors.moderation.admin_ban_not_found',
  report_target_required: 'errors.moderation.report_target_required',
  report_target_not_found: 'errors.moderation.report_target_not_found',
  report_self_forbidden: 'errors.moderation.report_self_forbidden',
  report_description_required: 'errors.moderation.report_description_required',
  report_description_too_long: 'errors.moderation.report_description_too_long',
  report_invalid_reason: 'errors.moderation.report_invalid_reason',
  report_invalid_reason_count: 'errors.moderation.report_invalid_reason_count',
  user_banned: 'errors.auth.user_banned'
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

    const socialKey = socialErrorKeyByCode[code]
    if (socialKey) {
      return t(socialKey)
    }

    const chatKey = chatErrorKeyByCode[code]
    if (chatKey) {
      return t(chatKey)
    }

    const moderationKey = moderationErrorKeyByCode[code]
    if (moderationKey) {
      return t(moderationKey)
    }
  }

  return reason || t('app.authFailed')
}
