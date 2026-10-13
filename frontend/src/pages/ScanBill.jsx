import { useDocumentTitle } from '../hooks/useUi'
import { PageHeader } from '../components/ui'
import { ScanBillForm } from '../components/product'
import { PageHeaderIC } from '../icons'

export function ScanBill({ initialProductId, onCreated }) {
  useDocumentTitle('Scan Bill')
  return (
    <div className="space-y-6">
      <PageHeader
        title="Scan Bill"
        subtitle="Upload the invoice or receipt and let OCR suggest the fields. You review everything before any product is created."
        icon={<PageHeaderIC />}
      />

      <ScanBillForm initialProductId={initialProductId} onCreated={onCreated} />
    </div>
  )
}

export default ScanBill
