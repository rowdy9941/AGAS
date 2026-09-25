import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Input, Message, Pagination, Space, Spin, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { createAgencyAssistant } from '@renderer/services/agency/createAssistant';
type Persona = {
  slug: string;
  name: string;
  division: string;
  description: string;
  body: string;
  source_path: string;
  source_commit: string;
  sha256: string;
};
const PAGE_SIZE = 12;
const AgencyCatalog: React.FC = () => {
  const { t } = useTranslation();
  const [agents, setAgents] = useState<Persona[]>([]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Persona>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createdSlug, setCreatedSlug] = useState('');
  const handleCreate = async (): Promise<void> => {
    if (!selected || creating) return;
    setCreating(true);
    setError('');
    try {
      await createAgencyAssistant(selected);
      setCreatedSlug(selected.slug);
      Message.success(t('common.createSuccess'));
    } catch (reason) {
      setError(`${t('common.saveFailed')}: ${reason instanceof Error ? reason.message : String(reason)}`);
    } finally {
      setCreating(false);
    }
  };
  useEffect(() => {
    const controller = new AbortController();
    void fetch('./agas/catalog.json', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(t('common.agas.catalogMissing'));
        const data: unknown = await response.json();
        if (!data || typeof data !== 'object' || !('agents' in data) || !Array.isArray(data.agents))
          throw new Error(t('common.agas.catalogMissing'));
        const valid = data.agents.every(
          (agent: unknown) =>
            agent &&
            typeof agent === 'object' &&
            ['slug', 'name', 'division', 'description', 'body', 'source_path', 'source_commit', 'sha256'].every(
              (key) => typeof (agent as Record<string, unknown>)[key] === 'string'
            )
        );
        if (!valid) throw new Error(t('common.agas.catalogMissing'));
        setAgents(data.agents as Persona[]);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(String(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [t]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return agents.filter((agent) =>
      `${agent.name} ${agent.division} ${agent.description}`.toLocaleLowerCase().includes(needle)
    );
  }, [agents, query]);
  if (loading) return <Spin />;
  return (
    <div className='flex flex-col gap-12px overflow-auto min-h-0'>
      {error && <Alert type='error' content={error} />}
      <Typography.Text type='secondary'>{t('common.agas.catalogCount', { count: agents.length })}</Typography.Text>
      <Input.Search
        aria-label={t('common.agas.search')}
        placeholder={t('common.agas.search')}
        value={query}
        onChange={(value) => {
          setQuery(value);
          setPage(1);
        }}
      />
      {selected ? (
        <Card title={selected.name} extra={<Button onClick={() => setSelected(undefined)}>{t('common.close')}</Button>}>
          <Typography.Paragraph>
            {selected.source_path} · {selected.source_commit.slice(0, 12)}
          </Typography.Paragraph>
          <Typography.Paragraph className='whitespace-pre-wrap'>{selected.body}</Typography.Paragraph>
          <Button
            type='primary'
            loading={creating}
            disabled={createdSlug === selected.slug}
            onClick={() => void handleCreate()}
          >
            {createdSlug === selected.slug ? t('common.createSuccess') : t('settings.createAssistant')}
          </Button>
        </Card>
      ) : (
        <>
          {filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((agent) => (
            <Card key={agent.slug} title={agent.name}>
              <Space direction='vertical'>
                <Typography.Text type='secondary'>{agent.division}</Typography.Text>
                <Typography.Paragraph>{agent.description}</Typography.Paragraph>
                <Button onClick={() => setSelected(agent)}>{t('common.agas.inspect')}</Button>
              </Space>
            </Card>
          ))}
          <Pagination current={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />
        </>
      )}
    </div>
  );
};
export default AgencyCatalog;
