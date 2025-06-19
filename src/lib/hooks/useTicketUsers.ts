import { useState, useEffect } from 'react';
import axios from 'axios';
import type { TicketUser as BaseUser } from '@/types/ticket';

export function useTicketUsers() {
  const [users, setUsers] = useState<BaseUser[]>([]);
  const [isUsersLoading, setIsUsersLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUsers = async () => {
      setIsUsersLoading(true);
      setError(null);
      try {
        const res = await axios.get<BaseUser[]>('/api/users');
        setUsers(res.data);
      } catch (err) {
        setError("Could not load assignable users.");
      } finally {
        setIsUsersLoading(false);
      }
    };
    fetchUsers();
  }, []);

  return { users, isUsersLoading, error, setError };
} 