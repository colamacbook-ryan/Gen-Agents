import { createContext, type ReactNode, useContext } from 'react';
import type { AuthClient } from './types.ts';

const Ctx = createContext<AuthClient | null>(null);

export function AuthProvider({ auth, children }: { auth: AuthClient; children: ReactNode }) {
  return <Ctx.Provider value={auth}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthClient {
  const auth = useContext(Ctx);
  if (!auth) throw new Error('useAuth phải nằm trong <AuthProvider>');
  return auth;
}
