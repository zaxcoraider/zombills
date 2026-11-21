// The Helper panel: how to cancel with the provider, and an email to send. It reads only the
// Answer record and the Cancel module (cancel-helper Req 7.9). No logo, no icon.

import { motion } from "framer-motion";
import { useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { APP_STORE_LINKS, cancellationEmail, getCancelHelp, mailtoHref } from "@zombills/core";
import type { CancelHelp } from "@zombills/core";
import {
  APP_STORE_NOTE,
  BRACKETS_NOTE,
  EMAIL_ONLY_INTRO,
  MAILTO_HINT,
  NEW_TAB_TEXT,
  PANEL_HEADING,
  cancelLinkText,
  checkedLine,
  copyTextOf,
  emailInputFor,
  knownNameFor,
  panelLine,
  withFor,
} from "../logic/cancel-text";
import { WRITE_INSTEAD } from "../logic/chrome-text";
import type { AnswerRecord } from "../logic/graveyard";
import { buttonVariant } from "../button-variants";
import { COPY_LABEL_FADE } from "./motion";
import { useCopyEmail } from "./use-copy-email";

export interface CancelHelperProps {
  record: AnswerRecord;
  /** The tombstone's Display name, for accessible names */
  displayName: string;
  reduceMotion: boolean;
  /** The Rising's "Next" / "Visit the graveyard" control, rendered last (Req 8.4) */
  next?: ReactNode;
}

type LinkHelp = Extract<CancelHelp, { kind: "link" }>;

interface ExternalLinkProps {
  href: string;
  text: string;
  displayName: string;
  newTabId: string;
}

function ExternalLink({ href, text, displayName, newTabId }: ExternalLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-describedby={newTabId}
      aria-label={withFor(text, displayName)}
      {...buttonVariant("secondary")}
    >
      {text}
    </a>
  );
}

interface LinkPartProps {
  help: LinkHelp;
  record: AnswerRecord;
  displayName: string;
  newTabId: string;
}

function LinkPart({ help, record, displayName, newTabId }: LinkPartProps) {
  const serviceName = knownNameFor(record.serviceId) ?? record.merchant;
  const checked = checkedLine(help.lastChecked);
  const stores = APP_STORE_LINKS;
  return (
    <>
      <ExternalLink
        href={help.url}
        text={cancelLinkText(help.linkKind, serviceName, help.host)}
        displayName={displayName}
        newTabId={newTabId}
      />
      <ol className="list-decimal pl-6">
        {help.steps.map((step, index) => (
          <li key={index}>{step}</li>
        ))}
      </ol>
      {help.appStoreMayApply ? (
        <>
          <p>{APP_STORE_NOTE}</p>
          <ul className="flex flex-col">
            <li>
              <ExternalLink
                href={stores.apple.url}
                text={stores.apple.label}
                displayName={displayName}
                newTabId={newTabId}
              />
            </li>
            <li>
              <ExternalLink
                href={stores.google.url}
                text={stores.google.label}
                displayName={displayName}
                newTabId={newTabId}
              />
            </li>
          </ul>
        </>
      ) : null}
      {checked !== null ? <p>{checked}</p> : null}
    </>
  );
}

interface EmailPartProps {
  record: AnswerRecord;
  displayName: string;
}

/** The bracket note, the email text, Copy, "Open in my email app" and the hint (Req 8.2). */
function EmailPart({ record, displayName }: EmailPartProps) {
  const emailRef = useRef<HTMLDivElement>(null);
  const email = cancellationEmail(emailInputFor(record));
  const copyText = copyTextOf(email);
  const { copied, onCopy } = useCopyEmail(copyText, displayName, emailRef);
  const copyLabel = copied ? "Copied" : "Copy email";
  return (
    <>
      <p>{BRACKETS_NOTE}</p>
      <div
        ref={emailRef}
        data-email-text=""
        className="w-full whitespace-pre-wrap select-text rounded-control border border-bone/40 p-3"
      >
        <span className="font-semibold">{email.subject}</span>
        {"\n\n" + email.body}
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onCopy}
          aria-label={withFor(copyLabel, displayName)}
          {...buttonVariant("secondary")}
        >
          <motion.span
            key={copied ? "copied" : "copy"}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={COPY_LABEL_FADE}
          >
            {copyLabel}
          </motion.span>
        </button>
        <a
          href={mailtoHref(email)}
          aria-label={withFor("Open in my email app", displayName)}
          {...buttonVariant("secondary")}
        >
          Open in my email app
        </a>
      </div>
      <p>{MAILTO_HINT}</p>
    </>
  );
}

interface EmailDisclosureProps extends EmailPartProps {
  bodyId: string;
}

/** "Write to them instead": collapsed on first show; its content is `hidden` until opened (Req 8.2). */
function EmailDisclosure({ record, displayName, bodyId }: EmailDisclosureProps) {
  const [emailOpen, setEmailOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-expanded={emailOpen}
        aria-controls={bodyId}
        aria-label={withFor(WRITE_INSTEAD, displayName)}
        onClick={() => setEmailOpen((open) => !open)}
        {...buttonVariant("secondary")}
      >
        {WRITE_INSTEAD}
      </button>
      <div id={bodyId} hidden={!emailOpen} className="flex w-full flex-col items-start gap-3">
        <EmailPart record={record} displayName={displayName} />
      </div>
    </>
  );
}

export function CancelHelper({ record, displayName, reduceMotion, next }: CancelHelperProps) {
  void reduceMotion; // The Copy label fades the same way in both motion modes (Req 8.7).
  const headingId = useId();
  const newTabId = useId();
  const emailBodyId = useId();
  const help = getCancelHelp(record.serviceId, record.currency);

  return (
    <section
      aria-labelledby={headingId}
      className="flex w-full max-w-[34rem] flex-col items-start gap-3 rounded-card bg-fog p-4 text-left text-bone [overflow-wrap:anywhere]"
    >
      <h3
        id={headingId}
        aria-label={`${PANEL_HEADING}: ${displayName}`}
        className="font-display text-xl"
      >
        {PANEL_HEADING}
      </h3>
      <p>{panelLine(displayName)}</p>
      <span id={newTabId} className="sr-only">
        {NEW_TAB_TEXT}
      </span>
      {help.kind === "link" ? (
        <>
          <LinkPart help={help} record={record} displayName={displayName} newTabId={newTabId} />
          <EmailDisclosure record={record} displayName={displayName} bodyId={emailBodyId} />
        </>
      ) : (
        <>
          <p>{EMAIL_ONLY_INTRO}</p>
          <EmailPart record={record} displayName={displayName} />
        </>
      )}
      {next !== undefined ? <div className="mt-6">{next}</div> : null}
    </section>
  );
}
