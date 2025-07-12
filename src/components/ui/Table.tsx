'use client';

import React, { forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/utils/cn';

const tableVariants = cva(
  'w-full border-collapse border-spacing-0 rounded-xl overflow-hidden',
  {
    variants: {
      variant: {
        default: 'bg-white/5 backdrop-blur-xl border border-white/10',
        glass: 'bg-white/10 backdrop-blur-2xl border border-white/20',
        solid: 'bg-white border border-gray-200'
      },
      size: {
        sm: 'text-sm',
        default: 'text-sm',
        lg: 'text-base'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
);

export interface TableProps
  extends React.TableHTMLAttributes<HTMLTableElement>,
    VariantProps<typeof tableVariants> {
  caption?: string;
  'aria-label'?: string;
}

const Table = forwardRef<HTMLTableElement, TableProps>(
  ({ className, variant, size, caption, ...props }, ref) => (
    <div className="relative overflow-hidden rounded-xl">
      <div className="overflow-x-auto">
        <table
          ref={ref}
          className={cn(tableVariants({ variant, size }), className)}
          {...props}
        >
          {caption && (
            <caption className="sr-only">
              {caption}
            </caption>
          )}
          {props.children}
        </table>
      </div>
    </div>
  )
);
Table.displayName = 'Table';

const TableHeader = forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead
      ref={ref}
      className={cn('bg-white/10 backdrop-blur-sm', className)}
      {...props}
    />
  )
);
TableHeader.displayName = 'TableHeader';

const TableBody = forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody
      ref={ref}
      className={cn('divide-y divide-white/10', className)}
      {...props}
    />
  )
);
TableBody.displayName = 'TableBody';

const TableFooter = forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tfoot
      ref={ref}
      className={cn('bg-white/5 backdrop-blur-sm border-t border-white/10', className)}
      {...props}
    />
  )
);
TableFooter.displayName = 'TableFooter';

const TableRow = forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement> & { interactive?: boolean }>(
  ({ className, interactive, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        'border-b border-white/10 transition-colors duration-200',
        interactive && 'hover:bg-white/5 cursor-pointer focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring',
        className
      )}
      tabIndex={interactive ? 0 : undefined}
      role={interactive ? 'button' : undefined}
      {...props}
    />
  )
);
TableRow.displayName = 'TableRow';

const TableHead = forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement> & { sortable?: boolean; sortDirection?: 'asc' | 'desc' | null }>(
  ({ className, sortable, sortDirection, children, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        'h-12 px-4 text-left align-middle font-semibold text-white/90 [&:has([role=checkbox])]:pr-0',
        sortable && 'cursor-pointer hover:bg-white/5 focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring',
        className
      )}
      tabIndex={sortable ? 0 : undefined}
      role={sortable ? 'button' : undefined}
      aria-sort={sortDirection ? (sortDirection === 'asc' ? 'ascending' : 'descending') : undefined}
      {...props}
    >
      <div className="flex items-center gap-2">
        {children}
        {sortable && (
          <div className="flex flex-col">
            <i className={cn(
              'fas fa-caret-up text-xs',
              sortDirection === 'asc' ? 'text-white' : 'text-white/30'
            )} />
            <i className={cn(
              'fas fa-caret-down text-xs -mt-1',
              sortDirection === 'desc' ? 'text-white' : 'text-white/30'
            )} />
          </div>
        )}
      </div>
    </th>
  )
);
TableHead.displayName = 'TableHead';

const TableCell = forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td
      ref={ref}
      className={cn('p-4 align-middle text-white/90 [&:has([role=checkbox])]:pr-0', className)}
      {...props}
    />
  )
);
TableCell.displayName = 'TableCell';

// Loading skeleton for tables
const TableSkeleton = ({ columns = 3, rows = 5 }: { columns?: number; rows?: number }) => (
  <Table>
    <TableHeader>
      <TableRow>
        {Array.from({ length: columns }).map((_, i) => (
          <TableHead key={i}>
            <div className="h-4 w-20 bg-white/10 rounded animate-pulse" />
          </TableHead>
        ))}
      </TableRow>
    </TableHeader>
    <TableBody>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: columns }).map((_, j) => (
            <TableCell key={j}>
              <div className="h-4 w-24 bg-white/10 rounded animate-pulse" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </TableBody>
  </Table>
);

// Empty state for tables
const TableEmpty = ({ message = 'No data available', icon }: { message?: string; icon?: React.ReactNode }) => (
  <div className="flex flex-col items-center justify-center py-12 px-4">
    <div className="text-white/40 text-4xl mb-4">
      {icon || <i className="fas fa-inbox" />}
    </div>
    <p className="text-white/70 text-center">{message}</p>
  </div>
);

export { 
  Table, 
  TableHeader, 
  TableBody, 
  TableFooter, 
  TableRow, 
  TableHead, 
  TableCell, 
  TableSkeleton, 
  TableEmpty 
};