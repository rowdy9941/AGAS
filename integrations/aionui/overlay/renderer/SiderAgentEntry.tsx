import React from 'react';
import { Button, Tooltip } from '@arco-design/web-react';
import { Robot } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
type Props = { collapsed: boolean; active: boolean; onClick: () => void };
const SiderAgentEntry: React.FC<Props> = ({ collapsed, active, onClick }) => {
  const { t } = useTranslation();
  return (
    <Tooltip content={t('common.agas.title')} position='right'>
      <Button
        long
        type={active ? 'secondary' : 'text'}
        aria-label={t('common.agas.title')}
        aria-current={active ? 'page' : undefined}
        icon={<Robot size={16} />}
        onClick={onClick}
      >
        {!collapsed && t('common.agas.title')}
      </Button>
    </Tooltip>
  );
};
export default SiderAgentEntry;
