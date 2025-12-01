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
      <Command className="rounded-lg border-0 bg-[#0d1117]">
        <CommandInput
          placeholder="Type a command or search..."
          className="border-0 focus:ring-0 text-white placeholder:text-white/40"
        />
        <CommandList className="max-h-[400px]">
          <CommandEmpty className="py-6 text-center text-sm text-white/40">
            No results found.
          </CommandEmpty>

          <CommandGroup heading="Quick Actions" className="text-white/40">
            <CommandItem
              onSelect={() => runCommand(() => router.push('/tickets/create'))}
              className="text-white/80 hover:bg-white/[0.06] aria-selected:bg-white/[0.06]"
            >
              <Plus className="mr-2 h-4 w-4 text-indigo-400" />
              <span>New Ticket</span>
              <kbd className="ml-auto text-[10px] text-white/30 bg-white/[0.06] px-1.5 py-0.5 rounded">N</kbd>
            </CommandItem>
            <CommandItem
              onSelect={() => runCommand(() => router.push('/admin/quotes/create'))}
              className="text-white/80 hover:bg-white/[0.06] aria-selected:bg-white/[0.06]"
            >
              <FileText className="mr-2 h-4 w-4 text-emerald-400" />
              <span>New Quote</span>
              <kbd className="ml-auto text-[10px] text-white/30 bg-white/[0.06] px-1.5 py-0.5 rounded">Q</kbd>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator className="bg-white/[0.06]" />

          <CommandGroup heading="Navigation" className="text-white/40">
            <CommandItem
              onSelect={() => runCommand(() => router.push('/dashboard'))}
              className="text-white/80 hover:bg-white/[0.06] aria-selected:bg-white/[0.06]"
            >
              <LayoutDashboard className="mr-2 h-4 w-4" />
              <span>Dashboard</span>
            </CommandItem>
            <CommandItem
              onSelect={() => runCommand(() => router.push('/tickets'))}
              className="text-white/80 hover:bg-white/[0.06] aria-selected:bg-white/[0.06]"
            >
              <Ticket className="mr-2 h-4 w-4" />
              <span>All Tickets</span>
            </CommandItem>
            <CommandItem
              onSelect={() => runCommand(() => router.push('/tickets?filter=my_tickets'))}
              className="text-white/80 hover:bg-white/[0.06] aria-selected:bg-white/[0.06]"
            >
              <User className="mr-2 h-4 w-4" />
              <span>My Tickets</span>
            </CommandItem>
            <CommandItem
              onSelect={() => runCommand(() => router.push('/tickets?filter=unassigned'))}
              className="text-white/80 hover:bg-white/[0.06] aria-selected:bg-white/[0.06]"
            >
              <AlertCircle className="mr-2 h-4 w-4 text-amber-400" />
              <span>Unassigned Tickets</span>
            </CommandItem>
            <CommandItem
              onSelect={() => runCommand(() => router.push('/customers'))}
              className="text-white/80 hover:bg-white/[0.06] aria-selected:bg-white/[0.06]"
            >
              <Users className="mr-2 h-4 w-4" />
              <span>Customers</span>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator className="bg-white/[0.06]" />

          <CommandGroup heading="Recent Tickets" className="text-white/40">
            <CommandItem
              onSelect={() => runCommand(() => router.push('/tickets?status=new'))}
              className="text-white/80 hover:bg-white/[0.06] aria-selected:bg-white/[0.06]"
            >
              <Clock className="mr-2 h-4 w-4 text-indigo-400" />
              <span>New Tickets</span>
            </CommandItem>
            <CommandItem
              onSelect={() => runCommand(() => router.push('/tickets?priority=urgent,high'))}
              className="text-white/80 hover:bg-white/[0.06] aria-selected:bg-white/[0.06]"
            >
              <AlertCircle className="mr-2 h-4 w-4 text-red-400" />
              <span>High Priority</span>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator className="bg-white/[0.06]" />

          <CommandGroup heading="Settings" className="text-white/40">
            <CommandItem
              onSelect={() => runCommand(() => router.push('/profile'))}
              className="text-white/80 hover:bg-white/[0.06] aria-selected:bg-white/[0.06]"
            >
              <User className="mr-2 h-4 w-4" />
              <span>Profile</span>
            </CommandItem>
            <CommandItem
              onSelect={() => runCommand(() => router.push('/admin/settings'))}
              className="text-white/80 hover:bg-white/[0.06] aria-selected:bg-white/[0.06]"
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
