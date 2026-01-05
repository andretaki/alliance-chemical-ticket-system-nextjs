'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useFormContext } from 'react-hook-form';
import axios from 'axios';
import { Search, User, Building2, Loader2 } from 'lucide-react';
import { QuoteFormData } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

// Customer search interface
interface CustomerSearchResult {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  company: string;
  defaultAddress?: {
    firstName?: string;
    lastName?: string;
    address1?: string;
    address2?: string;
    city?: string;
    province?: string;
    country?: string;
    zip?: string;
    company?: string;
    phone?: string;
  };
  source?: string;
}

const CustomerStep = () => {
  const { register, formState: { errors }, setValue } = useFormContext<QuoteFormData>();

  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<CustomerSearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const handleSelectCustomer = (customer: CustomerSearchResult) => {
    setValue('customer.firstName', customer.firstName, { shouldValidate: true });
    setValue('customer.lastName', customer.lastName, { shouldValidate: true });
    setValue('customer.email', customer.email, { shouldValidate: true });
    setValue('customer.phone', customer.phone || '');
    setValue('customer.company', customer.company || '');

    // Also populate shipping address if available
    if (customer.defaultAddress) {
        setValue('shippingAddress.firstName', customer.defaultAddress.firstName || customer.firstName || '');
        setValue('shippingAddress.lastName', customer.defaultAddress.lastName || customer.lastName || '');
        setValue('shippingAddress.address1', customer.defaultAddress.address1 || '');
        setValue('shippingAddress.city', customer.defaultAddress.city || '');
        setValue('shippingAddress.province', customer.defaultAddress.province || '');
        setValue('shippingAddress.country', customer.defaultAddress.country || 'United States');
        setValue('shippingAddress.zip', customer.defaultAddress.zip || '');
        setValue('shippingAddress.company', customer.defaultAddress.company || customer.company || '');
        setValue('shippingAddress.phone', customer.defaultAddress.phone || customer.phone || '');
    }

    setSearchTerm(`${customer.firstName} ${customer.lastName}`);
    setShowResults(false);
  };

  const searchCustomer = useCallback(async (term: string) => {
    if (term.trim().length < 3) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const response = await axios.get<{ customers: CustomerSearchResult[] }>(
        `/api/customers/search?query=${encodeURIComponent(term.trim())}`
      );
      setSearchResults(response.data.customers || []);
    } catch (error) {
      console.error('Customer search failed:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm) {
        searchCustomer(searchTerm);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, searchCustomer]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="space-y-6">
      {/* Customer Search Section */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Search className="h-5 w-5 text-primary" />
            Find Existing Customer
          </CardTitle>
          <CardDescription>
            Search for an existing customer by name, email, or phone number
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div ref={searchRef} className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search by name, email, or phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onFocus={() => setShowResults(true)}
                className="pl-10"
              />
              {isSearching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>

            {showResults && (searchResults.length > 0 || (searchTerm.length > 2 && !isSearching)) && (
              <div className="absolute z-50 w-full mt-2 bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
                {searchResults.length === 0 && searchTerm.length > 2 && !isSearching ? (
                  <div className="px-4 py-3 text-sm text-muted-foreground">
                    No customers found matching &quot;{searchTerm}&quot;
                  </div>
                ) : (
                  <div className="max-h-64 overflow-y-auto">
                    {searchResults.map((customer) => (
                      <button
                        type="button"
                        key={customer.id}
                        className="w-full px-4 py-3 text-left hover:bg-accent transition-colors border-b border-border last:border-b-0"
                        onClick={() => handleSelectCustomer(customer)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <User className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground truncate">
                              {customer.firstName} {customer.lastName}
                              {customer.company && (
                                <span className="text-muted-foreground font-normal ml-2">
                                  ({customer.company})
                                </span>
                              )}
                            </p>
                            <p className="text-sm text-muted-foreground truncate">
                              {customer.email}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <Separator className="w-full" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-background px-4 text-sm text-muted-foreground font-medium">
            OR ENTER MANUALLY
          </span>
        </div>
      </div>

      {/* Manual Entry Section */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <User className="h-5 w-5 text-primary" />
            Customer Details
          </CardTitle>
          <CardDescription>
            Enter the customer information manually
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="customer.firstName" required>First Name</Label>
              <Input
                id="customer.firstName"
                {...register('customer.firstName')}
                aria-invalid={errors.customer?.firstName ? 'true' : 'false'}
                className={errors.customer?.firstName ? 'border-destructive' : ''}
              />
              {errors.customer?.firstName && (
                <p className="text-sm text-destructive">{errors.customer.firstName.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer.lastName" required>Last Name</Label>
              <Input
                id="customer.lastName"
                {...register('customer.lastName')}
                aria-invalid={errors.customer?.lastName ? 'true' : 'false'}
                className={errors.customer?.lastName ? 'border-destructive' : ''}
              />
              {errors.customer?.lastName && (
                <p className="text-sm text-destructive">{errors.customer.lastName.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer.email" required>Email</Label>
              <Input
                id="customer.email"
                type="email"
                {...register('customer.email')}
                aria-invalid={errors.customer?.email ? 'true' : 'false'}
                className={errors.customer?.email ? 'border-destructive' : ''}
              />
              {errors.customer?.email && (
                <p className="text-sm text-destructive">{errors.customer.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer.phone">Phone</Label>
              <Input
                id="customer.phone"
                {...register('customer.phone')}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="customer.company" className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Company
              </Label>
              <Input
                id="customer.company"
                {...register('customer.company')}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CustomerStep;
