'use client';

import { useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  Upload,
  Camera,
  FileText,
  Receipt,
  CreditCard,
  Loader2,
  CheckCircle,
  AlertCircle,
  X,
  Edit,
  ChevronRight,
  Image as ImageIcon,
  Eye,
  Trash2,
  Plus,
  ShoppingCart,
} from 'lucide-react';

// Document types for OCR
type DocumentType = 'purchase_order' | 'vendor_bill' | 'customer_invoice' | 'expense';

interface OcrLineItem {
  product_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  amount: number;
}

interface OcrResult {
  invoice_id?: number;
  order_id?: number;
  vendor_name?: string;
  customer_name?: string;
  date?: string;
  invoice_number?: string;
  line_items: OcrLineItem[];
  subtotal?: number;
  tax?: number;
  total?: number;
  state?: string;
  ocr_status?: string;
  ocr_confidence?: number;
  ocr_matched_count?: number;
  document_type?: string;
}

interface FileItem {
  id: string;
  file: File;
  previewUrl: string | null;
  status: 'pending' | 'processing' | 'done' | 'error';
  progress: number;
  message: string;
  ocrResult: OcrResult | null;
  createdDocId: number | null;
}

export default function OcrPage() {
  const t = useTranslations();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [documentType, setDocumentType] = useState<DocumentType>('purchase_order');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [isProcessingAll, setIsProcessingAll] = useState(false);

  // Document type options
  const documentTypes = [
    {
      value: 'purchase_order' as DocumentType,
      label: t('ocr.purchaseOrder'),
      icon: ShoppingCart,
      description: t('ocr.purchaseOrderDesc'),
    },
    {
      value: 'vendor_bill' as DocumentType,
      label: t('ocr.vendorBill'),
      icon: Receipt,
      description: t('ocr.vendorBillDesc'),
    },
    {
      value: 'customer_invoice' as DocumentType,
      label: t('ocr.customerInvoice'),
      icon: FileText,
      description: t('ocr.customerInvoiceDesc'),
    },
    {
      value: 'expense' as DocumentType,
      label: t('ocr.expense'),
      icon: CreditCard,
      description: t('ocr.expenseDesc'),
    },
  ];

  // Generate unique ID
  const generateId = () => Math.random().toString(36).substr(2, 9);

  // Handle file selection (multiple files)
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    const newFiles: FileItem[] = [];

    Array.from(selectedFiles).forEach((file) => {
      if (!validTypes.includes(file.type)) {
        console.warn(`Skipping invalid file type: ${file.type}`);
        return;
      }

      const id = generateId();
      let previewUrl: string | null = null;

      if (file.type.startsWith('image/')) {
        previewUrl = URL.createObjectURL(file);
      }

      newFiles.push({
        id,
        file,
        previewUrl,
        status: 'pending',
        progress: 0,
        message: '',
        ocrResult: null,
        createdDocId: null,
      });
    });

    setFiles((prev) => [...prev, ...newFiles]);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Remove a file from the list
  const handleRemoveFile = (fileId: string) => {
    setFiles((prev) => {
      const file = prev.find((f) => f.id === fileId);
      if (file?.previewUrl) {
        URL.revokeObjectURL(file.previewUrl);
      }
      return prev.filter((f) => f.id !== fileId);
    });
    if (selectedFileId === fileId) {
      setSelectedFileId(null);
    }
  };

  // Process a single file
  const processFile = async (fileItem: FileItem): Promise<FileItem> => {
    const formData = new FormData();
    formData.append('file', fileItem.file);
    formData.append('documentType', documentType);

    try {
      const res = await fetch('/api/ocr/document', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!data.success) {
        return {
          ...fileItem,
          status: 'error',
          progress: 0,
          message: data.error?.message || 'OCR failed',
        };
      }

      return {
        ...fileItem,
        status: 'done',
        progress: 100,
        message: t('ocr.completed'),
        ocrResult: data.data,
        createdDocId: data.data.order_id || data.data.invoice_id,
      };
    } catch (error) {
      return {
        ...fileItem,
        status: 'error',
        progress: 0,
        message: error instanceof Error ? error.message : t('ocr.error'),
      };
    }
  };

  // Process all pending files
  const handleProcessAll = async () => {
    const pendingFiles = files.filter((f) => f.status === 'pending');
    if (pendingFiles.length === 0) return;

    setIsProcessingAll(true);

    for (const fileItem of pendingFiles) {
      // Update status to processing
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileItem.id
            ? { ...f, status: 'processing', progress: 30, message: t('ocr.recognizing') }
            : f
        )
      );

      // Process the file
      const result = await processFile(fileItem);

      // Update with result
      setFiles((prev) => prev.map((f) => (f.id === fileItem.id ? result : f)));
    }

    setIsProcessingAll(false);
  };

  // Process a single file
  const handleProcessSingle = async (fileId: string) => {
    const fileItem = files.find((f) => f.id === fileId);
    if (!fileItem || fileItem.status !== 'pending') return;

    // Update status to processing
    setFiles((prev) =>
      prev.map((f) =>
        f.id === fileId
          ? { ...f, status: 'processing', progress: 30, message: t('ocr.recognizing') }
          : f
      )
    );

    // Process the file
    const result = await processFile(fileItem);

    // Update with result
    setFiles((prev) => prev.map((f) => (f.id === fileId ? result : f)));
  };

  // Confirm document (post to Odoo)
  const handleConfirmDocument = async (fileId: string) => {
    const fileItem = files.find((f) => f.id === fileId);
    if (!fileItem || !fileItem.ocrResult) return;

    setFiles((prev) =>
      prev.map((f) =>
        f.id === fileId ? { ...f, status: 'processing', message: t('ocr.creating') } : f
      )
    );

    try {
      const res = await fetch('/api/ocr/create-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentType,
          ocrData: fileItem.ocrResult,
          autoPost: false, // Keep as draft
        }),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to confirm');
      }

      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId
            ? { ...f, status: 'done', message: t('ocr.created'), createdDocId: data.data.id }
            : f
        )
      );
    } catch (error) {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId
            ? {
                ...f,
                status: 'error',
                message: error instanceof Error ? error.message : t('ocr.createError'),
              }
            : f
        )
      );
    }
  };

  // Get selected file
  const selectedFile = files.find((f) => f.id === selectedFileId);

  // Update OCR result field for selected file
  const updateOcrField = (field: keyof OcrResult, value: unknown) => {
    if (!selectedFileId) return;
    setFiles((prev) =>
      prev.map((f) =>
        f.id === selectedFileId && f.ocrResult
          ? { ...f, ocrResult: { ...f.ocrResult, [field]: value } }
          : f
      )
    );
  };

  // Navigate to documents list
  const handleViewDocuments = () => {
    switch (documentType) {
      case 'purchase_order':
        router.push('/purchase');
        break;
      case 'vendor_bill':
        router.push('/finance/invoices');
        break;
      case 'customer_invoice':
        router.push('/finance/invoices');
        break;
      case 'expense':
        router.push('/accounting/cash-ledger');
        break;
    }
  };

  // Reset all
  const handleReset = () => {
    files.forEach((f) => {
      if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
    });
    setFiles([]);
    setSelectedFileId(null);
    setEditMode(false);
  };

  // Count stats
  const pendingCount = files.filter((f) => f.status === 'pending').length;
  const processingCount = files.filter((f) => f.status === 'processing').length;
  const doneCount = files.filter((f) => f.status === 'done').length;
  const errorCount = files.filter((f) => f.status === 'error').length;

  return (
    <div className="section-gap pb-24">
      {/* Header */}
      <div className="page-header-sticky">
        <div className="page-header-title">
          <h1 className="page-title">{t('ocr.title')}</h1>
        </div>
      </div>

      {/* Image Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <button
            onClick={() => setPreviewImage(null)}
            className="absolute top-4 right-4 text-white hover:text-gray-300"
          >
            <X className="w-8 h-8" />
          </button>
          <img
            src={previewImage}
            alt="Preview"
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Step 1: Select Document Type */}
      <div className="card p-4 mb-4">
        <h2 className="text-body font-semibold mb-3">{t('ocr.step1SelectType')}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {documentTypes.map((type) => {
            const Icon = type.icon;
            const isSelected = documentType === type.value;
            return (
              <button
                key={type.value}
                onClick={() => setDocumentType(type.value)}
                disabled={files.length > 0}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                } ${files.length > 0 ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <Icon className={`w-6 h-6 mb-2 ${isSelected ? 'text-blue-600' : 'text-gray-500'}`} />
                <p className={`font-medium ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>
                  {type.label}
                </p>
                <p className="text-micro text-gray-500 mt-1">{type.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step 2: Upload Documents (Multiple) */}
      <div className="card p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-body font-semibold">{t('ocr.step2Upload')}</h2>
          {files.length > 0 && (
            <div className="flex items-center gap-4 text-sm">
              <span className="text-gray-500">
                {files.length} {t('ocr.filesSelected')}
              </span>
              {pendingCount > 0 && (
                <span className="text-yellow-600">{pendingCount} {t('ocr.pending')}</span>
              )}
              {doneCount > 0 && (
                <span className="text-green-600">{doneCount} {t('ocr.completed')}</span>
              )}
              {errorCount > 0 && (
                <span className="text-red-600">{errorCount} {t('ocr.failed')}</span>
              )}
            </div>
          )}
        </div>

        {/* File Upload Area */}
        <div className="border-2 border-dashed border-gray-300 rounded-xl p-4 mb-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            onChange={handleFileSelect}
            className="hidden"
            id="file-upload"
            multiple
          />
          <div className="flex flex-col items-center gap-3">
            <div className="flex gap-3">
              <label
                htmlFor="file-upload"
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 transition"
              >
                <Upload className="w-5 h-5" />
                {t('ocr.selectFiles')}
              </label>
              <label
                htmlFor="file-upload"
                className="flex items-center gap-2 px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg cursor-pointer hover:bg-gray-200 transition"
              >
                <Camera className="w-5 h-5" />
                {t('ocr.takePhoto')}
              </label>
            </div>
            <p className="text-sub text-gray-500">{t('ocr.supportedFormatsMultiple')}</p>
          </div>
        </div>

        {/* File List */}
        {files.length > 0 && (
          <div className="space-y-2">
            {files.map((fileItem) => (
              <div
                key={fileItem.id}
                onClick={() => setSelectedFileId(fileItem.id)}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
                  selectedFileId === fileItem.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {/* Thumbnail */}
                <div
                  className="w-12 h-12 rounded bg-gray-100 flex items-center justify-center flex-shrink-0 overflow-hidden"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (fileItem.previewUrl) {
                      setPreviewImage(fileItem.previewUrl);
                    }
                  }}
                >
                  {fileItem.previewUrl ? (
                    <img
                      src={fileItem.previewUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <FileText className="w-6 h-6 text-gray-400" />
                  )}
                </div>

                {/* File Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{fileItem.file.name}</p>
                  <p className="text-micro text-gray-500">
                    {(fileItem.file.size / 1024).toFixed(1)} KB
                  </p>
                </div>

                {/* Status */}
                <div className="flex items-center gap-2">
                  {fileItem.status === 'pending' && (
                    <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
                      {t('ocr.pending')}
                    </span>
                  )}
                  {fileItem.status === 'processing' && (
                    <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                  )}
                  {fileItem.status === 'done' && (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  )}
                  {fileItem.status === 'error' && (
                    <AlertCircle className="w-5 h-5 text-red-600" />
                  )}

                  {/* Preview button */}
                  {fileItem.previewUrl && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewImage(fileItem.previewUrl);
                      }}
                      className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  )}

                  {/* Remove button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveFile(fileItem.id);
                    }}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Action Buttons */}
        {files.length > 0 && (
          <div className="flex justify-between mt-4 pt-4 border-t">
            <button
              onClick={handleReset}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
            >
              {t('ocr.clearAll')}
            </button>
            <div className="flex gap-2">
              {pendingCount > 0 && (
                <button
                  onClick={handleProcessAll}
                  disabled={isProcessingAll || processingCount > 0}
                  className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
                >
                  {isProcessingAll ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileText className="w-4 h-4" />
                  )}
                  {t('ocr.recognizeAll')} ({pendingCount})
                </button>
              )}
              {doneCount > 0 && (
                <button
                  onClick={handleViewDocuments}
                  className="flex items-center gap-2 px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                >
                  <ChevronRight className="w-4 h-4" />
                  {t('ocr.viewDocuments')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Step 3: Review Selected Document */}
      {selectedFile && selectedFile.ocrResult && (
        <div className="card p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <h2 className="text-body font-semibold">{t('ocr.step3Review')}</h2>
              {selectedFile.previewUrl && (
                <button
                  onClick={() => setPreviewImage(selectedFile.previewUrl)}
                  className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
                >
                  <ImageIcon className="w-4 h-4" />
                  {t('ocr.viewOriginal')}
                </button>
              )}
            </div>
            <button
              onClick={() => setEditMode(!editMode)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition ${
                editMode ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Edit className="w-4 h-4" />
              {editMode ? t('ocr.doneEditing') : t('ocr.edit')}
            </button>
          </div>

          <div className="space-y-4">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-micro text-gray-500">
                  {documentType === 'customer_invoice' ? t('ocr.customerName') : t('ocr.vendorName')}
                </label>
                {editMode ? (
                  <input
                    type="text"
                    value={selectedFile.ocrResult.vendor_name || selectedFile.ocrResult.customer_name || ''}
                    onChange={(e) =>
                      updateOcrField(
                        documentType === 'customer_invoice' ? 'customer_name' : 'vendor_name',
                        e.target.value
                      )
                    }
                    className="input mt-1"
                  />
                ) : (
                  <p className="font-medium">
                    {selectedFile.ocrResult.vendor_name || selectedFile.ocrResult.customer_name || '-'}
                  </p>
                )}
              </div>
              <div>
                <label className="text-micro text-gray-500">{t('ocr.date')}</label>
                {editMode ? (
                  <input
                    type="date"
                    value={selectedFile.ocrResult.date || ''}
                    onChange={(e) => updateOcrField('date', e.target.value)}
                    className="input mt-1"
                  />
                ) : (
                  <p className="font-medium">{selectedFile.ocrResult.date || '-'}</p>
                )}
              </div>
              <div>
                <label className="text-micro text-gray-500">{t('ocr.invoiceNumber')}</label>
                {editMode ? (
                  <input
                    type="text"
                    value={selectedFile.ocrResult.invoice_number || ''}
                    onChange={(e) => updateOcrField('invoice_number', e.target.value)}
                    className="input mt-1"
                  />
                ) : (
                  <p className="font-medium">{selectedFile.ocrResult.invoice_number || '-'}</p>
                )}
              </div>
              <div>
                <label className="text-micro text-gray-500">{t('ocr.total')}</label>
                <p className="font-bold text-lg">
                  ¥{(selectedFile.ocrResult.total || 0).toLocaleString()}
                </p>
              </div>
            </div>

            {/* Line Items */}
            {selectedFile.ocrResult.line_items && selectedFile.ocrResult.line_items.length > 0 && (
              <div>
                <label className="text-micro text-gray-500 mb-2 block">
                  {t('ocr.lineItems')} ({selectedFile.ocrResult.line_items.length})
                </label>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left p-2">{t('ocr.productName')}</th>
                        <th className="text-right p-2">{t('ocr.quantity')}</th>
                        <th className="text-right p-2">{t('ocr.unitPrice')}</th>
                        <th className="text-right p-2">{t('ocr.amount')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {selectedFile.ocrResult.line_items.map((item, index) => (
                        <tr key={index}>
                          <td className="p-2">{item.product_name || '-'}</td>
                          <td className="p-2 text-right">
                            {item.quantity} {item.unit}
                          </td>
                          <td className="p-2 text-right">¥{(item.unit_price || 0).toLocaleString()}</td>
                          <td className="p-2 text-right">¥{(item.amount || 0).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Summary */}
            <div className="flex justify-end">
              <div className="text-right space-y-1">
                <p className="text-sub">
                  {t('ocr.subtotal')}: ¥{(selectedFile.ocrResult.subtotal || 0).toLocaleString()}
                </p>
                <p className="text-sub">
                  {t('ocr.tax')}: ¥{(selectedFile.ocrResult.tax || 0).toLocaleString()}
                </p>
                <p className="font-bold text-lg">
                  {t('ocr.total')}: ¥{(selectedFile.ocrResult.total || 0).toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* OCR Info */}
          {selectedFile.ocrResult.ocr_matched_count !== undefined && (
            <div className="mt-4 pt-4 border-t flex items-center gap-4 text-sm text-gray-500">
              <span>
                {t('ocr.matchedProducts')}: {selectedFile.ocrResult.ocr_matched_count}
              </span>
              {selectedFile.ocrResult.ocr_confidence && (
                <span>
                  {t('ocr.confidence')}: {selectedFile.ocrResult.ocr_confidence.toFixed(1)}%
                </span>
              )}
              <span className="text-green-600">
                <CheckCircle className="w-4 h-4 inline mr-1" />
                {t('ocr.savedToOdoo')}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Error display for selected file */}
      {selectedFile && selectedFile.status === 'error' && (
        <div className="card p-4 mb-4 border-red-200 bg-red-50">
          <div className="flex items-center gap-2 text-red-600">
            <AlertCircle className="w-5 h-5" />
            <span className="font-medium">{t('ocr.processingFailed')}</span>
          </div>
          <p className="mt-2 text-red-700">{selectedFile.message}</p>
          <button
            onClick={() => handleProcessSingle(selectedFile.id)}
            className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
          >
            {t('common.retry')}
          </button>
        </div>
      )}
    </div>
  );
}
