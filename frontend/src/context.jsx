import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const RefContext = createContext(null);
export function RefProvider({ children }) {
  const [ref, setRef] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { api.reference().then(setRef).catch(e => setErr(e.message)); }, []);
  return <RefContext.Provider value={{ ref, err }}>{children}</RefContext.Provider>;
}
export const useReference = () => useContext(RefContext);
