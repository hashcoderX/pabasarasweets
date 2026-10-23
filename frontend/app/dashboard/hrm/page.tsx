'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createApiClient } from '@/lib/apiClient';

type HrmModuleCard = {
  id: string;
  name: string;
  icon: string;
  path: string;
  description: string;
  color: string;
  bgColor: string;
  getStats: () => string;
  accessKeywords: string[];
};

type HrmQuickActionCard = {
  id: string;
  icon: string;
  title: string;
  desc: string;
};

type WidgetVisibilityChange = {
  widget_key: string;
  is_visible: boolean;
};

type SuperAdminModalMode = 'apply' | 'restore' | 'unlock';

export default function HRM() {
  const [token, setToken] = useState('');
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [accessReady, setAccessReady] = useState(false);
  const [widgetVisibility, setWidgetVisibility] = useState<Record<string, boolean>>({});
  const [, setWidgetToggleLoadingKey] = useState('');
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
  const [activeEmployees, setActiveEmployees] = useState(0);
  const [attendanceRate, setAttendanceRate] = useState(0);
  const [departmentsCount, setDepartmentsCount] = useState(0);
  const [designationsCount, setDesignationsCount] = useState(0);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [todayAttendance, setTodayAttendance] = useState(0);
  const [pendingLeaves, setPendingLeaves] = useState(0);
  const [totalPayrolls, setTotalPayrolls] = useState(0);
  const [pendingPayrolls, setPendingPayrolls] = useState(0);
  const [processedPayrolls, setProcessedPayrolls] = useState(0);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const apiClient = createApiClient();

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
    } else {
      setToken(storedToken);
    }
  }, [router]);

  useEffect(() => {
    if (token) {
      fetchAccessProfile();
      fetchDashboardData();
    }
  }, [token]);

  const fetchAccessProfile = async () => {
    try {
      const userRes = await apiClient.get('/user', {
        headers: { Authorization: `Bearer ${token}` },
      });

      const userData = userRes.data || {};
      const employeeId = Number(userData?.employee_id || userData?.employee?.id || 0);

      const roleNames = [
        String(userData?.role || ''),
        ...(Array.isArray(userData?.roles)
          ? userData.roles.map((role: any) => String(role?.name || role || ''))
          : []),
      ]
        .map((role) => role.trim().toLowerCase())
        .filter(Boolean);

      const permissionNames = Array.isArray(userData?.roles)
        ? userData.roles.flatMap((role: any) =>
            Array.isArray(role?.permissions)
              ? role.permissions.map((permission: any) =>
                  String(permission?.name || '').trim().toLowerCase()
                )
              : []
          )
        : [];

      const roleBlob = roleNames.join(' ');
      const adminUser =
        !employeeId ||
        roleBlob.includes('super admin') ||
        roleBlob.includes('superadmin') ||
        roleBlob.includes('administrator') ||
        roleBlob.includes('admin');

      setUserRoles(Array.from(new Set(roleNames)));
      setUserPermissions(Array.from(new Set(permissionNames.filter(Boolean))));
      setIsAdminUser(adminUser);

      try {
        const widgetRes = await apiClient.get('/dashboard/widgets/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const widgetMap = widgetRes.data?.data?.widgets || {};
        const controlsLocked = Boolean(widgetRes.data?.data?.widget_controls_locked);
        setWidgetVisibility(widgetMap);
        setWidgetControlsLocked(controlsLocked);
      } catch (widgetError) {
        console.error('Error fetching HRM widget visibility:', widgetError);
        setWidgetVisibility({});
        setWidgetControlsLocked(false);
      }
    } catch (error) {
      console.error('Error fetching HRM access profile:', error);
      setUserRoles([]);
      setUserPermissions([]);
      setIsAdminUser(false);
      setWidgetVisibility({});
      setWidgetControlsLocked(false);
    } finally {
      setAccessReady(true);
    }
  };

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // Fetch all employees
      const employeesResponse = await apiClient.get('/hr/employees', {
        headers: { Authorization: `Bearer ${token}` },
        params: { per_page: 1000 } // Get all employees
      });
      const employeesData = employeesResponse.data.data || employeesResponse.data;
      const totalEmployeesCount = Array.isArray(employeesData) ? employeesData.length : 0;
      const activeEmployeesCount = Array.isArray(employeesData) 
        ? employeesData.filter((emp: any) => emp.status === 'active').length
        : 0;
      setTotalEmployees(totalEmployeesCount);
      setActiveEmployees(activeEmployeesCount);

      // Fetch departments count
      const departmentsResponse = await apiClient.get('/hr/departments', {
        headers: { Authorization: `Bearer ${token}` },
        params: { per_page: 1000 } // Get all departments
      });
      const departmentsCount = departmentsResponse.data.total || 
                               (departmentsResponse.data.data ? departmentsResponse.data.data.length : 0);
      setDepartmentsCount(departmentsCount);

      // Fetch designations count
      const designationsResponse = await apiClient.get('/hr/designations', {
        headers: { Authorization: `Bearer ${token}` },
        params: { per_page: 1000 } // Get all designations
      });
      const designationsCount = designationsResponse.data.total || 
                                 (designationsResponse.data.data ? designationsResponse.data.data.length : 0);
      setDesignationsCount(designationsCount);

      // Fetch today's attendance
      const today = new Date().toISOString().split('T')[0];
      const attendanceResponse = await apiClient.get('/hr/attendance', {
        headers: { Authorization: `Bearer ${token}` },
        params: { date: today, per_page: 1000 }
      });
      
      const attendanceData = attendanceResponse.data.data || attendanceResponse.data;
      const todayAttendanceCount = Array.isArray(attendanceData) ? attendanceData.length : 0;
      setTodayAttendance(todayAttendanceCount);
      
      // Calculate attendance rate
      if (Array.isArray(attendanceData) && attendanceData.length > 0) {
        const presentCount = attendanceData.filter((record: any) => record.status === 'present').length;
        const totalRecords = attendanceData.length;
        const rate = totalRecords > 0 ? Math.round((presentCount / totalRecords) * 100) : 0;
        setAttendanceRate(rate);
      } else {
        setAttendanceRate(0);
      }

      // Fetch pending leaves
      const leavesResponse = await apiClient.get('/hr/leaves', {
        headers: { Authorization: `Bearer ${token}` },
        params: { status: 'pending', per_page: 1000 } // Get all pending leaves
      });
      const leavesData = leavesResponse.data.data || leavesResponse.data;
      const pendingLeavesCount = Array.isArray(leavesData) ? leavesData.length : 0;
      setPendingLeaves(pendingLeavesCount);

      // Fetch payroll statistics
      const payrollsResponse = await apiClient.get('/hr/payrolls', {
        headers: { Authorization: `Bearer ${token}` },
        params: { per_page: 1000 } // Get all payrolls
      });
      const payrollsData = payrollsResponse.data.data || payrollsResponse.data;
      const totalPayrollsCount = Array.isArray(payrollsData) ? payrollsData.length : 0;
      const pendingPayrollsCount = Array.isArray(payrollsData) 
        ? payrollsData.filter((payroll: any) => payroll.status === 'pending').length
        : 0;
      const processedPayrollsCount = Array.isArray(payrollsData) 
        ? payrollsData.filter((payroll: any) => payroll.status === 'processed').length
        : 0;
      setTotalPayrolls(totalPayrollsCount);
      setPendingPayrolls(pendingPayrollsCount);
      setProcessedPayrolls(processedPayrollsCount);
      
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      // Set default values if API fails
      setActiveEmployees(0);
      setAttendanceRate(0);
      setDepartmentsCount(0);
      setDesignationsCount(0);
      setTotalEmployees(0);
      setTodayAttendance(0);
      setPendingLeaves(0);
      setTotalPayrolls(0);
      setPendingPayrolls(0);
      setProcessedPayrolls(0);
    } finally {
      setLoading(false);
    }
  };

  const hasAnyPermission = (keywords: string[]) => {
    if (isAdminUser) return true;
    return userPermissions.some((permission) => keywords.some((keyword) => permission.includes(keyword)));
  };

  const hrmModules: HrmModuleCard[] = [
    {
      id: 'hrm-employees',
      name: 'Employees',
      icon: '👥',
      path: '/dashboard/hrm/employees',
      description: 'Manage employee records',
      color: 'from-blue-500 to-cyan-500',
      bgColor: 'from-blue-50 to-cyan-50',
      getStats: () => loading ? '...' : `${totalEmployees} Employees`,
      accessKeywords: ['view_employees', 'create_employees', 'edit_employees', 'delete_employees']
    },
    {
      id: 'hrm-departments',
      name: 'Departments',
      icon: '🏢',
      path: '/dashboard/hrm/departments',
      description: 'Manage company departments',
      color: 'from-green-500 to-emerald-500',
      bgColor: 'from-green-50 to-emerald-50',
      getStats: () => loading ? '...' : `${departmentsCount} Departments`,
      accessKeywords: ['view_departments', 'create_departments', 'edit_departments', 'delete_departments']
    },
    {
      id: 'hrm-designations',
      name: 'Designations',
      icon: '👔',
      path: '/dashboard/hrm/designations',
      description: 'Manage job positions',
      color: 'from-purple-500 to-indigo-500',
      bgColor: 'from-purple-50 to-indigo-50',
      getStats: () => loading ? '...' : `${designationsCount} Positions`,
      accessKeywords: ['view_designations', 'create_designations', 'edit_designations', 'delete_designations']
    },
    {
      id: 'hrm-attendance',
      name: 'Attendance',
      icon: '📅',
      path: '/dashboard/hrm/attendance',
      description: 'Track employee attendance',
      color: 'from-orange-500 to-red-500',
      bgColor: 'from-orange-50 to-red-50',
      getStats: () => loading ? '...' : `${todayAttendance} Marked Today`,
      accessKeywords: ['view_attendance', 'create_attendance', 'edit_attendance', 'delete_attendance']
    },
    {
      id: 'hrm-leaves',
      name: 'Leaves',
      icon: '🏖️',
      path: '/dashboard/hrm/leaves',
      description: 'Manage leave requests',
      color: 'from-teal-500 to-green-500',
      bgColor: 'from-teal-50 to-green-50',
      getStats: () => loading ? '...' : `${pendingLeaves} Pending Requests`,
      accessKeywords: ['view_leaves', 'create_leaves', 'approve_leaves', 'reject_leaves']
    },
    {
      id: 'hrm-roles',
      name: 'Roles & Privileges',
      icon: '🔐',
      path: '/dashboard/hrm/roles',
      description: 'Manage user roles and permissions',
      color: 'from-indigo-500 to-purple-500',
      bgColor: 'from-indigo-50 to-purple-50',
      getStats: () => loading ? '...' : 'Access Control',
      accessKeywords: ['view_roles', 'create_roles', 'edit_roles', 'delete_roles', 'assign_roles', 'view_permissions', 'create_permissions', 'edit_permissions', 'delete_permissions']
    },
    {
      id: 'hrm-payroll',
      name: 'Payroll',
      icon: '💰',
      path: '/dashboard/hrm/payroll',
      description: 'Process payroll and salaries',
      color: 'from-yellow-500 to-orange-500',
      bgColor: 'from-yellow-50 to-orange-50',
      getStats: () => loading ? '...' : `${pendingPayrolls} Pending`,
      accessKeywords: ['view_payrolls', 'create_payrolls', 'edit_payrolls', 'delete_payrolls']
    },
  ];

  const hrmQuickActions: HrmQuickActionCard[] = [
    { id: 'hrm-quick-add-employee', icon: '➕', title: 'Add Employee', desc: 'New hire' },
    { id: 'hrm-quick-view-reports', icon: '📊', title: 'View Reports', desc: 'Analytics' },
    { id: 'hrm-quick-mark-attendance', icon: '📅', title: 'Mark Attendance', desc: 'Daily check-in' },
    { id: 'hrm-quick-process-payroll', icon: '💰', title: 'Process Payroll', desc: 'Monthly run' },
  ];

  const hrmExtraWidgets = [
    { id: 'hrm-hero-active-employees', name: 'HRM Hero Active Employees' },
    { id: 'hrm-hero-attendance-rate', name: 'HRM Hero Attendance Rate' },
    { id: 'hrm-hero-departments', name: 'HRM Hero Departments' },
    { id: 'hrm-modules-section', name: 'HRM Modules Section' },
    { id: 'hrm-quick-actions-section', name: 'HRM Quick Actions Section' },
  ];
  const allHrmWidgetItems = [
    ...hrmModules.map((module) => ({ id: module.id, name: module.name })),
    ...hrmQuickActions.map((action) => ({ id: action.id, name: action.title })),
    ...hrmExtraWidgets,
  ];
  const isWidgetVisible = (widgetKey: string) => widgetVisibility[widgetKey] !== false;

  const isSalesRefOnly =
    !isAdminUser && userRoles.length > 0 && userRoles.every((role) => role === 'sales ref');

  const visibleHrmModules = hrmModules.filter((module) => {
    if (widgetVisibility[module.id] === false) return false;
    if (isAdminUser) return true;
    if (module.name === 'Leaves') {
      // All employees should be able to open leave requests.
      return true;
    }
    if (isSalesRefOnly) {
      return module.name === 'Leaves';
    }
    return hasAnyPermission(module.accessKeywords);
  });

  const visibleQuickActions = hrmQuickActions.filter((action) => isWidgetVisible(action.id));
  const isModulesSectionVisible = isWidgetVisible('hrm-modules-section');
  const isQuickActionsSectionVisible = isWidgetVisible('hrm-quick-actions-section');
  const isHeroActiveEmployeesVisible = isWidgetVisible('hrm-hero-active-employees');
  const isHeroAttendanceRateVisible = isWidgetVisible('hrm-hero-attendance-rate');
  const isHeroDepartmentsVisible = isWidgetVisible('hrm-hero-departments');

  const setMyWidgetVisibility = async (widgetKey: string, isVisible: boolean) => {
    try {
      setWidgetToggleLoadingKey(widgetKey);
      await apiClient.put(
        '/dashboard/widgets/me',
        {
          widget_key: widgetKey,
          is_visible: isVisible,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setWidgetVisibility((prev) => ({
        ...prev,
        [widgetKey]: isVisible,
      }));
    } catch (error) {
      console.error('Error updating HRM widget visibility:', error);
    } finally {
      setWidgetToggleLoadingKey('');
    }
  };

  const allHrmWidgetKeys = [...hrmModules.map((module) => module.id), ...hrmQuickActions.map((action) => action.id)];
  const hiddenWidgetCount = allHrmWidgetKeys.filter((key) => widgetVisibility[key] === false).length;

  const restoreAllHiddenWidgets = async () => {
    const hiddenKeys = allHrmWidgetKeys.filter((key) => widgetVisibility[key] === false);
    if (hiddenKeys.length === 0) return;

    try {
      for (const key of hiddenKeys) {
        await apiClient.put(
          '/dashboard/widgets/me',
          {
            widget_key: key,
            is_visible: true,
          },
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
      }

      setWidgetVisibility((prev) => {
        const next = { ...prev };
        hiddenKeys.forEach((key) => {
          next[key] = true;
        });
        return next;
      });
    } catch (error) {
      console.error('Error restoring HRM widgets:', error);
    }
  };

  const stageWidgetVisibilityChange = (widgetKey: string, isVisible: boolean) => {
    if (widgetControlsLocked) return;
    setWidgetVisibilitySnapshot((prev) => prev ?? widgetVisibility);
    setWidgetVisibility((prev) => ({
      ...prev,
      [widgetKey]: isVisible,
    }));
    setPendingWidgetChanges((prev) => {
      const remaining = prev.filter((entry) => entry.widget_key !== widgetKey);
      return [...remaining, { widget_key: widgetKey, is_visible: isVisible }];
    });
  };

  const rollbackPendingWidgetChanges = () => {
    if (widgetVisibilitySnapshot) {
      setWidgetVisibility(widgetVisibilitySnapshot);
    }
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
      alert('Please enter Super Admin email and password.');
      return;
    }

    try {
      setSuperAdminConfirmLoading(true);
      for (const change of pendingWidgetChanges) {
        await apiClient.put(
          '/dashboard/widgets/me',
          {
            widget_key: change.widget_key,
            is_visible: change.is_visible,
            super_admin_email: superAdminEmail.trim(),
            super_admin_password: superAdminPassword,
            lock_widget_controls: true,
          },
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
      }
      setWidgetControlsLocked(true);
      setShowSuperAdminConfirmModal(false);
      setPendingWidgetChanges([]);
      setWidgetVisibilitySnapshot(null);
      setSuperAdminEmail('');
      setSuperAdminPassword('');
    } catch (error) {
      console.error('Error applying HRM widget visibility changes:', error);
      alert('Super Admin confirmation failed or widget update failed.');
    } finally {
      setSuperAdminConfirmLoading(false);
    }
  };

  const restoreAllHiddenWidgetsStaged = () => {
    if (widgetControlsLocked) return;
    const hiddenKeys = allHrmWidgetItems
      .map((item) => item.id)
      .filter((key) => widgetVisibility[key] === false);
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
      const mutable = [...prev];
      hiddenKeys.forEach((key) => {
        const remaining = mutable.filter((entry) => entry.widget_key !== key);
        remaining.push({ widget_key: key, is_visible: true });
        mutable.splice(0, mutable.length, ...remaining);
      });
      return mutable;
    });
  };

  const hiddenWidgetCountManaged = allHrmWidgetItems.filter((item) => widgetVisibility[item.id] === false).length;

  const restoreHiddenWidgetsAfterFix = () => {
    const hiddenKeys = allHrmWidgetItems
      .map((item) => item.id)
      .filter((key) => widgetVisibility[key] === false);
    if (!hiddenKeys.length) {
      alert('All widgets are already visible.');
      return;
    }
    openSuperAdminConfirmation(
      hiddenKeys.map((key) => ({ widget_key: key, is_visible: true })),
      'restore'
    );
  };

  const showRestoreWidgetList = () => {
    if (!superAdminEmail.trim() || !superAdminPassword) {
      alert('Please enter Super Admin email and password.');
      return;
    }
    setRestoreWidgetListVisible(true);
  };

  const restoreHiddenWidgetOneByOne = async (widgetKey: string) => {
    if (!superAdminEmail.trim() || !superAdminPassword) {
      alert('Please enter Super Admin email and password.');
      return;
    }
    try {
      setRestoreWidgetLoadingKey(widgetKey);
      await apiClient.put(
        '/dashboard/widgets/me',
        {
          widget_key: widgetKey,
          is_visible: true,
          super_admin_email: superAdminEmail.trim(),
          super_admin_password: superAdminPassword,
          lock_widget_controls: true,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setWidgetVisibility((prev) => ({ ...prev, [widgetKey]: true }));
      setPendingWidgetChanges((prev) => prev.filter((change) => change.widget_key !== widgetKey));
    } catch (error) {
      console.error('Error restoring HRM widget:', error);
      alert('Failed to restore widget. Please verify Super Admin credentials and try again.');
    } finally {
      setRestoreWidgetLoadingKey(null);
    }
  };

  const openUnlockWidgetsAfterFix = () => {
    openSuperAdminConfirmation([], 'unlock');
  };

  const unlockWidgetControls = async () => {
    if (superAdminModalMode !== 'unlock') return;
    if (!superAdminEmail.trim() || !superAdminPassword) {
      alert('Please enter Super Admin email and password.');
      return;
    }
    const fallbackWidgetKey = allHrmWidgetItems[0]?.id ?? 'hrm-employees';
    const fallbackVisibility = isWidgetVisible(fallbackWidgetKey);
    try {
      setSuperAdminConfirmLoading(true);
      await apiClient.put(
        '/dashboard/widgets/me',
        {
          widget_key: fallbackWidgetKey,
          is_visible: fallbackVisibility,
          super_admin_email: superAdminEmail.trim(),
          super_admin_password: superAdminPassword,
          lock_widget_controls: false,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
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
      console.error('Error unlocking HRM widget controls:', error);
      alert('Failed to unlock widget controls. Please verify Super Admin credentials and try again.');
    } finally {
      setSuperAdminConfirmLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/');
  };

  if (!token || !accessReady) {
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
          <div className="flex flex-col sm:flex-row justify-between sm:items-center h-auto sm:h-16 py-3 sm:py-0 gap-3 sm:gap-0">
            <div className="flex items-center justify-between sm:justify-start">
              <Link href="/dashboard" className="flex items-center space-x-2 text-gray-700 hover:text-blue-600 transition-colors duration-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="font-medium">Back to Dashboard</span>
              </Link>
            </div>
            <div className="flex items-center justify-between sm:justify-end space-x-3 sm:space-x-4">
              <div className="hidden md:flex items-center space-x-2 text-sm text-gray-600">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span>HRM System Active</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                  HR
                </div>
                <span className="font-medium text-gray-900 text-sm sm:text-base">Human Resources</span>
              </div>
              <button
                onClick={handleLogout}
                className="bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white px-6 py-2 rounded-full text-sm font-medium transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="inline-block p-1 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full mb-6">
            <div className="bg-white rounded-full p-4">
              <span className="text-4xl">👥</span>
            </div>
          </div>
          <h2 className="text-3xl md:text-5xl font-bold text-gray-900 mb-4">
            Human Resource <span className="bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">Management</span>
          </h2>
          <p className="text-lg sm:text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed mb-6 px-1">
            Streamline your workforce management with comprehensive HR tools.
            From employee onboarding to payroll processing, manage everything in one place.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:space-x-6">
            {isHeroActiveEmployeesVisible && (
              <div className="relative text-center px-8">
                {!widgetControlsLocked && (
                  <button
                    type="button"
                    onClick={() => stageWidgetVisibilityChange('hrm-hero-active-employees', false)}
                    className="absolute right-0 top-0 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-[11px] font-bold text-slate-600 shadow hover:bg-slate-100"
                    title="Disable this widget"
                    aria-label="Disable Active Employees"
                  >
                    ×
                  </button>
                )}
                <div className="text-2xl font-bold text-blue-600">{loading ? '...' : activeEmployees}</div>
                <div className="text-sm text-gray-500">Active Employees</div>
              </div>
            )}
            {isHeroAttendanceRateVisible && (
              <div className="relative text-center px-8">
                {!widgetControlsLocked && (
                  <button
                    type="button"
                    onClick={() => stageWidgetVisibilityChange('hrm-hero-attendance-rate', false)}
                    className="absolute right-0 top-0 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-[11px] font-bold text-slate-600 shadow hover:bg-slate-100"
                    title="Disable this widget"
                    aria-label="Disable Attendance Rate"
                  >
                    ×
                  </button>
                )}
                <div className="text-2xl font-bold text-green-600">{loading ? '...' : `${attendanceRate}%`}</div>
                <div className="text-sm text-gray-500">Attendance Rate</div>
              </div>
            )}
            {isHeroDepartmentsVisible && (
              <div className="relative text-center px-8">
                {!widgetControlsLocked && (
                  <button
                    type="button"
                    onClick={() => stageWidgetVisibilityChange('hrm-hero-departments', false)}
                    className="absolute right-0 top-0 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-[11px] font-bold text-slate-600 shadow hover:bg-slate-100"
                    title="Disable this widget"
                    aria-label="Disable Departments"
                  >
                    ×
                  </button>
                )}
                <div className="text-2xl font-bold text-purple-600">{loading ? '...' : departmentsCount}</div>
                <div className="text-sm text-gray-500">Departments</div>
              </div>
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {!widgetControlsLocked && hiddenWidgetCountManaged > 0 && (
              <button
                type="button"
                onClick={restoreAllHiddenWidgetsStaged}
                className="rounded-full border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
              >
                Restore Hidden Widgets ({hiddenWidgetCountManaged})
              </button>
            )}
            {!widgetControlsLocked && pendingWidgetChanges.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => openSuperAdminConfirmation(pendingWidgetChanges, 'apply')}
                  className="rounded-full border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
                >
                  Fix Widget ({pendingWidgetChanges.length})
                </button>
                <button
                  type="button"
                  onClick={rollbackPendingWidgetChanges}
                  className="rounded-full border border-gray-300 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
                >
                  Cancel Widget Changes
                </button>
              </>
            )}
            {widgetControlsLocked && (
              <>
                <div className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
                  Widget controls locked after Super Admin confirmation.
                </div>
                {hiddenWidgetCountManaged > 0 && (
                  <button
                    type="button"
                    onClick={restoreHiddenWidgetsAfterFix}
                    className="rounded-full border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
                  >
                    Restore Widgets ({hiddenWidgetCountManaged})
                  </button>
                )}
                <button
                  type="button"
                  onClick={openUnlockWidgetsAfterFix}
                  className="rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-100"
                >
                  Unlock Widgets
                </button>
              </>
            )}
          </div>
        </div>

        {/* HRM Module Cards */}
        {isModulesSectionVisible && (
        <div className="relative grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {!widgetControlsLocked && (
            <button
              type="button"
              onClick={() => stageWidgetVisibilityChange('hrm-modules-section', false)}
              className="absolute -top-3 right-0 z-30 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-xs font-bold text-slate-600 shadow hover:bg-slate-100"
              title="Disable this widget"
              aria-label="Disable HRM Modules Section"
            >
              ×
            </button>
          )}
          {visibleHrmModules.map((module, index) => (
            <Link
              key={index}
              href={module.path}
              className="group relative bg-white/70 backdrop-blur-sm rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-500 cursor-pointer border border-white/20 overflow-hidden transform hover:-translate-y-2 hover:scale-105"
            >
              {!widgetControlsLocked && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    stageWidgetVisibilityChange(module.id, false);
                  }}
                  className="absolute right-3 top-3 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-xs font-bold text-slate-600 shadow hover:bg-slate-100"
                  title="Disable this widget"
                  aria-label={`Disable ${module.name}`}
                >
                  ×
                </button>
              )}

              {/* Gradient Background */}
              <div className={`absolute inset-0 bg-gradient-to-br ${module.bgColor} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}></div>

              {/* Content */}
              <div className="relative p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-14 h-14 bg-gradient-to-r ${module.color} rounded-xl flex items-center justify-center text-2xl shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                    {module.icon}
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                      {module.getStats()}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-gray-900 group-hover:text-gray-800 transition-colors duration-300">
                    {module.name}
                  </h3>
                  <p className="text-sm text-gray-600 group-hover:text-gray-700 transition-colors duration-300">
                    {module.description}
                  </p>
                </div>

                {/* Hover Effect Line */}
                <div className="absolute bottom-0 left-0 w-0 h-1 bg-gradient-to-r from-blue-500 to-cyan-500 group-hover:w-full transition-all duration-500"></div>
              </div>

              {/* Floating Particles Effect */}
              <div className="absolute top-4 right-4 w-2 h-2 bg-white/30 rounded-full opacity-0 group-hover:opacity-100 animate-ping"></div>
              <div className="absolute top-8 right-6 w-1 h-1 bg-white/20 rounded-full opacity-0 group-hover:opacity-100 animate-ping animation-delay-300"></div>
            </Link>
          ))}
        </div>
        )}

        {isModulesSectionVisible && visibleHrmModules.length === 0 && (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            No HRM features are assigned to your role yet. Please contact an administrator.
          </div>
        )}

        {/* Quick Actions Section */}
        {isQuickActionsSectionVisible && (
        <div className="relative mt-12 bg-white/70 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 overflow-hidden">
          {!widgetControlsLocked && (
            <button
              type="button"
              onClick={() => stageWidgetVisibilityChange('hrm-quick-actions-section', false)}
              className="absolute right-3 top-3 z-30 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-xs font-bold text-slate-600 shadow hover:bg-slate-100"
              title="Disable this widget"
              aria-label="Disable Quick Actions Section"
            >
              ×
            </button>
          )}
          <div className="bg-gradient-to-r from-blue-500 to-cyan-500 p-6">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-2xl">
                ⚡
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Quick Actions</h3>
                <p className="text-white/80">Frequently used HR operations</p>
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {visibleQuickActions.map((action, index) => (
                <div
                  key={index}
                  className="group relative bg-white/50 hover:bg-white/80 rounded-xl p-4 border border-white/30 hover:border-white/50 transition-all duration-300 cursor-pointer transform hover:scale-105 text-center"
                >
                  {!widgetControlsLocked && (
                    <button
                      type="button"
                      onClick={() => {
                        stageWidgetVisibilityChange(action.id, false);
                      }}
                      className="absolute right-2 top-2 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-[11px] font-bold text-slate-600 shadow hover:bg-slate-100"
                      title="Disable this widget"
                      aria-label={`Disable ${action.title}`}
                    >
                      ×
                    </button>
                  )}
                  <div className="text-2xl mb-2">{action.icon}</div>
                  <h4 className="font-semibold text-gray-900 group-hover:text-gray-800 transition-colors duration-300 text-sm">
                    {action.title}
                  </h4>
                  <p className="text-xs text-gray-600 group-hover:text-gray-700 transition-colors duration-300">
                    {action.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
        )}

        {showSuperAdminConfirmModal && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-2xl border border-white/40 bg-white p-5 shadow-2xl">
              <div className="flex items-center justify-between border-b border-gray-200 pb-3">
                <h3 className="text-lg font-semibold text-gray-900">Super Admin Confirmation</h3>
                <button
                  type="button"
                  onClick={() => {
                    if (superAdminConfirmLoading) return;
                    rollbackPendingWidgetChanges();
                  }}
                  className="rounded-full border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                >
                  Close
                </button>
              </div>
              <div className="mt-4 space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Super Admin Email</label>
                  <input
                    type="email"
                    value={superAdminEmail}
                    onChange={(e) => setSuperAdminEmail(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900"
                    placeholder="superadmin@company.com"
                    autoComplete="username"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Super Admin Password</label>
                  <input
                    type="password"
                    value={superAdminPassword}
                    onChange={(e) => setSuperAdminPassword(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900"
                    placeholder="Enter password"
                    autoComplete="current-password"
                  />
                </div>
                {superAdminModalMode !== 'unlock' && !restoreWidgetListVisible && (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                    Pending widget updates: <strong>{pendingWidgetChanges.length}</strong>
                  </div>
                )}
                {superAdminModalMode === 'unlock' && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Confirm Super Admin credentials to unlock widget controls and show close buttons again.
                  </div>
                )}
                {superAdminModalMode === 'restore' && restoreWidgetListVisible && (
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 py-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-indigo-700">Hidden widgets</p>
                    {pendingWidgetChanges.length === 0 ? (
                      <p className="text-sm text-indigo-800">All hidden widgets are restored.</p>
                    ) : (
                      <div className="max-h-56 space-y-2 overflow-y-auto">
                        {pendingWidgetChanges.map((change) => {
                          const widgetName =
                            allHrmWidgetItems.find((item) => item.id === change.widget_key)?.name ?? change.widget_key;
                          const isRestoring = restoreWidgetLoadingKey === change.widget_key;
                          return (
                            <div
                              key={change.widget_key}
                              className="flex items-center justify-between rounded-lg border border-indigo-100 bg-white px-3 py-2"
                            >
                              <span className="text-sm font-medium text-gray-800">{widgetName}</span>
                              <button
                                type="button"
                                disabled={Boolean(restoreWidgetLoadingKey)}
                                onClick={() => restoreHiddenWidgetOneByOne(change.widget_key)}
                                className="rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
                              >
                                {isRestoring ? 'Restoring...' : 'Restore'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="mt-5 flex justify-end gap-2 border-t border-gray-200 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    if (superAdminConfirmLoading) return;
                    rollbackPendingWidgetChanges();
                  }}
                  className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
                >
                  Cancel
                </button>
                {superAdminModalMode === 'apply' ? (
                  <button
                    type="button"
                    disabled={superAdminConfirmLoading}
                    onClick={applyWidgetVisibilityChanges}
                    className="rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:from-blue-700 hover:to-cyan-700 disabled:opacity-60"
                  >
                    {superAdminConfirmLoading ? 'Confirming...' : 'Confirm & Apply'}
                  </button>
                ) : superAdminModalMode === 'restore' ? (
                  <button
                    type="button"
                    disabled={superAdminConfirmLoading || restoreWidgetListVisible}
                    onClick={showRestoreWidgetList}
                    className="rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white hover:from-indigo-700 hover:to-blue-700 disabled:opacity-60"
                  >
                    Show Hidden Widgets
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={superAdminConfirmLoading}
                    onClick={unlockWidgetControls}
                    className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-semibold text-white hover:from-amber-600 hover:to-orange-600 disabled:opacity-60"
                  >
                    {superAdminConfirmLoading ? 'Unlocking...' : 'Unlock Widgets'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}