import { SlicePage } from "./slice/slice-page";
import { EMPTY_STORE_LOAD, graveyardStore } from "./slice/storage/graveyard-store";
import type { GraveyardStore, StoreLoad } from "./slice/storage/graveyard-store";

export interface AppProps {
  store?: GraveyardStore;
  initialStore?: StoreLoad;
}

export function App({ store = graveyardStore, initialStore = EMPTY_STORE_LOAD }: AppProps) {
  return <SlicePage store={store} initialStore={initialStore} />;
}
