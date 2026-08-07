import type { ReactNode } from "react";

/**
 * Character class for a Latin/numeric run: letters, digits, and the
 * connector symbols that show up inside units/model numbers/measurements
 * (/ × ² ³ % . , - + ( )). A space is only absorbed into the run when
 * followed by another run character, so a multi-word phrase like
 * "Power Bank" or "PSI / BAR / KPA" is captured as ONE contiguous run
 * instead of several — merging isolates one word at a time still lets the
 * surrounding RTL paragraph reorder the isolates relative to each other
 * (each isolate is neutral to the outer algorithm), which is what flipped
 * "Power Bank" to "Bank Power" and broke "kg/cm²" apart from its "²".
 */
const LATIN_RUN_SOURCE =
  "[A-Za-z0-9](?:[A-Za-z0-9/×²³%.,+()-]|\\s(?=[A-Za-z0-9/×²³%.,+()-]))*";

/** Splits Arabic/French copy into Latin/numeric runs and everything else, isolating each run so its internal LTR order survives inside the RTL line. */
export function withLatinTokens(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = new RegExp(LATIN_RUN_SOURCE, "g");
  let lastIndex = 0;
  let seq = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(<span key={`${keyPrefix}-${seq++}`}>{text.slice(lastIndex, match.index)}</span>);
    }
    nodes.push(
      <span key={`${keyPrefix}-${seq++}`} dir="ltr" style={{ unicodeBidi: "isolate" }}>
        {match[0]}
      </span>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    nodes.push(<span key={`${keyPrefix}-${seq++}`}>{text.slice(lastIndex)}</span>);
  }
  return nodes;
}
