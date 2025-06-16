export interface CannedResponse {
  id: number;
  name: string;
  content: string;
  category?: string;
  tags?: string[];
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
} 