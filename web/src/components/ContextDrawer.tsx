"use client";

import { FileText, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { LIMITS } from "@cueline/shared";
import type { StoredContext } from "@/lib/contextStore";
import { SAMPLE_CONTEXT } from "@/lib/sample";
import { Drawer } from "./ui/Drawer";

/** Paste or edit the resume and job description. Answers only use experience from the resume. */
export function ContextDrawer({ initial, onSave, onClose }: { initial: StoredContext; onSave: (c: StoredContext) => void; onClose: () => void }) {
  const [resume, setResume] = useState(initial.resume);
  const [jobDescription, setJobDescription] = useState(initial.jobDescription);

  const save = () => {
    onSave({
      resume: resume.trim(),
      jobDescription: jobDescription.trim(),
      // Editing the text by hand means it no longer matches the uploaded file
      resumeFile: resume.trim() === initial.resume ? initial.resumeFile : null,
      jdFile: jobDescription.trim() === initial.jobDescription ? initial.jdFile : null,
    });
    onClose();
  };

  return (
    <Drawer
      title="Your interview context"
      subtitle="Answers only use experience from your resume and match it to the job description."
      icon={<FileText size={17} />}
      onClose={onClose}
      footer={
        <>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setResume(SAMPLE_CONTEXT.resume);
                setJobDescription(SAMPLE_CONTEXT.jobDescription);
              }}
            >
              <Sparkles size={15} /> Use sample
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
              <Trash2 size={15} /> Clear
            </button>
          </div>
          <button type="button" className="btn btn-primary" onClick={save}>
            Save context
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="resume">
          Resume or summary
          <small>
            {resume.length.toLocaleString()} / {LIMITS.contextChars.toLocaleString()}
          </small>
        </label>
        <textarea id="resume" className="textarea" value={resume} maxLength={LIMITS.contextChars} placeholder="Paste your resume: roles, projects, numbers, skills…" onChange={(e) => setResume(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="jd">
          Job description
          <small>
            {jobDescription.length.toLocaleString()} / {LIMITS.contextChars.toLocaleString()}
          </small>
        </label>
        <textarea id="jd" className="textarea" value={jobDescription} maxLength={LIMITS.contextChars} placeholder="Paste the job description you're interviewing for…" onChange={(e) => setJobDescription(e.target.value)} />
      </div>
    </Drawer>
  );
}
