'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { isAxiosError } from 'axios';
import axios from '@/lib/http';

interface Employee {
  id: number;
  employee_code: string;
  first_name: string;
  last_name: string;
  email: string;
  department: { id: number; name: string };
  designation: { id: number; name: string };
  status: 'active' | 'inactive';
}

interface LeaveType {
  id: number;
  name: string;
  code: string;
  description?: string;
  max_days_per_year: number;
  requires_documentation: boolean;
  is_active: boolean;
}

interface Leave {
  id: number;
  employee_id: number;
  leave_type: string;
  start_date: string;
  end_date: string;
  days_requested: number;
  reason: string;
  status: 'pending' | 'section_head_approved' | 'approved' | 'rejected';
  employee: Employee;
  leaveType?: LeaveType;
  section_head_approved: boolean;
  section_head_approved_by?: number;
  section_head_approved_at?: string;
  section_head_notes?: string;
  sectionHeadApprover?: Employee;
  hr_approved: boolean;
  hr_approved_by?: number;
  hr_approved_at?: string;
  hr_notes?: string;
  hrApprover?: Employee;
  created_at: string;
}

type WidgetVisibilityChange = {
  widget_key: string;
  is_visible: boolean;
};

type SuperAdminModalMode = 'apply' | 'restore' | 'unlock';

const DEFAULT_LEAVE_TYPES: LeaveType[] = [
  { id: -1, name: 'Annual Leave', code: 'annual', description: 'Annual leave', max_days_per_year: 14, requires_documentation: false, is_active: true },
  { id: -2, name: 'Sick Leave', code: 'sick', description: 'Sick leave', max_days_per_year: 14, requires_documentation: true, is_active: true },
  { id: -3, name: 'Casual Leave', code: 'casual', description: 'Casual leave', max_days_per_year: 7, requires_documentation: false, is_active: true },
  { id: -4, name: 'Maternity Leave', code: 'maternity', description: 'Maternity leave', max_days_per_year: 84, requires_documentation: true, is_active: true },
  { id: -5, name: 'Paternity Leave', code: 'paternity', description: 'Paternity leave', max_days_per_year: 7, requires_documentation: false, is_active: true },
  { id: -6, name: 'Unpaid Leave', code: 'unpaid', description: 'Unpaid leave', max_days_per_year: 30, requires_documentation: false, is_active: true },
  { id: -7, name: 'Religious/Festival Leave', code: 'religious_festival', description: 'Religious / festival leave', max_days_per_year: 5, requires_documentation: false, is_active: true },
  { id: -8, name: 'Study Leave', code: 'study', description: 'Study leave', max_days_per_year: 10, requires_documentation: true, is_active: true },
  { id: -9, name: 'Compensatory Leave', code: 'compensatory', description: 'Compensatory leave', max_days_per_year: 5, requires_documentation: false, is_active: true },
  { id: -10, name: 'Medical / Hospitalization Leave', code: 'medical_hospitalization', description: 'Medical / hospitalization leave', max_days_per_year: 30, requires_documentation: true, is_active: true },
];

export default function Leaves() {
  const [token, setToken] = useState('');
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showLeaveTypesModal, setShowLeaveTypesModal] = useState(false);
  const [editingLeave, setEditingLeave] = useState<Leave | null>(null);
  const [editingLeaveType, setEditingLeaveType] = useState<LeaveType | null>(null);
  const router = useRouter();

  // Form fields for leave request
  const [employeeId, setEmployeeId] = useState('');
  const [leaveType, setLeaveType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');

  // Form fields for leave type
  const [leaveTypeName, setLeaveTypeName] = useState('');
  const [leaveTypeCode, setLeaveTypeCode] = useState('');
  const [leaveTypeDescription, setLeaveTypeDescription] = useState('');
  const [maxDaysPerYear, setMaxDaysPerYear] = useState('');
  const [requiresDocumentation, setRequiresDocumentation] = useState(false);
  const [isActive, setIsActive] = useState(true);

  // Approval modal states
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [currentLeave, setCurrentLeave] = useState<Leave | null>(null);
  const [approvalStage, setApprovalStage] = useState<'section_head' | 'hr'>('section_head');
  const [approvalAction, setApprovalAction] = useState<'approve' | 'reject'>('approve');
  const [approvalNotes, setApprovalNotes] = useState('');

  // Confirm modal state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmMessage, setConfirmMessage] = useState('');
  const [confirmAction, setConfirmAction] = useState<(() => Promise<void> | void) | null>(null);

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
    } else {
      setToken(storedToken);
      fetchLeaves(storedToken);
      fetchLeaveTypes(storedToken);
      fetchEmployees(storedToken);
      fetchWidgetVisibility(storedToken);
    }
  }, [router]);

  const fetchLeaves = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;
    try {
      const response = await axios.get('/api/hr/leaves', {
        headers: { Authorization: `Bearer ${tokenToUse}` },
        params: { per_page: 1000 }
      });
      const leavesData = response.data.data || response.data;
      setLeaves(Array.isArray(leavesData) ? leavesData : []);
    } catch (error) {
      console.error('Error fetching leaves:', error);
    }
  };

  const fetchLeaveTypes = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;
    try {
      const response = await axios.get('/api/hr/leave-types', {
        headers: { Authorization: `Bearer ${tokenToUse}` },
        params: { per_page: 1000 }
      });

      const payload = response.data;
      const typesData = Array.isArray(payload)
        ? payload
        : (payload?.data?.data || payload?.data || []);

      const normalized = (Array.isArray(typesData) ? typesData : []) as LeaveType[];
      const apiCodes = new Set(normalized.map((row) => String(row.code || '').toLowerCase()).filter(Boolean));
      const merged = [
        ...normalized,
        ...DEFAULT_LEAVE_TYPES.filter((row) => !apiCodes.has(String(row.code).toLowerCase())),
      ];

      setLeaveTypes(merged);
    } catch (error) {
      console.error('Error fetching leave types:', error);
      setLeaveTypes(DEFAULT_LEAVE_TYPES);
    }
  };

  const fetchEmployees = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;
    try {
      const response = await axios.get('/api/hr/employees', {
        headers: { Authorization: `Bearer ${tokenToUse}` },
        params: { per_page: 1000 }
      });
      const employeesData = response.data.data || response.data;
      setEmployees(Array.isArray(employeesData) ? employeesData : []);
    } catch (error) {
      console.error('Error fetching employees:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    try {
      const leaveData = {
        employee_id: parseInt(employeeId),
        leave_type: leaveType,
        start_date: startDate,
        end_date: endDate,
        reason,
      };

      if (editingLeave) {
        await axios.put(`/api/hr/leaves/${editingLeave.id}`, leaveData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        showNotice('Success', 'Leave request updated successfully!', 'success');
      } else {
        await axios.post('/api/hr/leaves', leaveData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        showNotice('Success', 'Leave request submitted successfully!', 'success');
      }

      setShowForm(false);
      resetForm();
      fetchLeaves();
    } catch (error) {
      console.error('Error saving leave:', error);
      if (isAxiosError(error) && error.response?.status === 422) {
        const responseData = error.response.data as { message?: string; errors?: Record<string, string[]> };
        const firstFieldError = responseData?.errors
          ? Object.values(responseData.errors).flat()[0]
          : undefined;
        showNotice('Validation Error', firstFieldError || responseData?.message || 'Please check the form and try again.', 'error');
      } else {
        showNotice('Error', 'Failed to save leave request. Please try again.', 'error');
      }
    }
  };

  const handleLeaveTypeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    try {
      const typeData = {
        name: leaveTypeName,
        code: leaveTypeCode,
        description: leaveTypeDescription,
        max_days_per_year: parseInt(maxDaysPerYear),
        requires_documentation: requiresDocumentation,
        is_active: isActive,
      };

      if (editingLeaveType) {
        await axios.put(`/api/hr/leave-types/${editingLeaveType.id}`, typeData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        showNotice('Success', 'Leave type updated successfully!', 'success');
      } else {
        await axios.post('/api/hr/leave-types', typeData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        showNotice('Success', 'Leave type created successfully!', 'success');
      }

      setShowLeaveTypesModal(false);
      resetLeaveTypeForm();
      fetchLeaveTypes();
    } catch (error) {
      console.error('Error saving leave type:', error);
      showNotice('Error', 'Failed to save leave type. Please try again.', 'error');
    }
  };

  const handleApproval = async () => {
    if (!currentLeave || !token) return;

    try {
      const approvalData = {
        approved: approvalAction === 'approve',
        notes: approvalNotes,
      };

      const endpoint = approvalStage === 'section_head'
        ? `section-head-approve`
        : `hr-approve`;

      await axios.post(`/api/hr/leaves/${currentLeave.id}/${endpoint}`, approvalData, {
        headers: { Authorization: `Bearer ${token}` }
      });

      showNotice('Success', `Leave ${approvalAction}d successfully!`, 'success');
      setShowApprovalModal(false);
      setCurrentLeave(null);
      setApprovalNotes('');
      fetchLeaves();
    } catch (error) {
      console.error('Error processing approval:', error);
      if (isAxiosError(error) && error.response?.status === 422) {
        const responseData = error.response.data as { message?: string; errors?: Record<string, string[]> };
        const firstFieldError = responseData?.errors
          ? Object.values(responseData.errors).flat()[0]
          : undefined;
        showNotice('Validation Error', firstFieldError || responseData?.message || 'Unable to process approval with current data.', 'error');
      } else {
        showNotice('Error', 'Failed to process approval. Please try again.', 'error');
      }
    }
  };

  const openApprovalModal = (leave: Leave, stage: 'section_head' | 'hr') => {
    setCurrentLeave(leave);
    setApprovalStage(stage);
    setShowApprovalModal(true);
  };

  const resetForm = () => {
    setEmployeeId('');
    setLeaveType('');
    setStartDate('');
    setEndDate('');
    setReason('');
    setEditingLeave(null);
  };

  const resetLeaveTypeForm = () => {
    setLeaveTypeName('');
    setLeaveTypeCode('');
    setLeaveTypeDescription('');
    setMaxDaysPerYear('');
    setRequiresDocumentation(false);
    setIsActive(true);
    setEditingLeaveType(null);
  };

  const handleEdit = (leave: Leave) => {
    setEditingLeave(leave);
    setEmployeeId(leave.employee_id.toString());
    setLeaveType(leave.leave_type);
    setStartDate(leave.start_date);
    setEndDate(leave.end_date);
    setReason(leave.reason);
    setShowForm(true);
  };

  const handleEditLeaveType = (leaveType: LeaveType) => {
    setEditingLeaveType(leaveType);
    setLeaveTypeName(leaveType.name);
    setLeaveTypeCode(leaveType.code);
    setLeaveTypeDescription(leaveType.description || '');
    setMaxDaysPerYear(leaveType.max_days_per_year.toString());
    setRequiresDocumentation(leaveType.requires_documentation);
    setIsActive(leaveType.is_active);
    setShowLeaveTypesModal(true);
  };

  const confirmDeleteLeave = (leave: Leave) => {
    setConfirmTitle('Delete Leave Request');
    setConfirmMessage(`Are you sure you want to delete the leave request for ${leave.employee.first_name} ${leave.employee.last_name}?`);
    setConfirmAction(() => async () => {
      try {
        await axios.delete(`/api/hr/leaves/${leave.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        showNotice('Success', 'Leave request deleted successfully!', 'success');
        fetchLeaves();
      } catch (error) {
        console.error('Error deleting leave:', error);
        showNotice('Error', 'Failed to delete leave request. Please try again.', 'error');
      }
    });
    setConfirmOpen(true);
  };

  const confirmDeleteLeaveType = (leaveType: LeaveType) => {
    setConfirmTitle('Delete Leave Type');
    setConfirmMessage(`Are you sure you want to delete the leave type "${leaveType.name}"?`);
    setConfirmAction(() => async () => {
      try {
        await axios.delete(`/api/hr/leave-types/${leaveType.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        showNotice('Success', 'Leave type deleted successfully!', 'success');
        fetchLeaveTypes();
      } catch (error) {
        console.error('Error deleting leave type:', error);
        showNotice('Error', 'Failed to delete leave type. Please try again.', 'error');
      }
    });
    setConfirmOpen(true);
  };

  const openConfirm = (title: string, message: string, onConfirm: () => Promise<void> | void) => {
    setConfirmTitle(title);
    setConfirmMessage(message);
    setConfirmAction(() => onConfirm);
    setConfirmOpen(true);
  };

  // Notification modal state
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeMessage, setNoticeMessage] = useState('');
  const [noticeType, setNoticeType] = useState<'success' | 'error' | 'info'>('info');
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
  const showNotice = (title: string, message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setNoticeTitle(title);
    setNoticeMessage(message);
    setNoticeType(type);
    setNoticeOpen(true);
  };
  const closeNotice = () => {
    setNoticeOpen(false);
    setNoticeTitle('');
    setNoticeMessage('');
  };

  const leaveWidgetItems = [
    { id: 'hrm-leaves-nav-back-button', name: 'Leaves Back Button' },
    { id: 'hrm-leaves-nav-logout-button', name: 'Leaves Logout Button' },
    { id: 'hrm-leaves-hero-card', name: 'Leaves Hero Card' },
    { id: 'hrm-leaves-hero-title', name: 'Leaves Hero Title' },
    { id: 'hrm-leaves-hero-subtitle', name: 'Leaves Hero Subtitle' },
    { id: 'hrm-leaves-hero-stats', name: 'Leaves Hero Stats' },
    { id: 'hrm-leaves-action-buttons', name: 'Leaves Action Buttons' },
    { id: 'hrm-leaves-list-card', name: 'Leaves List Card' },
    { id: 'hrm-leaves-list-heading', name: 'Leaves List Heading' },
    { id: 'hrm-leaves-list-table-headings', name: 'Leaves Table Headings' },
    { id: 'hrm-leaves-row-action-buttons', name: 'Leaves Row Action Buttons' },
    { id: 'hrm-leaves-form-pane', name: 'Leaves Request Form Pane' },
    { id: 'hrm-leaves-form-heading', name: 'Leaves Request Form Heading' },
    { id: 'hrm-leaves-form-action-buttons', name: 'Leaves Request Form Action Buttons' },
    { id: 'hrm-leaves-types-pane', name: 'Leaves Types Pane' },
    { id: 'hrm-leaves-types-heading', name: 'Leaves Types Heading' },
    { id: 'hrm-leaves-types-action-buttons', name: 'Leaves Types Action Buttons' },
    { id: 'hrm-leaves-approval-pane', name: 'Leaves Approval Pane' },
    { id: 'hrm-leaves-approval-heading', name: 'Leaves Approval Heading' },
    { id: 'hrm-leaves-approval-action-buttons', name: 'Leaves Approval Action Buttons' },
    { id: 'hrm-leaves-notice-pane', name: 'Leaves Notice Pane' },
    { id: 'hrm-leaves-notice-heading', name: 'Leaves Notice Heading' },
    { id: 'hrm-leaves-confirm-pane', name: 'Leaves Confirm Pane' },
    { id: 'hrm-leaves-confirm-heading', name: 'Leaves Confirm Heading' },
    { id: 'hrm-leaves-confirm-action-buttons', name: 'Leaves Confirm Action Buttons' },
  ];
  const isWidgetVisible = (widgetKey: string) => widgetVisibility[widgetKey] !== false;
  const hiddenWidgetCount = leaveWidgetItems.filter((item) => widgetVisibility[item.id] === false).length;

  const fetchWidgetVisibility = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;
    try {
      const response = await axios.get('/api/dashboard/widgets/me', {
        headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
      });
      const widgetMap = response.data?.data?.widgets || {};
      const controlsLocked = Boolean(response.data?.data?.widget_controls_locked);
      setWidgetVisibility(widgetMap);
      setWidgetControlsLocked(controlsLocked);
    } catch (error) {
      const err: any = error;
      console.error('Error fetching leave widget visibility:', err?.response?.status, err?.response?.data || err?.message);
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
      showNotice('Widget Update Failed', 'Please enter Super Admin email and password.', 'error');
      return;
    }
    try {
      setSuperAdminConfirmLoading(true);
      for (const change of pendingWidgetChanges) {
        await axios.put(
          '/api/dashboard/widgets/me',
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
      console.error('Error applying leave widget changes:', err?.response?.status, err?.response?.data || err?.message);
      showNotice('Widget Update Failed', 'Super Admin confirmation failed or widget update failed.', 'error');
    } finally {
      setSuperAdminConfirmLoading(false);
    }
  };

  const restoreAllHiddenWidgetsStaged = () => {
    if (widgetControlsLocked) return;
    const hiddenKeys = leaveWidgetItems.map((item) => item.id).filter((key) => widgetVisibility[key] === false);
    if (!hiddenKeys.length) return;
    setWidgetVisibilitySnapshot((prev) => prev ?? widgetVisibility);
    setWidgetVisibility((prev) => {
      const next = { ...prev };
      hiddenKeys.forEach((key) => { next[key] = true; });
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
    const hiddenKeys = leaveWidgetItems.map((item) => item.id).filter((key) => widgetVisibility[key] === false);
    if (!hiddenKeys.length) {
      showNotice('Nothing to Restore', 'All widgets are already visible.', 'success');
      return;
    }
    openSuperAdminConfirmation(hiddenKeys.map((key) => ({ widget_key: key, is_visible: true })), 'restore');
  };

  const showRestoreWidgetList = () => {
    if (!superAdminEmail.trim() || !superAdminPassword) {
      showNotice('Super Admin Required', 'Please enter Super Admin email and password.', 'error');
      return;
    }
    setRestoreWidgetListVisible(true);
  };

  const restoreHiddenWidgetOneByOne = async (widgetKey: string) => {
    if (!superAdminEmail.trim() || !superAdminPassword) {
      showNotice('Super Admin Required', 'Please enter Super Admin email and password.', 'error');
      return;
    }
    try {
      setRestoreWidgetLoadingKey(widgetKey);
      await axios.put(
        '/api/dashboard/widgets/me',
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
      console.error('Error restoring leave widget:', err?.response?.status, err?.response?.data || err?.message);
      showNotice('Restore Failed', 'Failed to restore widget.', 'error');
    } finally {
      setRestoreWidgetLoadingKey(null);
    }
  };

  const openUnlockWidgetsAfterFix = () => openSuperAdminConfirmation([], 'unlock');

  const unlockWidgetControls = async () => {
    if (superAdminModalMode !== 'unlock') return;
    if (!superAdminEmail.trim() || !superAdminPassword) {
      showNotice('Super Admin Required', 'Please enter Super Admin email and password.', 'error');
      return;
    }
    const fallbackWidgetKey = leaveWidgetItems[0]?.id ?? 'hrm-leaves-hero-card';
    const fallbackVisibility = isWidgetVisible(fallbackWidgetKey);
    try {
      setSuperAdminConfirmLoading(true);
      await axios.put(
        '/api/dashboard/widgets/me',
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
      console.error('Error unlocking leave widgets:', err?.response?.status, err?.response?.data || err?.message);
      showNotice('Unlock Failed', 'Failed to unlock widget controls.', 'error');
    } finally {
      setSuperAdminConfirmLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/');
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-20 left-20 w-72 h-72 bg-blue-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-cyan-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-40 w-72 h-72 bg-teal-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-4000"></div>
      </div>

      {/* Modern Navigation */}
      <nav className="relative z-10 bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center h-auto sm:h-16 py-3 gap-3">
            <div className="flex items-center justify-between sm:justify-start gap-3">
              {isWidgetVisible('hrm-leaves-nav-back-button') && (
                <a href="/dashboard/hrm" className="flex items-center space-x-2 text-gray-700 hover:text-blue-600 transition-colors duration-300">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  <span className="font-medium text-sm sm:text-base">Back to HRM</span>
                </a>
              )}
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
              <div className="hidden md:flex items-center space-x-2 text-sm text-gray-600">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span>Leave Management Active</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                  📅
                </div>
                <span className="font-medium text-gray-900">Leave Management</span>
              </div>
              {isWidgetVisible('hrm-leaves-nav-logout-button') && (
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
        {/* Hero Section */}
        {isWidgetVisible('hrm-leaves-hero-card') && (
          <div className="text-center mb-12 rounded-2xl border border-gray-200 bg-white/90 shadow-sm p-6 relative">
            {!widgetControlsLocked && (
              <button
                onClick={() => stageWidgetVisibilityChange('hrm-leaves-hero-card', false)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-red-500 text-white hover:bg-red-600 flex items-center justify-center text-sm"
                title="Hide this widget"
              >
                ×
              </button>
            )}
            <div className="inline-block p-1 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full mb-6">
              <div className="bg-white rounded-full p-4">
                <span className="text-4xl">🏖️</span>
              </div>
            </div>
            {isWidgetVisible('hrm-leaves-hero-title') && (
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-4">
                Leave <span className="bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">Management</span>
              </h2>
            )}
            {isWidgetVisible('hrm-leaves-hero-subtitle') && (
              <p className="text-base sm:text-lg md:text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed mb-6 px-2">
                Manage employee leave requests with a streamlined two-stage approval process.
                From request submission to final HR approval, handle everything efficiently.
              </p>
            )}
            {isWidgetVisible('hrm-leaves-hero-stats') && (
              <div className="flex flex-col sm:flex-row justify-center gap-4 sm:space-x-6 sm:gap-0">
                <div className="text-center">
                  <div className="text-xl sm:text-2xl font-bold text-blue-600">
                    {leaves.filter(l => l.status === 'pending').length}
                  </div>
                  <div className="text-sm text-gray-500">Pending Requests</div>
                </div>
                <div className="text-center">
                  <div className="text-xl sm:text-2xl font-bold text-green-600">
                    {leaves.filter(l => l.status === 'approved').length}
                  </div>
                  <div className="text-sm text-gray-500">Approved This Month</div>
                </div>
                <div className="text-center">
                  <div className="text-xl sm:text-2xl font-bold text-purple-600">
                    {leaveTypes.length}
                  </div>
                  <div className="text-sm text-gray-500">Leave Types</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        {isWidgetVisible('hrm-leaves-action-buttons') && (
          <div className="flex flex-wrap gap-4 mb-8">
            <button
              onClick={() => setShowForm(true)}
              className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white px-6 py-3 rounded-xl font-medium transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl flex items-center space-x-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <span>New Leave Request</span>
            </button>
            <button
              onClick={() => setShowLeaveTypesModal(true)}
              className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white px-6 py-3 rounded-xl font-medium transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl flex items-center space-x-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <span>Manage Leave Types</span>
            </button>
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

        {/* Leave Requests List */}
        {isWidgetVisible('hrm-leaves-list-card') && (
        <div className="bg-white/70 backdrop-blur-sm shadow-xl rounded-2xl border border-white/20 overflow-hidden relative">
          {!widgetControlsLocked && (
            <button
              onClick={() => stageWidgetVisibilityChange('hrm-leaves-list-card', false)}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-red-500 text-white hover:bg-red-600 flex items-center justify-center text-sm z-10"
              title="Hide this widget"
            >
              ×
            </button>
          )}
          {isWidgetVisible('hrm-leaves-list-heading') && (
          <div className="bg-gradient-to-r from-blue-500 to-cyan-500 p-6">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-2xl">
                📋
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Leave Requests</h3>
                <p className="text-white/80">Manage and approve employee leave requests</p>
              </div>
            </div>
          </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              {isWidgetVisible('hrm-leaves-list-table-headings') && (
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Employee
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Leave Type
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Duration
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Section Head
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    HR Approval
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              )}
              <tbody className="bg-white divide-y divide-gray-200">
                {leaves.map((leave) => (
                  <tr key={leave.id} className="hover:bg-gray-50 transition-colors duration-200">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-gray-900">
                        {leave.employee.first_name} {leave.employee.last_name}
                      </div>
                      <div className="text-sm text-gray-500">{leave.employee.employee_code}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {leave.leave_type}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div>{new Date(leave.start_date).toLocaleDateString()}</div>
                      <div className="text-gray-500">to {new Date(leave.end_date).toLocaleDateString()}</div>
                      <div className="text-xs text-gray-500">{leave.days_requested} days</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${
                        leave.status === 'approved'
                          ? 'bg-green-100 text-green-800'
                          : leave.status === 'rejected'
                          ? 'bg-red-100 text-red-800'
                          : leave.status === 'section_head_approved'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {leave.status.replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className={`w-3 h-3 rounded-full mx-auto ${
                        leave.section_head_approved ? 'bg-green-500' : 'bg-gray-300'
                      }`}></div>
                      {leave.section_head_approved && leave.sectionHeadApprover && (
                        <div className="text-xs text-gray-500 mt-1 text-center">
                          {leave.sectionHeadApprover.first_name}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className={`w-3 h-3 rounded-full mx-auto ${
                        leave.hr_approved ? 'bg-green-500' : 'bg-gray-300'
                      }`}></div>
                      {leave.hr_approved && leave.hrApprover && (
                        <div className="text-xs text-gray-500 mt-1 text-center">
                          {leave.hrApprover.first_name}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      {isWidgetVisible('hrm-leaves-row-action-buttons') && (
                      <div className="flex space-x-2">
                        {leave.status === 'pending' && (
                          <button
                            onClick={() => openApprovalModal(leave, 'section_head')}
                            className="text-blue-600 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded text-xs"
                          >
                            Section Head
                          </button>
                        )}
                        {leave.status === 'section_head_approved' && (
                          <button
                            onClick={() => openApprovalModal(leave, 'hr')}
                            className="text-green-600 hover:text-green-900 bg-green-50 hover:bg-green-100 px-3 py-1 rounded text-xs"
                          >
                            HR Approve
                          </button>
                        )}
                        <button
                          onClick={() => handleEdit(leave)}
                          className="text-gray-600 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 px-3 py-1 rounded text-xs"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => confirmDeleteLeave(leave)}
                          className="text-red-600 hover:text-red-900 bg-red-50 hover:bg-red-100 px-3 py-1 rounded text-xs"
                        >
                          Delete
                        </button>
                      </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        )}
      </main>

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
                  {leaveWidgetItems.filter((item) => widgetVisibility[item.id] === false).map((item) => (
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
                  {leaveWidgetItems.filter((item) => widgetVisibility[item.id] === false).length === 0 && (
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

      {/* Leave Request Form Modal */}
      {showForm && isWidgetVisible('hrm-leaves-form-pane') && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-blue-500 to-cyan-500 p-6 rounded-t-2xl">
              {isWidgetVisible('hrm-leaves-form-heading') && (
                <h3 className="text-xl font-bold text-white">
                  {editingLeave ? 'Edit Leave Request' : 'New Leave Request'}
                </h3>
              )}
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Employee</label>
                  <select
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                    required
                  >
                    <option value="">Select Employee</option>
                    {employees.filter(employee => employee.status === 'active').map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.first_name} {employee.last_name} ({employee.employee_code})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Leave Type</label>
                  <select
                    value={leaveType}
                    onChange={(e) => setLeaveType(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                    required
                  >
                    <option value="">Select Leave Type</option>
                    {leaveTypes.map((type) => (
                      <option key={type.id} value={type.code}>
                        {type.name}{type.is_active ? '' : ' (Inactive)'}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Reason</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                  placeholder="Please provide a reason for your leave request..."
                  required
                />
              </div>
              {isWidgetVisible('hrm-leaves-form-action-buttons') && (
              <div className="flex justify-end space-x-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    resetForm();
                  }}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors duration-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white px-6 py-2 rounded-lg font-medium transition-all duration-300 transform hover:scale-105"
                >
                  {editingLeave ? 'Update Request' : 'Submit Request'}
                </button>
              </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Leave Types Management Modal */}
      {showLeaveTypesModal && isWidgetVisible('hrm-leaves-types-pane') && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-green-500 to-emerald-500 p-6 rounded-t-2xl">
              {isWidgetVisible('hrm-leaves-types-heading') && (
                <h3 className="text-xl font-bold text-white">Leave Types Management</h3>
              )}
            </div>
            <div className="p-6">
              {/* Leave Types List */}
              <div className="mb-6">
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Existing Leave Types</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {leaveTypes.map((type) => (
                    <div key={type.id} className="bg-gray-50 rounded-lg p-4 border">
                      <div className="flex justify-between items-start mb-2">
                        <h5 className="font-semibold text-gray-900">{type.name}</h5>
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                          {type.code}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{type.description}</p>
                      <div className="text-xs text-gray-500 space-y-1">
                        <div>Max Days: {type.max_days_per_year}</div>
                        <div>Requires Docs: {type.requires_documentation ? 'Yes' : 'No'}</div>
                        <div>Status: {type.is_active ? 'Active' : 'Inactive'}</div>
                      </div>
                      <div className="flex space-x-2 mt-3">
                        <button
                          onClick={() => handleEditLeaveType(type)}
                          className="text-blue-600 hover:text-blue-800 text-sm"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => confirmDeleteLeaveType(type)}
                          className="text-red-600 hover:text-red-800 text-sm"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add/Edit Form */}
              <form onSubmit={handleLeaveTypeSubmit} className="border-t pt-6">
                <h4 className="text-lg font-semibold text-gray-900 mb-4">
                  {editingLeaveType ? 'Edit Leave Type' : 'Add New Leave Type'}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Name</label>
                    <input
                      type="text"
                      value={leaveTypeName}
                      onChange={(e) => setLeaveTypeName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-black"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Code</label>
                    <input
                      type="text"
                      value={leaveTypeCode}
                      onChange={(e) => setLeaveTypeCode(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-black"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Max Days Per Year</label>
                    <input
                      type="number"
                      value={maxDaysPerYear}
                      onChange={(e) => setMaxDaysPerYear(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-black"
                      required
                    />
                  </div>
                  <div className="flex items-center space-x-4">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={requiresDocumentation}
                        onChange={(e) => setRequiresDocumentation(e.target.checked)}
                        className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">Requires Documentation</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={isActive}
                        onChange={(e) => setIsActive(e.target.checked)}
                        className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">Active</span>
                    </label>
                  </div>
                </div>
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                  <textarea
                    value={leaveTypeDescription}
                    onChange={(e) => setLeaveTypeDescription(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-black"
                  />
                </div>
                {isWidgetVisible('hrm-leaves-types-action-buttons') && (
                <div className="flex justify-end space-x-4 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setShowLeaveTypesModal(false);
                      resetLeaveTypeForm();
                    }}
                    className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors duration-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white px-6 py-2 rounded-lg font-medium transition-all duration-300 transform hover:scale-105"
                  >
                    {editingLeaveType ? 'Update Type' : 'Add Type'}
                  </button>
                </div>
                )}
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Approval Modal */}
      {showApprovalModal && currentLeave && isWidgetVisible('hrm-leaves-approval-pane') && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="bg-gradient-to-r from-blue-500 to-cyan-500 p-6 rounded-t-2xl">
              {isWidgetVisible('hrm-leaves-approval-heading') && (
                <h3 className="text-xl font-bold text-white">
                  {approvalStage === 'section_head' ? 'Section Head' : 'HR'} Approval
                </h3>
              )}
            </div>
            <div className="p-6">
              <div className="mb-4">
                <h4 className="font-semibold text-gray-900">
                  {currentLeave.employee.first_name} {currentLeave.employee.last_name}
                </h4>
                <p className="text-sm text-gray-600">
                  {currentLeave.leave_type} - {currentLeave.days_requested} days
                </p>
                <p className="text-sm text-gray-600">
                  {new Date(currentLeave.start_date).toLocaleDateString()} to {new Date(currentLeave.end_date).toLocaleDateString()}
                </p>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Decision</label>
                <div className="flex space-x-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="approval"
                      value="approve"
                      checked={approvalAction === 'approve'}
                      onChange={(e) => setApprovalAction(e.target.value as 'approve' | 'reject')}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Approve</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="approval"
                      value="reject"
                      checked={approvalAction === 'reject'}
                      onChange={(e) => setApprovalAction(e.target.value as 'approve' | 'reject')}
                      className="text-red-600 focus:ring-red-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Reject</span>
                  </label>
                </div>
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Comments (Optional)</label>
                <textarea
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Add any comments or notes..."
                />
              </div>
              {isWidgetVisible('hrm-leaves-approval-action-buttons') && (
              <div className="flex justify-end space-x-4">
                <button
                  onClick={() => {
                    setShowApprovalModal(false);
                    setCurrentLeave(null);
                    setApprovalNotes('');
                  }}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors duration-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApproval}
                  className={`px-6 py-2 rounded-lg font-medium transition-all duration-300 transform hover:scale-105 ${
                    approvalAction === 'approve'
                      ? 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white'
                      : 'bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white'
                  }`}
                >
                  {approvalAction === 'approve' ? 'Approve' : 'Reject'} Leave
                </button>
              </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Notification Modal */}
      {noticeOpen && isWidgetVisible('hrm-leaves-notice-pane') && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center space-x-4 mb-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  noticeType === 'success' ? 'bg-green-100 text-green-600' :
                  noticeType === 'error' ? 'bg-red-100 text-red-600' :
                  'bg-blue-100 text-blue-600'
                }`}>
                  {noticeType === 'success' ? '✓' : noticeType === 'error' ? '✕' : 'ℹ'}
                </div>
                <div>
                  {isWidgetVisible('hrm-leaves-notice-heading') && (
                    <h3 className="text-lg font-semibold text-gray-900">{noticeTitle}</h3>
                  )}
                  <p className="text-gray-600">{noticeMessage}</p>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={closeNotice}
                  className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white px-6 py-2 rounded-lg font-medium transition-all duration-300 transform hover:scale-105"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmOpen && isWidgetVisible('hrm-leaves-confirm-pane') && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center space-x-4 mb-4">
                <div className="w-12 h-12 bg-yellow-100 text-yellow-600 rounded-full w-12 h-12 flex items-center justify-center">
                  ⚠
                </div>
                <div>
                  {isWidgetVisible('hrm-leaves-confirm-heading') && (
                    <h3 className="text-lg font-semibold text-gray-900">{confirmTitle}</h3>
                  )}
                  <p className="text-gray-600">{confirmMessage}</p>
                </div>
              </div>
              {isWidgetVisible('hrm-leaves-confirm-action-buttons') && (
              <div className="flex justify-end space-x-4">
                <button
                  onClick={() => setConfirmOpen(false)}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors duration-300"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (confirmAction) {
                      await confirmAction();
                    }
                    setConfirmOpen(false);
                  }}
                  className="bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white px-6 py-2 rounded-lg font-medium transition-all duration-300 transform hover:scale-105"
                >
                  Confirm
                </button>
              </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}