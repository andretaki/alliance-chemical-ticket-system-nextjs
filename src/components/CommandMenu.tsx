'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  LayoutDashboard,
  Ticket,
  Users,
  Plus,
  Search,
  Settings,
  FileText,
  LogOut,
  User,
  Clock,
  AlertCircle,
} from 'lucide-react';

interface CommandMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandMenu({ open, onOpenChange }: CommandMenuProps) {
  const router = useRouter();

  const runCommand = React.useCallback((command: () => void) => {
    onOpenChange(false);
    command();
  }, [onOpenChange]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <Command className="rounded-lg border-0 bg-white dark:bg-gray-900">
        <CommandInput
          placeholder="Type a command or search..."
          className="border-0 focus:ring-0 text-gray-900 placeholder:text-gray-400 dark:text-white dark:placeholder:text-gray-500"
        />
        <CommandList className="max-h-[400px]">
          <CommandEmpty className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
            No results found.
          </CommandEmpty>

          <CommandGroup heading="Quick Actions" className="text-gray-500 dark:text-gray-400">
            <CommandItem
              onSelect={() => runCommand(() => router.push('/tickets/create'))}
              className="text-gray-700 hover:bg-gray-100 aria-selected:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800 dark:aria-selected:bg-gray-800"
            >
              <Plus className="mr-2 h-4 w-4 text-indigo-500 dark:text-indigo-400" />
              <span>New Ticket</span>
              <kbd className="ml-auto text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded dark:text-gray-500 dark:bg-gray-800">N</kbd>
            </CommandItem>
            <CommandItem
              onSelect={() => runCommand(() => router.push('/admin/quotes/create'))}
              className="text-gray-700 hover:bg-gray-100 aria-selected:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800 dark:aria-selected:bg-gray-800"
            >
              <FileText className="mr-2 h-4 w-4 text-emerald-500 dark:text-emerald-400" />
              <span>New Quote</span>
              <kbd className="ml-auto text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded dark:text-gray-500 dark:bg-gray-800">Q</kbd>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator className="bg-gray-100 dark:bg-gray-800" />

          <CommandGroup heading="Navigation" className="text-gray-500 dark:text-gray-400">
            <CommandItem
              onSelect={() => runCommand(() => router.push('/dashboard'))}
              className="text-gray-700 hover:bg-gray-100 aria-selected:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800 dark:aria-selected:bg-gray-800"
            >
              <LayoutDashboard className="mr-2 h-4 w-4" />
              <span>Dashboard</span>
            </CommandItem>
            <CommandItem
              onSelect={() => runCommand(() => router.push('/tickets'))}
              className="text-gray-700 hover:bg-gray-100 aria-selected:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800 dark:aria-selected:bg-gray-800"
            >
              <Ticket className="mr-2 h-4 w-4" />
              <span>All Tickets</span>
            </CommandItem>
            <CommandItem
              onSelect={() => runCommand(() => router.push('/tickets?filter=my_tickets'))}
              className="text-gray-700 hover:bg-gray-100 aria-selected:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800 dark:aria-selected:bg-gray-800"
            >
              <User className="mr-2 h-4 w-4" />
              <span>My Tickets</span>
            </CommandItem>
            <CommandItem
              onSelect={() => runCommand(() => router.push('/tickets?filter=unassigned'))}
              className="text-gray-700 hover:bg-gray-100 aria-selected:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800 dark:aria-selected:bg-gray-800"
            >
              <AlertCircle className="mr-2 h-4 w-4 text-amber-500 dark:text-amber-400" />
              <span>Unassigned Tickets</span>
            </CommandItem>
            <CommandItem
              onSelect={() => runCommand(() => router.push('/customers'))}
              className="text-gray-700 hover:bg-gray-100 aria-selected:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800 dark:aria-selected:bg-gray-800"
            >
              <Users className="mr-2 h-4 w-4" />
              <span>Customers</span>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator className="bg-gray-100 dark:bg-gray-800" />

          <CommandGroup heading="Recent Tickets" className="text-gray-500 dark:text-gray-400">
            <CommandItem
              onSelect={() => runCommand(() => router.push('/tickets?status=new'))}
              className="text-gray-700 hover:bg-gray-100 aria-selected:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800 dark:aria-selected:bg-gray-800"
            >
              <Clock className="mr-2 h-4 w-4 text-indigo-500 dark:text-indigo-400" />
              <span>New Tickets</span>
            </CommandItem>
            <CommandItem
              onSelect={() => runCommand(() => router.push('/tickets?priority=urgent,high'))}
              className="text-gray-700 hover:bg-gray-100 aria-selected:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800 dark:aria-selected:bg-gray-800"
            >
              <AlertCircle className="mr-2 h-4 w-4 text-red-500 dark:text-red-400" />
              <span>High Priority</span>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator className="bg-gray-100 dark:bg-gray-800" />

          <CommandGroup heading="Settings" className="text-gray-500 dark:text-gray-400">
            <CommandItem
              onSelect={() => runCommand(() => router.push('/profile'))}
              className="text-gray-700 hover:bg-gray-100 aria-selected:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800 dark:aria-selected:bg-gray-800"
            >
              <User className="mr-2 h-4 w-4" />
              <span>Profile</span>
            </CommandItem>
            <CommandItem
              onSelect={() => runCommand(() => router.push('/admin/settings'))}
              className="text-gray-700 hover:bg-gray-100 aria-selected:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800 dark:aria-selected:bg-gray-800"
            >
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

// Hook to manage command menu state globally
export function useCommandMenu() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  return { open, setOpen };
}
