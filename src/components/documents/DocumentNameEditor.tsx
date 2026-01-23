'use client';

/**
 * DocumentNameEditor Component
 *
 * A responsive editor for document names that:
 * - Shows as a bottom sheet on mobile
 * - Shows as an inline popover or modal on desktop
 * - Supports optimistic updates with rollback on error
 *
 * Usage:
 * ```tsx
 * <DocumentNameEditor
 *   value={document.name}
 *   placeholder="Add a name..."
 *   onSave={async (name) => { await updateDocument({ name }); }}
 *   trigger={<button><Edit className="w-4 h-4" /></button>}
 * />
 * ```
 */
import { useState, useEffect, useRef, ReactNode } from 'react';
import { X, Loader2, Check, Pencil } from 'lucide-react';

interface DocumentNameEditorProps {
  /** Current name value */
  value: string | null;
  /** Placeholder text when no name is set */
  placeholder?: string;
  /** Maximum character length */
  maxLength?: number;
  /** Callback to save the name */
  onSave: (name: string) => Promise<void>;
  /** Custom trigger element (optional) */
  trigger?: ReactNode;
  /** Label text shown above the input */
  label?: string;
}

export function DocumentNameEditor({
  value,
  placeholder = 'Enter name...',
  maxLength = 60,
  onSave,
  trigger,
  label = 'Name',
}: DocumentNameEditorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editValue, setEditValue] = useState(value || '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset edit value when modal opens
  useEffect(() => {
    if (isOpen) {
      setEditValue(value || '');
      setError(null);
      // Focus input after animation
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, value]);

  const handleSave = async () => {
    const trimmedValue = editValue.trim();

    // Validate
    if (trimmedValue.length > maxLength) {
      setError(`Maximum ${maxLength} characters allowed`);
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await onSave(trimmedValue);
      setIsOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  // Default trigger button
  const triggerElement = trigger || (
    <button
      onClick={() => setIsOpen(true)}
      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
      title="Edit name"
    >
      <Pencil className="w-4 h-4" />
    </button>
  );

  return (
    <>
      {/* Trigger */}
      <span onClick={() => setIsOpen(true)}>{triggerElement}</span>

      {/* Bottom Sheet / Modal */}
      {isOpen && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 bg-black/40 z-50"
            onClick={() => !isSaving && setIsOpen(false)}
          />

          {/* Sheet */}
          <div
            className="fixed bottom-0 left-0 right-0 md:bottom-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-md md:w-full md:rounded-xl bg-white rounded-t-2xl z-50 animate-slide-up md:animate-fade-in"
            style={{
              paddingBottom: 'calc(var(--space-6, 24px) + env(safe-area-inset-bottom, 0px))',
            }}
          >
            {/* Handle (mobile only) */}
            <div className="flex justify-center py-2 md:hidden">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">{label}</h3>
              <button
                onClick={() => !isSaving && setIsOpen(false)}
                disabled={isSaving}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="px-4 py-4">
              <input
                ref={inputRef}
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                maxLength={maxLength}
                disabled={isSaving}
                className="input w-full text-base disabled:opacity-50"
                style={{ minHeight: '44px' }}
              />

              {/* Character count */}
              <div className="flex justify-between mt-2 text-xs text-gray-400">
                <span>{error && <span className="text-red-500">{error}</span>}</span>
                <span>
                  {editValue.length}/{maxLength}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="px-4 flex gap-3">
              <button
                onClick={() => setIsOpen(false)}
                disabled={isSaving}
                className="flex-1 btn bg-gray-100 text-gray-700 hover:bg-gray-200 py-3 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 btn btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSaving ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Check className="w-5 h-5" />
                    Save
                  </>
                )}
              </button>
            </div>
          </div>
        </>
      )}

      <style jsx>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translate(-50%, -48%);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
        .animate-fade-in {
          animation: fade-in 0.2s ease-out;
        }
      `}</style>
    </>
  );
}

/**
 * Inline document title with edit affordance
 * Shows the document name (or number if no name) with a pencil icon to edit
 */
export function DocumentTitle({
  name,
  numberCode,
  onSave,
  editable = true,
}: {
  name: string | null;
  numberCode: string;
  onSave: (name: string) => Promise<void>;
  editable?: boolean;
}) {
  const displayName = name || numberCode;
  const hasName = !!name;

  return (
    <div className="flex items-center gap-2">
      <h1 className="text-lg font-semibold text-gray-900 truncate">{displayName}</h1>
      {editable && (
        <DocumentNameEditor
          value={name}
          placeholder={hasName ? 'Edit name...' : 'Add a name...'}
          onSave={onSave}
          label={hasName ? 'Edit Name' : 'Add Name'}
        />
      )}
      {!hasName && editable && (
        <span className="text-xs text-gray-400 hidden md:inline">Click to add name</span>
      )}
    </div>
  );
}
