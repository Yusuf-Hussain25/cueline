import { LIMITS } from "@cueline/shared";

export const ACCEPTED_FILES = ".pdf,.txt,.md,text/plain,application/pdf";

/** Reads a resume or JD file to plain text in the browser; the file itself never leaves the device. */
export const extractText = async (file: File): Promise<string> => {
  if (file.size > 10 * 1024 * 1024) throw new Error("That file is over 10 MB. Paste the text instead.");
  let text: string;
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    // Loaded on demand: the PDF reader is large and most visits never need it
    const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    text = (await pdfText(pdf, { mergePages: true })).text;
  } else {
    text = await file.text();
  }
  text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) throw new Error("No text found in that file. If it's a scanned PDF, paste the text instead.");
  return text.slice(0, LIMITS.contextChars);
};
