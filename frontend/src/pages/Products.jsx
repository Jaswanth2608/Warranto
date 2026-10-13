import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, FileText, FileX, Package, Pencil, Plus, SlidersHorizontal, Trash2, X } from 'lucide-react'

import {
  Card,
  EmptyState,
  ErrorState,
  ListSkeleton,
  PageHeader,
  Select,
  StatusBadge,
  Table,
  TableBody,
  TableHead,
  TH,
  TD,
  TableRow,
  Dropdown,
  DropdownItem,
  DropdownSeparator,
  buttonClasses,
} from '../components/ui'
import SearchInput from '../components/common/SearchInput'
import ProductIcon from '../components/common/ProductIcon'

import { useProductStore } from '../context/ProductStore'
import { useDeleteProduct } from '../hooks/useDeleteProduct'
import { useDebounce } from '../hooks/useDebounce'
import { useDocumentTitle } from '../hooks/useUi'
import { filterAndSortProducts, getWarrantyStats } from '../utils/selectors'
import { formatDate } from '../utils/dates'
import { getWarrantyInfo } from '../utils/warranty'
import { CATEGORIES, CATEGORY_LABELS, PRODUCT_FILTERS, SORT_OPTIONS } from '../utils/constants'

function RowMenu({ product, onView, onEdit, onDelete }) {
  return (
    <Dropdown
      trigger={
        <button
          type="button"
          className="rounded-[7px] p-1.5 text-muted transition hover:bg-surface-2 hover:text-ink"
          aria-label={`Actions for ${product.name}`}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="5" cy="12" r="1" />
            <circle cx="12" cy="12" r="1" />
            <circle cx="19" cy="12" r="1" />
          </svg>
        </button>
      }
    >
      <DropdownItem icon={Eye} onClick={onView}>
        View details
      </DropdownItem>
      <DropdownItem icon={Pencil} onClick={onEdit}>
        Edit product
      </DropdownItem>
      <DropdownSeparator />
      <DropdownItem icon={Trash2} danger onClick={onDelete}>
        Delete product
      </DropdownItem>
    </Dropdown>
  )
}

function MobileRow({ product, onView, onEdit, onDelete }) {
  const info = getWarrantyInfo(product)
  return (
    <li className="flex items-start gap-3 px-4 py-3.5">
      <ProductIcon product={product} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium text-ink">{product.name}</p>
            <p className="truncate text-[12.5px] text-muted">
              {product.brand} · {CATEGORY_LABELS[product.category]}
            </p>
          </div>
          <StatusBadge status={info.status} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted">
          <span>Purchased {formatDate(product.purchaseDate)}</span>
          <span className="text-ink-soft">Expires {formatDate(info.expiryDate)}</span>
          <span className={info.status === 'expired' ? 'text-danger-700' : info.status === 'expiring' ? 'text-warning-700' : ''}>
            {info.dayLabel}
          </span>
          <span className="inline-flex items-center gap-1.5">
            {product.bill ? (
              <>
                <FileText size={12} className="text-success-700" aria-hidden="true" />
                Bill
              </>
            ) : (
              <>
                <FileX size={12} aria-hidden="true" />
                No bill
              </>
            )}
          </span>
        </div>
      </div>
      <RowMenu product={product} onView={onView} onEdit={onEdit} onDelete={onDelete} />
    </li>
  )
}

export function Products() {
  useDocumentTitle('My Products')
  const { products, loading, error, retry } = useProductStore()
  const { requestDelete, dialog } = useDeleteProduct()
  const navigate = useNavigate()

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [category, setCategory] = useState('all')
  const [sortBy, setSortBy] = useState('newest')

  const debouncedQuery = useDebounce(query, 250)
  const stats = getWarrantyStats(products)

  const counts = {
    all: stats.total,
    active: stats.active,
    expiring: stats.expiring,
    expired: stats.expired,
  }

  const filtered = useMemo(
    () =>
      filterAndSortProducts(products, {
        query: debouncedQuery,
        status,
        category,
        sortBy,
      }),
    [products, debouncedQuery, status, category, sortBy],
  )

  const hasActiveFilters = Boolean(debouncedQuery) || status !== 'all' || category !== 'all'

  const clearFilters = () => {
    setQuery('')
    setStatus('all')
    setCategory('all')
    setSortBy('newest')
  }

  const openProduct = (product) => navigate(`/products/${product.id}`)
  const editProduct = (product) => navigate(`/products/${product.id}/edit`)

  return (
    <div className="space-y-5">
      <PageHeader
        title="My Products"
        subtitle="Keep track of everything you've purchased."
        actions={
          <Link to="/products/new" className={buttonClasses({ icon: Plus })}>
            Add Product
          </Link>
        }
      />

      <Card className="p-3.5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search products, brands, model numbers..."
            label="Search products"
            className="lg:flex-1"
          />

          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <Select
              aria-label="Filter by category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="sm:w-44"
            >
              <option value="all">All categories</option>
              {CATEGORIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>

            <Select
              aria-label="Sort products"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
              className="sm:w-44"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-0.5">
          <span className="hidden shrink-0 items-center gap-1.5 text-[12px] font-medium text-muted sm:flex">
            <SlidersHorizontal size={12} aria-hidden="true" />
            Filter
          </span>
          <div className="inline-flex shrink-0 gap-0.5 rounded-[8px] border border-line bg-canvas p-0.5">
            {PRODUCT_FILTERS.map((filter) => {
              const active = status === filter.value
              return (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setStatus(filter.value)}
                  aria-pressed={active}
                  className={`rounded-[6px] px-2.5 py-1 text-[12.5px] transition ${
                    active
                      ? 'bg-surface-2 font-medium text-ink'
                      : 'font-medium text-muted hover:text-ink'
                  }`}
                >
                  {filter.label}
                  <span className={`ml-1.5 tabular-nums ${active ? 'text-brand-400' : 'text-muted/70'}`}>
                    {counts[filter.value] ?? 0}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12.5px] text-muted">
          Showing <span className="font-medium text-ink-soft">{filtered.length}</span> of{' '}
          {products.length} products
        </p>
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-brand-400 transition hover:text-brand-300"
          >
            <X size={12} aria-hidden="true" />
            Clear filters
          </button>
        ) : null}
      </div>

      {loading ? <ListSkeleton rows={6} columns={4} /> : null}

      {!loading && error ? <ErrorState onRetry={retry} /> : null}

      {!loading && !error && products.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No products yet"
          description="Start by adding your first purchase to begin tracking its warranty."
          action={
            <Link to="/products/new" className={buttonClasses({ icon: Plus })}>
              Add Product
            </Link>
          }
        />
      ) : null}

      {!loading && !error && products.length > 0 && filtered.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No products match your filters"
          description="Try a different search term, or clear the filters to see everything you own."
          action={
            <button
              type="button"
              onClick={clearFilters}
              className={buttonClasses({ variant: 'secondary' })}
            >
              Clear filters
            </button>
          }
        />
      ) : null}

      {!loading && !error && filtered.length > 0 ? (
        <>
          {/* Desktop inventory table */}
          <Card className="hidden overflow-hidden lg:block">
            <Table minWidth="min-w-[860px]">
              <TableHead>
                <TH>Product</TH>
                <TH>Brand</TH>
                <TH className="hidden xl:table-cell">Category</TH>
                <TH>Purchase date</TH>
                <TH>Warranty expiry</TH>
                <TH>Status</TH>
                <TH className="hidden xl:table-cell">Bill</TH>
                <TH className="text-right">Actions</TH>
              </TableHead>
              <TableBody>
                {filtered.map((product) => {
                  const info = getWarrantyInfo(product)
                  return (
                    <TableRow key={product.id}>
                      <TD>
                        <div className="flex items-center gap-3">
                          <ProductIcon product={product} size="sm" />
                          <Link
                            to={`/products/${product.id}`}
                            className="truncate text-[13.5px] font-medium text-ink hover:text-brand-400"
                          >
                            {product.name}
                          </Link>
                        </div>
                      </TD>
                      <TD className="whitespace-nowrap">{product.brand}</TD>
                      <TD className="hidden whitespace-nowrap text-muted xl:table-cell">
                        {CATEGORY_LABELS[product.category]}
                      </TD>
                      <TD className="whitespace-nowrap">{formatDate(product.purchaseDate)}</TD>
                      <TD className="whitespace-nowrap">{formatDate(info.expiryDate)}</TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={info.status} />
                          <span className="hidden whitespace-nowrap text-[12.5px] text-muted 2xl:inline">
                            {info.dayLabel}
                          </span>
                        </div>
                      </TD>
                      <TD className="hidden xl:table-cell">
                        {product.bill ? (
                          <span className="inline-flex items-center gap-1.5 text-[12.5px] text-success-700">
                            <FileText size={13} aria-hidden="true" />
                            Stored
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted">
                            <FileX size={13} aria-hidden="true" />
                            None
                          </span>
                        )}
                      </TD>
                      <TD className="text-right">
                        <div className="flex justify-end">
                          <RowMenu
                            product={product}
                            onView={() => openProduct(product)}
                            onEdit={() => editProduct(product)}
                            onDelete={() => requestDelete(product)}
                          />
                        </div>
                      </TD>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Card>

          {/* Mobile / tablet rows */}
          <Card className="overflow-hidden lg:hidden">
            <ul className="divide-y divide-line">
              {filtered.map((product) => (
                <MobileRow
                  key={product.id}
                  product={product}
                  onView={() => openProduct(product)}
                  onEdit={() => editProduct(product)}
                  onDelete={() => requestDelete(product)}
                />
              ))}
            </ul>
          </Card>
        </>
      ) : null}

      {dialog}
    </div>
  )
}

export default Products
