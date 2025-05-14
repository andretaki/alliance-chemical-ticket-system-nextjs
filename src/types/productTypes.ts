export interface Product {
    id: number;
    productIdShopify: number | null;
    name: string;
    handleShopify: string | null;
    description: string | null;
    primaryImageUrl: string | null;
    pageUrl: string | null;
    isActive: boolean;
    metadata: Record<string, any> | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface ProductVariant {
    id: number;
    agentProductId: number;
    variantIdShopify: number | null;
    sku: string;
    variantTitle: string;
    displayName: string | null;
    price: number;
    currency: string;
    inventoryQuantity: number | null;
    isActive: boolean;
    metadata: Record<string, any> | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface PriceTier {
    id: number;
    variantId: number;
    minQuantity: number;
    unitPrice: number;
    description: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface ProductWithVariants extends Product {
    variants: ProductVariant[];
}

export interface ProductVariantWithTiers extends ProductVariant {
    priceTiers: PriceTier[];
} 