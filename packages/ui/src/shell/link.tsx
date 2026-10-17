import { createContext, type ReactNode, useContext } from 'react';

export interface ShellLinkProps {
  to: string;
  className?: string;
  children: ReactNode;
  title?: string;
  id?: string;
  role?: string;
  tabIndex?: number;
  'aria-current'?: 'page';
  'aria-selected'?: boolean;
  'aria-label'?: string;
}

/** Liên kết nội bộ do app cấp (TanStack Router `Link`). Mặc định là `<a href>` thường, để shell không phụ thuộc router. */
export type ShellLink = (props: ShellLinkProps) => ReactNode;

const PlainLink: ShellLink = ({ to, children, ...rest }) => (
  <a href={to} {...rest}>
    {children}
  </a>
);

const Ctx = createContext<ShellLink>(PlainLink);

export function ShellLinkProvider({ link, children }: { link: ShellLink; children: ReactNode }) {
  return <Ctx.Provider value={link}>{children}</Ctx.Provider>;
}

export function useShellLink(): ShellLink {
  return useContext(Ctx);
}
