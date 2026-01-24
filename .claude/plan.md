# Email Compose Feature for Purchase Orders

## Overview
Implement a complete email composition interface for purchase orders that allows users to:
- View and edit email recipient, subject, and body
- Review attachments (e.g., PO PDF)
- Send email after review and confirmation

## Implementation Steps

### 1. Create Email Compose Modal Component
**File**: `src/components/purchase/email-compose-modal.tsx`

- Modal dialog with form fields:
  - Recipient email (text input, pre-filled from vendor)
  - Subject (text input, pre-filled from template)
  - Body (textarea with rich content, pre-filled from template)
  - Attachments list (read-only, showing PDF attachments)
- Buttons: Cancel, Send
- Loading states for fetching template and sending

### 2. Create API Endpoint for Email Template
**File**: `src/app/api/purchase/[id]/email/template/route.ts`

- GET endpoint that returns:
  - Default recipient (vendor email)
  - Subject (from Odoo mail.template or generated)
  - Body (from Odoo mail.template, rendered with PO context)
  - List of attachments (PO PDF report)

Implementation:
- Search for `purchase.order` mail template in Odoo
- Use `mail.template.generate_email` or render template manually
- Get vendor contact email
- Get report attachment info

### 3. Modify Email Send API
**File**: `src/app/api/purchase/[id]/email/route.ts`

Update POST endpoint to accept:
```typescript
{
  recipient: string,
  subject: string,
  body: string,
  attachment_ids?: number[]
}
```

Implementation:
- Create `mail.compose.message` with custom values
- Attach the PO PDF report
- Call `action_send_mail` to send

### 4. Update Purchase Order Page
**File**: `src/app/(app)/purchase/[id]/page.tsx`

- Import and add `EmailComposeModal` component
- Add state for modal open/close
- Modify "发送邮件" button to open modal instead of direct send
- Handle send success/error feedback

### 5. Update ODOO_ALLOWLIST if needed
**File**: `src/lib/odoo.ts`

Verify these methods are allowed (add if missing):
- `mail.template`: `generate_email`, `get_email_template`
- `mail.compose.message`: `create`, `action_send_mail`
- `ir.attachment`: `search_read` (for listing attachments)

## API Contracts

### GET /api/purchase/[id]/email/template
Response:
```json
{
  "recipient": "vendor@example.com",
  "subject": "PO-00001 - Purchase Order",
  "body": "<p>Dear Vendor,...</p>",
  "attachments": [
    { "id": 123, "name": "PO-00001.pdf", "mimetype": "application/pdf" }
  ]
}
```

### POST /api/purchase/[id]/email
Request:
```json
{
  "recipient": "vendor@example.com",
  "subject": "PO-00001 - Purchase Order",
  "body": "<p>Custom message...</p>",
  "attachment_ids": [123]
}
```
Response:
```json
{
  "success": true,
  "message_id": 456
}
```

## UI/UX Flow
1. User clicks "发送邮件" button
2. Modal opens with loading state
3. Template data loads (recipient, subject, body, attachments)
4. User reviews and optionally edits content
5. User clicks "Send" button
6. Confirmation toast on success
7. Modal closes

## Files to Create/Modify
1. **Create**: `src/components/purchase/email-compose-modal.tsx`
2. **Create**: `src/app/api/purchase/[id]/email/template/route.ts`
3. **Modify**: `src/app/api/purchase/[id]/email/route.ts`
4. **Modify**: `src/app/(app)/purchase/[id]/page.tsx`
5. **Possibly modify**: `src/lib/odoo.ts` (ODOO_ALLOWLIST)
