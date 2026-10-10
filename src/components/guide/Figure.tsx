import { useState } from 'react'

type Props = {
  src: string
  alt: string
  caption: string
  /** Id of the animation in the asset set, named in the fallback. */
  spec: string
}

// An animation from public/gifs/, with its caption.
//
// If one fails to load the figure becomes a labelled "pending" box naming the
// missing asset, so a missing GIF is obvious in review rather than a silent
// blank. This replaced a second, imperative fallback that only the game guide
// ran — two mechanisms for one job, one of them dead on the modern side.
export function Figure({ src, alt, caption, spec }: Props) {
  const [failed, setFailed] = useState(false)

  return (
    <figure className="guide-figure">
      {failed ? (
        <div className="guide-figure-missing" aria-label={`${alt} (animation pending)`}>
          <span>
            {alt}
            <br />
            GIF pending · <code>{spec}</code>
          </span>
        </div>
      ) : (
        <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />
      )}
      <figcaption>{caption}</figcaption>
    </figure>
  )
}
