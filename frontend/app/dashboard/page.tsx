'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createApiClient } from '@/lib/apiClient';

type DashboardModule = {
  id: string;
  name: string;
  icon: string;
  color: string;
  bgColor: string;
  path?: string;
  comingSoon?: boolean;
  adminOnly?: boolean;
  accessKeywords: string[];
  description?: string;
};

export default function Dashboard() {
  const [token, setToken] = useState('');
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [widgetVisibility, setWidgetVisibility] = useState<Record<string, boolean>>({});
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [accessReady, setAccessReady] = useState(false);
  const [showWidgetPermissionModal, setShowWidgetPermissionModal] = useState(false);
  const [widgetUsers, setWidgetUsers] = useState<any[]>([]);
  const [selectedWidgetUserId, setSelectedWidgetUserId] = useState('');
  const [widgetPermissionForm, setWidgetPermissionForm] = useState<Record<string, boolean>>({});
  const [widgetPermissionLoading, setWidgetPermissionLoading] = useState(false);
  const [widgetPermissionSaving, setWidgetPermissionSaving] = useState(false);
  const [widgetToggleLoadingKey, setWidgetToggleLoadingKey] = useState('');
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

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/');
  };

  useEffect(() => {
    if (!token) return;

    const fetchUserAccess = async () => {
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

        const isOutletUser = roleNames.some((role) => role.includes('outlet_user'));
        if (!adminUser && isOutletUser) {
          router.push('/outlet-pos');
          return;
        }

        setUserRoles(Array.from(new Set(roleNames)));
        setUserPermissions(Array.from(new Set(permissionNames.filter(Boolean))));
        setIsAdminUser(adminUser);

        try {
          const widgetRes = await apiClient.get('/dashboard/widgets/me', {
            headers: { Authorization: `Bearer ${token}` },
          });
          const widgetMap = widgetRes.data?.data?.widgets || {};
          setWidgetVisibility(widgetMap);
        } catch (widgetError) {
          console.error('Error fetching widget visibility:', widgetError);
          setWidgetVisibility({});
        }
      } catch (error) {
        console.error('Error fetching dashboard access profile:', error);
        setUserRoles([]);
        setUserPermissions([]);
        setIsAdminUser(false);
        setWidgetVisibility({});
      } finally {
        setAccessReady(true);
      }
    };

    fetchUserAccess();
  }, [token, router]);

  const hasModuleAccess = (keywords: string[]) => {
    if (isAdminUser) return true;
    if (keywords.length === 0) return false;

    return userPermissions.some((permission) => keywords.some((keyword) => permission.includes(keyword)));
  };

  const modules: DashboardModule[] = [
    {
      id: 'hrm',
      name: 'HRM (Human Resource Management)',
      icon: '👥',
      color: 'from-red-500 to-pink-500',
      bgColor: 'from-red-50 to-pink-50',
      path: '/dashboard/hrm',
      accessKeywords: ['hrm', 'employee', 'department', 'designation', 'attendance', 'leave', 'payroll', 'candidate', 'role', 'permission'],
    },
    {
      id: 'reports',
      name: 'Reports',
      icon: '📈',
      color: 'from-rose-500 to-red-500',
      bgColor: 'from-rose-50 to-red-50',
      path: '/dashboard/reports',
      accessKeywords: ['report'],
    },
    {
      id: 'production',
      name: 'Production',
      icon: '🏭',
      color: 'from-emerald-500 to-teal-500',
      bgColor: 'from-emerald-50 to-teal-50',
      path: '/dashboard/production',
      accessKeywords: ['production', 'bom', 'formula', 'batch', 'planning', 'quality', 'qc', 'packaging'],
    },
    {
      id: 'purchasing',
      name: 'Purchasing',
      icon: '🛒',
      color: 'from-cyan-500 to-blue-500',
      bgColor: 'from-cyan-50 to-blue-50',
      path: '/dashboard/purchasing',
      accessKeywords: ['purchasing', 'purchesing', 'purchase', 'grn'],
    },
    {
      id: 'outlets',
      name: 'Outlets',
      icon: '🏪',
      color: 'from-violet-500 to-purple-500',
      bgColor: 'from-violet-50 to-purple-50',
      path: '/dashboard/outlets',
      accessKeywords: ['outlet', 'branch'],
    },
    {
      id: 'stock',
      name: 'Manage Stock',
      icon: '📦',
      color: 'from-orange-500 to-red-500',
      bgColor: 'from-orange-50 to-red-50',
      path: '/dashboard/stock',
      accessKeywords: ['stock', 'inventory', 'supplier', 'transfer'],
    },
    {
      id: 'vehicle-loading',
      name: 'Vehicle Loading',
      icon: '🚛',
      color: 'from-blue-500 to-indigo-500',
      bgColor: 'from-blue-50 to-indigo-50',
      path: '/dashboard/vehicle-loading',
      accessKeywords: ['vehicle-loading', 'vehicle', 'load', 'route'],
    },
    {
      id: 'distribution',
      name: 'Distribution',
      icon: '🚚',
      color: 'from-green-500 to-teal-500',
      bgColor: 'from-green-50 to-teal-50',
      path: '/dashboard/distribution',
      accessKeywords: ['distribution', 'customer', 'invoice', 'return', 'payment'],
    },
    {
      id: 'accounts',
      name: 'Accounts',
      icon: '💼',
      color: 'from-emerald-500 to-cyan-500',
      bgColor: 'from-emerald-50 to-cyan-50',
      path: '/dashboard/accounts',
      accessKeywords: ['account', 'accounts', 'ledger', 'cash', 'petty', 'finance'],
    },
  ];

  const adminSettingCards: DashboardModule[] = [
    {
      id: 'company-settings',
      name: 'Company Settings',
      icon: '🏢',
      color: 'from-blue-500 to-cyan-500',
      bgColor: 'from-blue-50 to-cyan-50',
      path: '/dashboard/company-settings',
      accessKeywords: [],
      adminOnly: true,
      description: 'Manage company profile for invoices and documents',
    },
    {
      id: 'user-management',
      name: 'User Management',
      icon: '👥',
      color: 'from-green-500 to-emerald-500',
      bgColor: 'from-green-50 to-emerald-50',
      path: '/dashboard/hrm/roles',
      accessKeywords: [],
      adminOnly: true,
      description: 'Manage users and permissions',
    },
    {
      id: 'system-settings',
      name: 'System Settings',
      icon: '⚙️',
      color: 'from-purple-500 to-indigo-500',
      bgColor: 'from-purple-50 to-indigo-50',
      path: '/dashboard/system-settings',
      accessKeywords: [],
      adminOnly: true,
      description: 'Configure system preferences',
    },
    {
      id: 'security-settings',
      name: 'Security Settings',
      icon: '🔒',
      color: 'from-red-500 to-pink-500',
      bgColor: 'from-red-50 to-pink-50',
      path: '/dashboard/security-settings',
      accessKeywords: [],
      adminOnly: true,
      description: 'Manage security configurations',
    },
    {
      id: 'backup-restore',
      name: 'Backup & Restore',
      icon: '💾',
      color: 'from-teal-500 to-green-500',
      bgColor: 'from-teal-50 to-green-50',
      path: '/dashboard/backup-restore',
      accessKeywords: [],
      adminOnly: true,
      description: 'Manage data backups',
    },
  ];

  const allWidgetCards = [...modules, ...adminSettingCards];

  const visibleModules = modules.filter((module) => {
    if (module.adminOnly) return isAdminUser;
    const widgetAllowed = widgetVisibility[module.id] !== false;
    if (!widgetAllowed) return false;
    if (module.id === 'hrm') {
      // Keep HRM entry visible so every employee can access leave requests.
      return true;
    }
    if (isAdminUser) return true;
    const roleAllowed = hasModuleAccess(module.accessKeywords);
    return roleAllowed && widgetAllowed;
  });

  const visibleAdminSettingCards = adminSettingCards.filter((card) => widgetVisibility[card.id] !== false);

  const fetchWidgetUsers = async () => {
    const usersRes = await apiClient.get('/dashboard/widgets/users', {
      headers: { Authorization: `Bearer ${token}` },
    });

    const users = Array.isArray(usersRes.data?.data) ? usersRes.data.data : [];
    setWidgetUsers(users);

    if (users.length > 0) {
      const firstUserId = String(users[0].id);
      setSelectedWidgetUserId(firstUserId);
      await fetchWidgetPermissionsForUser(firstUserId);
    }
  };

  const fetchWidgetPermissionsForUser = async (userId: string) => {
    if (!userId) return;
    const permissionRes = await apiClient.get(`/dashboard/widgets/users/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const widgets = permissionRes.data?.data?.widgets || {};
    setWidgetPermissionForm(widgets);
  };

  const openWidgetPermissionManager = async () => {
    if (!isAdminUser) return;
    try {
      setWidgetPermissionLoading(true);
      setShowWidgetPermissionModal(true);
      await fetchWidgetUsers();
    } catch (error) {
      console.error('Error loading widget permission manager:', error);
      alert('Failed to load widget permission manager.');
      setShowWidgetPermissionModal(false);
    } finally {
      setWidgetPermissionLoading(false);
    }
  };

  const handleWidgetUserChange = async (userId: string) => {
    setSelectedWidgetUserId(userId);
    if (!userId) return;
    try {
      setWidgetPermissionLoading(true);
      await fetchWidgetPermissionsForUser(userId);
    } catch (error) {
      console.error('Error loading user widget permissions:', error);
      alert('Failed to load selected user widget permissions.');
    } finally {
      setWidgetPermissionLoading(false);
    }
  };

  const saveWidgetPermissions = async () => {
    if (!selectedWidgetUserId) return;
    try {
      setWidgetPermissionSaving(true);
      await apiClient.put(
        `/dashboard/widgets/users/${selectedWidgetUserId}`,
        { widgets: widgetPermissionForm },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert('Widget permissions updated successfully.');
    } catch (error) {
      console.error('Error saving widget permissions:', error);
      alert('Failed to save widget permissions.');
    } finally {
      setWidgetPermissionSaving(false);
    }
  };

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
      console.error('Error updating own widget visibility:', error);
      alert('Failed to update widget visibility.');
    } finally {
      setWidgetToggleLoadingKey('');
    }
  };

  const restoreAllHiddenWidgets = async () => {
    const hiddenKeys = allWidgetCards
      .map((card) => card.id)
      .filter((cardId) => widgetVisibility[cardId] === false);

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
      console.error('Error restoring hidden widgets:', error);
      alert('Failed to restore widgets.');
    }
  };

  const hiddenWidgetCount = allWidgetCards.filter((card) => widgetVisibility[card.id] === false).length;

  const handleModuleClick = (module: DashboardModule) => {
    if (module.path) {
      router.push(module.path);
      return;
    }

    if (module.comingSoon) {
      alert(`${module.name} module coming soon!`);
    }
  };

  if (!token || !accessReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-pink-50 to-purple-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-pink-50 to-purple-50 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-20 left-20 w-72 h-72 bg-red-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-pink-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-40 w-72 h-72 bg-purple-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-4000"></div>
      </div>

      {/* Modern Navigation */}
      <nav className="relative z-10 bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between sm:h-16 h-auto py-3 sm:py-0 gap-3 sm:gap-0">
            <div className="flex items-center justify-between sm:justify-start">
              <div className="flex-shrink-0 flex items-center space-x-3">
                <div className="w-8 h-8 bg-gradient-to-r from-red-500 to-pink-500 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">BMS</span>
                </div>
                <h1 className="text-gray-900 text-lg sm:text-xl font-bold bg-gradient-to-r from-red-600 to-pink-600 bg-clip-text text-transparent">
                  Business Management System
                </h1>
              </div>
            </div>
            <div className="flex items-center justify-between sm:justify-end space-x-3 sm:space-x-4">
              <div className="hidden md:flex items-center space-x-2 text-sm text-gray-600">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span>System Online</span>
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
          <div className="inline-block p-1 bg-gradient-to-r from-red-500 to-pink-500 rounded-full mb-6">
            <div className="bg-white rounded-full p-4">
              <span className="text-4xl">🚀</span>
            </div>
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Welcome to <span className="bg-gradient-to-r from-red-600 to-pink-600 bg-clip-text text-transparent">BMS</span>
          </h2>
          <p className="text-lg sm:text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed px-1">
            Transform your business operations with our comprehensive management suite.
            Streamline processes, boost productivity, and drive growth with intelligent automation.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center mt-6 gap-2 sm:space-x-4">
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span>All Systems Operational</span>
            </div>
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <span>Real-time Updates</span>
            </div>
          </div>
          {hiddenWidgetCount > 0 && (
            <button
              type="button"
              onClick={restoreAllHiddenWidgets}
              className="mt-4 rounded-full border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
            >
              Restore Hidden Widgets ({hiddenWidgetCount})
            </button>
          )}
        </div>

        {/* Module Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-16">
          {visibleModules.map((module, index) => (
            <div
              key={index}
              onClick={() => handleModuleClick(module)}
              className={`group relative bg-white/70 backdrop-blur-sm rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-500 cursor-pointer border border-white/20 overflow-hidden transform hover:-translate-y-2 hover:scale-105 ${
                module.name === 'HRM (Human Resource Management)' ? 'ring-2 ring-red-500/50' : ''
              }`}
            >
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (widgetToggleLoadingKey) return;
                  setMyWidgetVisibility(module.id, false);
                }}
                className="absolute right-3 top-3 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-xs font-bold text-slate-600 shadow hover:bg-slate-100"
                title="Disable this widget"
                aria-label={`Disable ${module.name}`}
              >
                {widgetToggleLoadingKey === module.id ? '...' : '×'}
              </button>

              {/* Gradient Background */}
              <div className={`absolute inset-0 bg-gradient-to-br ${module.bgColor} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}></div>

              {/* Content */}
              <div className="relative p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-14 h-14 bg-gradient-to-r ${module.color} rounded-xl flex items-center justify-center text-2xl shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                    {module.icon}
                  </div>
                  <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-gray-900 group-hover:text-gray-800 transition-colors duration-300">
                    {module.name}
                  </h3>
                  <p className="text-sm text-gray-600 group-hover:text-gray-700 transition-colors duration-300">
                    {module.name === 'HRM (Human Resource Management)'
                      ? 'Manage your workforce efficiently'
                      : module.name === 'Manage Stock'
                      ? 'Monitor and manage inventory levels'
                      : module.name === 'Vehicle Loading'
                      ? 'Manage vehicle loading operations'
                      : module.name === 'Production'
                      ? 'Oversee production processes and workflows'
                      : module.name === 'Purchasing'
                      ? 'Handle procurement and supplier management'
                      : module.name === 'Outlets'
                      ? 'Manage retail outlets and sales points'
                      : module.name === 'Distribution'
                      ? 'Manage customers, invoices, returns and payments'
                      : module.name === 'Accounts'
                      ? 'Handle company books, cash accounts and balances'
                      : 'Access comprehensive management tools'
                    }
                  </p>
                </div>

                {/* Hover Effect Line */}
                <div className="absolute bottom-0 left-0 w-0 h-1 bg-gradient-to-r from-red-500 to-pink-500 group-hover:w-full transition-all duration-500"></div>
              </div>

              {/* Floating Particles Effect */}
              <div className="absolute top-4 right-4 w-2 h-2 bg-white/30 rounded-full opacity-0 group-hover:opacity-100 animate-ping"></div>
              <div className="absolute top-8 right-6 w-1 h-1 bg-white/20 rounded-full opacity-0 group-hover:opacity-100 animate-ping animation-delay-300"></div>
            </div>
          ))}
        </div>

        {visibleModules.length === 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 mb-8">
            No feature modules are currently assigned to your role. Contact an administrator to grant view permissions.
          </div>
        )}

        {/* Settings & Configuration Section */}
        {isAdminUser && (
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 overflow-hidden">
            <div className="bg-gradient-to-r from-red-500 to-pink-500 p-6">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-2xl">
                  ⚙️
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Settings & System Configuration</h3>
                  <p className="text-white/80">Configure and customize your system preferences</p>
                </div>
              </div>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {visibleAdminSettingCards.map((setting, index) => (
                  <div
                    key={index}
                    onClick={() => {
                      if (setting.path) {
                        router.push(setting.path);
                        return;
                      }

                      
                    }}
                    className="group relative bg-white/50 hover:bg-white/80 rounded-xl p-4 border border-white/30 hover:border-white/50 transition-all duration-300 cursor-pointer transform hover:scale-105"
                  >
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (widgetToggleLoadingKey) return;
                        setMyWidgetVisibility(setting.id, false);
                      }}
                      className="absolute right-3 top-3 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-xs font-bold text-slate-600 shadow hover:bg-slate-100"
                      title="Disable this widget"
                      aria-label={`Disable ${setting.name}`}
                    >
                      {widgetToggleLoadingKey === setting.id ? '...' : '×'}
                    </button>

                    <div className="flex items-center space-x-3">
                      <div className={`w-12 h-12 bg-gradient-to-r ${setting.color} rounded-lg flex items-center justify-center text-xl shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                        {setting.icon}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-900 group-hover:text-gray-800 transition-colors duration-300">
                          {setting.name}
                        </h4>
                        <p className="text-sm text-gray-600 group-hover:text-gray-700 transition-colors duration-300">
                          {setting.description || 'System setting card'}
                        </p>
                      </div>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 border-t border-red-100 pt-4">
                <button
                  type="button"
                  onClick={openWidgetPermissionManager}
                  className="inline-flex items-center rounded-xl bg-gradient-to-r from-fuchsia-600 to-pink-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-fuchsia-200/70 transition hover:from-fuchsia-700 hover:to-pink-700"
                >
                  Manage Employee Widget Access
                </button>
              </div>
            </div>
          </div>
        )}

        {showWidgetPermissionModal && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-2xl rounded-2xl border border-white/40 bg-white p-5 shadow-2xl">
              <div className="flex items-center justify-between border-b border-gray-200 pb-3">
                <h3 className="text-lg font-semibold text-gray-900">Employee Widget Access Control</h3>
                <button
                  type="button"
                  onClick={() => setShowWidgetPermissionModal(false)}
                  className="rounded-full border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                >
                  Close
                </button>
              </div>

              <div className="mt-4 space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Employee/User</label>
                  <select
                    value={selectedWidgetUserId}
                    onChange={(e) => handleWidgetUserChange(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900"
                  >
                    {widgetUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.employee_code ? `${user.employee_code} - ` : ''}
                        {user.employee_name || user.name || user.email}
                      </option>
                    ))}
                  </select>
                </div>

                {widgetPermissionLoading ? (
                  <div className="text-sm text-gray-500">Loading widget permissions...</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {allWidgetCards.map((module) => (
                      <label key={module.id} className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                        <span className="text-sm font-medium text-gray-800">{module.name}</span>
                        <input
                          type="checkbox"
                          checked={widgetPermissionForm[module.id] !== false}
                          onChange={(e) =>
                            setWidgetPermissionForm((prev) => ({
                              ...prev,
                              [module.id]: e.target.checked,
                            }))
                          }
                        />
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-5 flex justify-end gap-2 border-t border-gray-200 pt-3">
                <button
                  type="button"
                  onClick={() => setShowWidgetPermissionModal(false)}
                  className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={widgetPermissionSaving || !selectedWidgetUserId}
                  onClick={saveWidgetPermissions}
                  className="rounded-xl bg-gradient-to-r from-red-600 to-pink-600 px-4 py-2 text-sm font-semibold text-white hover:from-red-700 hover:to-pink-700 disabled:opacity-60"
                >
                  {widgetPermissionSaving ? 'Saving...' : 'Save Widget Access'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}