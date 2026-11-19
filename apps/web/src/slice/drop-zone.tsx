import { useId, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, KeyboardEvent } from "react";
import { TAP_TO_CHOOSE } from "./logic/chrome-text";
import { GravePit, RestingGhost } from "./statement/grave-art";
import { useHoverNone } from "./statement/use-hover-none";

export interface DropZoneProps {
  disabled: boolean;
  reduceMotion: boolean;
  onFiles: (files: File[]) => void;
}

/**
 * The Grave drop area (pro-polish "Statement panel", "Signature moments: 3"). The wrapper holds
 * the drag handlers and the depth counter, so the whole drawn grave, "Choose a file" included,
 * is one drop target; `role="button"` and its keyboard behaviour stay on the inner element.
 */
export function DropZone({ disabled, reduceMotion, onFiles }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const depthRef = useRef(0);
  const [dragging, setDragging] = useState(false);
  const textId = useId();
  const hoverNone = useHoverNone();

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
    if (!disabled) onFiles(files);
  };

  const text = disabled
    ? "Reading…"
    : dragging
      ? "Release to read this file"
      : hoverNone
        ? TAP_TO_CHOOSE
        : "Drop a CSV statement here";
  const active = dragging && !disabled;

  return (
    <div
      data-grave-drop=""
      data-dragging={active}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="group/grave relative pt-[48px]"
    >
      <div
        aria-hidden="true"
        className="ghost-window pointer-events-none absolute inset-x-0 top-0 flex h-[48px] justify-center overflow-clip"
      >
        <RestingGhost dragging={active} reduceMotion={reduceMotion} />
      </div>
      <div className="grave relative min-h-32 w-full">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <GravePit dragging={active} reduceMotion={reduceMotion} />
        </div>
        {/* While a file is over the grave the moss rim glow, on the same rounded edge, stands in
            for the drop area's focus ring, so exactly one moss ring shows (review B, V3). */}
        <div
          data-focus="drop-zone"
          data-exempt="drop-area"
          role="button"
          tabIndex={0}
          aria-label="Drop area: choose or drop a CSV statement"
          aria-disabled={disabled ? true : undefined}
          aria-describedby={textId}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onClick={openPicker}
          className="relative grid min-h-32 place-items-center rounded-card px-4 pb-16 pt-6 text-center text-bone group-data-[dragging=true]/grave:outline-none"
        >
          <span id={textId}>{text}</span>
        </div>
        <button
          type="button"
          aria-disabled={disabled ? true : undefined}
          onClick={openPicker}
          className="absolute inset-x-4 bottom-4 mx-auto w-fit min-h-11 text-center rounded border border-bone bg-fog px-4 py-2 text-bone aria-disabled:opacity-60"
        >
          Choose a file
        </button>
      </div>
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
