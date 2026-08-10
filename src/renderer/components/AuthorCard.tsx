import { memo, type JSX } from 'react'
import { api, type LibraryIndexEntry } from '../lib/api'

type Props = {
  author: string
  count: number
  coverEntry?: LibraryIndexEntry
  avatarUrl?: string
  onOpen: (author: string) => void
}

function authorInitial(name: string): string {
  const t = name.trim()
  if (!t) return '?'
  return t.slice(0, 1).toUpperCase()
}

function AuthorCard({ author, count, coverEntry, avatarUrl, onOpen }: Props): JSX.Element {
  const cover =
    !avatarUrl && coverEntry?.cover
      ? api.getMediaUrl(coverEntry.dirName, coverEntry.cover, {
          thumb: true,
          bust: coverEntry.downloadedAt,
        })
      : undefined
  const art = avatarUrl || cover

  return (
    <article className="author-card">
      <button type="button" className="author-card-hit" onClick={() => onOpen(author)}>
        <div className="author-card-cover">
          {art ? (
            <img className="author-card-art" src={art} alt="" loading="lazy" decoding="async" />
          ) : (
            <div className="author-card-fallback" aria-hidden>
              {authorInitial(author)}
            </div>
          )}
        </div>
        <div className="author-card-body">
          <span className="author-card-name">{author}</span>
          <span className="author-card-meta muted">{count} 部套图</span>
        </div>
      </button>
    </article>
  )
}

export default memo(AuthorCard)
