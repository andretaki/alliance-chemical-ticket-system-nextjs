'use client';

import React, { forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/utils/cn';

const cardVariants = cva(
  'relative overflow-hidden rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl transition-all duration-300 ease-in-out',
  {
    variants: {
      variant: {
        default: 'shadow-lg shadow-black/10 hover:shadow-xl hover:shadow-black/20',
        elevated: 'shadow-xl shadow-black/20 hover:shadow-2xl hover:shadow-black/30 hover:-translate-y-1',
        glass: 'bg-white/10 backdrop-blur-2xl border-white/20 shadow-2xl shadow-black/40',
        solid: 'bg-white border-border shadow-md hover:shadow-lg',
        outline: 'border-2 border-white/20 bg-transparent hover:bg-white/5'
      },
      size: {
        sm: 'p-4',
        default: 'p-6',
        lg: 'p-8',
        xl: 'p-10'
      },
      interactive: {
        true: 'cursor-pointer hover:bg-white/10 hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        false: ''
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
      interactive: false
    }
  }
);

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {
  asChild?: boolean;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, size, interactive, role, tabIndex, ...props }, ref) => {
    // Set appropriate ARIA attributes for interactive cards
    const cardProps = {
      ...props,
      role: interactive ? (role || 'button') : role,
      tabIndex: interactive ? (tabIndex ?? 0) : tabIndex,
      className: cn(cardVariants({ variant, size, interactive, className }))
    };

    return (
      <div ref={ref} {...cardProps}>
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_2px_2px,_rgba(255,255,255,0.05)_1px,_transparent_0)] [background-size:24px_24px] opacity-30 -z-10" />
        
        {/* Content */}
        <div className="relative z-10">
          {props.children}
        </div>
        
        {/* Shine Effect for Interactive Cards */}
        {interactive && (
          <div className="absolute top-0 left-[-100%] w-full h-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 ease-in-out hover:translate-x-full -z-10" />
        )}
      </div>
    );
  }
);

Card.displayName = 'Card';

const CardHeader = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex flex-col space-y-1.5 pb-4', className)}
      {...props}
    />
  )
);
CardHeader.displayName = 'CardHeader';

const CardTitle = forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement> & { level?: 1 | 2 | 3 | 4 | 5 | 6 }>(
  ({ className, level = 3, ...props }, ref) => {
    const HeadingTag = `h${level}` as const;
    
    return (
      <HeadingTag
        ref={ref}
        className={cn('text-2xl font-bold leading-none tracking-tight text-white', className)}
        {...props}
      />
    );
  }
);
CardTitle.displayName = 'CardTitle';

const CardDescription = forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn('text-sm text-foreground-muted leading-relaxed', className)}
      {...props}
    />
  )
);
CardDescription.displayName = 'CardDescription';

const CardContent = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex-1', className)} {...props} />
  )
);
CardContent.displayName = 'CardContent';

const CardFooter = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex items-center pt-4 border-t border-white/10', className)}
      {...props}
    />
  )
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };