import { useI18n } from '@ga/i18n/react';
import { RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../primitives/button.tsx';
import { type DiffMode, DiffViewer } from './diff-viewer.tsx';
import { type Revision, VersionTimeline } from './version-timeline.tsx';
import './version.css';

export interface VersionedRevision extends Revision {
  /** nội dung (văn bản) của bản này, để so sánh */
  content: string;
}

export interface VersionHistoryProps {
  revisions: readonly VersionedRevision[];
  label: string;
  timeZone?: string;
  /** Khôi phục = tạo REVISION MỚI từ nội dung bản cũ (không ghi đè): app lo việc tạo, ở đây chỉ báo id */
  onRestore?(id: string): void;
}

/** Ghép VersionTimeline + DiffViewer: tick 2 bản → diff theo thứ tự thời gian (cũ → mới). */
export function VersionHistory({ revisions, label, timeZone, onRestore }: VersionHistoryProps) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<DiffMode>('read');
  const picked = selected
    .map((id) => revisions.find((r) => r.id === id))
    .filter((r): r is VersionedRevision => r !== undefined)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  const [older, newer] = picked;
  return (
    <div className="ga-vh">
      <VersionTimeline
        revisions={revisions}
        selected={selected}
        onSelectedChange={setSelected}
        label={label}
        timeZone={timeZone}
      />
      {older && newer ? (
        <>
          <DiffViewer
            before={older.content}
            after={newer.content}
            mode={mode}
            onModeChange={setMode}
            title={`${older.version} → ${newer.version}`}
          />
          {onRestore ? (
            <div className="ga-vh__actions">
              <Button icon={RotateCcw} onClick={() => onRestore(older.id)}>
                {t('version.restore', { version: older.version })}
              </Button>
              <span>{t('version.restoreNote')}</span>
            </div>
          ) : null}
        </>
      ) : (
        <p className="ga-vh__actions">{t('version.pickTwo')}</p>
      )}
    </div>
  );
}
