type Img = { kind: string; url: string; alt: string; caption: string; credit?: string; sourceUrl?: string };

export function ArticleImages({ images }: { images?: Img[] }) {
  if (!images?.length) return null;
  const hero =
    images.find((i) => i.kind === "illustration") ??
    images.find((i) => i.kind === "source") ??
    images.find((i) => i.kind === "place") ??
    images.find((i) => i.kind === "cover");
  const rest = images.filter((i) => i !== hero && (i.kind === "portrait" || i.kind === "source" || i.kind === "place"));
  const credit = (i: Img) => i.sourceUrl && i.credit
    ? <a href={i.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">{i.credit}</a>
    : i.credit;
  return (
    <div className="my-6 space-y-4">
      {hero && (
        <figure>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={hero.url} alt={hero.alt} loading="lazy" referrerPolicy="no-referrer" className="max-h-96 w-full border border-rule object-cover" />
          <figcaption className="ui mt-1 text-xs text-muted">{hero.caption} {credit(hero)}</figcaption>
        </figure>
      )}
      {rest.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          {rest.map((p, i) => (
            <figure key={i}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.alt} loading="lazy" referrerPolicy="no-referrer" className="aspect-[4/5] w-full border border-rule object-cover" />
              <figcaption className="ui mt-1 text-xs text-muted">{p.caption} {credit(p)}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}