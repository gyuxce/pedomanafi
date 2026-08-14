"use client";

export function HighlightedText({ text, query }: { text: string; query: string }) {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return text;
  const pattern = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const matcher = new RegExp("(" + pattern + ")", "gi");
  const normalizedTerms = new Set(terms.map((term) => term.toLowerCase()));
  return text.split(matcher).map((part, index) => normalizedTerms.has(part.toLowerCase()) ? <mark className="search-highlight" key={index}>{part}</mark> : part);
}
