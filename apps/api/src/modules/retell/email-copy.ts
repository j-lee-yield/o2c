import type { BillingAccount, Contact } from "@o2c/domain";

export function buildRetellStatementEmailBody(input: {
  account: BillingAccount;
  contact: Contact;
  callSummary?: string;
}): string {
  const lines = [
    `Hi ${input.contact.fullName},`,
    "",
    "Thank you for taking our call earlier."
  ];

  const recapBullets = input.callSummary ? buildCustomerFacingRecapBullets(input.callSummary) : [];
  if (recapBullets.length > 0) {
    lines.push("", "Here is the recap from our conversation:", ...recapBullets);
  }

  lines.push(
    "",
    `We attached the current statement of account for ${input.account.displayName} for your reference.`,
    "Please reply if any invoice details need to be corrected or if you need invoice copies or supporting documents.",
    "",
    "Thank you."
  );

  return lines.join("\n");
}

export function buildCustomerFacingRecapBullets(summary: string): string[] {
  const grouped = new Map<string, string[]>();
  let currentGroup = "Account status";
  for (const sentence of splitSummarySentences(summary)) {
    const cleaned = cleanCustomerFacingSentence(sentence);
    if (!cleaned || shouldOmitFromCustomerRecap(cleaned)) {
      continue;
    }

    const explicitGroup = classifyInvoiceGroup(cleaned);
    const group = explicitGroup ?? currentGroup;
    currentGroup = group;
    grouped.set(group, [...(grouped.get(group) ?? []), cleaned]);
  }

  return [...grouped.entries()].map(([label, sentences]) => {
    const body = sentences.join("; ").replace(/\s+/g, " ").trim();
    return `- ${label}: ${sentenceCase(body)}`;
  });
}

function splitSummarySentences(summary: string): string[] {
  return summary
    .replace(/\s+/g, " ")
    .replace(/\.\.\.$/, "")
    .split(/(?<=[.!?])\s+|;\s+/)
    .map((entry) => entry.trim().replace(/[.!?]+$/, ""))
    .filter(Boolean);
}

function cleanCustomerFacingSentence(sentence: string): string | undefined {
  let cleaned = sentence
    .replace(
      /^the user stated that (.+?) (?:has|have) already been paid,?\s+and the agent acknowledged this and said they would verify (?:the )?payment with (?:their|the) team$/i,
      "you confirmed that $1 have already been paid. We will verify this with the team and get back to you"
    )
    .replace(
      /^the user stated that (.+?) (?:has|have) already been paid$/i,
      "you confirmed that $1 have already been paid"
    )
    .replace(
      /^the agent acknowledged this and said they would verify (?:the )?payment with (?:their|the) team$/i,
      "we will verify this with the team and get back to you"
    )
    .replace(
      /^called the user to discuss overdue invoices.*$/i,
      ""
    )
    .replace(
      /^the call ended after discussing (.+)$/i,
      "we also reviewed $1"
    )
    .replace(/\bthe user's\b/gi, "your")
    .replace(/\bthe user\b/gi, "you")
    .replace(/\buser\b/gi, "you")
    .replace(/\bAgent verified they were speaking with\b[^.]+/i, "")
    .replace(/\bspoke with\b[^,;.]+?\bregarding\b/gi, "reviewed")
    .replace(/^the agent\s+/i, "")
    .replace(/^agent\s+/i, "")
    .replace(/^explained\s+(that\s+)?/i, "")
    .replace(/^then discussed\s+/i, "")
    .replace(/^discussed\s+/i, "")
    .replace(/\bthe agent acknowledged this and said they would verify (?:the )?payment with (?:their|the) team\b/gi, "we will verify this with the team and get back to you")
    .replace(/\bagent acknowledged this and said they would verify (?:the )?payment with (?:their|the) team\b/gi, "we will verify this with the team and get back to you")
    .replace(/\bthe agent\b/gi, "we")
    .replace(/\bagent\b/gi, "we")
    .replace(/\bcustomer committed\b/gi, "you committed")
    .replace(/\bcustomer also confirmed\b/gi, "you confirmed")
    .replace(/\bcustomer stated\b/gi, "you noted")
    .replace(/\bcustomer confirmed\b/gi, "you confirmed")
    .replace(/\bcustomer asked\b/gi, "you asked")
    .replace(/\bcustomer requested\b/gi, "you requested")
    .replace(/\ba promise to pay was created\b/gi, "we recorded the payment promise")
    .replace(/\bcollector visiting the office\b/gi, "collector visit scheduled")
    .replace(/\s+/g, " ")
    .replace(/^[,;:\-\s]+/, "")
    .trim();

  if (!cleaned || cleaned.length < 8) {
    return undefined;
  }

  return cleaned;
}

function shouldOmitFromCustomerRecap(sentence: string): boolean {
  const lower = sentence.toLowerCase();
  return (
    lower.includes("confirmed your identity") ||
    lower.includes("confirmed the user's identity") ||
    lower.includes("confirmed the users identity") ||
    lower.includes("confirmed identity") ||
    lower.includes("called you to discuss") ||
    lower.includes("called the user") ||
    lower.startsWith("no ") ||
    lower.startsWith("none ") ||
    lower.includes("no disputes") ||
    lower.includes("no dispute") ||
    lower.includes("no hardship") ||
    lower.includes("no request to stop") ||
    lower.includes("request to stop calls") ||
    lower.includes("no transfer to human") ||
    lower.includes("transfer to human") ||
    lower.includes("right party verified")
  );
}

function classifyInvoiceGroup(sentence: string): string | undefined {
  const lower = sentence.toLowerCase();
  if (lower.includes("broken promise")) {
    return "Broken promise invoices";
  }
  if (lower.includes("overdue")) {
    return "Overdue invoices";
  }
  if (lower.includes("due today")) {
    return "Invoices due today";
  }
  if (
    lower.includes("upcoming") ||
    lower.includes("pre-due") ||
    lower.includes("pre due") ||
    lower.includes("before their due dates") ||
    lower.includes("on or before their due dates")
  ) {
    return "Upcoming invoices";
  }
  if (lower.includes("paid") || lower.includes("payment")) {
    return "Payment updates";
  }
  if (lower.includes("callback") || lower.includes("call back")) {
    return "Callback";
  }
  return undefined;
}

function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
