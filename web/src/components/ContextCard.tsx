"use client";

import { ChevronDown, ChevronUp, FileText, Lightbulb, Pencil, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import type { StoredContext } from "@/lib/contextStore";
import { ACCEPTED_FILES, extractText } from "@/lib/extract";
import { formatBytes } from "@/lib/format";

type Field = "resume" | "jd";

function FileRow({
  label,
  text,
  file,
  busy,
  onUpload,
  onClear,
}: {
  label: string;
  text: string;
  file: StoredContext["resumeFile"];
  busy: boolean;
  onUpload: () => void;
  onClear: () => void;
}) {
  if (!text) {
    return (
      <div className="file empty">
        <span className="ico">
          <Upload size={17} />
        </span>
        <div className="meta">
          <span className="name">{busy ? "Reading file…" : `No ${label.toLowerCase()} yet`}</span>
          <span className="sub">
            <button type="button" className="link" onClick={onUpload} disabled={busy}>
              Upload PDF or TXT
            </button>
            or paste via Edit
          </span>
        </div>
      </div>
    );
  }
  return (
    <div className="file">
      <span className="ico">
        <FileText size={18} />
      </span>
      <div className="meta">
        <span className="name">{file?.name ?? `Pasted ${label.toLowerCase()}`}</span>
        <span className="sub">
          {file ? formatBytes(file.size) : `${text.length.toLocaleString()} characters`} ·
          <button type="button" className="link" onClick={onUpload} disabled={busy}>
            {busy ? "Reading…" : "Upload new"}
          </button>
        </span>
      </div>
      <button type="button" className="btn btn-ghost icon-btn btn-sm" onClick={onClear} aria-label={`Remove ${label.toLowerCase()}`}>
        <X size={17} />
      </button>
    </div>
  );
}

export function ContextCard({ context, onChange, onEdit, onError }: { context: StoredContext; onChange: (c: StoredContext) => void; onEdit: () => void; onError: (m: string) => void }) {
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState<Field | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const targetRef = useRef<Field>("resume");

  const pick = (field: Field) => {
    targetRef.current = field;
    inputRef.current?.click();
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const field = targetRef.current;
    setBusy(field);
    try {
      const text = await extractText(file);
      const meta = { name: file.name, size: file.size };
      onChange(field === "resume" ? { ...context, resume: text, resumeFile: meta } : { ...context, jobDescription: text, jdFile: meta });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Couldn't read that file.");
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <section className="card context-card" aria-label="Interview context">
        <div className="card-head">
          <h2 className="card-title">
            <span className="ico">
              <FileText size={17} />
            </span>
            Context
          </h2>
          <span className="spacer" />
          <button type="button" className="btn btn-ghost icon-btn btn-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={open ? "Collapse context" : "Expand context"}>
            {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
        {open && (
          <div className="body">
            <p className="context-label">Resume</p>
            <FileRow
              label="Resume"
              text={context.resume}
              file={context.resumeFile}
              busy={busy === "resume"}
              onUpload={() => pick("resume")}
              onClear={() => onChange({ ...context, resume: "", resumeFile: null })}
            />
            <p className="context-label">Job Description</p>
            <FileRow
              label="Job description"
              text={context.jobDescription}
              file={context.jdFile}
              busy={busy === "jd"}
              onUpload={() => pick("jd")}
              onClear={() => onChange({ ...context, jobDescription: "", jdFile: null })}
            />
            <button type="button" className="btn" onClick={onEdit} style={{ marginTop: 6 }}>
              <Pencil size={16} /> Edit Context
            </button>
            <input ref={inputRef} type="file" accept={ACCEPTED_FILES} hidden onChange={(e) => void onFile(e.target.files?.[0])} />
          </div>
        )}
      </section>
      <aside className="tip">
        <Lightbulb size={20} />
        <div>
          <strong>Pro tip</strong>
          Share only the meeting tab with “Share tab audio” on. Cueline hears the interviewer, not you.
        </div>
      </aside>
    </>
  );
}
