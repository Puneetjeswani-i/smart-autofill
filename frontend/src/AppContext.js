import { createContext, useContext } from 'react';

/** App-wide helpers: notify(), catalog, settings, navigation. */
export const AppContext = createContext({
  notify: () => {},
  catalog: null,
  settings: null,
  reloadSettings: () => {},
  openCustomer: () => {},
  go: () => {},
  extensionPaired: false,
});

export function useApp() {
  return useContext(AppContext);
}

export const BACKEND_ORIGIN = process.env.NODE_ENV === 'production'
  ? window.location.origin
  : (process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001');
