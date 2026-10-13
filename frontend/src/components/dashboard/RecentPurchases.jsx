import { Link } from 'react-router-dom'
import { FileText, FileX } from 'lucide-react'

import { StatusBadge, Table, TableBody, TableHead, TH, TD, TableRow } from '../ui'
import ProductIcon from '../common/ProductIcon'
import { formatDate } from '../../utils/dates'
import { formatCurrency } from '../../utils/format'
import { getWarrantyInfo } from '../../utils/warranty'
import { CATEGORY_LABELS } from '../../utils/constants'

/** Recent purchases as a clean, dense table. */
export function RecentPurchases({ products, maxRows = 6 }) {
  const rows = products.slice(0, maxRows)
  if (rows.length === 0) return null

  return (
    <Table minWidth="min-w-[620px]">
      <TableHead>
        <TH>Product</TH>
        <TH className="hidden md:table-cell">Category</TH>
        <TH className="hidden sm:table-cell">Purchased</TH>
        <TH className="hidden lg:table-cell">Price</TH>
        <TH>Status</TH>
        <TH className="text-right">Bill</TH>
      </TableHead>
      <TableBody>
        {rows.map((product) => {
          const info = getWarrantyInfo(product)
          return (
          <TableRow key={product.id}>
            <TD>
              <Link to={`/products/${product.id}`} className="flex items-center gap-3">
                <ProductIcon product={product} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-medium text-ink">
                    {product.name}
                  </span>
                  <span className="block truncate text-[12px] text-muted">{product.brand}</span>
                </span>
              </Link>
            </TD>
            <TD className="hidden text-muted md:table-cell">
              {CATEGORY_LABELS[product.category]}
            </TD>
            <TD className="hidden whitespace-nowrap sm:table-cell">
              {formatDate(product.purchaseDate)}
            </TD>
            <TD className="hidden whitespace-nowrap lg:table-cell">
              {formatCurrency(product.purchasePrice)}
            </TD>
            <TD>
              <StatusBadge status={info.status} />
            </TD>
            <TD className="text-right">
              {product.bill ? (
                <span
                  className="inline-flex items-center gap-1.5 text-[12.5px] text-success-700"
                  title={`${product.bill.fileName}`}
                >
                  <FileText size={13} aria-hidden="true" />
                  <span className="hidden sm:inline">Stored</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted">
                  <FileX size={13} aria-hidden="true" />
                  <span className="hidden sm:inline">None</span>
                </span>
              )}
            </TD>
          </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

export default RecentPurchases
