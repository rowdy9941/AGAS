import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Input, Select, Space, Spin, Tabs, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import type { AgasWorkspace, SurfaceBounds } from '@/common/platform/agas';
import LocalAgents from '../settings/AgentSettings/LocalAgents';
import AgencyCatalog from './AgencyCatalog';
import styles from './workspace.module.css';
const NativeWorkspace: React.FC = () => {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<AgasWorkspace[]>([]);
  const [selected, setSelected] = useState('paperclip');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const api = window.agas;
  const bounds = (): SurfaceBounds => {
    const rect = host.current!.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  };
  const refresh = useCallback(async () => {
    if (!api) return;
    const values = await api.list();
    setEntries(values);
    setUrl(values.find((entry) => entry.id === selected)?.url ?? '');
  }, [api, selected]);
  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true); setError('');
    try { await action(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };
  useEffect(() => { void refresh().catch((reason: unknown) => setError(String(reason))); }, [refresh]);
  useEffect(() => {
    if (!api || !host.current) return;
    const observer = new ResizeObserver(() => { void api.resize(bounds()).catch((reason: unknown) => setError(String(reason))); });
    observer.observe(host.current);
    return () => { observer.disconnect(); void api.close().catch(() => {}); };
  }, [api]);
  const selectedEntry = entries.find((entry) => entry.id === selected);
  if (!api) return <Alert type='info' content={t('common.agas.desktopOnly')} />;
  return <div className={styles.native}>
    <Space wrap>
      <Select aria-label={t('common.agas.workspace')} value={selected} disabled={busy} style={{ width: 180 }} onChange={(id: string) => {
        void run(async () => { await api.close(); setOpened(false); setSelected(id); });
      }} options={entries.map((entry) => ({ value: entry.id, label: entry.name }))} />
      <Input aria-label={t('common.agas.url')} placeholder='http://127.0.0.1:3100' value={url} disabled={busy || opened} onChange={setUrl} style={{ width: 280 }} />
      <Button disabled={busy || opened} onClick={() => void run(async () => { await api.configure(selected, url); await refresh(); })}>{t('common.save')}</Button>
      <Button type='primary' disabled={busy || !selectedEntry?.url || opened} onClick={() => void run(async () => { await api.open(selected, bounds()); setOpened(true); })}>{t('common.agas.open')}</Button>
      <Button disabled={busy || !opened} onClick={() => void run(async () => { await api.close(); setOpened(false); })}>{t('common.close')}</Button>
      <Button disabled={busy || opened} onClick={() => void run(refresh)}>{t('common.agas.refresh')}</Button>
    </Space>
    {error && <Alert type='error' content={error} />}
    {!opened && <Alert type='info' content={t('common.agas.nativeHelp')} />}
    {!opened && selectedEntry && <Typography.Text type='secondary'>{t(`common.agas.${selectedEntry.status}`)}</Typography.Text>}
    <div ref={host} className={styles.host} aria-label={t('common.agas.nativeRegion')}>
      {!opened && <div className={styles.empty}>{busy ? <Spin /> : t('common.agas.empty')}</div>}
    </div>
  </div>;
};
const AgentWorkspace: React.FC = () => {
  const { t } = useTranslation();
  const [tab, setTab] = useState('native');
  return <div className={styles.page}>
    <Typography.Title heading={4}>{t('common.agas.title')}</Typography.Title>
    <Typography.Text type='secondary'>{t('common.agas.subtitle')}</Typography.Text>
    <Tabs activeTab={tab} onChange={setTab}>
      <Tabs.TabPane key='native' title={t('common.agas.native')} />
      <Tabs.TabPane key='catalog' title={t('common.agas.catalog')} />
      <Tabs.TabPane key='agents' title={t('common.agas.agents')} />
    </Tabs>
    {tab === 'catalog' ? <AgencyCatalog /> : tab === 'native' ? <NativeWorkspace /> : <div className={styles.agents}><LocalAgents /></div>}
  </div>;
};
export default AgentWorkspace;
