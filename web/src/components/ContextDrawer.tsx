"use client";

import { FileText, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LIMITS, type CandidateContext } from "@cueline/shared";
import { SAMPLE_CONTEXT } from "@/lib/sample";

/** Resume + job description form. Answers are grounded in what's pasted here. */
export function ContextDrawer({ initial, onSave, onClose }: { initial: CandidateContext; onSave: (c: CandidateContext) => void; onClose: () => void }) {
  const [resume, setResume] = useState(initial.resume);
  const [jobDescription, setJobDescription] = useState(initial.jobDescription);
  const firstRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = () => {
    onSave({ resume: resume.trim(), jobDescription: jobDescription.trim() });
    onClose();
  };

  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="context-title">
        <div className="drawer-head">
          <FileText size={22} style={{ color: "var(--accent-1)" }} />
          <div style={{ flex: 1 }}>
            <h2 id="context-title">Your interview context</h2>
            <p>Answers only use experience from your resume, and match it to the job description.</p>
          </div>
          <button type="button" className="btn btn-ghost icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="drawer-body">
          <div className="field">
            <label htmlFor="resume">
              Resume or summary <small>{resume.length.toLocaleString()} / {LIMITS.contextChars.toLocaleString()}</small>
            </label>
            <textarea
              id="resume"
              ref={firstRef}
              className="textarea"
              value={resume}
              maxLength={LIMITS.contextChars}
              placeholder="Paste your resume: roles, projects, numbers, skills…"
              onChange={(e) => setResume(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="jd">
              Job description <small>{jobDescription.length.toLocaleString()} / {LIMITS.contextChars.toLocaleString()}</small>
            </label>
            <textarea
              id="jd"
              className="textarea"
              value={jobDescription}
              maxLength={LIMITS.contextChars}
              placeholder="Paste the job description you're interviewing for…"
              onChange={(e) => setJobDescription(e.target.value)}
            />
          </div>
        </div>
        <div className="drawer-foot">
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setResume(SAMPLE_CONTEXT.resume);
                setJobDescription(SAMPLE_CONTEXT.jobDescription);
              }}
            >
              <Sparkles size={14} /> Use sample
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={!resume && !jobDescription}
              onClick={() => {
                setResume("");
                setJobDescription("");
              }}
            >
              <Trash2 size={14} /> Clear
            </button>
          </div>
          <button type="button" className="btn btn-primary" onClick={save}>
            Save context
          </button>
        </div>
      </div>
    </>
  );
}
