import { SpikeView } from "./routing/spike-view";
import { useHashRoute } from "./routing/use-hash-route";
import { SlicePage } from "./slice/slice-page";

export function App() {
  const route = useHashRoute();
  return route === "spike" ? <SpikeView /> : <SlicePage />;
}
