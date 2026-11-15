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
  { fileName: "us-signed.csv", label: "US bank, signed amounts", text: usSigned },
  {
    fileName: "uk-debit-credit.csv",
    label: "UK bank, debit and credit columns",
    text: ukDebitCredit,
  },
  { fileName: "eu-semicolon.csv", label: "EU bank, semicolons", text: euSemicolon },
  { fileName: "with-preamble.csv", label: "Statement with a header block", text: withPreamble },
];
