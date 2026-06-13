export type OrderProcessingStatus =
  | 'Pending'
  | 'Received'
  | 'InProcessing'
  | 'InvoiceIssued'
  | 'Shipping'
  | 'Delivered'
  | 'Rejected';

export const ORDER_STATUS_TABS: OrderProcessingStatus[] = [
  'Pending',
  'Received',
  'InProcessing',
  'InvoiceIssued',
  'Shipping',
  'Delivered',
  'Rejected',
];

export const ORDER_STATUS_API_VALUE: Record<OrderProcessingStatus, number> = {
  Pending: 1,
  Received: 2,
  InProcessing: 3,
  InvoiceIssued: 4,
  Shipping: 5,
  Delivered: 6,
  Rejected: 7,
};

export const INVOICE_LOCKED_STATUSES: OrderProcessingStatus[] = [
  'InvoiceIssued',
  'Shipping',
  'Delivered',
  'Rejected',
];
