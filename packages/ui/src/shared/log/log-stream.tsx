import { formatClockSeconds } from '@ga/i18n';
import { useI18n } from '@ga/i18n/react';
import { Pause, Play } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { findBase } from '../../overlay/match.ts';
import { Button } from '../../primitives/button.tsx';
import type { EntityColor } from '../../tokens/index.ts';
import { entityClass } from '../../tokens/index.ts';
import { maskSecrets } from './mask.ts';
import './log-stream.css';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogLine {
  /** khoá ổn định (thường là seq) */
  id: string;
  at: Date;
  level: LogLevel;
  /** tiền tố Role màu (hoặc dịch vụ): tên + màu nhận diện */
  source?: { name: string; color?: EntityColor };
  text: string;
}

export interface LogStreamProps {
  lines: readonly LogLine[];
  /** nhãn truy cập của vùng log */
  label: string;
  /** giữ tối đa N dòng mới nhất trong DOM */
  maxLines?: number;
  timeZone?: string;
}

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
type LevelFilter = 'all' | 'warn' | 'error';

/**
 * LogStream: mono 12 trên `bg.sunken`, timestamp mờ, tiền tố Role màu, mức log, tạm dừng, tìm, bí mật tự che
 * (FRONTEND-SPEC §5). Tự cuộn theo dòng mới khi đang ở đáy; kéo lên là dừng bám; tạm dừng thì đóng băng ảnh chụp.
 */
export function LogStream({ lines, label, maxLines = 2000, timeZone }: LogStreamProps) {
  const { t, locale } = useI18n();
  const [paused, setPaused] = useState(false);
  const [frozen, setFrozen] = useState<readonly LogLine[]>([]);
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState<LevelFilter>('all');
  const body = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  // tạm dừng: chụp lại danh sách hiện tại; dòng mới vẫn tới nhưng chưa hiện
  const togglePause = () => {
    if (!paused) setFrozen(lines);
    setPaused(!paused);
  };
  const shown = paused ? frozen : lines;
  const pendingCount = paused ? Math.max(0, lines.length - frozen.length) : 0;

  const visible = useMemo(() => {
    const min = level === 'all' ? 0 : level === 'warn' ? LEVEL_RANK.warn : LEVEL_RANK.error;
    const q = query.trim();
    const filtered = shown.filter((l) => {
      if (LEVEL_RANK[l.level] < min) return false;
      if (q === '') return true;
      return findBase(`${l.source?.name ?? ''} ${l.text}`, q, locale) !== null;
    });
    return filtered.slice(-maxLines);
  }, [shown, level, query, maxLines, locale]);

  // bám đáy khi có dòng mới (trừ khi người dùng đã kéo lên)
  // biome-ignore lint/correctness/useExhaustiveDependencies: chạy khi số dòng hiển thị đổi
  useEffect(() => {
    const el = body.current;
    if (el && stick.current && !paused) el.scrollTop = el.scrollHeight;
  }, [visible.length, paused]);

  const fmt = timeZone ? { timeZone } : {};
  return (
    <div className="ga-log">
      <div className="ga-log__bar">
        <Button size="sm" icon={paused ? Play : Pause} aria-pressed={paused} onClick={togglePause}>
          {paused ? t('log.resume') : t('log.pause')}
        </Button>
        <input
          className="ga-log__search"
          type="search"
          aria-label={t('log.search')}
          placeholder={t('log.search')}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          spellCheck={false}
          autoComplete="off"
        />
        <select
          className="ga-log__level"
          aria-label={t('log.levelFilter')}
          value={level}
          onChange={(e) => setLevel(e.currentTarget.value as LevelFilter)}
        >
          <option value="all">{t('log.levelAll')}</option>
          <option value="warn">{t('log.levelWarn')}</option>
          <option value="error">{t('log.levelError')}</option>
        </select>
        {pendingCount > 0 ? <span className="ga-log__pending">{t('log.pending', { count: pendingCount })}</span> : null}
      </div>
      <div
        ref={body}
        className="ga-log__body"
        role="log"
        aria-live="off"
        aria-label={label}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: vùng log cuộn được phải focus được bằng bàn phím
        tabIndex={0}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
      >
        {visible.length === 0 ? (
          <div className="ga-log__empty">{t('log.empty')}</div>
        ) : (
          visible.map((l) => {
            const text = maskSecrets(l.text);
            const hit = query.trim() === '' ? null : findBase(text, query, locale);
            return (
              <div key={l.id} className="ga-log__line">
                <time className="ga-log__time" dateTime={l.at.toISOString()}>
                  {formatClockSeconds(l.at, locale, fmt)}
                </time>
                <span className={`ga-log__level-tag ga-log__level-tag--${l.level}`}>{t(`log.level.${l.level}`)}</span>
                {l.source ? (
                  <span className={l.source.color ? `ga-log__source ${entityClass(l.source.color)}` : 'ga-log__source'}>
                    {l.source.name}
                  </span>
                ) : null}
                <span className="ga-log__text">
                  {hit ? (
                    <>
                      {text.slice(0, hit.index)}
                      <mark>{text.slice(hit.index, hit.index + hit.length)}</mark>
                      {text.slice(hit.index + hit.length)}
                    </>
                  ) : (
                    text
                  )}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
