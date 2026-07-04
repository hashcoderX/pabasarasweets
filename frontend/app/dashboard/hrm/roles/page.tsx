'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

interface Role {
  id: number;
  name: string;
  description: string;
  permissions: Permission[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface Permission {
  id: number;
  name: string;
  module: string;
  description: string;
  is_active: boolean;
}

interface UserRole {
  id: number;
  user_id: number;
  role_id: number;
  assigned_at: string;
  assigned_by: number;
  user: {
    id: number;
    name: string;
    email: string;
  };
  role: Role;
}


const PERMISSION_SECTION_ORDER = [
  { key: 'distribution', label: 'Distribution' },
  { key: 'accounts', label: 'Accounts' },
  { key: 'hrm', label: 'HRM' },
  { key: 'purchasing', label: 'Purchasing' },
  { key: 'stock', label: 'Stock' },
  { key: 'production', label: 'Production' },
  { key: 'vehicle-loading', label: 'Vehicle Loading' },
  { key: 'outlet-pos', label: 'Outlet POS' },
  { key: 'reports', label: 'Reports' },
  { key: 'settings', label: 'Settings' },
  { key: 'branches', label: 'Branches' },
  { key: 'other', label: 'Other' },
];

const SECTION_FALLBACK_ACTIONS: Record<string, string[]> = {
  accounts: [
    'View Main Account',
    'Manage Main Account',
    'View Transaction Book',
    'Manage Transaction Book',
    'View Petty Cash',
    'Manage Petty Cash',
    'View Delivery Cash',
    'Manage Delivery Cash',
    'Approve Outlet Transfers',
  ],
  hrm: [
    'View Employees',
    'Manage Employees',
    'View Departments',
    'Manage Departments',
    'View Designations',
    'Manage Designations',
    'Manage Attendance',
    'Manage Leave',
    'Manage Payroll',
    'Manage Candidates',
  ],
  distribution: [
    'View Customers',
    'Manage Customers',
    'View Invoices',
    'Create Invoices',
    'Manage Returns',
    'Record Payments',
    'View Debtors',
    'View Customer Ledger',
  ],
  purchasing: [
    'View Purchase Orders',
    'Create Purchase Orders',
    'Manage GRN',
  ],
  stock: [
    'View Inventory',
    'Manage Inventory',
    'Manage Transfers',
    'Manage Suppliers',
  ],
  production: [
    'View Production Plans',
    'Manage Production Plans',
    'Manage BOM',
    'Manage Production Execution',
    'Manage QC',
    'Manage Packaging',
  ],
  'vehicle-loading': [
    'View Vehicles',
    'Manage Vehicles',
    'View Routes',
    'Manage Routes',
    'View Loads',
    'Manage Loads',
    'Manage Load Items',
  ],
  'outlet-pos': [
    'View Sales',
    'Create Sales',
    'Manage Cash Drawer',
    'Manage Loyalty Customers',
    'View Outlet Reports',
  ],
  reports: [
    'View HR Reports',
    'View Distribution Reports',
    'View Purchasing Reports',
    'View Stock Reports',
    'View Vehicle Loading Reports',
  ],
  settings: [
    'Manage System Settings',
    'Manage Security Settings',
    'Manage Backup Settings',
    'Manage Company Settings',
  ],
  branches: [
    'View Branches',
    'Manage Branches',
    'View Branch Stock Report',
  ],
  other: [
    'Manage Roles',
    'Manage Permissions',
    'Manage System Settings',
    'Manage Security Settings',
    'Manage Backup Settings',
  ],
};

const toPermissionSlug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const inferPermissionSection = (permission: Permission): string => {
  const moduleValue = String(permission.module || '').toLowerCase();
  const permissionName = String(permission.name || '').toLowerCase();
  const haystack = `${moduleValue} ${permissionName} ${String(permission.description || '').toLowerCase()}`;

  const normalizedModule = moduleValue
    .replace(/[_.]+/g, '-')
    .replace(/\s+/g, '-')
    .trim();

  if (normalizedModule === 'hrm' || normalizedModule === 'hr') {
    return 'hrm';
  }

  if (normalizedModule === 'distribution') {
    return 'distribution';
  }

  if (normalizedModule === 'accounts' || normalizedModule === 'account' || normalizedModule === 'finance') {
    return 'accounts';
  }

  if (normalizedModule === 'purchasing' || normalizedModule === 'purchase') {
    return 'purchasing';
  }

  if (normalizedModule === 'stock' || normalizedModule === 'inventory') {
    return 'stock';
  }

  if (normalizedModule === 'production') {
    return 'production';
  }

  if (normalizedModule === 'vehicle-loading' || normalizedModule === 'vehicle' || normalizedModule === 'loading') {
    return 'vehicle-loading';
  }

  if (normalizedModule === 'outlet-pos' || normalizedModule === 'outlet' || normalizedModule === 'pos') {
    return 'outlet-pos';
  }

  if (normalizedModule === 'reports' || normalizedModule === 'report') {
    return 'reports';
  }

  if (
    normalizedModule === 'settings' ||
    normalizedModule === 'system-management' ||
    normalizedModule === 'security-management' ||
    normalizedModule === 'backup-management'
  ) {
    return 'settings';
  }

  if (normalizedModule === 'branches' || normalizedModule === 'branch' || normalizedModule === 'outlet') {
    return 'branches';
  }

  if (
    haystack.includes('account') ||
    haystack.includes('accounts') ||
    haystack.includes('cash book') ||
    haystack.includes('transaction book') ||
    haystack.includes('petty cash') ||
    haystack.includes('delivery cash') ||
    haystack.includes('main account')
  ) {
    return 'accounts';
  }

  if (
    haystack.includes('distribution') ||
    haystack.includes('customer') ||
    haystack.includes('invoice') ||
    haystack.includes('return') ||
    haystack.includes('payment')
  ) {
    return 'distribution';
  }

  if (
    haystack.includes('vehicle-loading') ||
    haystack.includes('vehicle_loading') ||
    haystack.includes('vehicle') ||
    haystack.includes('load') ||
    haystack.includes('route')
  ) {
    return 'vehicle-loading';
  }

  if (
    haystack.includes('purchasing') ||
    haystack.includes('purchesing') ||
    haystack.includes('purchase') ||
    haystack.includes('grn')
  ) {
    return 'purchasing';
  }

  if (
    haystack.includes('stock') ||
    haystack.includes('inventory') ||
    haystack.includes('supplier') ||
    haystack.includes('transfer')
  ) {
    return 'stock';
  }

  if (
    haystack.includes('production') ||
    haystack.includes('bom') ||
    haystack.includes('packaging') ||
    haystack.includes('qc')
  ) {
    return 'production';
  }

  if (
    haystack.includes('outlet') ||
    haystack.includes('pos') ||
    haystack.includes('cash drawer') ||
    haystack.includes('loyalty')
  ) {
    return 'outlet-pos';
  }

  if (haystack.includes('report')) {
    return 'reports';
  }

  if (
    haystack.includes('setting') ||
    haystack.includes('security') ||
    haystack.includes('backup')
  ) {
    return 'settings';
  }

  if (
    haystack.includes('branch') ||
    haystack.includes('outlet')
  ) {
    return 'branches';
  }

  if (
    haystack.includes('hr') ||
    haystack.includes('employee') ||
    haystack.includes('department') ||
    haystack.includes('designation') ||
    haystack.includes('attendance') ||
    haystack.includes('leave') ||
    haystack.includes('payroll') ||
    haystack.includes('candidate')
  ) {
    return 'hrm';
  }

  return 'other';
};
export default function Roles() {
  const [token, setToken] = useState('');
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8020';
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [activeRole, setActiveRole] = useState<Role | null>(null);
  const router = useRouter();

  // Form fields
  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<number[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState('');

  // Assignment fields
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [users, setUsers] = useState<any[]>([]);

  // Actions menu state
  const [openMenuFor, setOpenMenuFor] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Confirm modal state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmMessage, setConfirmMessage] = useState('');
  const [confirmAction, setConfirmAction] = useState<(() => Promise<void> | void) | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageModalTitle, setMessageModalTitle] = useState('');
  const [messageModalBody, setMessageModalBody] = useState('');
  const [messageModalType, setMessageModalType] = useState<'error' | 'success'>('error');

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (openMenuFor && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuFor(null);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenMenuFor(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [openMenuFor]);

  const openConfirm = (title: string, message: string, onConfirm: () => Promise<void> | void) => {
    setConfirmTitle(title);
    setConfirmMessage(message);
    setConfirmAction(onConfirm);
    setConfirmOpen(true);
  };

  const closeConfirm = () => {
    if (confirmLoading) return;
    setConfirmOpen(false);
    setConfirmTitle('');
    setConfirmMessage('');
    setConfirmAction(null);
  };

  const showModalMessage = (
    title: string,
    body: string,
    type: 'error' | 'success' = 'error'
  ) => {
    setMessageModalTitle(title);
    setMessageModalBody(body);
    setMessageModalType(type);
    setShowMessageModal(true);
  };

  const extractApiErrorMessage = (error: any, fallback: string) =>
    error?.response?.data?.message ||
    (error?.response?.data?.errors && typeof error.response.data.errors === 'object'
      ? String(Object.values(error.response.data.errors).flat()[0] || '')
      : '') ||
    error?.response?.data?.error ||
    fallback;

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
    } else {
      setToken(storedToken);
      fetchRoles(storedToken);
      fetchPermissions(storedToken);
      fetchUsers(storedToken);
    }
  }, [router]);

  const permissionSections = useMemo(() => {
    const buckets = new Map<string, Permission[]>();
    PERMISSION_SECTION_ORDER.forEach((section) => {
      buckets.set(section.key, []);
    });

    permissions
      .filter((permission) => permission.is_active !== false)
      .forEach((permission) => {
        const key = inferPermissionSection(permission);
        const existing = buckets.get(key) || [];
        existing.push(permission);
        buckets.set(key, existing);
      });

    return PERMISSION_SECTION_ORDER.map((section) => ({
      ...section,
      permissions: (buckets.get(section.key) || []).sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }, [permissions]);

  const virtualPermissions = useMemo(() => {
    let seed = 1;
    const generated: Permission[] = [];

    permissionSections.forEach((section) => {
      if (section.permissions.length > 0) return;
      const fallbackActions = SECTION_FALLBACK_ACTIONS[section.key] || [];
      fallbackActions.forEach((action) => {
        generated.push({
          id: -seed,
          name: `${section.key}_${toPermissionSlug(action)}`,
          module: section.label,
          description: action,
          is_active: true,
        });
        seed += 1;
      });
    });

    return generated;
  }, [permissionSections]);

  const virtualPermissionById = useMemo(() => {
    const map = new Map<number, Permission>();
    virtualPermissions.forEach((permission) => {
      map.set(permission.id, permission);
    });
    return map;
  }, [virtualPermissions]);

  const getSectionPermissionItems = (sectionKey: string) => {
    const section = permissionSections.find((item) => item.key === sectionKey);
    if (!section) return [] as Permission[];

    if (section.permissions.length > 0) {
      return section.permissions;
    }

    return virtualPermissions.filter((permission) => inferPermissionSection(permission) === sectionKey);
  };

  const allPermissionOptions = useMemo(
    () => permissionSections.flatMap((section) => getSectionPermissionItems(section.key)),
    [permissionSections, virtualPermissions]
  );

  const allPermissionsSelected = useMemo(
    () => allPermissionOptions.length > 0 && allPermissionOptions.every((permission) => selectedPermissions.includes(permission.id)),
    [allPermissionOptions, selectedPermissions]
  );

  const resolveSelectedPermissionIds = async () => {
    const resolvedIds = selectedPermissions.filter((id) => id > 0);
    const virtualIds = selectedPermissions.filter((id) => id < 0);
    if (virtualIds.length === 0) return Array.from(new Set(resolvedIds));

    const existingByName = new Map<string, Permission>();
    permissions.forEach((permission) => {
      existingByName.set(String(permission.name || '').toLowerCase(), permission);
    });

    const toCreate = virtualIds
      .map((id) => virtualPermissionById.get(id))
      .filter((virtual): virtual is Permission => Boolean(virtual))
      .filter((virtual) => !existingByName.has(virtual.name.toLowerCase()))
      .map((virtual) => ({
        name: virtual.name,
        description: virtual.description,
        module: virtual.module,
        is_active: true,
      }));

    if (toCreate.length > 0) {
      try {
        const bulkRes = await axios.post(
          `${API_URL}/api/permissions/bulk-upsert`,
          { permissions: toCreate },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const createdRows = Array.isArray(bulkRes.data)
          ? bulkRes.data
          : (bulkRes.data?.data || []);

        createdRows.forEach((created: any) => {
          const createdId = Number(created?.id || 0);
          const createdName = String(created?.name || '').toLowerCase();
          if (createdId > 0 && createdName) {
            resolvedIds.push(createdId);
            existingByName.set(createdName, {
              id: createdId,
              name: String(created?.name || ''),
              module: String(created?.module || ''),
              description: String(created?.description || ''),
              is_active: created?.is_active !== false,
            });
          }
        });
      } catch (error) {
        console.error('Failed to bulk-create permissions, falling back to single create.', error);

        for (const row of toCreate) {
          try {
            const createRes = await axios.post(`${API_URL}/api/permissions`, row, {
              headers: { Authorization: `Bearer ${token}` },
            });

            const created = createRes.data;
            if (created?.id) {
              resolvedIds.push(Number(created.id));
              existingByName.set(String(created?.name || row.name).toLowerCase(), {
                id: Number(created.id),
                name: String(created?.name || row.name),
                module: String(created?.module || row.module || ''),
                description: String(created?.description || row.description || ''),
                is_active: created?.is_active !== false,
              });
            }
          } catch (singleError) {
            console.error(`Failed to auto-create permission: ${row.name}`, singleError);
          }
        }
      }
    }

    for (const id of virtualIds) {
      const virtual = virtualPermissionById.get(id);
      if (!virtual) continue;

      const existing = existingByName.get(virtual.name.toLowerCase());
      if (existing?.id) {
        resolvedIds.push(existing.id);
      }
    }

    await fetchPermissions();
    return Array.from(new Set(resolvedIds));
  };

  const sectionActionsByKey = useMemo(() => {
    const prettify = (value: string) => value.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

    const extractAction = (permissionName: string, sectionKey: string) => {
      const trimmed = String(permissionName || '').trim();
      if (!trimmed) return 'Manage';

      if (trimmed.includes('.')) {
        const parts = trimmed.split('.').filter(Boolean);
        return prettify(parts.length >= 2 ? parts[1] : parts[0]);
      }

      const sectionPrefix = `${sectionKey}_`;
      if (trimmed.toLowerCase().startsWith(sectionPrefix.toLowerCase())) {
        return prettify(trimmed.slice(sectionPrefix.length));
      }

      return prettify(trimmed);
    };

    const map = new Map<string, string[]>();
    permissionSections.forEach((section) => {
      const actions = Array.from(
        new Set(section.permissions.map((permission) => extractAction(permission.name, section.key)))
      ).sort((a, b) => a.localeCompare(b));
      map.set(section.key, actions);
    });
    return map;
  }, [permissionSections]);

  const getDisplayActions = (sectionKey: string) => {
    const derived = sectionActionsByKey.get(sectionKey) || [];
    if (derived.length > 0) return derived;
    return SECTION_FALLBACK_ACTIONS[sectionKey] || [];
  };

  const toggleSectionPermissions = (sectionKey: string) => {
    const sectionPermissionIds = getSectionPermissionItems(sectionKey).map((permission) => permission.id);
    if (sectionPermissionIds.length === 0) return;
    const allSelected = sectionPermissionIds.every((id) => selectedPermissions.includes(id));

    setSelectedPermissions((prev) => {
      if (allSelected) {
        return prev.filter((id) => !sectionPermissionIds.includes(id));
      }
      return Array.from(new Set([...prev, ...sectionPermissionIds]));
    });
  };

  const toggleAllPermissions = () => {
    const allIds = allPermissionOptions.map((permission) => permission.id);
    if (allIds.length === 0) return;

    setSelectedPermissions((prev) => {
      const currentlyAllSelected = allIds.every((id) => prev.includes(id));
      if (currentlyAllSelected) {
        return prev.filter((id) => !allIds.includes(id));
      }
      return Array.from(new Set([...prev, ...allIds]));
    });
  };

  const fetchRoles = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;

    try {
      const response = await axios.get(`${API_URL}/api/roles`, {
        headers: { Authorization: `Bearer ${tokenToUse}` },
        params: { per_page: 1000 }
      });
      const rawRoles = Array.isArray(response.data) ? response.data : (response.data?.data || []);
      setRoles(
        rawRoles.map((role: any) => ({
          ...role,
          permissions: Array.isArray(role?.permissions) ? role.permissions : [],
        }))
      );
    } catch (error) {
      console.error('Error fetching roles:', error);
      // For demo purposes, set some sample data
      setRoles([
        {
          id: 1,
          name: 'Super Admin',
          description: 'Full system access with all permissions',
          permissions: [],
          is_active: true,
          created_at: '2025-01-01T00:00:00.000000Z',
          updated_at: '2025-01-01T00:00:00.000000Z'
        },
        {
          id: 2,
          name: 'HR Manager',
          description: 'Manage HR operations and employee data',
          permissions: [],
          is_active: true,
          created_at: '2025-01-01T00:00:00.000000Z',
          updated_at: '2025-01-01T00:00:00.000000Z'
        },
        {
          id: 3,
          name: 'Employee',
          description: 'Basic employee access',
          permissions: [],
          is_active: true,
          created_at: '2025-01-01T00:00:00.000000Z',
          updated_at: '2025-01-01T00:00:00.000000Z'
        }
      ]);
    }
  };

  const fetchPermissions = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;

    try {
      const response = await axios.get(`${API_URL}/api/permissions`, {
        headers: { Authorization: `Bearer ${tokenToUse}` },
        params: { per_page: 1000 }
      });
      const rawPermissions = Array.isArray(response.data) ? response.data : (response.data?.data || []);
      setPermissions(rawPermissions);
    } catch (error) {
      console.error('Error fetching permissions:', error);
      // For demo purposes, set some sample data
      setPermissions([
        { id: 1, name: 'distribution.view_customers', module: 'distribution', description: 'View distribution customers', is_active: true },
        { id: 9, name: 'accounts.view_main_account', module: 'accounts', description: 'View main account', is_active: true },
        { id: 10, name: 'accounts.manage_main_account', module: 'accounts', description: 'Manage main account transactions', is_active: true },
        { id: 11, name: 'accounts.view_petty_cash', module: 'accounts', description: 'View petty cash', is_active: true },
        { id: 12, name: 'accounts.manage_petty_cash', module: 'accounts', description: 'Manage petty cash transactions', is_active: true },
        { id: 13, name: 'accounts.view_delivery_cash', module: 'accounts', description: 'View delivery cash', is_active: true },
        { id: 14, name: 'accounts.manage_delivery_cash', module: 'accounts', description: 'Manage delivery cash transactions', is_active: true },
        { id: 15, name: 'accounts.view_transaction_book', module: 'accounts', description: 'View transaction book', is_active: true },
        { id: 2, name: 'distribution.manage_invoices', module: 'distribution', description: 'Create and manage invoices', is_active: true },
        { id: 3, name: 'hrm.view_employees', module: 'hrm', description: 'View employee records', is_active: true },
        { id: 4, name: 'hrm.manage_payroll', module: 'hrm', description: 'Manage payroll', is_active: true },
        { id: 5, name: 'purchasing.manage_po', module: 'purchasing', description: 'Manage purchase orders', is_active: true },
        { id: 6, name: 'stock.manage_inventory', module: 'stock', description: 'Manage inventory and transfers', is_active: true },
        { id: 7, name: 'vehicle-loading.manage_loads', module: 'vehicle-loading', description: 'Manage routes and loads', is_active: true },
        { id: 8, name: 'branches.manage_branches', module: 'branches', description: 'Manage branch records', is_active: true }
      ]);
    }
  };

  const fetchUsers = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;

    try {
      const response = await axios.get(`${API_URL}/api/hr/employees`, {
        headers: { Authorization: `Bearer ${tokenToUse}` },
        params: { per_page: 1000 }
      });
      const employeesData = response.data.data || response.data;
      setUsers(Array.isArray(employeesData) ? employeesData : []);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const resetForm = () => {
    setRoleName('');
    setRoleDescription('');
    setSelectedPermissions([]);
    setIsActive(true);
    setEditingRole(null);
    setFormError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFormError('');

    const resolvedPermissions = await resolveSelectedPermissionIds();

    const roleData = {
      name: roleName,
      description: roleDescription,
      permissions: resolvedPermissions,
      is_active: isActive,
    };

    try {
      if (editingRole) {
        await axios.put(`${API_URL}/api/roles/${editingRole.id}`, roleData, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } else {
        await axios.post(`${API_URL}/api/roles`, roleData, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      fetchRoles();
      setShowForm(false);
      resetForm();
    } catch (error) {
      const err: any = error;
      console.error('Error saving role:', err?.response?.status, err?.response?.data || err?.message);
      const validationErrors = err?.response?.data?.errors;
      const firstValidationError = validationErrors && typeof validationErrors === 'object'
        ? String(Object.values(validationErrors).flat()[0] || '')
        : '';
      setFormError(
        err?.response?.data?.message ||
        firstValidationError ||
        'Failed to save role. Please check the form and try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (role: Role) => {
    setFormError('');
    setEditingRole(role);
    setRoleName(role.name);
    setRoleDescription(role.description);
    setSelectedPermissions(role.permissions.map(p => p.id));
    setIsActive(role.is_active);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    await axios.delete(`${API_URL}/api/roles/${id}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });

    if (activeRole?.id === id) {
      setShowPermissionsModal(false);
      setActiveRole(null);
      setSelectedPermissions([]);
    }

    if (editingRole?.id === id) {
      setShowForm(false);
      setEditingRole(null);
      setRoleName('');
      setRoleDescription('');
      setSelectedPermissions([]);
      setIsActive(true);
    }

    await fetchRoles();
    showModalMessage('Role Deleted', 'Role and its allocated permissions were removed successfully.', 'success');
  };

  const confirmDeleteRole = (role: Role) => {
    openConfirm(
      'Delete Role',
      `Are you sure you want to delete "${role.name}"? This will remove the role from the database, unassign it from all users, and clear its allocated permissions.`,
      async () => {
        setConfirmLoading(true);
        try {
          await handleDelete(role.id);
          setConfirmLoading(false);
          closeConfirm();
        } catch (error) {
          const err: any = error;
          setConfirmLoading(false);
          closeConfirm();
          if (err?.response?.status >= 500) {
            console.error('Error deleting role:', err?.response?.status, err?.response?.data || err?.message);
          }
          showModalMessage(
            'Delete Failed',
            extractApiErrorMessage(err, 'Failed to delete role. Please try again.'),
            'error'
          );
        } finally {
          setConfirmLoading(false);
        }
      }
    );
  };

  const openPermissionsModal = (role: Role) => {
    setActiveRole(role);
    setSelectedPermissions(role.permissions.map(p => p.id));
    setShowPermissionsModal(true);
  };

  const handlePermissionToggle = (permissionId: number) => {
    setSelectedPermissions(prev =>
      prev.includes(permissionId)
        ? prev.filter(id => id !== permissionId)
        : [...prev, permissionId]
    );
  };

  const savePermissions = async () => {
    if (!activeRole) return;
    setFormError('');

    try {
      const resolvedPermissions = await resolveSelectedPermissionIds();

      await axios.put(`${API_URL}/api/roles/${activeRole.id}/permissions`, {
        permissions: resolvedPermissions
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchRoles();
      setShowPermissionsModal(false);
    } catch (error) {
      const err: any = error;
      console.error('Error saving permissions:', err?.response?.status, err?.response?.data || err?.message);
      setFormError(err?.response?.data?.message || 'Failed to save permissions.');
    }
  };

  const openAssignModal = () => {
    setSelectedUser('');
    setSelectedRole('');
    setShowAssignModal(true);
  };

  const assignRole = async () => {
    if (!selectedUser || !selectedRole) return;

    try {
      await axios.post(`${API_URL}/api/roles/assign-to-user`, {
        user_id: selectedUser,
        role_id: selectedRole
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setShowAssignModal(false);
    } catch (error) {
      console.error('Error assigning role:', error);
      // For demo purposes, simulate success
      setShowAssignModal(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-20 left-20 w-72 h-72 bg-indigo-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-purple-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-40 w-72 h-72 bg-pink-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-4000"></div>
      </div>

      {/* Navigation */}
      <nav className="relative z-10 bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center h-auto sm:h-16 py-3 gap-3">
            <div className="flex items-center justify-between sm:justify-start gap-3">
              <button
                onClick={() => router.push('/dashboard/hrm')}
                className="flex items-center space-x-2 text-gray-700 hover:text-blue-600 transition-colors duration-300"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                <span className="font-medium text-sm sm:text-base">Back to HRM</span>
              </button>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4">
              <button
                onClick={() => {
                  resetForm();
                  setShowForm(true);
                }}
                className="w-full sm:w-auto bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white px-4 py-2 rounded-lg font-medium transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
              >
                Add Role
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center text-2xl">
              🔐
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900">Roles(Designation) & Privileges</h1>
              <p className="text-sm sm:text-base md:text-lg text-gray-600">Manage user roles and access permissions</p>
            </div>
          </div>
        </div>

        {/* Roles Table */}
        <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">User Roles</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Role Name
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Permissions
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {roles.map((role) => (
                  <tr key={role.id} className="hover:bg-gray-50 transition-colors duration-200">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                      {role.name}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                      {role.description}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                        {role.permissions.length} permissions
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${
                        role.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {role.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="relative" ref={openMenuFor === role.id ? menuRef : undefined}>
                        <button
                          aria-haspopup="menu"
                          aria-expanded={openMenuFor === role.id}
                          aria-controls={`row-menu-${role.id}`}
                          onClick={() => {
                            const willOpen = openMenuFor !== role.id;
                            setOpenMenuFor(willOpen ? role.id : null);
                          }}
                          className="p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          title="More actions"
                        >
                          <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                        </button>
                        {openMenuFor === role.id && (
                          <div
                            id={`row-menu-${role.id}`}
                            role="menu"
                            tabIndex={-1}
                            className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-[99]"
                          >
                            <button role="menuitem" onClick={() => { openPermissionsModal(role); setOpenMenuFor(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-left text-gray-700 hover:bg-gray-50">
                              <span className="w-4 h-4">🔑</span>
                              <span>Manage Permissions</span>
                            </button>
                            <button role="menuitem" onClick={() => { handleEdit(role); setOpenMenuFor(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-left text-gray-700 hover:bg-gray-50">
                              <span className="w-4 h-4">✏️</span>
                              <span>Edit</span>
                            </button>
                            <div className="my-1 h-px bg-gray-200" />
                            <button role="menuitem" onClick={() => { confirmDeleteRole(role); setOpenMenuFor(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50">
                              <span className="w-4 h-4">🗑️</span>
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Role Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-indigo-500 to-purple-500 p-6 rounded-t-2xl">
              <h3 className="text-xl font-bold text-white">
                {editingRole ? 'Edit Role' : 'Add New Role'}
              </h3>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {formError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {formError}
                </div>
              ) : null}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Role Name *
                  </label>
                  <input
                    type="text"
                    value={roleName}
                    onChange={(e) => setRoleName(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 text-gray-900 placeholder-gray-500"
                    required
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={roleDescription}
                    onChange={(e) => setRoleDescription(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 text-gray-900 placeholder-gray-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2 mb-3">
                    Permissions
                  </label>
                  <div className="flex justify-end mb-3">
                    <button
                      type="button"
                      onClick={toggleAllPermissions}
                      className="px-3 py-1.5 text-xs rounded-md border border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                    >
                      {allPermissionsSelected ? 'Clear All' : 'Select All'}
                    </button>
                  </div>
                  <div className="space-y-4 max-h-72 overflow-y-auto border border-gray-200 rounded-xl p-4 bg-gray-50">
                    {permissionSections.map((section) => {
                      const sectionItems = getSectionPermissionItems(section.key);
                      const sectionPermissionIds = sectionItems.map((permission) => permission.id);
                      const allSelected = sectionPermissionIds.length > 0 && sectionPermissionIds.every((id) => selectedPermissions.includes(id));

                      return (
                        <div key={section.key} className="rounded-xl border border-gray-200 bg-white p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="text-sm font-semibold text-gray-900">{section.label}</p>
                              <p className="text-xs text-gray-500">{sectionItems.length} permission(s)</p>
                              {getDisplayActions(section.key).length ? (
                                <p className="text-[11px] text-gray-500 mt-0.5">
                                  Actions: {getDisplayActions(section.key).join(', ')}
                                </p>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleSectionPermissions(section.key)}
                              className="px-2.5 py-1 text-xs rounded-md border border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                            >
                              {allSelected ? 'Clear' : 'Select All'}
                            </button>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {sectionItems.map((permission) => (
                              <label key={permission.id} className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-50 transition-colors duration-200">
                                <input
                                  type="checkbox"
                                  checked={selectedPermissions.includes(permission.id)}
                                  onChange={() => handlePermissionToggle(permission.id)}
                                  className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900">{permission.name || permission.description}</p>
                                  <p className="text-xs text-gray-600">
                                    {permission.id < 0 ? 'Will be created when saved' : permission.description}
                                  </p>
                                </div>
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}

                    {permissionSections.every((section) => section.permissions.length === 0) && (
                      <p className="text-sm text-gray-500">No active permissions found.</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-4">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Active</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-4 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    resetForm();
                  }}
                  className="bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white px-6 py-3 rounded-xl font-medium transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white px-6 py-3 rounded-xl font-medium transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                >
                  {loading ? (
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Saving...</span>
                    </div>
                  ) : (
                    <span>{editingRole ? 'Update Role' : 'Create Role'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Permissions Modal */}
      {showPermissionsModal && activeRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowPermissionsModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center text-white text-lg">
                  🔑
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Manage Permissions</h3>
                  <p className="text-sm text-gray-600">Configure permissions for "{activeRole.name}"</p>
                </div>
              </div>
              <button onClick={() => setShowPermissionsModal(false)} className="absolute top-4 right-4 bg-gradient-to-r from-red-500 to-red-600 text-white p-2 rounded-full shadow-lg hover:shadow-xl transform hover:scale-110 transition-all duration-200 hover:from-red-600 hover:to-red-700">✕</button>
            </div>

            <div className="space-y-6">
              <div className="space-y-4">
                {permissionSections.map((section) => {
                  const sectionItems = getSectionPermissionItems(section.key);
                  const sectionPermissionIds = sectionItems.map((permission) => permission.id);
                  const allSelected = sectionPermissionIds.length > 0 && sectionPermissionIds.every((id) => selectedPermissions.includes(id));

                  return (
                    <div key={section.key} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h4 className="text-sm font-semibold text-gray-900">{section.label}</h4>
                          <p className="text-xs text-gray-500">{sectionItems.length} permission(s)</p>
                          {getDisplayActions(section.key).length ? (
                            <p className="text-[11px] text-gray-500 mt-0.5">
                              Actions: {getDisplayActions(section.key).join(', ')}
                            </p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleSectionPermissions(section.key)}
                          className="px-3 py-1 text-xs rounded-md border border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                        >
                          {allSelected ? 'Clear Section' : 'Select Section'}
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {sectionItems.map((permission) => (
                          <div key={permission.id} className="flex items-center justify-between p-3 border border-gray-200 bg-white rounded-lg hover:border-indigo-300 transition-colors duration-200">
                            <div className="flex-1">
                              <h5 className="text-sm font-medium text-gray-900">{permission.name || permission.description}</h5>
                              <p className="text-xs text-gray-600">
                                {permission.id < 0 ? 'Will be created when saved' : permission.description}
                              </p>
                            </div>
                            <label className="flex items-center">
                              <input
                                type="checkbox"
                                checked={selectedPermissions.includes(permission.id)}
                                onChange={() => handlePermissionToggle(permission.id)}
                                className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                              />
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {permissionSections.every((section) => section.permissions.length === 0) && (
                  <p className="text-sm text-gray-500">No active permissions found.</p>
                )}
              </div>

              <div className="flex justify-end space-x-4 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowPermissionsModal(false)}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors duration-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={savePermissions}
                  className="bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white px-6 py-2 rounded-lg font-medium transition-all duration-300 transform hover:scale-105"
                >
                  Save Permissions
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assign Role Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowAssignModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl flex items-center justify-center text-white text-lg">
                  👤
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Assign Role</h3>
                  <p className="text-sm text-gray-600">Assign a role to a user</p>
                </div>
              </div>
              <button onClick={() => setShowAssignModal(false)} className="absolute top-4 right-4 bg-gradient-to-r from-red-500 to-red-600 text-white p-2 rounded-full shadow-lg hover:shadow-xl transform hover:scale-110 transition-all duration-200 hover:from-red-600 hover:to-red-700">✕</button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select User
                </label>
                <select
                  value={selectedUser}
                  onChange={(e) => setSelectedUser(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-colors duration-200 text-gray-900"
                >
                  <option value="">Choose a user</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.first_name} {user.last_name} ({user.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Role
                </label>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-colors duration-200 text-gray-900"
                >
                  <option value="">Choose a role</option>
                  {roles.filter(role => role.is_active).map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end space-x-4 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors duration-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={assignRole}
                  disabled={!selectedUser || !selectedRole}
                  className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white px-6 py-2 rounded-lg font-medium transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Assign Role
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeConfirm} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">{confirmTitle || 'Confirm'}</h3>
              <button onClick={closeConfirm} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            <div className="text-gray-700 mb-6">{confirmMessage || 'Are you sure?'}</div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={closeConfirm}
                disabled={confirmLoading}
                className="px-5 py-2 rounded-xl bg-gray-200 text-gray-800 hover:bg-gray-300 transition disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={async () => { if (confirmAction) await confirmAction(); }}
                disabled={confirmLoading}
                className="px-5 py-2 rounded-xl bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-60"
              >
                {confirmLoading ? 'Deleting...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showMessageModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200">
            <div
              className={`px-5 py-4 ${
                messageModalType === 'error'
                  ? 'bg-gradient-to-r from-red-500 to-pink-500'
                  : 'bg-gradient-to-r from-emerald-500 to-cyan-500'
              }`}
            >
              <h4 className="text-white font-semibold">{messageModalTitle}</h4>
            </div>
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
    </div>
  );
}