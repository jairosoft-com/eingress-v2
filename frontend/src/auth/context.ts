import { createContext } from 'react';

import { AuthSession } from './session';

export type SignInInput = {
  usernameOrEmail: string;
  password: string;
  rfidCode: string;
};

export type AuthContextValue = {
  session: AuthSession | null;
  isAuthenticated: boolean;
  signIn: (input: SignInInput) => Promise<AuthSession>;
  signOut: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
