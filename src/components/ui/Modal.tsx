'use client';

import React, { forwardRef, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/utils/cn';

const modalVariants = cva(
  'relative bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl shadow-black/20 dark:shadow-black/50 transition-all duration-300 ease-in-out',
  {
    variants: {
      size: {
        sm: 'max-w-sm w-full',
        default: 'max-w-md w-full',
        lg: 'max-w-lg w-full',
        xl: 'max-w-xl w-full',
        '2xl': 'max-w-2xl w-full',
        '3xl': 'max-w-3xl w-full',
        '4xl': 'max-w-4xl w-full',
        full: 'w-full h-full max-w-none'
      }
    },
    defaultVariants: {
      size: 'default'
    }
  }
);

export interface ModalProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof modalVariants> {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  showCloseButton?: boolean;
  closeOnOverlayClick?: boolean;
  closeOnEscapeKey?: boolean;
  preventScrollLock?: boolean;
  initialFocus?: React.RefObject<HTMLElement>;
}

const Modal = forwardRef<HTMLDivElement, ModalProps>(
  ({ 
    className, 
    size, 
    isOpen, 
    onClose, 
    title, 
    description,
    showCloseButton = true,
    closeOnOverlayClick = true,
    closeOnEscapeKey = true,
    preventScrollLock = false,
    initialFocus,
    children,
    ...props 
  }, ref) => {
    const modalRef = useRef<HTMLDivElement>(null);
    const overlayRef = useRef<HTMLDivElement>(null);
    const previousActiveElement = useRef<HTMLElement | null>(null);
    
    // Focus management
    useEffect(() => {
      if (isOpen) {
        // Store the currently focused element
        previousActiveElement.current = document.activeElement as HTMLElement;
        
        // Focus the modal or initial focus element
        setTimeout(() => {
          if (initialFocus?.current) {
            initialFocus.current.focus();
          } else if (modalRef.current) {
            modalRef.current.focus();
          }
        }, 0);
      } else {
        // Return focus to previously focused element
        if (previousActiveElement.current) {
          previousActiveElement.current.focus();
        }
      }
    }, [isOpen, initialFocus]);
    
    // Scroll lock
    useEffect(() => {
      if (isOpen && !preventScrollLock) {
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = 'unset';
      }
      
      return () => {
        document.body.style.overflow = 'unset';
      };
    }, [isOpen, preventScrollLock]);
    
    // Escape key handler
    useEffect(() => {
      const handleEscape = (event: KeyboardEvent) => {
        if (closeOnEscapeKey && event.key === 'Escape') {
          onClose();
        }
      };
      
      if (isOpen) {
        document.addEventListener('keydown', handleEscape);
      }
      
      return () => {
        document.removeEventListener('keydown', handleEscape);
      };
    }, [isOpen, closeOnEscapeKey, onClose]);
    
    // Focus trap
    useEffect(() => {
      const handleTabKey = (event: KeyboardEvent) => {
        if (event.key !== 'Tab' || !modalRef.current) return;
        
        const focusableElements = modalRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        
        const firstFocusable = focusableElements[0] as HTMLElement;
        const lastFocusable = focusableElements[focusableElements.length - 1] as HTMLElement;
        
        if (event.shiftKey) {
          if (document.activeElement === firstFocusable) {
            lastFocusable.focus();
            event.preventDefault();
          }
        } else {
          if (document.activeElement === lastFocusable) {
            firstFocusable.focus();
            event.preventDefault();
          }
        }
      };
      
      if (isOpen) {
        document.addEventListener('keydown', handleTabKey);
      }
      
      return () => {
        document.removeEventListener('keydown', handleTabKey);
      };
    }, [isOpen]);
    
    if (!isOpen) return null;
    
    const modalContent = (
      <div
        ref={overlayRef}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        onClick={closeOnOverlayClick ? (e) => {
          if (e.target === overlayRef.current) {
            onClose();
          }
        } : undefined}
      >
        <div
          ref={ref || modalRef}
          className={cn(modalVariants({ size }), className)}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? 'modal-title' : undefined}
          aria-describedby={description ? 'modal-description' : undefined}
          tabIndex={-1}
          {...props}
        >
          {/* Close Button */}
          {showCloseButton && (
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="Close modal"
            >
              <i className="fas fa-times" />
            </button>
          )}

          {/* Content */}
          <div className="p-6">
            {title && (
              <h2 id="modal-title" className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                {title}
              </h2>
            )}

            {description && (
              <p id="modal-description" className="text-gray-600 dark:text-gray-300 mb-4">
                {description}
              </p>
            )}
            
            {children}
          </div>
        </div>
      </div>
    );
    
    return createPortal(modalContent, document.body);
  }
);

Modal.displayName = 'Modal';

// Modal components for composition
const ModalHeader = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex flex-col space-y-1.5 pb-4 border-b border-gray-200 dark:border-gray-700', className)}
      {...props}
    />
  )
);
ModalHeader.displayName = 'ModalHeader';

const ModalTitle = forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h2
      ref={ref}
      className={cn('text-lg font-semibold text-gray-900 dark:text-white', className)}
      {...props}
    />
  )
);
ModalTitle.displayName = 'ModalTitle';

const ModalDescription = forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn('text-sm text-gray-600 dark:text-gray-300', className)}
      {...props}
    />
  )
);
ModalDescription.displayName = 'ModalDescription';

const ModalContent = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex-1 py-4', className)}
      {...props}
    />
  )
);
ModalContent.displayName = 'ModalContent';

const ModalFooter = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 pt-4 border-t border-gray-200 dark:border-gray-700', className)}
      {...props}
    />
  )
);
ModalFooter.displayName = 'ModalFooter';

export { Modal, ModalHeader, ModalTitle, ModalDescription, ModalContent, ModalFooter };