'use client';

import * as React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { CommandMenu } from './CommandMenu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import {
  LayoutDashboard,
  Ticket,
  Users,
  Plus,
  FileText,
  Search,
  ArrowUp,
  ArrowDown,
  CornerDownLeft,
  X,
  HelpCircle,
} from 'lucide-react';

// Shortcut definitions
interface Shortcut {
  key: string;
  label: string;
  description: string;
  category: 'navigation' | 'actions' | 'ticket';
  icon?: React.ElementType;
}

const shortcuts: Shortcut[] = [
  // Navigation
  { key: 'g d', label: 'G then D', description: 'Go to Dashboard', category: 'navigation', icon: LayoutDashboard },
  { key: 'g t', label: 'G then T', description: 'Go to Tickets', category: 'navigation', icon: Ticket },
  { key: 'g c', label: 'G then C', description: 'Go to Customers', category: 'navigation', icon: Users },

  // Actions
  { key: 'n t', label: 'N then T', description: 'New Ticket', category: 'actions', icon: Plus },
  { key: 'n q', label: 'N then Q', description: 'New Quote', category: 'actions', icon: FileText },
  { key: '⌘ k', label: '⌘K', description: 'Command Menu', category: 'actions', icon: Search },
  { key: '?', label: '?', description: 'Show Shortcuts', category: 'actions', icon: HelpCircle },

  // Ticket list
  { key: 'j', label: 'J', description: 'Move down in list', category: 'ticket', icon: ArrowDown },
  { key: 'k', label: 'K', description: 'Move up in list', category: 'ticket', icon: ArrowUp },
  { key: 'enter', label: 'Enter', description: 'Open selected', category: 'ticket', icon: CornerDownLeft },

  // Ticket detail
  { key: 'r', label: 'R', description: 'Reply', category: 'ticket' },
  { key: 'a', label: 'A', description: 'Assign to me', category: 'ticket' },
  { key: 'e', label: 'E', description: 'Edit', category: 'ticket' },
  { key: 'c', label: 'C', description: 'Close ticket', category: 'ticket', icon: X },
];

interface KeyboardShortcutsContextType {
  openCommandMenu: () => void;
  closeCommandMenu: () => void;
  isHelpOpen: boolean;
  setIsHelpOpen: (open: boolean) => void;
  selectedIndex: number;
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
}

const KeyboardShortcutsContext = React.createContext<KeyboardShortcutsContextType | null>(null);

export function useKeyboardShortcuts() {
  const context = React.useContext(KeyboardShortcutsContext);
  if (!context) {
    throw new Error('useKeyboardShortcuts must be used within KeyboardShortcutsProvider');
  }
  return context;
}

export function KeyboardShortcutsProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [commandMenuOpen, setCommandMenuOpen] = React.useState(false);
  const [isHelpOpen, setIsHelpOpen] = React.useState(false);
  const [selectedIndex, setSelectedIndex] = React.useState(-1);
  const [pendingKey, setPendingKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    let pendingTimeout: NodeJS.Timeout | null = null;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' ||
                      target.tagName === 'TEXTAREA' ||
                      target.isContentEditable;

      // Cmd/Ctrl + K to open command menu (works even in inputs)
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandMenuOpen(open => !open);
        return;
      }

      // Escape to close dialogs
      if (e.key === 'Escape') {
        if (isHelpOpen) {
          setIsHelpOpen(false);
          return;
        }
        if (commandMenuOpen) {
          setCommandMenuOpen(false);
          return;
        }
        setPendingKey(null);
        return;
      }

      // Skip other shortcuts if in input
      if (isInput) {
        if (pendingKey) setPendingKey(null);
        return;
      }

      // Skip if dialog open
      if (commandMenuOpen || isHelpOpen) return;

      const key = e.key.toLowerCase();

      // Handle ? for help
      if (e.key === '?' || (e.shiftKey && key === '/')) {
        e.preventDefault();
        setIsHelpOpen(true);
        return;
      }

      // Handle two-key sequences
      if (pendingKey) {
        const combo = `${pendingKey} ${key}`;
        setPendingKey(null);
        if (pendingTimeout) clearTimeout(pendingTimeout);

        if (combo === 'g d') {
          e.preventDefault();
          router.push('/dashboard');
          return;
        }
        if (combo === 'g t') {
          e.preventDefault();
          router.push('/tickets');
          return;
        }
        if (combo === 'g c') {
          e.preventDefault();
          router.push('/customers');
          return;
        }
        if (combo === 'n t') {
          e.preventDefault();
          router.push('/tickets/create');
          return;
        }
        if (combo === 'n q') {
          e.preventDefault();
          router.push('/admin/quotes/create');
          return;
        }
        return;
      }

      // Start two-key sequence
      if (key === 'g' || key === 'n') {
        e.preventDefault();
        setPendingKey(key);
        pendingTimeout = setTimeout(() => setPendingKey(null), 1500);
        return;
      }

      // Ticket list navigation (j/k)
      if (pathname === '/tickets') {
        if (key === 'j') {
          e.preventDefault();
          setSelectedIndex(prev => prev + 1);
          return;
        }
        if (key === 'k') {
          e.preventDefault();
          setSelectedIndex(prev => Math.max(-1, prev - 1));
          return;
        }
        if (e.key === 'Enter' && selectedIndex >= 0) {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent('keyboard-open-ticket'));
          return;
        }
      }

      // Ticket detail shortcuts
      const isTicketDetail = pathname?.match(/^\/tickets\/\d+$/);
      if (isTicketDetail) {
        if (key === 'a') {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent('keyboard-assign-to-me'));
          return;
        }
        if (key === 'e') {
          e.preventDefault();
          router.push(`${pathname}/edit`);
          return;
        }
        if (key === 'c') {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent('keyboard-close-ticket'));
          return;
        }
        // 'r' is handled by ReplyComposer
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (pendingTimeout) clearTimeout(pendingTimeout);
    };
  }, [router, pathname, isHelpOpen, commandMenuOpen, pendingKey, selectedIndex]);

  // Reset selected index when navigating away from tickets
  React.useEffect(() => {
    if (pathname !== '/tickets') {
      setSelectedIndex(-1);
    }
  }, [pathname]);

  const contextValue: KeyboardShortcutsContextType = {
    openCommandMenu: () => setCommandMenuOpen(true),
    closeCommandMenu: () => setCommandMenuOpen(false),
    isHelpOpen,
    setIsHelpOpen,
    selectedIndex,
    setSelectedIndex,
  };

  return (
    <KeyboardShortcutsContext.Provider value={contextValue}>
      {children}
      <CommandMenu open={commandMenuOpen} onOpenChange={setCommandMenuOpen} />

      {/* Pending key indicator */}
      {pendingKey && (
        <div className="fixed bottom-20 right-6 z-50 flex items-center gap-2 rounded-lg border border-gray-200 bg-white/95 px-3 py-2 text-sm text-gray-700 shadow-lg backdrop-blur dark:border-gray-700 dark:bg-gray-900/95 dark:text-gray-300">
          <Kbd>{pendingKey.toUpperCase()}</Kbd>
          <span className="text-gray-400 dark:text-gray-500">...</span>
        </div>
      )}

      {/* Help Dialog */}
      <KeyboardShortcutsHelp open={isHelpOpen} onOpenChange={setIsHelpOpen} />
    </KeyboardShortcutsContext.Provider>
  );
}

// Help Modal Component
function KeyboardShortcutsHelp({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const categories = [
    { id: 'navigation', label: 'Navigation' },
    { id: 'actions', label: 'Actions' },
    { id: 'ticket', label: 'Tickets' },
  ] as const;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-gray-200 bg-white/95 backdrop-blur dark:border-gray-700 dark:bg-gray-900/95">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-gray-900 dark:text-white">Keyboard Shortcuts</DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 py-4 md:grid-cols-3">
          {categories.map(category => (
            <div key={category.id}>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {category.label}
              </h3>
              <div className="space-y-2">
                {shortcuts
                  .filter(s => s.category === category.id)
                  .map(shortcut => (
                    <div
                      key={shortcut.key}
                      className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      <div className="flex items-center gap-2">
                        {shortcut.icon && (
                          <shortcut.icon className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
                        )}
                        <span className="text-sm text-gray-700 dark:text-gray-300">{shortcut.description}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {shortcut.label.includes(' then ') ? (
                          shortcut.label.split(' then ').map((k, i) => (
                            <React.Fragment key={i}>
                              {i > 0 && <span className="text-[10px] text-gray-400 dark:text-gray-500">+</span>}
                              <Kbd className="min-w-[24px] justify-center">{k}</Kbd>
                            </React.Fragment>
                          ))
                        ) : (
                          <Kbd className="min-w-[24px] justify-center">{shortcut.label}</Kbd>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
          <p className="text-center text-xs text-gray-500 dark:text-gray-400">
            Press <Kbd>?</Kbd> anytime to show this help
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
