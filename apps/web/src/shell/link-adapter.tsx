import type { ShellLink } from '@ga/ui/shell';
import { Link } from '@tanstack/react-router';

/** Gắn liên kết của shell (sidebar, tab, breadcrumb) vào TanStack Router: điều hướng phía client, không tải lại trang. */
export const RouterShellLink: ShellLink = ({ to, children, ...rest }) => (
  <Link to={to} {...rest}>
    {children}
  </Link>
);
