export const VERDICTS: Record<string, { label: string; color: string; bg: string }> = {
  true: { label: "True", color: "#1F5C42", bg: "#E6F2EC" },
  false: { label: "False", color: "#8C2F39", bg: "#F7E8EA" },
  partly_true: { label: "Partly true", color: "#7A5A0E", bg: "#F8F0DC" },
  misleading: { label: "Misleading", color: "#8A4216", bg: "#F8EBDF" },
  out_of_context: { label: "Out of context", color: "#4F3F82", bg: "#EEEAF6" },
  unverified: { label: "Unverified", color: "#4A5260", bg: "#ECEEF1" },
};
export const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "Date unknown";
