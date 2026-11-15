import { useId, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, KeyboardEvent } from "react";

export interface DropZoneProps {
  disabled: boolean;
  onFiles: (files: File[]) => void;
}

export function DropZone({ disabled, onFiles }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const depthRef = useRef(0);
  const [dragging, setDragging] = useState(false);
  const textId = useId();

  const openPicker = () => {
    if (disabled) return;
    inputRef.current?.click();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      openPicker();
    } else if (event.key === " ") {
      // Space activates on keyup, like a native button; stop the page from scrolling.
      event.preventDefault();
    }
  };

  const handleKeyUp = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === " ") {
      event.preventDefault();
      openPicker();
    }
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    depthRef.current += 1;
    setDragging(true);
  };

  const handleDragLeave = () => {
    depthRef.current = Math.max(0, depthRef.current - 1);
    if (depthRef.current === 0) setDragging(false);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    depthRef.current = 0;
    setDragging(false);
    if (!disabled) onFiles(Array.from(event.dataTransfer.files));
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    input.value = "";
    onFiles(files);
  };

  const text = disabled
    ? "Reading…"
    : dragging
      ? "Release to read this file"
      : "Drop a CSV statement here";

  return (
    <div className="flex flex-col items-start gap-3">
      <div
        data-focus="drop-zone"
        role="button"
        tabIndex={0}
        aria-label="Drop area: choose or drop a CSV statement"
        aria-disabled={disabled ? true : undefined}
        aria-describedby={textId}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`w-full rounded border-2 border-dashed px-4 py-10 text-center ${
          dragging && !disabled ? "border-moss" : "border-bone"
        } bg-fog text-bone`}
      >
        <span id={textId}>{text}</span>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={openPicker}
        className="rounded border border-bone bg-fog px-4 py-2 text-bone disabled:opacity-60"
      >
        Choose a file
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        tabIndex={-1}
        aria-label="CSV statement file"
        onChange={handleChange}
      />
    </div>
  );
}
