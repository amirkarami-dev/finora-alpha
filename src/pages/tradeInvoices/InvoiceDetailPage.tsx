import { useParams } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="fade-in">
      <PageHeader title={id} onBack />
    </div>
  );
}
