/** Table primitives with a horizontal scroll wrapper for small screens. */

export function Table({ children, className = '', minWidth = 'min-w-[640px]' }) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full border-collapse text-left text-[13.5px] ${minWidth} ${className}`}>
        {children}
      </table>
    </div>
  )
}

export function TableHead({ children }) {
  return (
    <thead className="bg-surface-2/70">
      <tr className="border-b border-line">{children}</tr>
    </thead>
  )
}

export function TableBody({ children }) {
  return <tbody className="divide-y divide-line">{children}</tbody>
}

export function TableRow({ children, className = '', ...props }) {
  return (
    <tr className={`transition-colors hover:bg-surface-2/60 ${className}`} {...props}>
      {children}
    </tr>
  )
}

export function TH({ children, className = '', ...props }) {
  return (
    <th
      scope="col"
      className={`px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-muted sm:px-5 ${className}`}
      {...props}
    >
      {children}
    </th>
  )
}

export function TD({ children, className = '', ...props }) {
  return (
    <td className={`px-4 py-3 align-middle text-ink-soft sm:px-5 ${className}`} {...props}>
      {children}
    </td>
  )
}

export default Table
