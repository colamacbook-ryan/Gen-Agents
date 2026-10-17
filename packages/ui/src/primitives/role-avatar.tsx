import { Droplet } from 'lucide-react';
import type { EntityColor } from '../tokens/index.ts';
import { entityClass } from '../tokens/index.ts';
import './role-avatar.css';

export type AvatarSize = 16 | 18 | 20 | 28 | 48 | 96;
export type AvatarLive = 'running' | 'sleeping' | 'error' | 'awaiting';

export interface RoleAvatarProps {
  /** tên hiển thị (lấy chữ cái đầu làm monogram) */
  name: string;
  color: EntityColor;
  size?: AvatarSize;
  /** ảnh đại diện nếu có (cùng nguồn gốc, CSP `img-src 'self'`) */
  imageSrc?: string;
  /** Trọng thương: giảm bão hoà, viền xám, giọt lệ (không dùng màu danger) */
  wounded?: boolean;
  live?: AvatarLive;
  /** nhãn đọc cho trình đọc màn hình; không có thì avatar là trang trí (đứng cạnh tên) */
  label?: string;
}

/** Chữ cái đầu theo grapheme (giữ nguyên dấu tiếng Việt), in hoa. */
export function monogramOf(name: string): string {
  const trimmed = name.trim();
  if (trimmed === '') return '?';
  const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const first = seg.segment(trimmed)[Symbol.iterator]().next().value?.segment ?? trimmed.slice(0, 1);
  return first.toLocaleUpperCase();
}

/** Avatar 16/18/20/28/48/96: viền màu Role, monogram serif khi chưa có ảnh, chấm trạng thái, Trọng thương. */
export function RoleAvatar({ name, color, size = 28, imageSrc, wounded, live, label }: RoleAvatarProps) {
  const cls = ['ga-avatar', `ga-avatar--s${size}`, entityClass(color), wounded && 'ga-avatar--wounded']
    .filter(Boolean)
    .join(' ');
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true as const };
  return (
    <span className={cls} {...a11y}>
      <span className="ga-avatar__face">
        {imageSrc ? <img className="ga-avatar__img" src={imageSrc} alt="" /> : monogramOf(name)}
      </span>
      {wounded ? (
        <Droplet
          className="ga-avatar__tear"
          size={size >= 28 ? 10 : 8}
          strokeWidth={2}
          fill="currentColor"
          aria-hidden="true"
        />
      ) : live ? (
        <span className={`ga-avatar__status ga-avatar__status--${live}`} />
      ) : null}
    </span>
  );
}
