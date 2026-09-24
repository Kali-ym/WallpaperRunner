import { describe, expect, it } from 'vitest'
import { Api } from 'telegram'
import {
  peerKeyFromChannel,
  pickDiscussionRootMessage,
} from '../../src/main/adapters/telegram/discover'

describe('pickDiscussionRootMessage', () => {
  it('prefers megagroup mirror over broadcast channel message', () => {
    const broadcast = new Api.Channel({
      id: bigIntChannelId(1),
      title: 'Channel',
      megagroup: false,
      broadcast: true,
      accessHash: bigInt(1),
    })
    const discussion = new Api.Channel({
      id: bigIntChannelId(2),
      title: 'Discussion',
      megagroup: true,
      broadcast: false,
      accessHash: bigInt(2),
    })

    const channelPost = new Api.Message({
      id: 5257,
      peerId: new Api.PeerChannel({ channelId: bigIntChannelId(1) }),
      message: 'post',
    })
    const discussionRoot = new Api.Message({
      id: 900,
      peerId: new Api.PeerChannel({ channelId: bigIntChannelId(2) }),
      message: 'discussion root',
    })

    const picked = pickDiscussionRootMessage({
      messages: [channelPost, discussionRoot],
      chats: [broadcast, discussion],
    })

    expect(picked?.id).toBe(900)
  })

  it('picks newest megagroup mirror as discussion root', () => {
    const discussion = new Api.Channel({
      id: bigIntChannelId(2),
      title: 'Discussion',
      megagroup: true,
      broadcast: false,
      accessHash: bigInt(2),
    })
    const older = new Api.Message({
      id: 880,
      peerId: new Api.PeerChannel({ channelId: bigIntChannelId(2) }),
      message: 'stale',
    })
    const root = new Api.Message({
      id: 950,
      peerId: new Api.PeerChannel({ channelId: bigIntChannelId(2) }),
      message: 'discussion root',
    })

    const picked = pickDiscussionRootMessage({
      messages: [older, root],
      chats: [discussion],
    })

    expect(picked?.id).toBe(950)
  })

  it('does not treat broadcast channel post as discussion root', () => {
    const broadcast = new Api.Channel({
      id: bigIntChannelId(1),
      title: 'Channel',
      megagroup: false,
      broadcast: true,
      accessHash: bigInt(1),
    })
    const discussion = new Api.Channel({
      id: bigIntChannelId(2),
      title: 'Discussion',
      megagroup: true,
      broadcast: false,
      accessHash: bigInt(2),
    })
    const channelPost = new Api.Message({
      id: 5257,
      peerId: new Api.PeerChannel({ channelId: bigIntChannelId(1) }),
      message: 'post',
    })

    const picked = pickDiscussionRootMessage({
      messages: [channelPost],
      chats: [broadcast, discussion],
    })

    expect(picked).toBeUndefined()
  })
})

describe('peerKeyFromChannel', () => {
  it('uses -100 marked id when username is missing', () => {
    const chat = new Api.Channel({
      id: bigIntChannelId(42),
      title: 'Discussion',
      megagroup: true,
      broadcast: false,
      accessHash: bigInt(1),
    })
    expect(peerKeyFromChannel(chat)).toBe('-10042')
  })
})

function bigInt(n: number): Api.long {
  return n as Api.long
}

function bigIntChannelId(n: number): Api.long {
  return n as Api.long
}
