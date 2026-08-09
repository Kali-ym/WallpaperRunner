import type { Api } from 'telegram'

export type TelegramMediaHandle = {
  kind: 'telegram'
  peer: string
  messageId: number
}

export type HttpMediaHandle = {
  kind: 'http'
  url: string
}

export type TelegramCachedMediaHandle = {
  kind: 'telegram_media'
  media: Api.TypePhoto | Api.TypeDocument
}

export type MediaHandle = TelegramMediaHandle | HttpMediaHandle | TelegramCachedMediaHandle
