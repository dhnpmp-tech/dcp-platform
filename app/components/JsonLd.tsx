// JsonLd — renders schema.org structured data as a server-rendered
// <script type="application/ld+json"> block. Server component (no 'use client')
// so the JSON-LD is present in the initial HTML that AI crawlers and answer
// engines parse without executing JavaScript.

interface JsonLdProps {
  // One graph object, or an array of graphs rendered as separate script tags.
  data: Record<string, unknown> | ReadonlyArray<Record<string, unknown>>
}

export default function JsonLd({ data }: JsonLdProps) {
  const graphs = Array.isArray(data) ? data : [data]
  return (
    <>
      {graphs.map((graph, i) => (
        <script
          // eslint-disable-next-line react/no-array-index-key
          key={`ld-${i}`}
          type="application/ld+json"
          // Static, code-generated JSON from app/lib/structured-data.ts — never
          // user input. JSON.stringify escapes the content; no XSS surface.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
        />
      ))}
    </>
  )
}
