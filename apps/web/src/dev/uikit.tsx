import { useI18n } from '@ga/i18n/react';
import {
  BirthCertificate,
  Button,
  type CardStatus,
  CHIP_STATES,
  ChangeSetTray,
  type ChipState,
  CommandPalette,
  ConfirmModal,
  EmployeeCard,
  EmptyState,
  ENTITY_COLOR_NAMES,
  FileDropzone,
  IconButton,
  KpiStrip,
  KpiTile,
  LogStream,
  Modal,
  NotificationCenter,
  PageActions,
  ProvenanceLegend,
  ProvenanceMark,
  type QuietHours,
  QuietHoursTimeline,
  RoleAvatar,
  ShortcutsDialog,
  Skeleton,
  SkeletonGrid,
  SkeletonLines,
  StatusChip,
  Stepper,
  useToast,
  VersionHistory,
  WarningBanner,
} from '@ga/ui';
import { Check, Plus } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import {
  SAMPLE_CHANGES,
  SAMPLE_LOG,
  SAMPLE_NOTIFICATIONS,
  SAMPLE_NOW,
  SAMPLE_PALETTE,
  SAMPLE_REVISIONS,
  SAMPLE_TZ,
} from './fixtures.ts';

import './uikit.css';

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`kit-${id}`} data-kit={id}>
      <h2 id={`kit-${id}`} className="ga-kit__title">
        {title}
      </h2>
      <div className="ga-kit__row">{children}</div>
    </section>
  );
}

/** Trang duyệt component: mọi primitive / overlay / component dùng chung với dữ liệu mẫu. Chỉ có ở dev hoặc bản build VITE_GA_UIKIT=1. */
export function UiKit() {
  const { t } = useI18n();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [modal, setModal] = useState(false);
  const [overlay, setOverlay] = useState<'palette' | 'notifications' | 'shortcuts' | null>(null);
  const [ack, setAck] = useState(false);
  const [quiet, setQuiet] = useState<QuietHours>({ start: 22 * 60, end: 6 * 60, weekends: true });
  const [confirmed, setConfirmed] = useState(false);

  const cardStates: CardStatus[] = ['pending', 'active', 'suspended', 'revoked', 'superseded'];

  return (
    <div className="ga-kit">
      <PageActions
        primary={
          <Button variant="primary" icon={Plus}>
            {t('devkit.button.primary')}
          </Button>
        }
        secondary={[<Button key="s">{t('devkit.button.secondary')}</Button>]}
      />

      <Section id="buttons" title={t('devkit.section.buttons')}>
        <Button variant="primary" icon={Check}>
          {t('devkit.button.primary')}
        </Button>
        <Button>{t('devkit.button.secondary')}</Button>
        <Button variant="ghost">{t('devkit.button.ghost')}</Button>
        <Button variant="danger">{t('devkit.button.danger')}</Button>
        <Button busy>{t('devkit.button.busy')}</Button>
        <Button disabled>{t('devkit.button.disabled')}</Button>
        <IconButton icon={Plus} label={t('devkit.button.iconOnly')} />
      </Section>

      <Section id="chips" title={t('devkit.section.chips')}>
        {(Object.keys(CHIP_STATES) as ChipState[]).map((s) => (
          <StatusChip key={s} state={s} />
        ))}
      </Section>

      <Section id="avatars" title={t('devkit.section.avatars')}>
        {ENTITY_COLOR_NAMES.map((c, i) => (
          <RoleAvatar
            key={c}
            name={['Mai', 'Lan', 'Tùng', 'Minh', 'Hà', 'Khoa', 'Vy', 'An', 'Bảo', 'Chi', 'Dũng', 'Giang'][i] ?? 'M'}
            color={c}
            size={28}
            live={i % 3 === 0 ? 'running' : undefined}
          />
        ))}
        <RoleAvatar name="Lan" color="coral" size={48} wounded />
        <RoleAvatar name="Mai" color="teal" size={96} />
      </Section>

      <Section id="kpi" title={t('devkit.section.kpi')}>
        <div className="ga-kit__wide">
          <KpiStrip label={t('devkit.section.kpi')}>
            <KpiTile
              label={t('devkit.kpi.roles')}
              value="3"
              unit="/ 7"
              source="v_roles"
              note={t('devkit.kpi.rolesNote')}
              noteTone="ok"
              spark={[2, 3, 3, 4, 3, 3, 3]}
              sparkLabel={t('devkit.kpi.sparkLabel')}
            />
            <KpiTile label={t('devkit.kpi.tokens')} value="1.795" unit="/ 2.000" source="v_role_prompt_budget" />
            <KpiTile label={t('devkit.kpi.wallet')} value="4.250" unit="₲" source="v_wallets" />
          </KpiStrip>
        </div>
      </Section>

      <Section id="stepper" title={t('devkit.section.stepper')}>
        <div className="ga-kit__wide">
          <Stepper
            label={t('devkit.stepper.label')}
            steps={[
              { id: 'a', label: t('devkit.stepper.download'), status: 'done' },
              { id: 'b', label: t('devkit.stepper.migrate'), status: 'running' },
              { id: 'c', label: t('devkit.stepper.restart'), status: 'pending' },
              { id: 'd', label: t('devkit.stepper.verify'), status: 'error' },
              { id: 'e', label: t('devkit.stepper.rollback'), status: 'branch' },
            ]}
          />
        </div>
        <Stepper
          orientation="vertical"
          label={t('devkit.stepper.label')}
          steps={[
            { id: 'a', label: t('devkit.stepper.download'), status: 'done' },
            { id: 'b', label: t('devkit.stepper.migrate'), status: 'running' },
            { id: 'c', label: t('devkit.stepper.restart'), status: 'pending' },
          ]}
        />
      </Section>

      <Section id="banners" title={t('devkit.section.banners')}>
        <div className="ga-kit__wide ga-kit__stack">
          <WarningBanner tone="info">{t('devkit.banner.infoBody')}</WarningBanner>
          <WarningBanner tone="warn" title={t('devkit.banner.warnTitle')} onDismiss={() => undefined}>
            {t('devkit.banner.warnBody')}
          </WarningBanner>
          <WarningBanner tone="danger" blocking actions={<Button size="sm">{t('common.retry')}</Button>}>
            {t('devkit.banner.dangerBody')}
          </WarningBanner>
          <WarningBanner
            tone="warn"
            blocking
            ack={{ label: t('devkit.banner.ackLabel'), checked: ack, onChange: setAck }}
          >
            {t('devkit.banner.warnBody')}
          </WarningBanner>
        </div>
      </Section>

      <Section id="empty" title={t('devkit.section.empty')}>
        {(['desk', 'cabinet', 'shelf', 'socket', 'ledger', 'tree', 'star'] as const).map((illustration) => (
          <EmptyState
            key={illustration}
            illustration={illustration}
            title={t('devkit.empty.title')}
            description={t('devkit.empty.body')}
            action={<Button size="sm">{t('devkit.empty.cta')}</Button>}
          />
        ))}
      </Section>

      <Section id="skeleton" title={t('devkit.section.skeleton')}>
        <div className="ga-kit__wide ga-kit__stack">
          <SkeletonLines lines={3} />
          <SkeletonGrid rows={4} columns={4} />
          <Skeleton variant="block" width={50} />
        </div>
      </Section>

      <Section id="dropzone" title={t('devkit.section.dropzone')}>
        <div className="ga-kit__wide">
          <FileDropzone targetLabel={t('devkit.dropzone.target')} onFiles={() => undefined} maxBytes={25 * 1024 * 1024}>
            <SkeletonLines lines={2} />
          </FileDropzone>
        </div>
      </Section>

      <Section id="overlays" title={t('devkit.section.overlays')}>
        <Button onClick={() => toast.push({ kind: 'ok', title: t('devkit.overlay.toastOk') })}>
          {t('devkit.overlay.toastOk')}
        </Button>
        <Button
          onClick={() =>
            toast.push({
              kind: 'warn',
              title: t('devkit.overlay.toastWarn'),
              detail: t('devkit.overlay.toastDetail'),
              ref: 'EV-8842',
              action: { label: t('devkit.overlay.toastAction'), onClick: () => undefined },
            })
          }
        >
          {t('devkit.overlay.toastWarn')}
        </Button>
        <Button onClick={() => toast.push({ kind: 'danger', title: t('devkit.overlay.toastDanger') })}>
          {t('devkit.overlay.toastDanger')}
        </Button>
        <Button variant="danger" onClick={() => setConfirm(true)}>
          {t('devkit.overlay.confirm')}
        </Button>
        <Button onClick={() => setModal(true)}>{t('devkit.overlay.modal')}</Button>
        <Button onClick={() => setOverlay('palette')}>{t('devkit.overlay.palette')}</Button>
        <Button onClick={() => setOverlay('notifications')}>{t('devkit.overlay.notifications')}</Button>
        <Button onClick={() => setOverlay('shortcuts')}>{t('devkit.overlay.shortcuts')}</Button>
        {confirmed ? (
          <StatusChip tone="ok" icon={Check}>
            {t('devkit.overlay.confirmed')}
          </StatusChip>
        ) : null}
      </Section>

      <Section id="log" title={t('devkit.section.log')}>
        <div className="ga-kit__wide ga-kit__log">
          <LogStream lines={SAMPLE_LOG} label={t('devkit.log.label')} timeZone={SAMPLE_TZ} />
        </div>
      </Section>

      <Section id="versions" title={t('devkit.section.versions')}>
        <div className="ga-kit__wide">
          <VersionHistory
            revisions={SAMPLE_REVISIONS}
            label={t('devkit.versions.label')}
            timeZone={SAMPLE_TZ}
            onRestore={() => undefined}
          />
        </div>
      </Section>

      <Section id="provenance" title={t('devkit.section.provenance')}>
        <ProvenanceMark source="owner">{t('devkit.provenance.owner')}</ProvenanceMark>
        <ProvenanceMark source="ai" onConfirm={() => undefined} onEdit={() => undefined}>
          {t('devkit.provenance.ai')}
        </ProvenanceMark>
        <ProvenanceMark source="system">{t('devkit.provenance.system')}</ProvenanceMark>
        <ProvenanceLegend />
      </Section>

      <Section id="changeset" title={t('devkit.section.changeset')}>
        <div className="ga-kit__wide">
          <ChangeSetTray
            items={SAMPLE_CHANGES}
            onApply={() => undefined}
            onReject={() => undefined}
            onApplyAll={() => undefined}
            budget={{ current: 1795, ceiling: 2000 }}
          />
        </div>
      </Section>

      <Section id="cards" title={t('devkit.section.cards')}>
        {cardStates.map((status) => (
          <EmployeeCard
            key={status}
            name="Mai"
            position={t('devkit.card.position')}
            cardNo="CD-0004"
            status={status}
            supersededBy="CD-0005"
            issuedAt={SAMPLE_NOW}
            timeZone={SAMPLE_TZ}
            backLines={[{ label: t('devkit.card.term'), value: t('devkit.card.termValue') }]}
            avatar={<RoleAvatar name="Mai" color="teal" size={48} />}
          />
        ))}
        <BirthCertificate
          title={t('devkit.birth.title')}
          template="GA-01"
          fileNo="GA-2026-0001"
          signed={{ at: SAMPLE_NOW, by: t('devkit.provenance.owner') }}
          timeZone={SAMPLE_TZ}
          sections={[
            {
              roman: 'I',
              title: t('devkit.birth.identity'),
              fields: [
                { key: 'name', label: t('devkit.birth.name'), value: t('devkit.provenance.owner'), source: 'owner' },
                {
                  key: 'tone',
                  label: t('devkit.birth.tone'),
                  value: t('devkit.provenance.ai'),
                  source: 'ai',
                  onConfirm: () => undefined,
                },
                { key: 'dna', label: t('devkit.birth.dna'), value: t('devkit.provenance.system'), source: 'system' },
              ],
            },
            {
              roman: 'II',
              title: t('devkit.birth.traits'),
              fields: [
                {
                  key: 'patience',
                  label: t('devkit.birth.patience'),
                  value: { trait: 4, text: t('devkit.birth.high') },
                  source: 'ai',
                },
              ],
            },
          ]}
        />
      </Section>

      <Section id="quiet" title={t('devkit.section.quiet')}>
        <div className="ga-kit__wide">
          <QuietHoursTimeline value={quiet} onChange={setQuiet} nowMinutes={14 * 60 + 6} />
        </div>
      </Section>

      <ConfirmModal
        open={confirm}
        title={t('devkit.overlay.confirmTitle')}
        consequences={[
          t('devkit.overlay.consequence1'),
          t('devkit.overlay.consequence2'),
          t('devkit.overlay.consequence3'),
        ]}
        confirmPhrase="Mai"
        confirmLabel={t('devkit.overlay.confirmLabel')}
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          setConfirmed(true);
        }}
      />
      <Modal
        open={modal}
        title={t('devkit.overlay.modalTitle')}
        onClose={() => setModal(false)}
        footer={<Button onClick={() => setModal(false)}>{t('common.close')}</Button>}
      >
        {t('devkit.overlay.modalBody')}
      </Modal>
      <CommandPalette
        open={overlay === 'palette'}
        onClose={() => setOverlay(null)}
        items={SAMPLE_PALETTE.map((p) => ({ ...p, run: () => undefined }))}
      />
      <NotificationCenter
        open={overlay === 'notifications'}
        onClose={() => setOverlay(null)}
        items={SAMPLE_NOTIFICATIONS}
        now={SAMPLE_NOW}
        timeZone={SAMPLE_TZ}
      />
      <ShortcutsDialog open={overlay === 'shortcuts'} onClose={() => setOverlay(null)} />
    </div>
  );
}
