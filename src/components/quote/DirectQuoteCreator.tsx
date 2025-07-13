'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Button, Badge, Input, Modal } from '@/components/ui';
import { enhancedAiService } from '@/services/enhancedAiService';
import { cn } from '@/utils/cn';

interface QuoteOption {
  id: 'shopify_draft' | 'qbo_estimate';
  title: string;
  description: string;
  icon: string;
  benefits: string[];
  recommended?: boolean;
}

interface ProductItem {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  confidence: number;
}

interface DirectQuoteCreatorProps {
  customerEmail: string;
  inquiryText: string;
  ticketId?: number;
  onQuoteCreated?: (quoteData: any) => void;
}

const DirectQuoteCreator: React.FC<DirectQuoteCreatorProps> = ({
  customerEmail,
  inquiryText,
  ticketId,
  onQuoteCreated
}) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [quoteIntelligence, setQuoteIntelligence] = useState<any>(null);
  const [selectedOption, setSelectedOption] = useState<'shopify_draft' | 'qbo_estimate' | null>(null);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [customerData, setCustomerData] = useState<any>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const quoteOptions: QuoteOption[] = [
    {
      id: 'shopify_draft',
      title: 'Shopify Draft Order',
      description: 'Create an interactive draft order in Shopify',
      icon: 'fas fa-shopping-cart',
      benefits: [
        'Customer can review and approve online',
        'Automatic inventory management',
        'Integrated shipping calculations',
        'Payment processing ready',
        'Order tracking and notifications'
      ],
      recommended: quoteIntelligence?.recommendedAction === 'create_draft_order'
    },
    {
      id: 'qbo_estimate',
      title: 'QuickBooks Estimate',
      description: 'Generate a professional estimate in QuickBooks',
      icon: 'fas fa-file-invoice-dollar',
      benefits: [
        'Professional PDF generation',
        'Accounting integration',
        'Easy conversion to invoice',
        'Tax calculations included',
        'Financial reporting integration'
      ],
      recommended: quoteIntelligence?.recommendedAction === 'create_qbo_estimate'
    }
  ];

  useEffect(() => {
    analyzeInquiry();
  }, [customerEmail, inquiryText]); // eslint-disable-line react-hooks/exhaustive-deps

  const analyzeInquiry = async () => {
    setIsAnalyzing(true);
    try {
      // Get AI analysis
      const intelligence = await enhancedAiService.analyzeQuoteInquiry(
        customerEmail,
        inquiryText
      );
      
      setQuoteIntelligence(intelligence);
      
      // Convert AI recommendations to products
      const productItems: ProductItem[] = intelligence.recommendedProducts?.map((rec: any) => ({
        id: rec.productId || Math.random().toString(),
        name: rec.productName || 'Unknown Product',
        sku: rec.sku || 'N/A',
        quantity: 1,
        unitPrice: rec.estimatedPrice || 0,
        totalPrice: rec.estimatedPrice || 0,
        confidence: rec.confidence || 0
      })) || [];
      
      setProducts(productItems);
      
      // Fetch customer data
      await fetchCustomerData();
      
    } catch (error) {
      console.error('Error analyzing inquiry:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const fetchCustomerData = async () => {
    try {
      const response = await fetch(`/api/customers/search?email=${encodeURIComponent(customerEmail)}`);
      if (response.ok) {
        const data = await response.json();
        setCustomerData(data.customer);
      }
    } catch (error) {
      console.error('Error fetching customer data:', error);
    }
  };

  const updateProductQuantity = (productId: string, quantity: number) => {
    setProducts(products.map(p => 
      p.id === productId 
        ? { ...p, quantity, totalPrice: quantity * p.unitPrice }
        : p
    ));
  };

  const updateProductPrice = (productId: string, unitPrice: number) => {
    setProducts(products.map(p => 
      p.id === productId 
        ? { ...p, unitPrice, totalPrice: p.quantity * unitPrice }
        : p
    ));
  };

  const removeProduct = (productId: string) => {
    setProducts(products.filter(p => p.id !== productId));
  };

  const getTotalValue = () => {
    return products.reduce((sum, p) => sum + p.totalPrice, 0);
  };

  const handleCreateQuote = () => {
    if (!selectedOption || products.length === 0) return;
    setShowConfirmModal(true);
  };

  const confirmCreateQuote = async () => {
    if (!selectedOption) return;
    
    setIsCreating(true);
    try {
      const endpoint = selectedOption === 'shopify_draft' 
        ? '/api/draft-orders'
        : '/api/qbo/estimates';
      
      const quoteData = {
        customerEmail,
        customerData,
        products,
        totalValue: getTotalValue(),
        inquiryText,
        ticketId,
        intelligence: quoteIntelligence
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quoteData)
      });

      if (response.ok) {
        const result = await response.json();
        onQuoteCreated?.(result);
        setShowConfirmModal(false);
      } else {
        throw new Error('Failed to create quote');
      }
    } catch (error) {
      console.error('Error creating quote:', error);
    } finally {
      setIsCreating(false);
    }
  };

  if (isAnalyzing) {
    return (
      <Card className="animate-pulse">
        <CardContent className="p-8 text-center">
          <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center text-primary text-2xl mx-auto mb-4">
            <i className="fas fa-brain animate-pulse" />
          </div>
          <h3 className="text-white font-medium mb-2">AI is analyzing the inquiry...</h3>
          <p className="text-white/70">Identifying products, pricing, and best quote option</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* AI Intelligence Summary */}
      {quoteIntelligence && (
        <Card variant="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <i className="fas fa-brain text-primary" />
              AI Quote Intelligence
              <Badge variant={quoteIntelligence.complexity === 'simple' ? 'success' : 'warning'}>
                {quoteIntelligence.complexity}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <h4 className="text-white font-medium mb-2">Estimated Value</h4>
                <p className="text-2xl font-bold text-primary">
                  ${quoteIntelligence.estimatedTotalValue?.toLocaleString() || 'TBD'}
                </p>
              </div>
              <div>
                <h4 className="text-white font-medium mb-2">Customer Urgency</h4>
                <Badge variant={
                  quoteIntelligence.customerInsights?.urgency === 'high' ? 'danger' :
                  quoteIntelligence.customerInsights?.urgency === 'medium' ? 'warning' : 'success'
                }>
                  {quoteIntelligence.customerInsights?.urgency || 'Unknown'}
                </Badge>
              </div>
              <div>
                <h4 className="text-white font-medium mb-2">Risk Level</h4>
                <Badge variant={
                  quoteIntelligence.riskAssessment?.creditRisk === 'high' ? 'danger' :
                  quoteIntelligence.riskAssessment?.creditRisk === 'medium' ? 'warning' : 'success'
                }>
                  {quoteIntelligence.riskAssessment?.creditRisk || 'Low'} Risk
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quote Option Selection */}
      <Card variant="glass">
        <CardHeader>
          <CardTitle>Choose Quote Type</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {quoteOptions.map((option) => (
              <Card
                key={option.id}
                variant="outline"
                interactive
                className={cn(
                  'cursor-pointer transition-all duration-200 hover:scale-105',
                  selectedOption === option.id && 'ring-2 ring-primary bg-primary/10',
                  option.recommended && 'ring-2 ring-success border-success/30'
                )}
                onClick={() => setSelectedOption(option.id)}
              >
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className={cn(
                      'w-12 h-12 rounded-lg flex items-center justify-center text-xl',
                      option.recommended ? 'bg-success/20 text-success' : 'bg-primary/20 text-primary'
                    )}>
                      <i className={option.icon} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-white font-bold">{option.title}</h3>
                        {option.recommended && (
                          <Badge variant="success" size="sm">AI Recommended</Badge>
                        )}
                      </div>
                      <p className="text-white/70 text-sm mb-3">{option.description}</p>
                      <ul className="space-y-1">
                        {option.benefits.slice(0, 3).map((benefit, index) => (
                          <li key={index} className="text-white/60 text-xs flex items-center gap-2">
                            <i className="fas fa-check text-success w-3" />
                            {benefit}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Product Configuration */}
      {products.length > 0 && (
        <Card variant="glass">
          <CardHeader>
            <CardTitle>Configure Products</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {products.map((product) => (
                <div key={product.id} className="bg-white/5 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex-1">
                      <h4 className="text-white font-medium">{product.name}</h4>
                      <p className="text-white/60 text-sm">SKU: {product.sku}</p>
                      <Badge variant="outline" size="sm">
                        {Math.round(product.confidence * 100)}% confidence
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeProduct(product.id)}
                      className="text-red-400 hover:text-red-300"
                    >
                      <i className="fas fa-trash" />
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-white/70 text-sm">Quantity</label>
                      <Input
                        type="number"
                        value={product.quantity}
                        onChange={(e) => updateProductQuantity(product.id, parseInt(e.target.value) || 0)}
                        min="1"
                      />
                    </div>
                    <div>
                      <label className="text-white/70 text-sm">Unit Price ($)</label>
                      <Input
                        type="number"
                        value={product.unitPrice}
                        onChange={(e) => updateProductPrice(product.id, parseFloat(e.target.value) || 0)}
                        min="0"
                        step="0.01"
                      />
                    </div>
                    <div>
                      <label className="text-white/70 text-sm">Total</label>
                      <div className="h-10 px-3 py-2 bg-white/10 rounded-lg text-white font-bold">
                        ${product.totalPrice.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              
              <div className="bg-primary/10 rounded-lg p-4 border border-primary/30">
                <div className="flex justify-between items-center">
                  <span className="text-white font-bold">Total Quote Value:</span>
                  <span className="text-2xl font-bold text-primary">
                    ${getTotalValue().toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Quote Button */}
      <div className="flex justify-end">
        <Button
          size="lg"
          leftIcon={<i className="fas fa-rocket" />}
          onClick={handleCreateQuote}
          disabled={!selectedOption || products.length === 0}
        >
          Create {selectedOption === 'shopify_draft' ? 'Draft Order' : 'QBO Estimate'}
        </Button>
      </div>

      {/* Confirmation Modal */}
      <Modal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        title={`Create ${selectedOption === 'shopify_draft' ? 'Shopify Draft Order' : 'QuickBooks Estimate'}`}
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-white/70">
            You&apos;re about to create a {selectedOption === 'shopify_draft' ? 'Shopify Draft Order' : 'QuickBooks Estimate'} 
            for {customerEmail} with a total value of ${getTotalValue().toFixed(2)}.
          </p>
          
          <div className="bg-white/5 rounded-lg p-4">
            <h4 className="text-white font-medium mb-2">Quote Summary:</h4>
            <ul className="space-y-1">
              {products.map(product => (
                <li key={product.id} className="text-white/70 text-sm flex justify-between">
                  <span>{product.name} (x{product.quantity})</span>
                  <span>${product.totalPrice.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          </div>
          
          <div className="flex gap-3 justify-end">
            <Button variant="ghost" onClick={() => setShowConfirmModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={confirmCreateQuote}
              loading={isCreating}
              leftIcon={<i className="fas fa-check" />}
            >
              Confirm & Create
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default DirectQuoteCreator;