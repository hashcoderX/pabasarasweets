'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import axios from '@/lib/http';

interface Designation {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

type WidgetVisibilityChange = {
  widget_key: string;
  is_visible: boolean;
};

type SuperAdminModalMode = 'apply' | 'restore' | 'unlock';

export default function Designations() {
  const [token, setToken] = useState('');
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingDesignation, setEditingDesignation] = useState<Designation | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [designationToDelete, setDesignationToDelete] = useState<Designation | null>(null);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageModalTitle, setMessageModalTitle] = useState('');
  const [messageModalBody, setMessageModalBody] = useState('');
  const [messageModalType, setMessageModalType] = useState<'error' | 'success'>('error');
  const [widgetVisibility, setWidgetVisibility] = useState<Record<string, boolean>>({});
  const [widgetControlsLocked, setWidgetControlsLocked] = useState(false);
  const [showSuperAdminConfirmModal, setShowSuperAdminConfirmModal] = useState(false);
  const [superAdminModalMode, setSuperAdminModalMode] = useState<SuperAdminModalMode>('apply');
  const [pendingWidgetChanges, setPendingWidgetChanges] = useState<WidgetVisibilityChange[]>([]);
  const [widgetVisibilitySnapshot, setWidgetVisibilitySnapshot] = useState<Record<string, boolean> | null>(null);
  const [superAdminEmail, setSuperAdminEmail] = useState('');
  const [superAdminPassword, setSuperAdminPassword] = useState('');
  const [superAdminConfirmLoading, setSuperAdminConfirmLoading] = useState(false);
  const [restoreWidgetListVisible, setRestoreWidgetListVisible] = useState(false);
  const [restoreWidgetLoadingKey, setRestoreWidgetLoadingKey] = useState<string | null>(null);
  const router = useRouter();

  // Form fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const designationWidgetItems = [
    { id: 'hrm-designations-nav-back-button', name: 'Designations Back Button' },
    { id: 'hrm-designations-nav-logout-button', name: 'Designations Logout Button' },
    { id: 'hrm-designations-hero-card', name: 'Designations Hero Card' },
    { id: 'hrm-designations-hero-title', name: 'Designations Hero Title' },
    { id: 'hrm-designations-hero-subtitle', name: 'Designations Hero Subtitle' },
    { id: 'hrm-designations-hero-stats', name: 'Designations Hero Stats' },
    { id: 'hrm-designations-list-card', name: 'Designations List Card' },
    { id: 'hrm-designations-list-heading', name: 'Designations List Heading' },
    { id: 'hrm-designations-list-table-headings', name: 'Designations Table Headings' },
    { id: 'hrm-designations-form-pane', name: 'Designations Form Pane' },
    { id: 'hrm-designations-form-heading', name: 'Designations Form Heading' },
    { id: 'hrm-designations-form-action-buttons', name: 'Designations Form Action Buttons' },
    { id: 'hrm-designations-delete-modal-pane', name: 'Designations Delete Pane' },
    { id: 'hrm-designations-delete-modal-heading', name: 'Designations Delete Heading' },
    { id: 'hrm-designations-delete-modal-action-buttons', name: 'Designations Delete Action Buttons' },
    { id: 'hrm-designations-message-modal-pane', name: 'Designations Message Pane' },
    { id: 'hrm-designations-message-modal-heading', name: 'Designations Message Heading' },
  ];
  const isWidgetVisible = (widgetKey: string) => widgetVisibility[widgetKey] !== false;
  const hiddenWidgetCount = designationWidgetItems.filter((item) => widgetVisibility[item.id] === false).length;

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
    } else {
      setToken(storedToken);
      setApiError(null);
      fetchDesignations(storedToken);
      fetchWidgetVisibility(storedToken);
    }
  }, [router]);

  const fetchDesignations = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;
    
    try {
      const response = await axios.get(`${API_URL}/api/hr/designations`, {
        headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
      });
      setDesignations(response.data.data || []);
    } catch (error) {
      const err: any = error;
      console.error('Error fetching designations:', err?.response?.status, err?.response?.data || err?.message);
      setApiError(
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        `Failed to fetch designations (${err?.response?.status || 'network error'})`
      );
    }
  };

  const fetchWidgetVisibility = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;
    try {
      const response = await axios.get(`${API_URL}/api/dashboard/widgets/me`, {
        headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
      });
      const widgetMap = response.data?.data?.widgets || {};
      const controlsLocked = Boolean(response.data?.data?.widget_controls_locked);
      setWidgetVisibility(widgetMap);
      setWidgetControlsLocked(controlsLocked);
    } catch (error) {
      const err: any = error;
      console.error('Error fetching designation widget visibility:', err?.response?.status, err?.response?.data || err?.message);
      setWidgetVisibility({});
      setWidgetControlsLocked(false);
    }
  };

  const stageWidgetVisibilityChange = (widgetKey: string, isVisible: boolean) => {
    if (widgetControlsLocked) return;
    setWidgetVisibilitySnapshot((prev) => prev ?? widgetVisibility);
    setWidgetVisibility((prev) => ({ ...prev, [widgetKey]: isVisible }));
    setPendingWidgetChanges((prev) => {
      const remaining = prev.filter((entry) => entry.widget_key !== widgetKey);
      return [...remaining, { widget_key: widgetKey, is_visible: isVisible }];
    });
  };

  const rollbackPendingWidgetChanges = () => {
    if (widgetVisibilitySnapshot) setWidgetVisibility(widgetVisibilitySnapshot);
    setPendingWidgetChanges([]);
    setWidgetVisibilitySnapshot(null);
    setShowSuperAdminConfirmModal(false);
    setSuperAdminModalMode('apply');
    setRestoreWidgetListVisible(false);
    setRestoreWidgetLoadingKey(null);
    setSuperAdminEmail('');
    setSuperAdminPassword('');
  };

  const openSuperAdminConfirmation = (
    changes: WidgetVisibilityChange[] = [],
    mode: SuperAdminModalMode = 'apply'
  ) => {
    if (mode !== 'unlock' && !changes.length) return;
    setSuperAdminModalMode(mode);
    setPendingWidgetChanges(changes);
    setRestoreWidgetListVisible(false);
    setRestoreWidgetLoadingKey(null);
    setSuperAdminEmail('');
    setSuperAdminPassword('');
    setShowSuperAdminConfirmModal(true);
  };

  const applyWidgetVisibilityChanges = async () => {
    if (superAdminModalMode !== 'apply') return;
    if (!pendingWidgetChanges.length) return;
    if (!superAdminEmail.trim() || !superAdminPassword) {
      setMessageModalType('error');
      setMessageModalTitle('Widget Update Failed');
      setMessageModalBody('Please enter Super Admin email and password.');
      setShowMessageModal(true);
      return;
    }
    try {
      setSuperAdminConfirmLoading(true);
      for (const change of pendingWidgetChanges) {
        await axios.put(
          `${API_URL}/api/dashboard/widgets/me`,
          {
            widget_key: change.widget_key,
            is_visible: change.is_visible,
            super_admin_email: superAdminEmail.trim(),
            super_admin_password: superAdminPassword,
            lock_widget_controls: true,
          },
          { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
        );
      }
      setWidgetControlsLocked(true);
      setShowSuperAdminConfirmModal(false);
      setPendingWidgetChanges([]);
      setWidgetVisibilitySnapshot(null);
      setSuperAdminEmail('');
      setSuperAdminPassword('');
    } catch (error) {
      const err: any = error;
      console.error('Error applying designation widget changes:', err?.response?.status, err?.response?.data || err?.message);
      setMessageModalType('error');
      setMessageModalTitle('Widget Update Failed');
      setMessageModalBody('Super Admin confirmation failed or widget update failed.');
      setShowMessageModal(true);
    } finally {
      setSuperAdminConfirmLoading(false);
    }
  };

  const restoreAllHiddenWidgetsStaged = () => {
    if (widgetControlsLocked) return;
    const hiddenKeys = designationWidgetItems.map((item) => item.id).filter((key) => widgetVisibility[key] === false);
    if (!hiddenKeys.length) return;
    setWidgetVisibilitySnapshot((prev) => prev ?? widgetVisibility);
    setWidgetVisibility((prev) => {
      const next = { ...prev };
      hiddenKeys.forEach((key) => {
        next[key] = true;
      });
      return next;
    });
    setPendingWidgetChanges((prev) => {
      const next = [...prev];
      hiddenKeys.forEach((key) => {
        const remaining = next.filter((entry) => entry.widget_key !== key);
        remaining.push({ widget_key: key, is_visible: true });
        next.splice(0, next.length, ...remaining);
      });
      return next;
    });
  };

  const restoreHiddenWidgetsAfterFix = () => {
    const hiddenKeys = designationWidgetItems.map((item) => item.id).filter((key) => widgetVisibility[key] === false);
    if (!hiddenKeys.length) {
      setMessageModalType('success');
      setMessageModalTitle('Nothing to Restore');
      setMessageModalBody('All widgets are already visible.');
      setShowMessageModal(true);
      return;
    }
    openSuperAdminConfirmation(hiddenKeys.map((key) => ({ widget_key: key, is_visible: true })), 'restore');
  };

  const showRestoreWidgetList = () => {
    if (!superAdminEmail.trim() || !superAdminPassword) {
      setMessageModalType('error');
      setMessageModalTitle('Super Admin Required');
      setMessageModalBody('Please enter Super Admin email and password.');
      setShowMessageModal(true);
      return;
    }
    setRestoreWidgetListVisible(true);
  };

  const restoreHiddenWidgetOneByOne = async (widgetKey: string) => {
    if (!superAdminEmail.trim() || !superAdminPassword) {
      setMessageModalType('error');
      setMessageModalTitle('Super Admin Required');
      setMessageModalBody('Please enter Super Admin email and password.');
      setShowMessageModal(true);
      return;
    }
    try {
      setRestoreWidgetLoadingKey(widgetKey);
      await axios.put(
        `${API_URL}/api/dashboard/widgets/me`,
        {
          widget_key: widgetKey,
          is_visible: true,
          super_admin_email: superAdminEmail.trim(),
          super_admin_password: superAdminPassword,
          lock_widget_controls: true,
        },
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
      );
      setWidgetVisibility((prev) => ({ ...prev, [widgetKey]: true }));
      setPendingWidgetChanges((prev) => prev.filter((change) => change.widget_key !== widgetKey));
    } catch (error) {
      const err: any = error;
      console.error('Error restoring designation widget:', err?.response?.status, err?.response?.data || err?.message);
      setMessageModalType('error');
      setMessageModalTitle('Restore Failed');
      setMessageModalBody('Failed to restore widget.');
      setShowMessageModal(true);
    } finally {
      setRestoreWidgetLoadingKey(null);
    }
  };

  const openUnlockWidgetsAfterFix = () => openSuperAdminConfirmation([], 'unlock');

  const unlockWidgetControls = async () => {
    if (superAdminModalMode !== 'unlock') return;
    if (!superAdminEmail.trim() || !superAdminPassword) {
      setMessageModalType('error');
      setMessageModalTitle('Super Admin Required');
      setMessageModalBody('Please enter Super Admin email and password.');
      setShowMessageModal(true);
      return;
    }
    const fallbackWidgetKey = designationWidgetItems[0]?.id ?? 'hrm-designations-hero-card';
    const fallbackVisibility = isWidgetVisible(fallbackWidgetKey);
    try {
      setSuperAdminConfirmLoading(true);
      await axios.put(
        `${API_URL}/api/dashboard/widgets/me`,
        {
          widget_key: fallbackWidgetKey,
          is_visible: fallbackVisibility,
          super_admin_email: superAdminEmail.trim(),
          super_admin_password: superAdminPassword,
          lock_widget_controls: false,
        },
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
      );
      setWidgetControlsLocked(false);
      setShowSuperAdminConfirmModal(false);
      setSuperAdminModalMode('apply');
      setRestoreWidgetListVisible(false);
      setRestoreWidgetLoadingKey(null);
      setSuperAdminEmail('');
      setSuperAdminPassword('');
      setPendingWidgetChanges([]);
      setWidgetVisibilitySnapshot(null);
    } catch (error) {
      const err: any = error;
      console.error('Error unlocking designation widgets:', err?.response?.status, err?.response?.data || err?.message);
      setMessageModalType('error');
      setMessageModalTitle('Unlock Failed');
      setMessageModalBody('Failed to unlock widget controls.');
      setShowMessageModal(true);
    } finally {
      setSuperAdminConfirmLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setEditingDesignation(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const designationData = {
      name,
      description,
    };

    try {
      if (editingDesignation) {
        await axios.put(`${API_URL}/api/hr/designations/${editingDesignation.id}`, designationData, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        });
      } else {
        await axios.post(`${API_URL}/api/hr/designations`, designationData, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        });
      }
      fetchDesignations();
      setShowForm(false);
      resetForm();
    } catch (error) {
      console.error('Error saving designation:', error);
      setMessageModalType('error');
      setMessageModalTitle('Save Failed');
      setMessageModalBody('Failed to save designation. Please try again.');
      setShowMessageModal(true);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (designation: Designation) => {
    setEditingDesignation(designation);
    setName(designation.name);
    setDescription(designation.description);
    setShowForm(true);
  };

  const handleDelete = (designation: Designation) => {
    setDesignationToDelete(designation);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!designationToDelete) return;

    try {
      await axios.delete(`${API_URL}/api/hr/designations/${designationToDelete.id}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      setShowDeleteModal(false);
      setDesignationToDelete(null);
      fetchDesignations();
    } catch (error) {
      const err: any = error;
      console.error('Error deleting designation:', err?.response?.status, err?.response?.data || err?.message);
      setShowDeleteModal(false);
      setMessageModalType('error');
      setMessageModalTitle('Delete Failed');
      setMessageModalBody('Failed to delete designation. Please try again.');
      setShowMessageModal(true);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/');
  };

  if (!token) {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-20 left-20 w-72 h-72 bg-blue-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-cyan-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-40 w-72 h-72 bg-teal-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-4000"></div>
      </div>

      {/* Modern Navigation */}
      <nav className="relative z-10 bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center h-auto sm:h-16 py-3 gap-3">
            <div className="flex items-center justify-between sm:justify-start gap-3">
              {isWidgetVisible('hrm-designations-nav-back-button') && (
                <button
                  onClick={() => router.push('/dashboard/hrm')}
                  className="flex items-center space-x-2 text-gray-700 hover:text-blue-600 transition-colors duration-300"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  <span className="font-medium text-sm sm:text-base">Back to HRM</span>
                </button>
              )}
            </div>
            <div className="flex items-center">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                  🏷️
                </div>
                <span className="font-medium text-gray-900">Designation Management</span>
              </div>
            </div>
            <div className="flex items-center justify-end">
              {isWidgetVisible('hrm-designations-nav-logout-button') && (
                <button
                  onClick={handleLogout}
                  className="bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white px-6 py-2 rounded-full text-sm font-medium transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
                >
                  Logout
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {apiError && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3">
            {apiError}
          </div>
        )}
        {isWidgetVisible('hrm-designations-hero-card') && (
          <div className="mb-8 rounded-2xl border border-gray-200 bg-white/90 shadow-sm p-6 relative">
            {!widgetControlsLocked && (
              <button
                onClick={() => stageWidgetVisibilityChange('hrm-designations-hero-card', false)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-red-500 text-white hover:bg-red-600 flex items-center justify-center text-sm"
                title="Hide this widget"
              >
                ×
              </button>
            )}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div>
                <div className="flex items-center space-x-3 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center text-2xl shadow-lg">
                    🏷️
                  </div>
                  <div>
                    {isWidgetVisible('hrm-designations-hero-title') && (
                      <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900">Designation Management</h2>
                    )}
                    {isWidgetVisible('hrm-designations-hero-subtitle') && (
                      <p className="text-sm sm:text-base md:text-lg text-gray-600">Manage job positions and titles</p>
                    )}
                  </div>
                </div>
                {isWidgetVisible('hrm-designations-hero-stats') && (
                  <div className="flex flex-col sm:flex-row gap-4 sm:space-x-6 sm:gap-0 mt-2 sm:mt-4">
                    <div className="text-center">
                      <div className="text-xl sm:text-2xl font-bold text-blue-600">{designations.length}</div>
                      <div className="text-sm text-gray-500">Total Designations</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50/90 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-blue-900">
                Widget Controls {widgetControlsLocked ? '(Locked)' : '(Editable)'}
              </p>
              <p className="text-xs text-blue-700">
                Hidden widgets: {hiddenWidgetCount} | Pending changes: {pendingWidgetChanges.length}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!widgetControlsLocked && (
                <button
                  onClick={() => openSuperAdminConfirmation(pendingWidgetChanges, 'apply')}
                  disabled={!pendingWidgetChanges.length}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Fix Widget
                </button>
              )}
              {!widgetControlsLocked && (
                <button
                  onClick={restoreAllHiddenWidgetsStaged}
                  className="px-4 py-2 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-100"
                >
                  Stage Restore All
                </button>
              )}
              {!widgetControlsLocked && (
                <button
                  onClick={rollbackPendingWidgetChanges}
                  disabled={!pendingWidgetChanges.length}
                  className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Rollback
                </button>
              )}
              <button
                onClick={restoreHiddenWidgetsAfterFix}
                disabled={!hiddenWidgetCount}
                className="px-4 py-2 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Restore Widgets
              </button>
              {widgetControlsLocked && (
                <button
                  onClick={openUnlockWidgetsAfterFix}
                  className="px-4 py-2 rounded-lg border border-orange-200 text-orange-700 hover:bg-orange-50"
                >
                  Unlock Widgets
                </button>
              )}
            </div>
          </div>
        </div>

        {showForm && isWidgetVisible('hrm-designations-form-pane') && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
              <div className="bg-gradient-to-r from-blue-500 to-cyan-500 p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-2xl">🏷️</div>
                    {isWidgetVisible('hrm-designations-form-heading') && (
                      <div>
                        <h3 className="text-xl font-bold text-white">
                          {editingDesignation ? 'Edit Designation' : 'Add New Designation'}
                        </h3>
                        <p className="text-white/80">
                          {editingDesignation ? 'Update designation information' : 'Create a new designation'}
                        </p>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setShowForm(false)}
                    className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-white hover:bg-white/30 transition-colors"
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div className="p-6">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Designation Name *</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-gray-900 placeholder-gray-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-gray-900 placeholder-gray-500"
                    />
                  </div>
                  {isWidgetVisible('hrm-designations-form-action-buttons') && (
                    <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100">
                      <button
                        type="button"
                        onClick={() => setShowForm(false)}
                        className="px-6 py-3 text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50 transition-all duration-200 font-medium"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={loading}
                        className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white px-6 py-3 rounded-xl font-medium transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                      >
                        {loading ? 'Saving...' : (editingDesignation ? 'Update Designation' : 'Create Designation')}
                      </button>
                    </div>
                  )}
                </form>
              </div>
            </div>
          </div>
        )}

        {isWidgetVisible('hrm-designations-list-card') && (
          <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-xl border border-white/20 overflow-hidden relative">
            {!widgetControlsLocked && (
              <button
                onClick={() => stageWidgetVisibilityChange('hrm-designations-list-card', false)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-red-500 text-white hover:bg-red-600 flex items-center justify-center text-sm z-10"
                title="Hide this widget"
              >
                ×
              </button>
            )}
            {isWidgetVisible('hrm-designations-list-heading') && (
              <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-cyan-50">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <span>Designation List</span>
                </h3>
              </div>
            )}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              {isWidgetVisible('hrm-designations-list-table-headings') && (
                <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                      Description
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                      Created
                    </th>
                  </tr>
                </thead>
              )}
              <tbody className="bg-white divide-y divide-gray-200">
                {designations.map((designation) => (
                  <tr key={designation.id} className="hover:bg-gray-50 transition-colors duration-200">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                      {designation.name}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {designation.description || 'No description'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(designation.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        )}

        {showSuperAdminConfirmModal && (
          <div className="fixed inset-0 z-[75] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => {
                if (!superAdminConfirmLoading) rollbackPendingWidgetChanges();
              }}
            />
            <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900">
                  {superAdminModalMode === 'apply' && 'Super Admin Confirmation'}
                  {superAdminModalMode === 'restore' && 'Restore Hidden Widgets'}
                  {superAdminModalMode === 'unlock' && 'Unlock Widget Controls'}
                </h3>
                <p className="mt-1 text-sm text-gray-600">
                  {superAdminModalMode === 'apply' && 'Confirm credentials to apply and lock widget controls.'}
                  {superAdminModalMode === 'restore' && 'Confirm credentials to list and restore hidden widgets.'}
                  {superAdminModalMode === 'unlock' && 'Confirm credentials to unlock widget controls.'}
                </p>
              </div>
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Super Admin Email</label>
                  <input
                    type="email"
                    value={superAdminEmail}
                    onChange={(e) => setSuperAdminEmail(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                    placeholder="superadmin@company.com"
                    disabled={superAdminConfirmLoading}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Super Admin Password</label>
                  <input
                    type="password"
                    value={superAdminPassword}
                    onChange={(e) => setSuperAdminPassword(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                    placeholder="Enter password"
                    disabled={superAdminConfirmLoading}
                  />
                </div>

                {superAdminModalMode === 'restore' && restoreWidgetListVisible && (
                  <div className="max-h-56 overflow-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
                    {designationWidgetItems
                      .filter((item) => widgetVisibility[item.id] === false)
                      .map((item) => (
                        <div key={item.id} className="px-3 py-2 flex items-center justify-between gap-2">
                          <div className="text-sm text-gray-800">{item.name}</div>
                          <button
                            onClick={() => restoreHiddenWidgetOneByOne(item.id)}
                            disabled={restoreWidgetLoadingKey === item.id}
                            className="px-3 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {restoreWidgetLoadingKey === item.id ? 'Restoring...' : 'Restore'}
                          </button>
                        </div>
                      ))}
                    {designationWidgetItems.filter((item) => widgetVisibility[item.id] === false).length === 0 && (
                      <div className="px-3 py-3 text-sm text-gray-500">All widgets are visible.</div>
                    )}
                  </div>
                )}
              </div>
              <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
                <button
                  onClick={rollbackPendingWidgetChanges}
                  disabled={superAdminConfirmLoading}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                {superAdminModalMode === 'apply' && (
                  <button
                    onClick={applyWidgetVisibilityChanges}
                    disabled={superAdminConfirmLoading || !pendingWidgetChanges.length}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {superAdminConfirmLoading ? 'Applying...' : 'Confirm & Lock'}
                  </button>
                )}
                {superAdminModalMode === 'restore' && !restoreWidgetListVisible && (
                  <button
                    onClick={showRestoreWidgetList}
                    disabled={superAdminConfirmLoading}
                    className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Show Hidden Widgets
                  </button>
                )}
                {superAdminModalMode === 'unlock' && (
                  <button
                    onClick={unlockWidgetControls}
                    disabled={superAdminConfirmLoading}
                    className="px-4 py-2 rounded-lg bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50"
                  >
                    {superAdminConfirmLoading ? 'Unlocking...' : 'Unlock Widgets'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {showDeleteModal && isWidgetVisible('hrm-designations-delete-modal-pane') && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-red-200">
              {isWidgetVisible('hrm-designations-delete-modal-heading') && (
                <div className="px-5 py-4 bg-gradient-to-r from-red-500 to-pink-500">
                  <h4 className="text-white font-semibold">Confirm Deletion</h4>
                </div>
              )}
              <div className="p-5 space-y-3">
                <p className="text-sm text-gray-700">
                  Are you sure you want to delete
                  <span className="font-semibold"> {designationToDelete?.name || 'this designation'}</span>?
                </p>
                <p className="text-xs text-red-700">This action cannot be undone.</p>
              </div>
              {isWidgetVisible('hrm-designations-delete-modal-action-buttons') && (
                <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDeleteModal(false);
                      setDesignationToDelete(null);
                    }}
                    className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmDelete}
                    className="px-4 py-2 rounded-lg bg-red-600 text-sm font-semibold text-white hover:bg-red-700"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {showMessageModal && isWidgetVisible('hrm-designations-message-modal-pane') && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200">
              {isWidgetVisible('hrm-designations-message-modal-heading') && (
                <div
                  className={`px-5 py-4 ${
                    messageModalType === 'error'
                      ? 'bg-gradient-to-r from-red-500 to-pink-500'
                      : 'bg-gradient-to-r from-emerald-500 to-cyan-500'
                  }`}
                >
                  <h4 className="text-white font-semibold">{messageModalTitle}</h4>
                </div>
              )}
              <div className="p-5">
                <p className="text-sm text-gray-700">{messageModalBody}</p>
              </div>
              <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowMessageModal(false)}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-100"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}