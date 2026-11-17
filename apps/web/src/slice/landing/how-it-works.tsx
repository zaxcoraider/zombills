import { useId } from "react";
import { HOW_IT_WORKS_HEADING, HOW_IT_WORKS_STEPS } from "../logic/landing-text";

/** Three numbered steps. Reading only: no control. */
export function HowItWorks() {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-6">
      <h2 id={headingId} className="font-display text-3xl">
        {HOW_IT_WORKS_HEADING}
      </h2>
      <ol role="list" className="grid list-none gap-4 md:grid-cols-3">
        {HOW_IT_WORKS_STEPS.map((step, index) => (
          <li key={step.heading} className="flex flex-col gap-2 rounded-2xl bg-fog/95 p-6">
            <span className="flex size-8 items-center justify-center rounded-full border border-moss font-semibold text-moss">
              {index + 1}
            </span>
            <h3 className="text-lg font-bold">{step.heading}</h3>
            <p>{step.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
