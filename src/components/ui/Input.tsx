'use client';

import React, { forwardRef, useState } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/utils/cn';

const inputVariants = cva(
  'flex w-full rounded-xl border border-white/20 bg-white/5 backdrop-blur-md px-3 py-2 text-sm text-white placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200',
  {
    variants: {
      variant: {
        default: 'hover:border-white/30 focus:bg-white/10',
        filled: 'bg-white/10 border-white/30 hover:bg-white/15 focus:bg-white/20',
        outline: 'border-2 border-white/20 bg-transparent hover:border-white/40 focus:border-white/60'
      },
      size: {
        sm: 'h-8 px-2 text-xs',
        default: 'h-10 px-3',
        lg: 'h-12 px-4 text-base'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
);

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement>,
    VariantProps<typeof inputVariants> {
  label?: string;
  description?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  showPasswordToggle?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ 
    className, 
    variant, 
    size, 
    type = 'text', 
    label, 
    description, 
    error, 
    leftIcon, 
    rightIcon, 
    showPasswordToggle,
    id,
    required,
    'aria-describedby': ariaDescribedBy,
    ...props 
  }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    
    const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;
    const descriptionId = description ? `${inputId}-description` : undefined;
    const errorId = error ? `${inputId}-error` : undefined;
    
    const describedBy = [ariaDescribedBy, descriptionId, errorId].filter(Boolean).join(' ') || undefined;
    
    const isPassword = type === 'password';
    const actualType = isPassword && showPassword ? 'text' : type;
    
    const hasError = !!error;
    const hasLeftIcon = !!leftIcon;
    const hasRightIcon = !!rightIcon || (isPassword && showPasswordToggle);

    return (
      <div className="w-full">
        {/* Label */}
        {label && (
          <label 
            htmlFor={inputId}
            className={cn(
              'block text-sm font-medium text-white mb-2',
              required && "after:content-['*'] after:ml-0.5 after:text-red-500"
            )}
          >
            {label}
          </label>
        )}
        
        {/* Description */}
        {description && (
          <p id={descriptionId} className="text-xs text-white/70 mb-2">
            {description}
          </p>
        )}
        
        {/* Input Container */}
        <div className="relative">
          {/* Left Icon */}
          {hasLeftIcon && (
            <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/60 pointer-events-none">
              {leftIcon}
            </div>
          )}
          
          {/* Input */}
          <input
            ref={ref}
            id={inputId}
            type={actualType}
            className={cn(
              inputVariants({ variant, size }),
              hasError && 'border-red-500 focus:ring-red-500',
              hasLeftIcon && 'pl-10',
              hasRightIcon && 'pr-10',
              className
            )}
            aria-invalid={hasError}
            aria-describedby={describedBy}
            aria-required={required}
            onFocus={(e) => {
              setIsFocused(true);
              props.onFocus?.(e);
            }}
            onBlur={(e) => {
              setIsFocused(false);
              props.onBlur?.(e);
            }}
            {...props}
          />
          
          {/* Right Icon / Password Toggle */}
          {hasRightIcon && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
              {isPassword && showPasswordToggle ? (
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-white/60 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-ring rounded-sm p-1"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  <i className={`fas fa-${showPassword ? 'eye-slash' : 'eye'}`} />
                </button>
              ) : (
                <div className="text-white/60 pointer-events-none">
                  {rightIcon}
                </div>
              )}
            </div>
          )}
          
          {/* Focus Ring */}
          {isFocused && (
            <div className="absolute inset-0 rounded-xl ring-2 ring-ring pointer-events-none" />
          )}
        </div>
        
        {/* Error Message */}
        {error && (
          <p id={errorId} className="mt-2 text-sm text-red-400" role="alert">
            <i className="fas fa-exclamation-circle mr-1" aria-hidden="true" />
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export { Input };