import { useParams } from 'react-router-dom';

export default function InvoicePrintPage() {
  const { id } = useParams<{ id: string }>();

  return <div>{id}</div>;
}
