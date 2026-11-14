/** Strip obvious personal details before any text leaves our servers (e.g. to an AI API). */
export function redact(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, "[phone]")
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[ssn]")
    .replace(/\b\d{1,2}[/-]\d{1,2}[/-](19|20)?\d{2}\b/g, "[date]")
    .replace(/\b\d{2,6}\s+([NSEW]\.?\s+)?[A-Z]?[a-z]+(\s[A-Z]?[a-z]+)?\s(st|street|ave|avenue|rd|road|blvd|dr|drive|ln|lane|way|ct|court|pl|place)\b\.?/gi, "[address]")
    .replace(/\b(my name is|i am called|i'm called|me llamo|call me)\s+[A-Za-zÀ-ÿ'-]+(\s+[A-Z][A-Za-zÀ-ÿ'-]+)?/gi, "$1 [name]");
}
