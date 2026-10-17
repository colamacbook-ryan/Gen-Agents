import { useT } from '@ga/i18n/react';
import { Button, EmptyState } from '@ga/ui/primitives';
import { Link } from '@tanstack/react-router';

/** Màn chưa có nội dung (M4 điền): khung điều hướng đã chạy, màn nghiệp vụ thêm vào registry `screens.ts`. */
export function PlaceholderScreen() {
  const t = useT();
  return <EmptyState illustration="desk" title={t('placeholder.title')} description={t('placeholder.body')} />;
}

export function NotFoundScreen() {
  const t = useT();
  return (
    <EmptyState
      illustration="cabinet"
      title={t('notFound.title')}
      description={t('notFound.body')}
      action={
        <Link to="/overview">
          <Button variant="primary">{t('notFound.action')}</Button>
        </Link>
      }
    />
  );
}
