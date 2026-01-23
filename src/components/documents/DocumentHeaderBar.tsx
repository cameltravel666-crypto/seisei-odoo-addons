'use client';

/**
 * DocumentHeaderBar Component
 *
 * Unified header bar for document detail pages featuring:
 * - Back button
 * - Editable document title (name or fallback to number)
 * - Status badge
 * - Actions menu (Edit, Delete, Copy, Email/Share)
 *
 * Usage:
 * ```tsx
 * <DocumentHeaderBar
 *   name={document.name}
 *   numberCode={document.numberCode}
 *   state={document.state}
 *   onBack={() => router.back()}
 *   onNameSave={async (name) => updateDocument({ name })}
 *   canEdit={document.state === 'draft'}
 *   isEditMode={editMode}
 *   onToggleEditMode={() => setEditMode(!editMode)}
 * />
 * ```
 */
import { useState, useRef, useEffect } from 'react';
import { ArrowLeft, X, Edit, MoreVertical, Trash2, Copy, Mail, Share2 } from 'lucide-react';
import { DocumentTitle } from './DocumentNameEditor';
import type { DocumentState } from '@/types/document';

interface DocumentHeaderBarProps {
  /** User-editable document name */
  name: string | null;
  /** System-generated document number */
  numberCode: string;
  /** Current document state */
  state: DocumentState;
  /** State label text */
  stateLabel: string;
  /** State badge color class */
  stateColorClass?: string;
  /** Go back handler */
  onBack: () => void;
  /** Save name handler */
  onNameSave: (name: string) => Promise<void>;
  /** Can document be edited? */
  canEdit?: boolean;
  /** Is currently in edit mode? */
  isEditMode?: boolean;
  /** Toggle edit mode */
  onToggleEditMode?: () => void;
  /** Translation function */
  t: (key: string) => string;
  /** Additional actions for the menu */
  actions?: {
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
    danger?: boolean;
  }[];
}

// Default state colors
const defaultStateColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  sent: 'bg-yellow-100 text-yellow-800',
  to_approve: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-green-100 text-green-800',
  sale: 'bg-green-100 text-green-800',
  purchase: 'bg-green-100 text-green-800',
  posted: 'bg-blue-100 text-blue-800',
  done: 'bg-green-100 text-green-800',
  paid: 'bg-green-100 text-green-800',
  cancel: 'bg-red-100 text-red-800',
};

export function DocumentHeaderBar({
  name,
  numberCode,
  state,
  stateLabel,
  stateColorClass,
  onBack,
  onNameSave,
  canEdit = false,
  isEditMode = false,
  onToggleEditMode,
  t,
  actions = [],
}: DocumentHeaderBarProps) {
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowActionsMenu(false);
      }
    };
    if (showActionsMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showActionsMenu]);

  const colorClass = stateColorClass || defaultStateColors[state] || 'bg-gray-100 text-gray-800';

  return (
    <div className="flex items-center justify-between mb-4">
      {/* Left: Back button + Title */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <button
          onClick={onBack}
          className="p-2 hover:bg-gray-100 rounded-lg transition flex-shrink-0"
          style={{ minWidth: '44px', minHeight: '44px' }}
        >
          {isEditMode ? <X className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
        </button>

        <div className="min-w-0 flex-1">
          {/* Title with edit capability */}
          <DocumentTitle
            name={name}
            numberCode={numberCode}
            onSave={onNameSave}
            editable={canEdit && !isEditMode}
          />

          {/* Subtitle: Number (if name exists) + Status */}
          <div className="flex items-center gap-2 mt-0.5">
            {name && (
              <span className="text-sm text-gray-500">{numberCode}</span>
            )}
            <span
              className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${colorClass}`}
            >
              {stateLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Edit button (when not in edit mode and can edit) */}
        {canEdit && !isEditMode && onToggleEditMode && (
          <button
            onClick={onToggleEditMode}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition"
            style={{ minHeight: '44px' }}
          >
            <Edit className="w-4 h-4" />
            {t('common.edit')}
          </button>
        )}

        {/* Actions menu */}
        {actions.length > 0 && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowActionsMenu(!showActionsMenu)}
              className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition"
              style={{ minWidth: '44px', minHeight: '44px' }}
            >
              <MoreVertical className="w-5 h-5" />
            </button>

            {showActionsMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                {actions.map((action, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      action.onClick();
                      setShowActionsMenu(false);
                    }}
                    disabled={action.disabled}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition disabled:opacity-50 ${
                      action.danger
                        ? 'text-red-600 hover:bg-red-50'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                    style={{ minHeight: '44px' }}
                  >
                    {action.icon}
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Helper to create common document actions
 */
export function createDocumentActions({
  onDelete,
  onCopy,
  onEmail,
  onShare,
  canDelete = false,
  canCopy = true,
  canEmail = false,
  canShare = false,
  t,
}: {
  onDelete?: () => void;
  onCopy?: () => void;
  onEmail?: () => void;
  onShare?: () => void;
  canDelete?: boolean;
  canCopy?: boolean;
  canEmail?: boolean;
  canShare?: boolean;
  t: (key: string) => string;
}) {
  const actions = [];

  if (canCopy && onCopy) {
    actions.push({
      label: t('common.copy'),
      icon: <Copy className="w-4 h-4" />,
      onClick: onCopy,
    });
  }

  if (canEmail && onEmail) {
    actions.push({
      label: t('common.sendEmail'),
      icon: <Mail className="w-4 h-4" />,
      onClick: onEmail,
    });
  }

  if (canShare && onShare) {
    actions.push({
      label: t('common.share'),
      icon: <Share2 className="w-4 h-4" />,
      onClick: onShare,
    });
  }

  if (canDelete && onDelete) {
    actions.push({
      label: t('common.delete'),
      icon: <Trash2 className="w-4 h-4" />,
      onClick: onDelete,
      danger: true,
    });
  }

  return actions;
}
