'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { X, Mail, Loader2, CheckCircle, AlertCircle, Paperclip, Send } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { ApiResponse } from '@/types';

interface Attachment {
  id: number;
  name: string;
  mimetype: string;
  fileSize?: number;
}

interface EmailTemplate {
  recipient: string;
  subject: string;
  body: string;
  attachments: Attachment[];
}

interface EmailComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: number;
  orderName: string;
  partnerName: string;
  partnerEmail?: string;
  onSuccess?: () => void;
}

export function EmailComposeModal({
  isOpen,
  onClose,
  orderId,
  orderName,
  partnerName,
  partnerEmail,
  onSuccess,
}: EmailComposeModalProps) {
  const t = useTranslations();

  const [recipient, setRecipient] = useState(partnerEmail || '');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attachmentIds, setAttachmentIds] = useState<number[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  // Fetch email template/defaults
  const { data: templateData, isLoading: isLoadingTemplate, error: templateError } = useQuery({
    queryKey: ['email-template', orderId],
    queryFn: async () => {
      const res = await fetch(`/api/purchase/${orderId}/email/template`);
      const data: ApiResponse<EmailTemplate> = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Failed to fetch email template');
      return data.data!;
    },
    enabled: isOpen && !!orderId,
  });

  // Set form values when template loads
  useEffect(() => {
    if (templateData) {
      setRecipient(templateData.recipient || partnerEmail || '');
      setSubject(templateData.subject || '');
      setBody(templateData.body || '');
      setAttachments(templateData.attachments || []);
      setAttachmentIds(templateData.attachments?.map(a => a.id) || []);
    }
  }, [templateData, partnerEmail]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setRecipient(partnerEmail || '');
      setSubject('');
      setBody('');
      setAttachments([]);
      setAttachmentIds([]);
    }
  }, [isOpen, partnerEmail]);

  // Send email mutation
  const sendEmail = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/purchase/${orderId}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient,
          subject,
          body,
          attachment_ids: attachmentIds,
        }),
      });
      const data: ApiResponse<{ sent: boolean; message: string }> = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Failed to send email');
      return data.data!;
    },
    onSuccess: () => {
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1500);
    },
  });

  // Toggle attachment selection
  const toggleAttachment = (attachmentId: number) => {
    setAttachmentIds(prev =>
      prev.includes(attachmentId)
        ? prev.filter(id => id !== attachmentId)
        : [...prev, attachmentId]
    );
  };

  if (!isOpen) return null;

  const canSend = recipient.trim() && subject.trim() && !sendEmail.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-blue-600 text-white flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Mail className="w-6 h-6" />
              <div>
                <h2 className="text-lg font-semibold">{t('email.compose') || '编辑邮件'}</h2>
                <p className="text-sm text-blue-100">{orderName} - {partnerName}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-white/20 rounded-lg transition"
              disabled={sendEmail.isPending}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Success State */}
        {sendEmail.isSuccess && (
          <div className="p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {t('email.sent') || '邮件已发送'}
            </h3>
            <p className="text-gray-500">
              {t('email.sentTo') || '已发送至'} {recipient}
            </p>
          </div>
        )}

        {/* Error State */}
        {sendEmail.isError && (
          <div className="p-6">
            <div className="flex items-start gap-3 p-4 bg-red-50 rounded-lg mb-4">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-800">{t('email.sendFailed') || '发送失败'}</p>
                <p className="text-sm text-red-600 mt-1">
                  {(sendEmail.error as Error)?.message || t('common.error')}
                </p>
              </div>
            </div>
            <button
              onClick={() => sendEmail.reset()}
              className="w-full py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
            >
              {t('common.retry') || '重试'}
            </button>
          </div>
        )}

        {/* Loading Template */}
        {isLoadingTemplate && !sendEmail.isSuccess && !sendEmail.isError && (
          <div className="p-8 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-gray-500">{t('common.loading') || '加载中...'}</p>
          </div>
        )}

        {/* Template Error */}
        {templateError && !sendEmail.isSuccess && !sendEmail.isError && (
          <div className="p-6">
            <div className="flex items-start gap-3 p-4 bg-yellow-50 rounded-lg mb-4">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-800">{t('email.templateLoadFailed') || '加载模板失败'}</p>
                <p className="text-sm text-yellow-600 mt-1">
                  {(templateError as Error)?.message || t('common.error')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Form */}
        {!sendEmail.isSuccess && !sendEmail.isError && !isLoadingTemplate && (
          <>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Recipient */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('email.recipient') || '收件人'} <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="vendor@example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Subject */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('email.subject') || '主题'} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder={t('email.subjectPlaceholder') || '邮件主题'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Body */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('email.body') || '正文'}
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={8}
                  placeholder={t('email.bodyPlaceholder') || '邮件内容...'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
              </div>

              {/* Attachments */}
              {attachments.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Paperclip className="w-4 h-4 inline-block mr-1" />
                    {t('email.attachments') || '附件'}
                  </label>
                  <div className="space-y-2">
                    {attachments.map((attachment) => (
                      <label
                        key={attachment.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
                          attachmentIds.includes(attachment.id)
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={attachmentIds.includes(attachment.id)}
                          onChange={() => toggleAttachment(attachment.id)}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {attachment.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {attachment.mimetype}
                            {attachment.fileSize && ` · ${Math.round(attachment.fileSize / 1024)} KB`}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="px-6 py-4 bg-gray-50 flex gap-3 flex-shrink-0 border-t">
              <button
                type="button"
                onClick={onClose}
                disabled={sendEmail.isPending}
                className="flex-1 py-2.5 px-4 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-100 transition disabled:opacity-50"
              >
                {t('common.cancel') || '取消'}
              </button>
              <button
                type="button"
                onClick={() => sendEmail.mutate()}
                disabled={!canSend}
                className="flex-1 py-2.5 px-4 rounded-lg text-white font-medium bg-blue-600 hover:bg-blue-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {sendEmail.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('email.sending') || '发送中...'}
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    {t('email.send') || '发送'}
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
