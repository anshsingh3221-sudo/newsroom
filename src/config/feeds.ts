// Public RSS/Atom feeds. Feed URLs change over time: if one returns an error, check the publisher's RSS page and update it.
// Only add feeds whose terms permit syndication of headlines and summaries. The app stores headline, link and summary, not full articles.
export const FEEDS: { publisher: string; url: string; country: string }[] = [
  { publisher: "The Hindu", url: "https://www.thehindu.com/news/national/feeder/default.rss", country: "IN" },
  { publisher: "The Indian Express", url: "https://indianexpress.com/section/india/feed/", country: "IN" },
  { publisher: "PIB (Government of India)", url: "https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3", country: "IN" },
  { publisher: "BBC News", url: "https://feeds.bbci.co.uk/news/world/rss.xml", country: "INT" },
  { publisher: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", country: "INT" },
];
