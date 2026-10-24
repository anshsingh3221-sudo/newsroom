import Link from "next/link";

const NAV = [["News analysis", "/search?type=articles"], ["Fact-checks", "/fact-checks"], ["Statements", "/statements"], ["People", "/search?type=people"], ["Methodology", "/methodology"]];

export function Header() {
  return (
    <header className="border-b border-rule bg-white">
      <div className="ui mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-3 px-4 py-4">
        <Link href="/" className="font-serif text-2xl font-semibold tracking-tight text-navy">The Record</Link>
        <nav aria-label="Main" className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {NAV.map(([label, href]) => <Link key={label} href={href} className="hover:underline">{label}</Link>)}
        </nav>
        <form action="/search" className="ml-auto flex gap-2" role="search">
          <label htmlFor="q" className="sr-only">Search</label>
          <input id="q" name="q" placeholder="Search stories, people, statements" className="field w-64" />
          <button className="btn">Search</button>
        </form>
      </div>
    </header>
  );
}

export function Footer() {
  const links = [["Methodology", "/methodology"], ["Editorial policy", "/editorial-policy"], ["Corrections", "/corrections"], ["Privacy", "/privacy"], ["Terms", "/terms"], ["Staff sign-in", "/admin"]];
  return (
    <footer className="ui mt-16 border-t border-rule bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap gap-x-6 gap-y-2 px-4 py-8 text-sm text-muted">
        <span>The Record is an independent, evidence-first news analysis project. AI drafts are reviewed by editors before publication.</span>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5">{links.map(([l, h]) => <Link key={l} href={h} className="underline">{l}</Link>)}</nav>
      </div>
    </footer>
  );
}
