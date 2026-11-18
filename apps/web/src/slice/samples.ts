import euSemicolon from "../../../../samples/eu-semicolon.csv?raw";
import ukDebitCredit from "../../../../samples/uk-debit-credit.csv?raw";
import usSigned from "../../../../samples/us-signed.csv?raw";
import withPreamble from "../../../../samples/with-preamble.csv?raw";

export interface Sample {
  fileName: string;
  label: string;
  text: string;
}

export const SAMPLES: readonly Sample[] = [
  { fileName: "us-signed.csv", label: "US bank statement", text: usSigned },
  {
    fileName: "uk-debit-credit.csv",
    label: "UK bank statement",
    text: ukDebitCredit,
  },
  { fileName: "eu-semicolon.csv", label: "European bank statement", text: euSemicolon },
  { fileName: "with-preamble.csv", label: "Statement with extra top lines", text: withPreamble },
];
