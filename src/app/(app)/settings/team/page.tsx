'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useAuthStore } from '@/stores/auth';
import {
  Users,
  UserPlus,
  Mail,
  RefreshCw,
  XCircle,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Search,
  ChevronDown,
  Shield,
  Building2,
  Copy,
} from 'lucide-react';

type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';
type Role = 'BILLING_ADMIN' | 'ORG_ADMIN' | 'MANAGER' | 'OPERATOR';

interface Invitation {
  id: string;
  email: string;
  role: Role;
  storeScope: string[];
  status: InvitationStatus;
  type: string;
  expiresAt: string;
  usedAt?: string;
  resentCount: number;
  createdAt: string;
  sender?: {
    displayName: string;
    email: string;
  };
}

interface TeamMember {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  storeScope: string[];
  status: string;
  lastLoginAt?: string;
  createdAt: string;
}

export default function TeamPage() {
  const t = useTranslations();
  const locale = useLocale();
  const { user } = useAuthStore();

  const [activeTab, setActiveTab] = useState<'members' | 'invitations'>('members');
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: '',
    role: 'OPERATOR' as Role,
    storeScope: [] as string[],
  });
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState<{ url?: string } | null>(null);

  // Actions state
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const getText = useCallback((zh: string, ja: string, en: string) => {
    return locale === 'zh' ? zh : locale === 'ja' ? ja : en;
  }, [locale]);

  const roleLabels: Record<Role, { zh: string; ja: string; en: string }> = {
    BILLING_ADMIN: { zh: '账务管理员', ja: '課金管理者', en: 'Billing Admin' },
    ORG_ADMIN: { zh: '组织管理员', ja: '組織管理者', en: 'Org Admin' },
    MANAGER: { zh: '经理', ja: 'マネージャー', en: 'Manager' },
    OPERATOR: { zh: '操作员', ja: 'オペレーター', en: 'Operator' },
  };

  const statusConfig: Record<InvitationStatus, { color: string; icon: React.ElementType; label: { zh: string; ja: string; en: string } }> = {
    PENDING: { color: 'text-yellow-600 bg-yellow-50', icon: Clock, label: { zh: '待接受', ja: '保留中', en: 'Pending' } },
    ACCEPTED: { color: 'text-green-600 bg-green-50', icon: CheckCircle2, label: { zh: '已接受', ja: '承認済み', en: 'Accepted' } },
    EXPIRED: { color: 'text-gray-600 bg-gray-100', icon: AlertCircle, label: { zh: '已过期', ja: '期限切れ', en: 'Expired' } },
    REVOKED: { color: 'text-red-600 bg-red-50', icon: XCircle, label: { zh: '已撤销', ja: '取り消し', en: 'Revoked' } },
  };

  const getRoleLabel = (role: Role) => {
    const labels = roleLabels[role];
    return locale === 'zh' ? labels.zh : locale === 'ja' ? labels.ja : labels.en;
  };

  const getStatusLabel = (status: InvitationStatus) => {
    const config = statusConfig[status];
    return locale === 'zh' ? config.label.zh : locale === 'ja' ? config.label.ja : config.label.en;
  };

  // Fetch invitations
  const fetchInvitations = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/invitations');
      const data = await res.json();
      if (data.success) {
        setInvitations(data.data.invitations);
      }
    } catch {
      console.error('Failed to fetch invitations');
    }
  }, []);

  // Fetch team members
  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/members');
      const data = await res.json();
      if (data.success) {
        setMembers(data.data.members);
      }
    } catch {
      console.error('Failed to fetch members');
    }
  }, []);

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([fetchMembers(), fetchInvitations()]);
      setIsLoading(false);
    };
    loadData();
  }, [fetchMembers, fetchInvitations]);

  // Send invitation
  const handleSendInvitation = async () => {
    if (!inviteForm.email || !inviteForm.email.includes('@')) {
      setInviteError(getText('请输入有效的邮箱地址', '有効なメールアドレスを入力してください', 'Please enter a valid email address'));
      return;
    }

    setIsInviting(true);
    setInviteError('');
    setInviteSuccess(null);

    try {
      const res = await fetch('/api/admin/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inviteForm),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to send invitation');
      }

      setInviteSuccess({ url: data.data.invitationUrl });
      fetchInvitations();
      setInviteForm({ email: '', role: 'OPERATOR', storeScope: [] });
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to send invitation');
    } finally {
      setIsInviting(false);
    }
  };

  // Resend invitation
  const handleResendInvitation = async (invitationId: string) => {
    setActionLoading(invitationId);
    try {
      const res = await fetch(`/api/admin/invitations/${invitationId}/resend`, {
        method: 'POST',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to resend');
      }

      fetchInvitations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend invitation');
    } finally {
      setActionLoading(null);
    }
  };

  // Revoke invitation
  const handleRevokeInvitation = async (invitationId: string) => {
    if (!confirm(getText('确定要撤销此邀请吗？', 'この招待を取り消しますか？', 'Are you sure you want to revoke this invitation?'))) {
      return;
    }

    setActionLoading(invitationId);
    try {
      const res = await fetch(`/api/admin/invitations/${invitationId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to revoke');
      }

      fetchInvitations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke invitation');
    } finally {
      setActionLoading(null);
    }
  };

  // Copy URL to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Check if user is admin
  const isAdmin = user?.isAdmin;

  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="card p-8 text-center">
          <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-lg font-medium text-gray-900 mb-2">
            {getText('权限不足', 'アクセス権限がありません', 'Access Denied')}
          </h2>
          <p className="text-gray-500">
            {getText('只有管理员可以管理团队成员', '管理者のみがチームメンバーを管理できます', 'Only administrators can manage team members')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Users className="w-6 h-6" />
            {getText('团队管理', 'チーム管理', 'Team Management')}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {getText('管理团队成员和邀请', 'チームメンバーと招待を管理', 'Manage team members and invitations')}
          </p>
        </div>
        <button
          onClick={() => setShowInviteModal(true)}
          className="btn-primary flex items-center gap-2"
        >
          <UserPlus className="w-4 h-4" />
          {getText('邀请成员', 'メンバーを招待', 'Invite Member')}
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-500 hover:text-red-700">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('members')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            activeTab === 'members'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {getText('成员', 'メンバー', 'Members')} ({members.length})
        </button>
        <button
          onClick={() => setActiveTab('invitations')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            activeTab === 'invitations'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {getText('邀请', '招待', 'Invitations')} ({invitations.filter(i => i.status === 'PENDING').length})
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="card p-8 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" />
          <p className="mt-2 text-gray-500">{getText('加载中...', '読み込み中...', 'Loading...')}</p>
        </div>
      ) : activeTab === 'members' ? (
        /* Members List */
        <div className="card divide-y">
          {members.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              {getText('暂无成员', 'メンバーがいません', 'No members yet')}
            </div>
          ) : (
            members.map((member) => (
              <div key={member.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                    <span className="text-gray-600 font-medium">
                      {member.displayName?.charAt(0).toUpperCase() || member.email.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">{member.displayName || member.email}</div>
                    <div className="text-sm text-gray-500">{member.email}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-50 text-blue-700">
                    {getRoleLabel(member.role)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* Invitations List */
        <div className="card divide-y">
          {invitations.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              {getText('暂无邀请', '招待がありません', 'No invitations')}
            </div>
          ) : (
            invitations.map((invitation) => {
              const status = statusConfig[invitation.status];
              const StatusIcon = status.icon;

              return (
                <div key={invitation.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${status.color}`}>
                        <StatusIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{invitation.email}</div>
                        <div className="text-sm text-gray-500 flex items-center gap-2">
                          <span className="px-1.5 py-0.5 text-xs rounded bg-gray-100">
                            {getRoleLabel(invitation.role)}
                          </span>
                          <span>·</span>
                          <span>{getStatusLabel(invitation.status)}</span>
                          {invitation.resentCount > 0 && (
                            <>
                              <span>·</span>
                              <span>{getText(`已重发 ${invitation.resentCount} 次`, `${invitation.resentCount}回再送信`, `Resent ${invitation.resentCount}x`)}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {invitation.status === 'PENDING' && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleResendInvitation(invitation.id)}
                          disabled={actionLoading === invitation.id}
                          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                          title={getText('重新发送', '再送信', 'Resend')}
                        >
                          {actionLoading === invitation.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() => handleRevokeInvitation(invitation.id)}
                          disabled={actionLoading === invitation.id}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                          title={getText('撤销', '取り消し', 'Revoke')}
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  {invitation.status === 'PENDING' && (
                    <div className="mt-2 text-xs text-gray-500">
                      {getText('过期时间', '有効期限', 'Expires')}: {new Date(invitation.expiresAt).toLocaleString(locale)}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <UserPlus className="w-5 h-5" />
                {getText('邀请新成员', '新しいメンバーを招待', 'Invite New Member')}
              </h2>
            </div>

            <div className="p-6 space-y-4">
              {inviteError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                  {inviteError}
                </div>
              )}

              {inviteSuccess ? (
                <div className="space-y-4">
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-2 text-green-700 mb-2">
                      <CheckCircle2 className="w-5 h-5" />
                      <span className="font-medium">{getText('邀请已发送', '招待が送信されました', 'Invitation Sent')}</span>
                    </div>
                    <p className="text-sm text-green-600">
                      {getText('邀请链接已创建，有效期48小时', '招待リンクが作成されました。48時間有効です', 'Invitation link created. Valid for 48 hours.')}
                    </p>
                  </div>

                  {inviteSuccess.url && (
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        {getText('邀请链接 (仅开发环境显示)', '招待リンク (開発環境のみ)', 'Invitation URL (dev only)')}
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={inviteSuccess.url}
                          readOnly
                          className="flex-1 h-10 px-3 text-sm border border-gray-300 rounded-lg bg-gray-50"
                        />
                        <button
                          onClick={() => copyToClipboard(inviteSuccess.url!)}
                          className="h-10 px-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => {
                      setShowInviteModal(false);
                      setInviteSuccess(null);
                    }}
                    className="w-full btn-primary"
                  >
                    {getText('完成', '完了', 'Done')}
                  </button>
                </div>
              ) : (
                <>
                  {/* Email */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {getText('邮箱地址', 'メールアドレス', 'Email Address')}
                    </label>
                    <input
                      type="email"
                      value={inviteForm.email}
                      onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                      className="w-full h-11 px-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="employee@example.com"
                    />
                  </div>

                  {/* Role */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {getText('角色', 'ロール', 'Role')}
                    </label>
                    <select
                      value={inviteForm.role}
                      onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value as Role })}
                      className="w-full h-11 px-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="OPERATOR">{getRoleLabel('OPERATOR')}</option>
                      <option value="MANAGER">{getRoleLabel('MANAGER')}</option>
                      <option value="ORG_ADMIN">{getRoleLabel('ORG_ADMIN')}</option>
                    </select>
                    <p className="mt-1 text-xs text-gray-500">
                      {inviteForm.role === 'OPERATOR' && getText('可以执行日常操作', '日常的な操作を実行できます', 'Can perform daily operations')}
                      {inviteForm.role === 'MANAGER' && getText('可以管理特定店铺', '特定の店舗を管理できます', 'Can manage specific stores')}
                      {inviteForm.role === 'ORG_ADMIN' && getText('可以管理组织和成员', '組織とメンバーを管理できます', 'Can manage organization and members')}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => {
                        setShowInviteModal(false);
                        setInviteError('');
                        setInviteForm({ email: '', role: 'OPERATOR', storeScope: [] });
                      }}
                      className="flex-1 h-11 px-4 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition"
                    >
                      {getText('取消', 'キャンセル', 'Cancel')}
                    </button>
                    <button
                      onClick={handleSendInvitation}
                      disabled={isInviting}
                      className="flex-1 btn-primary h-11 flex items-center justify-center gap-2"
                    >
                      {isInviting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {getText('发送中...', '送信中...', 'Sending...')}
                        </>
                      ) : (
                        <>
                          <Mail className="w-4 h-4" />
                          {getText('发送邀请', '招待を送信', 'Send Invitation')}
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
