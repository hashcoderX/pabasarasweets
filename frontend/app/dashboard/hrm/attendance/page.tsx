'use client';

import PageSkeleton from '@/app/components/PageSkeleton';
import { Fragment, useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import axios from '@/lib/http';

interface Employee {
  id: number;
  employee_code: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  mobile?: string;
  branch?: { id: number; name: string };
  department?: { id: number; name: string };
  designation?: { id: number; name: string };
}

interface AttendanceRecord {
  id: number;
  employee_id: number;
  date: string;
  in_time: string | null;
  out_time: string | null;
  status: 'present' | 'absent' | 'late' | 'half_day';
  work_hours: number | null;
  notes: string | null;
  employee: Employee;
}

interface AttendanceDeviceSettings {
  device_name: string;
  communication_type: string;
  communication_password: string;
  dhcp_enabled: boolean;
  device_ip: string;
  device_port: number;
  subnet_mask: string;
  gateway: string;
  dns: string;
  real_time_push_enabled: boolean;
  server_host: string;
  server_port: string;
  p2p_service_enabled: boolean;
  is_active: boolean;
  listener_port: string;
  listener_allow_any_ip: boolean;
  device_timezone: string;
  sample_events_json: string;
}

interface DeviceListenerStatus {
  listener: {
    online: boolean;
    port: number;
    started_at: string | null;
    heartbeat_at: string | null;
    last_packet_at: string | null;
    server_ips: string[];
  };
  today: { date: string; marked_in: number; marked_out: number; unmatched: number; ignored: number };
  unmatched_total: number;
  unparsed_packets: number;
}

interface BiometricPunchLogRow {
  id: number;
  device_user_id: string;
  employee_code: string | null;
  employee_name: string | null;
  punch_time: string;
  direction: string;
  source: string;
  source_ip: string | null;
  result: string;
  message: string | null;
}

interface BiometricPacketRow {
  id: number;
  source_ip: string | null;
  protocol: string;
  bytes: number;
  payload_hex: string | null;
  payload_text: string | null;
  status: string;
  events_count: number;
  message: string | null;
  created_at: string;
}

const PUNCH_RESULT_STYLES: Record<string, string> = {
  marked_in: 'bg-green-100 text-green-800',
  marked_out: 'bg-blue-100 text-blue-800',
  ignored: 'bg-gray-100 text-gray-700',
  duplicate: 'bg-gray-100 text-gray-700',
  unmatched: 'bg-amber-100 text-amber-800',
  error: 'bg-red-100 text-red-700',
};

const PACKET_STATUS_STYLES: Record<string, string> = {
  parsed: 'bg-green-100 text-green-800',
  unparsed: 'bg-amber-100 text-amber-800',
  rejected: 'bg-red-100 text-red-700',
  error: 'bg-red-100 text-red-700',
  ignored: 'bg-gray-100 text-gray-700',
};

const formatDeviceTime = (value: string | null | undefined) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

type WidgetVisibilityChange = {
  widget_key: string;
  is_visible: boolean;
};

type SuperAdminModalMode = 'apply' | 'restore' | 'unlock';

export default function AttendancePage() {
  type NoticeTone = 'success' | 'error' | 'info';
  const todayDate = new Date().toISOString().split('T')[0];

  const [token, setToken] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'mark' | 'upload' | 'device' | 'history'>('mark');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [deviceSyncResult, setDeviceSyncResult] = useState<any>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceRecord[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [todayAttendance, setTodayAttendance] = useState<{[key: number]: AttendanceRecord}>({});
  const [selectedAttendanceDate, setSelectedAttendanceDate] = useState(todayDate);
  const [showMarkModal, setShowMarkModal] = useState(false);
  const [markingEmployee, setMarkingEmployee] = useState<Employee | null>(null);
  const [markStatus, setMarkStatus] = useState<'present' | 'absent' | 'late' | 'half_day'>('present');
  const [markInTime, setMarkInTime] = useState('');
  const [markNotes, setMarkNotes] = useState('');
  const [showMarkOutModal, setShowMarkOutModal] = useState(false);
  const [markingOutAttendance, setMarkingOutAttendance] = useState<AttendanceRecord | null>(null);
  const [markOutTimeInput, setMarkOutTimeInput] = useState('');
  const [markOutNotes, setMarkOutNotes] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingAttendance, setEditingAttendance] = useState<AttendanceRecord | null>(null);
  const [editStatus, setEditStatus] = useState<'present' | 'absent' | 'late' | 'half_day'>('present');
  const [editInTime, setEditInTime] = useState('');
  const [editOutTime, setEditOutTime] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [noticeModal, setNoticeModal] = useState<{ title: string; message: string; tone: NoticeTone } | null>(null);
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
  const [deviceSettingsLoading, setDeviceSettingsLoading] = useState(false);
  const [deviceSaveLoading, setDeviceSaveLoading] = useState(false);
  const [deviceTestLoading, setDeviceTestLoading] = useState(false);
  const [deviceSyncLoading, setDeviceSyncLoading] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState<DeviceListenerStatus | null>(null);
  const [punchLogs, setPunchLogs] = useState<BiometricPunchLogRow[]>([]);
  const [devicePackets, setDevicePackets] = useState<BiometricPacketRow[]>([]);
  const [showPackets, setShowPackets] = useState(false);
  const [expandedPacketId, setExpandedPacketId] = useState<number | null>(null);
  const [testPunchUserId, setTestPunchUserId] = useState('');
  const [testPunchTime, setTestPunchTime] = useState('');
  const [testPunchDirection, setTestPunchDirection] = useState<'auto' | 'in' | 'out'>('auto');
  const [testPunchLoading, setTestPunchLoading] = useState(false);
  const [testPacketPayload, setTestPacketPayload] = useState('');
  const [testPacketIsHex, setTestPacketIsHex] = useState(false);
  const [testPacketLoading, setTestPacketLoading] = useState(false);
  const [reprocessLoading, setReprocessLoading] = useState(false);
  const [deviceSettings, setDeviceSettings] = useState<AttendanceDeviceSettings>({
    device_name: 'Realand A-L355',
    communication_type: 'CS',
    communication_password: '00000000',
    dhcp_enabled: true,
    device_ip: '172.20.10.2',
    device_port: 5500,
    subnet_mask: '255.255.255.240',
    gateway: '172.20.10.1',
    dns: '0.0.0.0',
    real_time_push_enabled: false,
    server_host: 's0.weixinac.com',
    server_port: '5055',
    p2p_service_enabled: true,
    is_active: true,
    listener_port: '5055',
    listener_allow_any_ip: false,
    device_timezone: 'Asia/Colombo',
    sample_events_json: JSON.stringify(
      [
        { employee_code: 'EMP001', punch_time: `${todayDate} 08:03:10`, direction: 'in', device_id: 'Realand-A-L355' },
        { employee_code: 'EMP001', punch_time: `${todayDate} 17:21:44`, direction: 'out', device_id: 'Realand-A-L355' },
      ],
      null,
      2
    ),
  });
  const router = useRouter();

  const openNoticeModal = (tone: NoticeTone, title: string, message: string) => {
    setNoticeModal({ tone, title, message });
  };

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
    } else {
      setToken(storedToken);
      fetchEmployees(storedToken);
      fetchWidgetVisibility(storedToken);
      fetchDeviceSettings(storedToken);
    }
  }, [router]);

  useEffect(() => {
    if (!token) return;
    fetchTodayAttendance(token, selectedAttendanceDate);
  }, [token, selectedAttendanceDate]);

  useEffect(() => {
    if (!token || activeTab !== 'device') return;
    fetchDeviceLive(token);
    const timer = window.setInterval(() => fetchDeviceLive(token), 5000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, activeTab, selectedAttendanceDate]);

  const fetchEmployees = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;
    try {
      const response = await axios.get('/api/hr/employees', {
        headers: { Authorization: `Bearer ${tokenToUse}` },
      });
      const rows = Array.isArray(response.data)
        ? response.data
        : Array.isArray(response.data?.data)
          ? response.data.data
          : [];

      setEmployees(rows);
    } catch (error) {
      console.error('Error fetching employees:', error);
      setEmployees([]);
    }
  };

  const fetchWidgetVisibility = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;
    try {
      const response = await axios.get('/api/dashboard/widgets/me', {
        headers: { Authorization: `Bearer ${tokenToUse}` },
      });
      const widgetMap = response.data?.data?.widgets || {};
      const controlsLocked = Boolean(response.data?.data?.widget_controls_locked);
      setWidgetVisibility(widgetMap);
      setWidgetControlsLocked(controlsLocked);
    } catch (error) {
      console.error('Error fetching attendance widget visibility:', error);
      setWidgetVisibility({});
      setWidgetControlsLocked(false);
    }
  };

  const fetchDeviceSettings = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;
    try {
      setDeviceSettingsLoading(true);
      const response = await axios.get('/api/hr/attendance/device-settings', {
        headers: { Authorization: `Bearer ${tokenToUse}` },
      });
      const settings = response.data?.data;
      if (!settings) return;

      setDeviceSettings((prev) => ({
        ...prev,
        device_name: settings.device_name || prev.device_name,
        communication_type: settings.communication_type || prev.communication_type,
        communication_password: settings.communication_password || prev.communication_password,
        dhcp_enabled: Boolean(settings.dhcp_enabled),
        device_ip: settings.device_ip || '',
        device_port: Number(settings.device_port || prev.device_port),
        subnet_mask: settings.subnet_mask || '',
        gateway: settings.gateway || '',
        dns: settings.dns || '',
        real_time_push_enabled: Boolean(settings.real_time_push_enabled),
        server_host: settings.server_host || '',
        server_port: settings.server_port ? String(settings.server_port) : '',
        p2p_service_enabled: Boolean(settings.p2p_service_enabled),
        is_active: settings.is_active !== false,
        listener_port: settings.listener_port ? String(settings.listener_port) : prev.listener_port,
        listener_allow_any_ip: Boolean(settings.listener_allow_any_ip),
        device_timezone: settings.device_timezone || prev.device_timezone,
      }));
    } catch (error) {
      console.error('Error fetching attendance device settings:', error);
    } finally {
      setDeviceSettingsLoading(false);
    }
  };

  const saveDeviceSettings = async () => {
    if (!token) return;
    try {
      setDeviceSaveLoading(true);
      const payload = {
        device_name: deviceSettings.device_name,
        communication_type: deviceSettings.communication_type,
        communication_password: deviceSettings.communication_password || null,
        dhcp_enabled: deviceSettings.dhcp_enabled,
        device_ip: deviceSettings.device_ip || null,
        device_port: Number(deviceSettings.device_port || 5500),
        subnet_mask: deviceSettings.subnet_mask || null,
        gateway: deviceSettings.gateway || null,
        dns: deviceSettings.dns || null,
        real_time_push_enabled: deviceSettings.real_time_push_enabled,
        server_host: deviceSettings.server_host || null,
        server_port: deviceSettings.server_port ? Number(deviceSettings.server_port) : null,
        p2p_service_enabled: deviceSettings.p2p_service_enabled,
        is_active: deviceSettings.is_active,
        listener_port: deviceSettings.listener_port ? Number(deviceSettings.listener_port) : 5055,
        listener_allow_any_ip: deviceSettings.listener_allow_any_ip,
        device_timezone: deviceSettings.device_timezone || 'Asia/Colombo',
      };

      await axios.put('/api/hr/attendance/device-settings', payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      openNoticeModal('success', 'Device Settings Saved', 'Fingerprint device configuration has been saved.');
      fetchDeviceSettings();
    } catch (error: any) {
      console.error('Error saving attendance device settings:', error);
      openNoticeModal(
        'error',
        'Save Failed',
        error?.response?.data?.message || 'Failed to save attendance device settings.'
      );
    } finally {
      setDeviceSaveLoading(false);
    }
  };

  const testDeviceConnection = async () => {
    if (!token) return;
    try {
      setDeviceTestLoading(true);
      const response = await axios.post(
        '/api/hr/attendance/device-settings/test',
        {
          device_ip: deviceSettings.device_ip || null,
          device_port: Number(deviceSettings.device_port || 5500),
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          validateStatus: () => true,
        }
      );

      if (response.status >= 200 && response.status < 300 && response.data?.ok !== false) {
        openNoticeModal('success', 'Connection Test', response.data?.message || 'Device is reachable.');
      } else {
        openNoticeModal(
          'error',
          'Connection Test Failed',
          response.data?.message || 'Unable to reach the fingerprint device.'
        );
      }
      fetchDeviceSettings();
    } catch (error: any) {
      const statusCode = Number(error?.response?.status || 0);
      if (!statusCode || statusCode >= 500) {
        console.error('Error testing attendance device connection:', error);
      }
      openNoticeModal(
        'error',
        'Connection Test Failed',
        error?.response?.data?.message || 'Unable to reach the fingerprint device.'
      );
      fetchDeviceSettings();
    } finally {
      setDeviceTestLoading(false);
    }
  };

  const syncDeviceEvents = async () => {
    if (!token) return;

    let parsedEvents: any[] = [];
    try {
      const parsed = JSON.parse(deviceSettings.sample_events_json || '[]');
      parsedEvents = Array.isArray(parsed) ? parsed : [];
      if (!parsedEvents.length) {
        openNoticeModal('info', 'No Events', 'Please add at least one attendance event in JSON format.');
        return;
      }
    } catch (error) {
      openNoticeModal('error', 'Invalid JSON', 'Events JSON is invalid. Please correct and try again.');
      return;
    }

    try {
      setDeviceSyncLoading(true);
      const response = await axios.post(
        '/api/hr/attendance/device-events',
        { events: parsedEvents },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setDeviceSyncResult(response.data);
      openNoticeModal('success', 'Device Sync Completed', response.data?.message || 'Device events processed.');
      fetchTodayAttendance();
    } catch (error: any) {
      console.error('Error syncing attendance device events:', error);
      openNoticeModal(
        'error',
        'Device Sync Failed',
        error?.response?.data?.message || 'Failed to process biometric events.'
      );
    } finally {
      setDeviceSyncLoading(false);
    }
  };

  const lastMarkedPunchIdRef = useRef<number | null>(null);

  const fetchDeviceLive = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;
    const headers = { Authorization: `Bearer ${tokenToUse}` };
    try {
      const [statusRes, logsRes, packetsRes] = await Promise.all([
        axios.get('/api/hr/attendance/device-status', { headers }),
        axios.get('/api/hr/attendance/device-punch-logs', { headers, params: { limit: 50 } }),
        axios.get('/api/hr/attendance/device-packets', { headers, params: { limit: 30 } }),
      ]);
      setDeviceStatus(statusRes.data || null);
      const logs: BiometricPunchLogRow[] = logsRes.data?.data || [];
      setPunchLogs(logs);
      setDevicePackets(packetsRes.data?.data || []);

      // Refresh the attendance table as soon as a new IN/OUT arrives from the machine.
      const newestMarked = logs.find((log) => log.result === 'marked_in' || log.result === 'marked_out');
      if (newestMarked) {
        if (lastMarkedPunchIdRef.current !== null && newestMarked.id !== lastMarkedPunchIdRef.current) {
          fetchTodayAttendance(tokenToUse, selectedAttendanceDate);
        }
        lastMarkedPunchIdRef.current = newestMarked.id;
      }
    } catch (error) {
      console.error('Error fetching device live data:', error);
    }
  };

  const sendTestPunch = async () => {
    if (!token) return;
    if (!testPunchUserId.trim()) {
      openNoticeModal('info', 'Device User Required', 'Enter the device user ID (or employee code) to test.');
      return;
    }
    try {
      setTestPunchLoading(true);
      const response = await axios.post(
        '/api/hr/attendance/device-test/punch',
        {
          device_user_id: testPunchUserId.trim(),
          punch_time: testPunchTime ? testPunchTime.replace('T', ' ') + (testPunchTime.length === 16 ? ':00' : '') : null,
          direction: testPunchDirection,
        },
        { headers: { Authorization: `Bearer ${token}` }, validateStatus: () => true }
      );
      const ok = response.status >= 200 && response.status < 300;
      openNoticeModal(
        response.data?.ok ? 'success' : ok ? 'info' : 'error',
        response.data?.ok ? 'Punch Marked' : 'Punch Not Marked',
        response.data?.message || 'Test punch processed.'
      );
      fetchDeviceLive();
      fetchTodayAttendance(token, selectedAttendanceDate);
    } catch (error: any) {
      openNoticeModal('error', 'Test Punch Failed', error?.response?.data?.message || 'Failed to send test punch.');
    } finally {
      setTestPunchLoading(false);
    }
  };

  const sendTestPacket = async () => {
    if (!token) return;
    if (!testPacketPayload.trim()) {
      openNoticeModal('info', 'Payload Required', 'Paste the raw data the device sends.');
      return;
    }
    try {
      setTestPacketLoading(true);
      const response = await axios.post(
        '/api/hr/attendance/device-test/packet',
        { payload: testPacketPayload, is_hex: testPacketIsHex },
        { headers: { Authorization: `Bearer ${token}` }, validateStatus: () => true }
      );
      const ok = response.status >= 200 && response.status < 300;
      openNoticeModal(
        ok ? 'success' : 'error',
        ok ? `Payload Processed (${response.data?.events ?? 0} punch)` : 'Payload Not Recognised',
        response.data?.message || 'Payload processed.'
      );
      fetchDeviceLive();
      fetchTodayAttendance(token, selectedAttendanceDate);
    } catch (error: any) {
      openNoticeModal('error', 'Test Failed', error?.response?.data?.message || 'Failed to process payload.');
    } finally {
      setTestPacketLoading(false);
    }
  };

  const reprocessUnmatched = async () => {
    if (!token) return;
    try {
      setReprocessLoading(true);
      const response = await axios.post(
        '/api/hr/attendance/device-punch-logs/reprocess',
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      openNoticeModal('success', 'Unmatched Punches Reprocessed', response.data?.message || 'Done.');
      fetchDeviceLive();
      fetchTodayAttendance(token, selectedAttendanceDate);
    } catch (error: any) {
      openNoticeModal('error', 'Reprocess Failed', error?.response?.data?.message || 'Failed to reprocess punches.');
    } finally {
      setReprocessLoading(false);
    }
  };

  const fetchTodayAttendance = async (authToken?: string, targetDate?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;
    try {
      const dateToLoad = targetDate || selectedAttendanceDate;
      const response = await axios.get(`/api/hr/attendance?date=${dateToLoad}&per_page=1000`, {
        headers: { Authorization: `Bearer ${tokenToUse}` },
      });
      const attendanceMap: {[key: number]: AttendanceRecord} = {};
      const rows: AttendanceRecord[] = Array.isArray(response.data?.data)
        ? response.data.data
        : Array.isArray(response.data)
          ? response.data
          : [];

      rows.forEach((record: AttendanceRecord) => {
        attendanceMap[record.employee_id] = record;
      });
      setTodayAttendance(attendanceMap);
    } catch (error) {
      console.error('Error fetching today\'s attendance:', error);
    }
  };

  const markAttendance = async (
    employeeId: number,
    status: 'present' | 'absent' | 'late' | 'half_day',
    attendanceDate: string,
    inTime?: string,
    outTime?: string,
    notes?: string
  ) => {
    if (!token) return;
    setLoading(true);
    try {
      const payload: any = { 
        employee_id: employeeId, 
        status,
        date: attendanceDate,
      };
      
      if (inTime) payload.in_time = inTime;
      if (outTime) payload.out_time = outTime;
      if (notes) payload.notes = notes;

      await axios.post(
        '/api/hr/attendance/mark',
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      openNoticeModal('success', 'Attendance Marked', `Marked ${status} successfully.`);
      // Refresh attendance data for selected date
      fetchTodayAttendance();
      // Close modal if open
      setShowMarkModal(false);
      resetMarkForm();
    } catch (error: any) {
      console.error('Error marking attendance:', error);
      
      let errorMessage = 'Failed to mark attendance.';
      
      if (error.response?.status === 409) {
        errorMessage = error.response.data?.message || 'Attendance already marked for this employee today.';
      } else if (error.response?.status === 422) {
        errorMessage = 'Validation error: ' + (error.response.data?.errors ? Object.values(error.response.data.errors).flat().join(', ') : error.response.data?.message);
      } else if (error.response?.status === 500) {
        errorMessage = 'Server error: ' + (error.response.data?.message || 'Internal server error');
      } else {
        errorMessage = error.response?.data?.message || error.response?.data?.error || errorMessage;
      }
      
      openNoticeModal('error', 'Attendance Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const openMarkModal = (employee: Employee, status: 'present' | 'absent' | 'late' | 'half_day' = 'present') => {
    setMarkingEmployee(employee);
    setMarkStatus(status);
    setShowMarkModal(true);
  };

  const resetMarkForm = () => {
    setMarkingEmployee(null);
    setMarkStatus('present');
    setMarkInTime('');
    setMarkNotes('');
  };

  const handleMarkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!markingEmployee) return;
    markAttendance(
      markingEmployee.id,
      markStatus,
      selectedAttendanceDate,
      markInTime || undefined,
      undefined,
      markNotes || undefined
    );
  };

  const openMarkOutModal = (attendance: AttendanceRecord) => {
    setMarkingOutAttendance(attendance);
    setMarkOutTimeInput('');
    setMarkOutNotes('');
    setShowMarkOutModal(true);
  };

  const normalizeTimeForInput = (raw: string | null) => {
    if (!raw) return '';
    const value = String(raw).trim();
    if (!value) return '';
    if (value.length >= 5 && value.includes(':')) {
      return value.slice(0, 5);
    }
    return value;
  };

  const openEditModal = (attendance: AttendanceRecord) => {
    setEditingAttendance(attendance);
    setEditStatus(attendance.status);
    setEditInTime(normalizeTimeForInput(attendance.in_time));
    setEditOutTime(normalizeTimeForInput(attendance.out_time));
    setEditNotes(attendance.notes || '');
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAttendance || !token) return;

    if (editOutTime && !editInTime) {
      openNoticeModal('error', 'Edit Error', 'Please set in time before out time.');
      return;
    }

    setLoading(true);
    try {
      await axios.put(
        `/api/hr/attendance/${editingAttendance.id}`,
        {
          status: editStatus,
          in_time: editInTime || null,
          out_time: editOutTime || null,
          notes: editNotes || null,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      openNoticeModal('success', 'Attendance Updated', 'Attendance record updated successfully.');
      setShowEditModal(false);
      setEditingAttendance(null);
      fetchTodayAttendance();

      if (selectedEmployee && activeTab === 'history') {
        fetchAttendanceHistory();
      }
    } catch (error: any) {
      console.error('Error updating attendance:', error);
      const message =
        error?.response?.data?.message ||
        (error?.response?.data?.errors
          ? Object.values(error.response.data.errors).flat().join(', ')
          : 'Failed to update attendance.');
      openNoticeModal('error', 'Update Failed', String(message));
    } finally {
      setLoading(false);
    }
  };

  const markOut = async (attendanceId: number, outTime: string, notes?: string) => {
    if (!token) return;
    setLoading(true);
    try {
      const payload: any = { 
        employee_id: markingOutAttendance?.employee_id,
        out_time: outTime,
        date: markingOutAttendance?.date
          ? String(markingOutAttendance.date).split('T')[0]
          : new Date().toISOString().split('T')[0]
      };
      
      if (notes) payload.notes = notes;

      await axios.post(
        '/api/hr/attendance/mark-out',
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      openNoticeModal('success', 'Marked Out', 'Marked out successfully.');
      // Refresh today's attendance data
      fetchTodayAttendance();
      setShowMarkOutModal(false);
    } catch (error: any) {
      console.error('Error marking out:', error);
      if (error.response?.status === 409) {
        openNoticeModal('error', 'Mark Out Error', error.response.data.message || 'Attendance is already marked out.');
      } else if (error.response?.status === 404) {
        openNoticeModal('error', 'Mark Out Error', error.response.data.message || 'Attendance record not found.');
      } else {
        openNoticeModal('error', 'Mark Out Error', 'Failed to mark out.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleMarkOutSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!markingOutAttendance || !markOutTimeInput) return;
    markOut(markingOutAttendance.id, markOutTimeInput, markOutNotes || undefined);
  };

  const handleCsvUpload = async () => {
    if (!csvFile) {
      openNoticeModal('info', 'CSV Required', 'Please select a CSV file first.');
      return;
    }
    setLoading(true);
    const formData = new FormData();
    formData.append('csv_file', csvFile);

    try {
      const response = await axios.post(
        '/api/hr/attendance/upload-csv',
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
        }
      );
      setUploadResult(response.data);
      openNoticeModal(
        'success',
        'Upload Completed',
        `Upload processed. Created ${response.data.created_records || 0}, Updated ${response.data.updated_records || 0}.`
      );
      fetchTodayAttendance();
    } catch (error: any) {
      console.error('Error uploading CSV:', error);
      openNoticeModal('error', 'Upload Failed', 'Failed to upload CSV: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const fetchAttendanceHistory = async () => {
    if (!selectedEmployee) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);

      const response = await axios.get(
        `/api/hr/attendance/employee/${selectedEmployee.id}?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setAttendanceHistory(response.data.attendance);
    } catch (error) {
      console.error('Error fetching attendance history:', error);
      openNoticeModal('error', 'History Error', 'Failed to fetch attendance history.');
    } finally {
      setLoading(false);
    }
  };

  const filteredEmployees = employees.filter(e => {
    const term = search.toLowerCase();
    return (
      e.first_name.toLowerCase().includes(term) ||
      e.last_name.toLowerCase().includes(term) ||
      e.email.toLowerCase().includes(term) ||
      e.employee_code.toLowerCase().includes(term)
    );
  });

  const attendanceWidgetItems = [
    { id: 'hrm-attendance-nav-back-button', name: 'Attendance Back Button' },
    { id: 'hrm-attendance-header', name: 'Attendance Header' },
    { id: 'hrm-attendance-heading-title', name: 'Attendance Title Heading' },
    { id: 'hrm-attendance-heading-subtitle', name: 'Attendance Subtitle Heading' },
    { id: 'hrm-attendance-tabs', name: 'Attendance Tabs' },
    { id: 'hrm-attendance-tab-button-mark', name: 'Attendance Tab Button: Quick Mark' },
    { id: 'hrm-attendance-tab-button-upload', name: 'Attendance Tab Button: CSV Upload' },
    { id: 'hrm-attendance-tab-button-device', name: 'Attendance Tab Button: Device Sync' },
    { id: 'hrm-attendance-tab-button-history', name: 'Attendance Tab Button: View History' },
    { id: 'hrm-attendance-mark-pane', name: 'Attendance Tab Pane: Quick Mark' },
    { id: 'hrm-attendance-mark-controls', name: 'Quick Mark Controls' },
    { id: 'hrm-attendance-mark-table', name: 'Quick Mark Employee Table' },
    { id: 'hrm-attendance-mark-action-buttons', name: 'Quick Mark Action Buttons' },
    { id: 'hrm-attendance-upload-pane', name: 'Attendance Tab Pane: Upload' },
    { id: 'hrm-attendance-upload-panel', name: 'Attendance CSV Upload Panel' },
    { id: 'hrm-attendance-upload-heading', name: 'Attendance Upload Heading' },
    { id: 'hrm-attendance-upload-action-buttons', name: 'Attendance Upload Buttons' },
    { id: 'hrm-attendance-device-pane', name: 'Attendance Tab Pane: Device Sync' },
    { id: 'hrm-attendance-device-panel', name: 'Attendance Device Sync Panel' },
    { id: 'hrm-attendance-history-pane', name: 'Attendance Tab Pane: History' },
    { id: 'hrm-attendance-history-panel', name: 'Attendance History Panel' },
    { id: 'hrm-attendance-history-heading', name: 'Attendance History Heading' },
    { id: 'hrm-attendance-history-action-buttons', name: 'Attendance History Buttons' },
  ];
  const isWidgetVisible = (widgetKey: string) => widgetVisibility[widgetKey] !== false;
  const hiddenWidgetCount = attendanceWidgetItems.filter((item) => widgetVisibility[item.id] === false).length;

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
      openNoticeModal('info', 'Super Admin Required', 'Please enter Super Admin email and password.');
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
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }

      setWidgetControlsLocked(true);
      setShowSuperAdminConfirmModal(false);
      setPendingWidgetChanges([]);
      setWidgetVisibilitySnapshot(null);
      setSuperAdminEmail('');
      setSuperAdminPassword('');
    } catch (error) {
      console.error('Error applying attendance widget changes:', error);
      openNoticeModal('error', 'Widget Update Failed', 'Super Admin confirmation failed or widget update failed.');
    } finally {
      setSuperAdminConfirmLoading(false);
    }
  };

  const restoreAllHiddenWidgetsStaged = () => {
    if (widgetControlsLocked) return;
    const hiddenKeys = attendanceWidgetItems
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
    const hiddenKeys = attendanceWidgetItems
      .map((item) => item.id)
      .filter((key) => widgetVisibility[key] === false);
    if (!hiddenKeys.length) {
      openNoticeModal('info', 'Nothing to Restore', 'All widgets are already visible.');
      return;
    }
    openSuperAdminConfirmation(
      hiddenKeys.map((key) => ({ widget_key: key, is_visible: true })),
      'restore'
    );
  };

  const showRestoreWidgetList = () => {
    if (!superAdminEmail.trim() || !superAdminPassword) {
      openNoticeModal('info', 'Super Admin Required', 'Please enter Super Admin email and password.');
      return;
    }
    setRestoreWidgetListVisible(true);
  };

  const restoreHiddenWidgetOneByOne = async (widgetKey: string) => {
    if (!superAdminEmail.trim() || !superAdminPassword) {
      openNoticeModal('info', 'Super Admin Required', 'Please enter Super Admin email and password.');
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
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setWidgetVisibility((prev) => ({ ...prev, [widgetKey]: true }));
      setPendingWidgetChanges((prev) => prev.filter((change) => change.widget_key !== widgetKey));
    } catch (error) {
      console.error('Error restoring attendance widget:', error);
      openNoticeModal('error', 'Restore Failed', 'Failed to restore widget.');
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
      openNoticeModal('info', 'Super Admin Required', 'Please enter Super Admin email and password.');
      return;
    }
    const fallbackWidgetKey = attendanceWidgetItems[0]?.id ?? 'hrm-attendance-header';
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
        { headers: { Authorization: `Bearer ${token}` } }
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
      console.error('Error unlocking attendance widgets:', error);
      openNoticeModal('error', 'Unlock Failed', 'Failed to unlock widget controls.');
    } finally {
      setSuperAdminConfirmLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-rose-50 flex items-center justify-center">
        <PageSkeleton />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-rose-50 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-20 left-20 w-72 h-72 bg-orange-200 rounded-full mix-blend-multiply filter blur-xl"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-red-200 rounded-full mix-blend-multiply filter blur-xl"></div>
        <div className="absolute -bottom-8 left-40 w-72 h-72 bg-rose-200 rounded-full mix-blend-multiply filter blur-xl"></div>
      </div>

      {/* Navigation */}
      <nav className="relative z-10 bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="w-full px-3 sm:px-4 lg:px-6">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center h-auto sm:h-16 py-3 sm:py-0 gap-3 sm:gap-0">
            <div className="flex items-center justify-between sm:justify-start">
              {isWidgetVisible('hrm-attendance-nav-back-button') && (
                <div className="flex items-center gap-2">
                  <button onClick={() => router.push('/dashboard/hrm')} className="flex items-center space-x-2 text-gray-700 hover:text-orange-600 transition-colors duration-300">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    <span className="font-medium">Back to HRM</span>
                  </button>
                  {!widgetControlsLocked && (
                    <button
                      type="button"
                      onClick={() => stageWidgetVisibilityChange('hrm-attendance-nav-back-button', false)}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-[11px] font-bold text-slate-600 shadow hover:bg-slate-100"
                      title="Disable this widget"
                      aria-label="Disable Attendance Back Button"
                    >
                      ×
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between sm:justify-end space-x-2">
              <div className="w-8 h-8 bg-gradient-to-r from-orange-500 to-red-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                AT
              </div>
              <span className="font-medium text-gray-900 text-sm sm:text-base">Attendance</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10 w-full py-8 px-3 sm:px-4 lg:px-6">
        {/* Header */}
        {isWidgetVisible('hrm-attendance-header') && (
        <div className="relative text-center mb-8">
          {!widgetControlsLocked && (
            <button
              type="button"
              onClick={() => stageWidgetVisibilityChange('hrm-attendance-header', false)}
              className="absolute right-0 top-0 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-xs font-bold text-slate-600 shadow hover:bg-slate-100"
              title="Disable this widget"
              aria-label="Disable Attendance Header"
            >
              ×
            </button>
          )}
          <div className="inline-block p-1 bg-gradient-to-r from-orange-500 to-red-500 rounded-full mb-6">
            <div className="bg-white rounded-full p-4">
              <span className="text-4xl">📅</span>
            </div>
          </div>
          {isWidgetVisible('hrm-attendance-heading-title') && (
            <div className="relative mx-auto w-fit">
              {!widgetControlsLocked && (
                <button
                  type="button"
                  onClick={() => stageWidgetVisibilityChange('hrm-attendance-heading-title', false)}
                  className="absolute -right-8 top-2 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-[11px] font-bold text-slate-600 shadow hover:bg-slate-100"
                  title="Disable this widget"
                  aria-label="Disable Attendance Title Heading"
                >
                  ×
                </button>
              )}
              <h2 className="text-3xl md:text-5xl font-bold text-gray-900 mb-3">
                Attendance <span className="bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">Manager</span>
              </h2>
            </div>
          )}
          {isWidgetVisible('hrm-attendance-heading-subtitle') && (
            <div className="relative mx-auto max-w-3xl">
              {!widgetControlsLocked && (
                <button
                  type="button"
                  onClick={() => stageWidgetVisibilityChange('hrm-attendance-heading-subtitle', false)}
                  className="absolute -right-8 top-1 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-[11px] font-bold text-slate-600 shadow hover:bg-slate-100"
                  title="Disable this widget"
                  aria-label="Disable Attendance Subtitle Heading"
                >
                  ×
                </button>
              )}
              <p className="text-base sm:text-lg text-gray-600 mx-auto leading-relaxed px-1">
                Manage employee attendance with quick marking, CSV uploads, and history tracking.
              </p>
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {!widgetControlsLocked && hiddenWidgetCount > 0 && (
              <button
                type="button"
                onClick={restoreAllHiddenWidgetsStaged}
                className="rounded-full border border-orange-300 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-700 transition hover:bg-orange-100"
              >
                Restore Hidden Widgets ({hiddenWidgetCount})
              </button>
            )}
            {!widgetControlsLocked && pendingWidgetChanges.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => openSuperAdminConfirmation(pendingWidgetChanges, 'apply')}
                  className="rounded-full border border-orange-300 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-700 transition hover:bg-orange-100"
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
                {hiddenWidgetCount > 0 && (
                  <button
                    type="button"
                    onClick={restoreHiddenWidgetsAfterFix}
                    className="rounded-full border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
                  >
                    Restore Widgets ({hiddenWidgetCount})
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
        )}

        {/* Tabs */}
        {isWidgetVisible('hrm-attendance-tabs') && (
        <div className="mb-6 flex justify-center">
          <div className="relative bg-white/70 backdrop-blur-sm rounded-full p-1 pr-10 shadow-lg inline-flex max-w-full overflow-x-auto">
            {!widgetControlsLocked && (
              <button
                type="button"
                onClick={() => stageWidgetVisibilityChange('hrm-attendance-tabs', false)}
                className="absolute right-2 top-1/2 z-20 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-xs font-bold text-slate-600 shadow hover:bg-slate-100"
                title="Disable this widget"
                aria-label="Disable Attendance Tabs"
              >
                ×
              </button>
            )}
            {isWidgetVisible('hrm-attendance-tab-button-mark') && (
              <div className="relative">
                {!widgetControlsLocked && (
                  <button
                    type="button"
                    onClick={() => stageWidgetVisibilityChange('hrm-attendance-tab-button-mark', false)}
                    className="absolute -right-2 -top-2 z-20 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-[10px] font-bold text-slate-600 shadow hover:bg-slate-100"
                    title="Disable this widget"
                    aria-label="Disable Quick Mark Tab Button"
                  >
                    ×
                  </button>
                )}
                <button
                  onClick={() => setActiveTab('mark')}
                  className={`px-6 py-2 rounded-full font-medium transition-all duration-300 ${
                    activeTab === 'mark'
                      ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Quick Mark
                </button>
              </div>
            )}
            {isWidgetVisible('hrm-attendance-tab-button-upload') && (
              <div className="relative">
                {!widgetControlsLocked && (
                  <button
                    type="button"
                    onClick={() => stageWidgetVisibilityChange('hrm-attendance-tab-button-upload', false)}
                    className="absolute -right-2 -top-2 z-20 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-[10px] font-bold text-slate-600 shadow hover:bg-slate-100"
                    title="Disable this widget"
                    aria-label="Disable CSV Upload Tab Button"
                  >
                    ×
                  </button>
                )}
                <button
                  onClick={() => setActiveTab('upload')}
                  className={`px-6 py-2 rounded-full font-medium transition-all duration-300 ${
                    activeTab === 'upload'
                      ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  CSV Upload
                </button>
              </div>
            )}
            {isWidgetVisible('hrm-attendance-tab-button-device') && (
              <div className="relative">
                {!widgetControlsLocked && (
                  <button
                    type="button"
                    onClick={() => stageWidgetVisibilityChange('hrm-attendance-tab-button-device', false)}
                    className="absolute -right-2 -top-2 z-20 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-[10px] font-bold text-slate-600 shadow hover:bg-slate-100"
                    title="Disable this widget"
                    aria-label="Disable Device Sync Tab Button"
                  >
                    ×
                  </button>
                )}
                <button
                  onClick={() => setActiveTab('device')}
                  className={`px-6 py-2 rounded-full font-medium transition-all duration-300 ${
                    activeTab === 'device'
                      ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Device Sync
                </button>
              </div>
            )}
            {isWidgetVisible('hrm-attendance-tab-button-history') && (
              <div className="relative">
                {!widgetControlsLocked && (
                  <button
                    type="button"
                    onClick={() => stageWidgetVisibilityChange('hrm-attendance-tab-button-history', false)}
                    className="absolute -right-2 -top-2 z-20 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-[10px] font-bold text-slate-600 shadow hover:bg-slate-100"
                    title="Disable this widget"
                    aria-label="Disable View History Tab Button"
                  >
                    ×
                  </button>
                )}
                <button
                  onClick={() => setActiveTab('history')}
                  className={`px-6 py-2 rounded-full font-medium transition-all duration-300 ${
                    activeTab === 'history'
                      ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  View History
                </button>
              </div>
            )}
          </div>
        </div>
        )}

        {/* Tab Content */}
        {activeTab === 'mark' && isWidgetVisible('hrm-attendance-mark-pane') && (
          <>
            {!widgetControlsLocked && (
              <div className="mb-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => stageWidgetVisibilityChange('hrm-attendance-mark-pane', false)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-xs font-bold text-slate-600 shadow hover:bg-slate-100"
                  title="Disable this widget"
                  aria-label="Disable Quick Mark Tab Pane"
                >
                  ×
                </button>
              </div>
            )}
            {/* Controls */}
            {isWidgetVisible('hrm-attendance-mark-controls') && (
            <div className="relative mb-6 flex flex-col gap-3 pr-10 md:flex-row md:items-center md:justify-between">
              {!widgetControlsLocked && (
                <button
                  type="button"
                  onClick={() => stageWidgetVisibilityChange('hrm-attendance-mark-controls', false)}
                  className="absolute right-0 top-1/2 z-20 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-xs font-bold text-slate-600 shadow hover:bg-slate-100"
                  title="Disable this widget"
                  aria-label="Disable Quick Mark Controls"
                >
                  ×
                </button>
              )}
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Search employees..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full md:w-80 px-4 py-2 rounded-full border border-white/20 bg-white/70 backdrop-blur-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <input
                  type="date"
                  value={selectedAttendanceDate}
                  onChange={(e) => setSelectedAttendanceDate(e.target.value)}
                  max={todayDate}
                  className="px-4 py-2 rounded-full border border-white/20 bg-white/70 backdrop-blur-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  title="Attendance date"
                />
              </div>
              <div className="text-sm text-gray-600">
                {loading ? 'Updating attendance...' : `${filteredEmployees.length} employees listed for ${selectedAttendanceDate}`}
              </div>
            </div>
            )}

            {/* Employees Table */}
            {isWidgetVisible('hrm-attendance-mark-table') && (
            <div className="relative bg-white/70 backdrop-blur-sm rounded-2xl shadow-lg border border-white/20 overflow-hidden">
              {!widgetControlsLocked && (
                <button
                  type="button"
                  onClick={() => stageWidgetVisibilityChange('hrm-attendance-mark-table', false)}
                  className="absolute right-3 top-3 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-xs font-bold text-slate-600 shadow hover:bg-slate-100"
                  title="Disable this widget"
                  aria-label="Disable Quick Mark Employee Table"
                >
                  ×
                </button>
              )}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-white/30">
                  <thead className="bg-gradient-to-r from-orange-500 to-red-500 text-white">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Code</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Email</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Phone</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">In Time</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Out Time</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white/60 divide-y divide-white/30">
                    {filteredEmployees.map((emp) => {
                      const attendance = todayAttendance[emp.id];
                      const isMarked = !!attendance;
                      
                      return (
                        <tr key={emp.id} className={`hover:bg-white/80 ${
                          isMarked 
                            ? attendance.status === 'present' ? 'bg-green-50/50' :
                              attendance.status === 'absent' ? 'bg-red-50/50' :
                              attendance.status === 'late' ? 'bg-yellow-50/50' :
                              'bg-blue-50/50'
                            : ''
                        }`}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{emp.employee_code}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{emp.first_name} {emp.last_name}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{emp.email}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{emp.phone || emp.mobile || '-'}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                            {isMarked && attendance.in_time ? attendance.in_time : '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                            {isMarked && attendance.out_time ? attendance.out_time : '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {isMarked ? (
                              <div className="flex items-center space-x-2">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  attendance.status === 'present' ? 'bg-green-100 text-green-800' :
                                  attendance.status === 'absent' ? 'bg-red-100 text-red-800' :
                                  attendance.status === 'late' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-blue-100 text-blue-800'
                                }`}>
                                  {attendance.status.replace('_', ' ').toUpperCase()}
                                </span>
                                <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              </div>
                            ) : (
                              <span className="text-gray-400 text-xs">Not marked</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <div className="flex flex-wrap gap-2">
                              {isWidgetVisible('hrm-attendance-mark-action-buttons') && !widgetControlsLocked && (
                                <button
                                  type="button"
                                  onClick={() => stageWidgetVisibilityChange('hrm-attendance-mark-action-buttons', false)}
                                  className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-[11px] font-bold text-slate-600 shadow hover:bg-slate-100"
                                  title="Disable this widget"
                                  aria-label="Disable Quick Mark Action Buttons"
                                >
                                  ×
                                </button>
                              )}
                              {isWidgetVisible('hrm-attendance-mark-action-buttons') && (
                                <>
                                  <button
                                    onClick={() => openMarkModal(emp, 'present')}
                                    disabled={isMarked || loading}
                                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                                      isMarked 
                                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                                        : 'bg-green-500 text-white hover:bg-green-600'
                                    }`}
                                  >
                                    Present
                                  </button>
                                  <button
                                    onClick={() => openMarkModal(emp, 'absent')}
                                    disabled={isMarked || loading}
                                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                                      isMarked 
                                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                                        : 'bg-red-500 text-white hover:bg-red-600'
                                    }`}
                                  >
                                    Absent
                                  </button>
                                  <button
                                    onClick={() => openMarkModal(emp, 'late')}
                                    disabled={isMarked || loading}
                                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                                      isMarked 
                                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                                        : 'bg-yellow-500 text-white hover:bg-yellow-600'
                                    }`}
                                  >
                                    Late
                                  </button>
                                  <button
                                    onClick={() => openMarkModal(emp, 'half_day')}
                                    disabled={isMarked || loading}
                                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                                      isMarked 
                                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                                        : 'bg-blue-500 text-white hover:bg-blue-600'
                                    }`}
                                  >
                                    Half Day
                                  </button>
                                  {isMarked && attendance.status === 'present' && !attendance.out_time && (
                                    <button
                                      onClick={() => openMarkOutModal(attendance)}
                                      disabled={loading}
                                      className="px-3 py-1 rounded-full text-xs font-medium transition-colors bg-purple-500 text-white hover:bg-purple-600"
                                    >
                                      Mark Out
                                    </button>
                                  )}
                                  {isMarked && (
                                    <button
                                      onClick={() => openEditModal(attendance)}
                                      disabled={loading}
                                      className="px-3 py-1 rounded-full text-xs font-medium transition-colors bg-indigo-500 text-white hover:bg-indigo-600"
                                    >
                                      Edit
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            )}
          </>
        )}

        {activeTab === 'upload' && isWidgetVisible('hrm-attendance-upload-pane') && isWidgetVisible('hrm-attendance-upload-panel') && (
          <div className="relative bg-white/70 backdrop-blur-sm rounded-2xl shadow-lg border border-white/20 p-8">
            {!widgetControlsLocked && (
              <button
                type="button"
                onClick={() => {
                  stageWidgetVisibilityChange('hrm-attendance-upload-panel', false);
                  stageWidgetVisibilityChange('hrm-attendance-upload-pane', false);
                }}
                className="absolute right-3 top-3 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-xs font-bold text-slate-600 shadow hover:bg-slate-100"
                title="Disable this widget"
                aria-label="Disable Attendance CSV Upload Panel"
              >
                ×
              </button>
            )}
            {isWidgetVisible('hrm-attendance-upload-heading') && (
              <div className="relative mb-4 w-fit">
                {!widgetControlsLocked && (
                  <button
                    type="button"
                    onClick={() => stageWidgetVisibilityChange('hrm-attendance-upload-heading', false)}
                    className="absolute -right-7 top-1 z-20 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-[10px] font-bold text-slate-600 shadow hover:bg-slate-100"
                    title="Disable this widget"
                    aria-label="Disable Attendance Upload Heading"
                  >
                    ×
                  </button>
                )}
                <h3 className="text-2xl font-bold text-gray-900">Upload Attendance CSV</h3>
              </div>
            )}
            <p className="text-gray-600 mb-6">
              Upload a CSV from your fingerprint machine. Supported headers include both legacy format and fingerprint format.
            </p>
            <div className="mb-6 p-4 rounded-xl bg-orange-50 border border-orange-200 text-sm text-gray-700">
              <p className="font-semibold text-orange-800 mb-2">Fingerprint sample format:</p>
              <p>Employee_ID, Employee_Name, Date, Check_In, Check_Out, Total_Hours, Status, Device_ID</p>
            </div>
            <div className="mb-6">
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100"
              />
            </div>
            {isWidgetVisible('hrm-attendance-upload-action-buttons') && (
              <div className="relative w-fit">
                {!widgetControlsLocked && (
                  <button
                    type="button"
                    onClick={() => stageWidgetVisibilityChange('hrm-attendance-upload-action-buttons', false)}
                    className="absolute -right-7 top-2 z-20 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-[10px] font-bold text-slate-600 shadow hover:bg-slate-100"
                    title="Disable this widget"
                    aria-label="Disable Attendance Upload Buttons"
                  >
                    ×
                  </button>
                )}
                <button
                  onClick={handleCsvUpload}
                  disabled={!csvFile || loading}
                  className="px-6 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-full font-medium hover:from-orange-600 hover:to-red-600 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Uploading...' : 'Upload CSV'}
                </button>
              </div>
            )}
            {uploadResult && (
              <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                <h4 className="font-semibold text-green-800">Upload Result</h4>
                <p className="text-green-700">Created {uploadResult.created_records || 0} records</p>
                <p className="text-green-700">Updated {uploadResult.updated_records || 0} records</p>
                {typeof uploadResult.skipped_rows === 'number' && (
                  <p className="text-amber-700">Skipped empty rows: {uploadResult.skipped_rows}</p>
                )}
                {uploadResult.errors.length > 0 && (
                  <div className="mt-2">
                    <p className="text-red-700 font-semibold">Errors:</p>
                    <ul className="list-disc list-inside text-red-600">
                      {uploadResult.errors.map((error: string, index: number) => (
                        <li key={index}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'device' && isWidgetVisible('hrm-attendance-device-pane') && isWidgetVisible('hrm-attendance-device-panel') && (
          <div className="relative bg-white/70 backdrop-blur-sm rounded-2xl shadow-lg border border-white/20 p-6">
            {!widgetControlsLocked && (
              <button
                type="button"
                onClick={() => {
                  stageWidgetVisibilityChange('hrm-attendance-device-panel', false);
                  stageWidgetVisibilityChange('hrm-attendance-device-pane', false);
                }}
                className="absolute right-3 top-3 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-xs font-bold text-slate-600 shadow hover:bg-slate-100"
                title="Disable this widget"
                aria-label="Disable Device Sync Panel"
              >
                ×
              </button>
            )}

            <h3 className="text-xl font-bold text-gray-900">Biometric Device Auto Attendance</h3>
            <p className="mt-1 text-sm text-gray-600">
              Configure your Realand device, test network connectivity, and process punch events automatically.
            </p>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              <label className="text-sm font-medium text-gray-700">
                Device Name
                <input
                  type="text"
                  value={deviceSettings.device_name}
                  onChange={(e) => setDeviceSettings((prev) => ({ ...prev, device_name: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-black"
                />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Communication Type
                <input
                  type="text"
                  value={deviceSettings.communication_type}
                  onChange={(e) => setDeviceSettings((prev) => ({ ...prev, communication_type: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-black"
                />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Communication Password
                <input
                  type="text"
                  value={deviceSettings.communication_password}
                  onChange={(e) => setDeviceSettings((prev) => ({ ...prev, communication_password: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-black"
                />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Device IP
                <input
                  type="text"
                  value={deviceSettings.device_ip}
                  onChange={(e) => setDeviceSettings((prev) => ({ ...prev, device_ip: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-black"
                />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Local Port
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={deviceSettings.device_port}
                  onChange={(e) => setDeviceSettings((prev) => ({ ...prev, device_port: Number(e.target.value || 5500) }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-black"
                />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Server Port
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={deviceSettings.server_port}
                  onChange={(e) => setDeviceSettings((prev) => ({ ...prev, server_port: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-black"
                />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Subnet Mask
                <input
                  type="text"
                  value={deviceSettings.subnet_mask}
                  onChange={(e) => setDeviceSettings((prev) => ({ ...prev, subnet_mask: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-black"
                />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Gateway
                <input
                  type="text"
                  value={deviceSettings.gateway}
                  onChange={(e) => setDeviceSettings((prev) => ({ ...prev, gateway: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-black"
                />
              </label>
              <label className="text-sm font-medium text-gray-700">
                DNS
                <input
                  type="text"
                  value={deviceSettings.dns}
                  onChange={(e) => setDeviceSettings((prev) => ({ ...prev, dns: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-black"
                />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Listener Port (this PC)
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={deviceSettings.listener_port}
                  onChange={(e) => setDeviceSettings((prev) => ({ ...prev, listener_port: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-black"
                />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Device Time Zone
                <input
                  type="text"
                  value={deviceSettings.device_timezone}
                  onChange={(e) => setDeviceSettings((prev) => ({ ...prev, device_timezone: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-black"
                  placeholder="Asia/Colombo"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-4">
              <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={deviceSettings.dhcp_enabled}
                  onChange={(e) => setDeviceSettings((prev) => ({ ...prev, dhcp_enabled: e.target.checked }))}
                />
                DHCP Enabled
              </label>
              <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={deviceSettings.real_time_push_enabled}
                  onChange={(e) => setDeviceSettings((prev) => ({ ...prev, real_time_push_enabled: e.target.checked }))}
                />
                Real Time Push Enabled
              </label>
              <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={deviceSettings.p2p_service_enabled}
                  onChange={(e) => setDeviceSettings((prev) => ({ ...prev, p2p_service_enabled: e.target.checked }))}
                />
                P2P Service Enabled
              </label>
              <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={deviceSettings.is_active}
                  onChange={(e) => setDeviceSettings((prev) => ({ ...prev, is_active: e.target.checked }))}
                />
                Integration Active
              </label>
              <label
                className="inline-flex items-center gap-2 text-sm font-medium text-gray-700"
                title="Accept punches from any IP address (use if the device IP changes because of DHCP)"
              >
                <input
                  type="checkbox"
                  checked={deviceSettings.listener_allow_any_ip}
                  onChange={(e) => setDeviceSettings((prev) => ({ ...prev, listener_allow_any_ip: e.target.checked }))}
                />
                Accept Punches From Any IP
              </label>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={saveDeviceSettings}
                disabled={deviceSaveLoading || deviceSettingsLoading}
                className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
              >
                {deviceSaveLoading ? 'Saving...' : 'Save Device Settings'}
              </button>
              <button
                type="button"
                onClick={testDeviceConnection}
                disabled={deviceTestLoading || deviceSettingsLoading}
                className="rounded-lg border border-orange-300 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-60"
              >
                {deviceTestLoading ? 'Testing...' : 'Test Connection'}
              </button>
            </div>

            {/* ---------- Live punch receiver ---------- */}
            <div className="mt-8 border-t border-gray-200 pt-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-lg font-bold text-gray-900">Live Punch Receiver</h4>
                  <p className="text-sm text-gray-600">Fingerprint punches are marked as IN / OUT the moment the machine sends them.</p>
                </div>
                <span
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${
                    deviceStatus?.listener.online ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'
                  }`}
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${deviceStatus?.listener.online ? 'bg-green-500' : 'bg-red-500'}`} />
                  {deviceStatus?.listener.online ? `Listener online · port ${deviceStatus.listener.port}` : 'Listener offline'}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                {[
                  { label: 'IN marked today', value: deviceStatus?.today.marked_in ?? 0, tone: 'text-green-700' },
                  { label: 'OUT marked today', value: deviceStatus?.today.marked_out ?? 0, tone: 'text-blue-700' },
                  { label: 'Unmatched users', value: deviceStatus?.unmatched_total ?? 0, tone: 'text-amber-700' },
                  { label: 'Last packet', value: formatDeviceTime(deviceStatus?.listener.last_packet_at), tone: 'text-gray-800 text-sm' },
                ].map((card) => (
                  <div key={card.label} className="rounded-xl border border-gray-200 bg-white p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{card.label}</p>
                    <p className={`mt-1 text-2xl font-bold ${card.tone}`}>{card.value}</p>
                  </div>
                ))}
              </div>

              {!deviceStatus?.listener.online && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <p className="font-semibold">Start the listener on the server PC</p>
                  <p className="mt-1">
                    Double-click <code className="rounded bg-white px-1">backend\start-attendance-listener.bat</code>, or run{' '}
                    <code className="rounded bg-white px-1">php artisan attendance:listen</code> in the backend folder. Keep that window open.
                  </p>
                </div>
              )}

              <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
                <p className="font-semibold">Machine setup (Menu → Comm. → Server / Real-time push)</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-5">
                  <li>
                    Server IP / Host:{' '}
                    <strong>{deviceStatus?.listener.server_ips?.length ? deviceStatus.listener.server_ips.join(' or ') : 'this PC’s LAN IP'}</strong>
                  </li>
                  <li>
                    Server Port: <strong>{deviceStatus?.listener.port ?? deviceSettings.listener_port}</strong>
                  </li>
                  <li>Real-time push: <strong>ON</strong>. Then punch a finger and watch the table below.</li>
                  <li>Device user ID must match the employee code (user 1 → EMP0001, or the exact code).</li>
                </ol>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
                <h5 className="font-semibold text-gray-900">Recent Punches</h5>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => fetchDeviceLive()}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={reprocessUnmatched}
                    disabled={reprocessLoading || !(deviceStatus?.unmatched_total)}
                    className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                  >
                    {reprocessLoading ? 'Reprocessing...' : 'Reprocess Unmatched'}
                  </button>
                </div>
              </div>
              <div className="mt-2 max-h-80 overflow-auto rounded-xl border border-gray-200 bg-white">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-3 py-2">Punch Time</th>
                      <th className="px-3 py-2">Device User</th>
                      <th className="px-3 py-2">Employee</th>
                      <th className="px-3 py-2">Result</th>
                      <th className="px-3 py-2">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-gray-800">
                    {punchLogs.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                          No punches received yet.
                        </td>
                      </tr>
                    )}
                    {punchLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{log.punch_time}</td>
                        <td className="px-3 py-2">{log.device_user_id}</td>
                        <td className="px-3 py-2">
                          {log.employee_code ? `${log.employee_code} · ${log.employee_name || ''}` : <span className="text-amber-700">Not linked</span>}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PUNCH_RESULT_STYLES[log.result] || 'bg-gray-100 text-gray-700'}`}>
                            {log.result.replace('_', ' ').toUpperCase()}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-600">
                          {log.message}
                          <span className="ml-1 text-gray-400">({log.source})</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <h5 className="font-semibold text-gray-900">Test Punch (without the machine)</h5>
                  <p className="text-xs text-gray-500">Runs through the same IN/OUT rules the machine uses.</p>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <input
                      type="text"
                      value={testPunchUserId}
                      onChange={(e) => setTestPunchUserId(e.target.value)}
                      placeholder="Device user / EMP code"
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-black"
                    />
                    <input
                      type="datetime-local"
                      step={1}
                      value={testPunchTime}
                      onChange={(e) => setTestPunchTime(e.target.value)}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-black"
                      title="Leave empty to use the current time"
                    />
                    <select
                      value={testPunchDirection}
                      onChange={(e) => setTestPunchDirection(e.target.value as 'auto' | 'in' | 'out')}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-black"
                    >
                      <option value="auto">Auto (first IN, last OUT)</option>
                      <option value="in">Force IN</option>
                      <option value="out">Force OUT</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={sendTestPunch}
                    disabled={testPunchLoading}
                    className="mt-3 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
                  >
                    {testPunchLoading ? 'Sending...' : 'Send Test Punch'}
                  </button>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <h5 className="font-semibold text-gray-900">Test Raw Device Data</h5>
                  <p className="text-xs text-gray-500">Paste what the machine sends (text or hex) to check it is understood.</p>
                  <textarea
                    rows={3}
                    value={testPacketPayload}
                    onChange={(e) => setTestPacketPayload(e.target.value)}
                    placeholder={'1\t2026-11-22 08:01:05\t0\t1'}
                    className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs text-black"
                  />
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                      <input type="checkbox" checked={testPacketIsHex} onChange={(e) => setTestPacketIsHex(e.target.checked)} />
                      Payload is hex
                    </label>
                    <button
                      type="button"
                      onClick={sendTestPacket}
                      disabled={testPacketLoading}
                      className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-60"
                    >
                      {testPacketLoading ? 'Processing...' : 'Process Payload'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => setShowPackets((prev) => !prev)}
                  className="text-sm font-semibold text-gray-700 hover:text-gray-900"
                >
                  {showPackets ? '▾' : '▸'} Raw packets from device ({devicePackets.length})
                  {(deviceStatus?.unparsed_packets ?? 0) > 0 && (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                      {deviceStatus?.unparsed_packets} not recognised
                    </span>
                  )}
                </button>
                {showPackets && (
                  <div className="mt-2 max-h-80 overflow-auto rounded-xl border border-gray-200 bg-white">
                    <table className="min-w-full text-sm">
                      <thead className="sticky top-0 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                        <tr>
                          <th className="px-3 py-2">Received</th>
                          <th className="px-3 py-2">From</th>
                          <th className="px-3 py-2">Bytes</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2">Message</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 text-gray-800">
                        {devicePackets.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                              No packets captured yet.
                            </td>
                          </tr>
                        )}
                        {devicePackets.map((packet) => (
                          <Fragment key={packet.id}>
                            <tr
                              className="cursor-pointer hover:bg-gray-50"
                              onClick={() => setExpandedPacketId((prev) => (prev === packet.id ? null : packet.id))}
                            >
                              <td className="whitespace-nowrap px-3 py-2 text-xs">{formatDeviceTime(packet.created_at)}</td>
                              <td className="px-3 py-2 text-xs">
                                {packet.protocol.toUpperCase()} {packet.source_ip}
                              </td>
                              <td className="px-3 py-2 text-xs">{packet.bytes}</td>
                              <td className="px-3 py-2">
                                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PACKET_STATUS_STYLES[packet.status] || 'bg-gray-100 text-gray-700'}`}>
                                  {packet.status}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-xs text-gray-600">{packet.message}</td>
                            </tr>
                            {expandedPacketId === packet.id && (
                              <tr>
                                <td colSpan={5} className="bg-gray-50 px-3 py-2">
                                  <p className="text-xs font-semibold text-gray-600">Text</p>
                                  <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-xs text-gray-800">{packet.payload_text}</pre>
                                  <p className="mt-2 text-xs font-semibold text-gray-600">Hex</p>
                                  <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-xs text-gray-800">{packet.payload_hex}</pre>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-8 border-t border-gray-200 pt-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Bulk Import Events (JSON from a bridge / export)</label>
              <textarea
                rows={8}
                value={deviceSettings.sample_events_json}
                onChange={(e) => setDeviceSettings((prev) => ({ ...prev, sample_events_json: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs text-black"
              />
            </div>

            <div className="mt-3">
              <button
                type="button"
                onClick={syncDeviceEvents}
                disabled={deviceSyncLoading}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
              >
                {deviceSyncLoading ? 'Syncing...' : 'Process Device Events'}
              </button>
            </div>

            {deviceSyncResult && (
              <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                <p>Created: {deviceSyncResult?.summary?.created_records ?? 0}</p>
                <p>Updated: {deviceSyncResult?.summary?.updated_records ?? 0}</p>
                <p>Skipped: {deviceSyncResult?.summary?.skipped_records ?? 0}</p>
                {(deviceSyncResult?.errors || []).length > 0 && (
                  <div className="mt-2 max-h-24 overflow-y-auto rounded-md border border-green-200 bg-white p-2 text-xs">
                    {(deviceSyncResult.errors as string[]).map((error: string, index: number) => (
                      <p key={index} className="text-red-600">{error}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && isWidgetVisible('hrm-attendance-history-pane') && isWidgetVisible('hrm-attendance-history-panel') && (
          <div className="relative bg-white/70 backdrop-blur-sm rounded-2xl shadow-lg border border-white/20 p-8">
            {!widgetControlsLocked && (
              <button
                type="button"
                onClick={() => {
                  stageWidgetVisibilityChange('hrm-attendance-history-panel', false);
                  stageWidgetVisibilityChange('hrm-attendance-history-pane', false);
                }}
                className="absolute right-3 top-3 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-xs font-bold text-slate-600 shadow hover:bg-slate-100"
                title="Disable this widget"
                aria-label="Disable Attendance History Panel"
              >
                ×
              </button>
            )}
            {isWidgetVisible('hrm-attendance-history-heading') && (
              <div className="relative mb-4 w-fit">
                {!widgetControlsLocked && (
                  <button
                    type="button"
                    onClick={() => stageWidgetVisibilityChange('hrm-attendance-history-heading', false)}
                    className="absolute -right-7 top-1 z-20 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-[10px] font-bold text-slate-600 shadow hover:bg-slate-100"
                    title="Disable this widget"
                    aria-label="Disable Attendance History Heading"
                  >
                    ×
                  </button>
                )}
                <h3 className="text-2xl font-bold text-gray-900">Attendance History</h3>
              </div>
            )}
            <div className="mb-6 flex flex-col md:flex-row gap-4">
              <select
                value={selectedEmployee?.id || ''}
                onChange={(e) => {
                  const emp = employees.find(emp => emp.id === parseInt(e.target.value));
                  setSelectedEmployee(emp || null);
                }}
                className="px-4 py-2 rounded-full border border-white/20 bg-white/70 backdrop-blur-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="">Select Employee</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.employee_code} - {emp.first_name} {emp.last_name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-4 py-2 rounded-full border border-white/20 bg-white/70 backdrop-blur-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="Start Date"
              />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-4 py-2 rounded-full border border-white/20 bg-white/70 backdrop-blur-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="End Date"
              />
              {isWidgetVisible('hrm-attendance-history-action-buttons') && (
                <div className="relative w-fit">
                  {!widgetControlsLocked && (
                    <button
                      type="button"
                      onClick={() => stageWidgetVisibilityChange('hrm-attendance-history-action-buttons', false)}
                      className="absolute -right-7 top-1 z-20 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-[10px] font-bold text-slate-600 shadow hover:bg-slate-100"
                      title="Disable this widget"
                      aria-label="Disable Attendance History Buttons"
                    >
                      ×
                    </button>
                  )}
                  <button
                    onClick={fetchAttendanceHistory}
                    disabled={!selectedEmployee || loading}
                    className="px-6 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-full font-medium hover:from-orange-600 hover:to-red-600 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Loading...' : 'View History'}
                  </button>
                </div>
              )}
            </div>
            {attendanceHistory.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-white/30">
                  <thead className="bg-gradient-to-r from-orange-500 to-red-500 text-white">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">In Time</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Out Time</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Work Hours</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white/60 divide-y divide-white/30">
                    {attendanceHistory.map((record) => (
                      <tr key={record.id} className="hover:bg-white/80">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{record.date}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{record.in_time || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{record.out_time || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            record.status === 'present' ? 'bg-green-100 text-green-800' :
                            record.status === 'absent' ? 'bg-red-100 text-red-800' :
                            record.status === 'late' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {record.status.replace('_', ' ').toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{record.work_hours || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{record.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

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
                          attendanceWidgetItems.find((item) => item.id === change.widget_key)?.name ?? change.widget_key;
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
                  className="rounded-xl bg-gradient-to-r from-orange-500 to-red-500 px-4 py-2 text-sm font-semibold text-white hover:from-orange-600 hover:to-red-600 disabled:opacity-60"
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

      {/* Feedback Modal */}
      {noticeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-lg font-bold ${
                  noticeModal.tone === 'success'
                    ? 'bg-green-500'
                    : noticeModal.tone === 'error'
                      ? 'bg-red-500'
                      : 'bg-orange-500'
                }`}>
                  {noticeModal.tone === 'success' ? '✓' : noticeModal.tone === 'error' ? '!' : 'i'}
                </div>
                <h3 className="text-xl font-bold text-gray-900">{noticeModal.title}</h3>
              </div>
              <p className="text-gray-700 leading-relaxed">{noticeModal.message}</p>
              <div className="flex justify-end mt-6">
                <button
                  type="button"
                  onClick={() => setNoticeModal(null)}
                  className="px-5 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg hover:from-orange-600 hover:to-red-600 transition-colors"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Attendance Marking Modal */}
      {showMarkModal && markingEmployee && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-4">
                Mark Attendance for {markingEmployee.first_name} {markingEmployee.last_name}
              </h3>
              <form onSubmit={handleMarkSubmit}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Attendance Date
                    </label>
                    <input
                      type="date"
                      value={selectedAttendanceDate}
                      onChange={(e) => setSelectedAttendanceDate(e.target.value)}
                      max={todayDate}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Status
                    </label>
                    <select
                      value={markStatus}
                      onChange={(e) => setMarkStatus(e.target.value as 'present' | 'absent' | 'late' | 'half_day')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                      required
                    >
                      <option value="present">Present</option>
                      <option value="absent">Absent</option>
                      <option value="late">Late</option>
                      <option value="half_day">Half Day</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      In Time
                    </label>
                    <input
                      type="time"
                      value={markInTime}
                      onChange={(e) => setMarkInTime(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Notes (Optional)
                    </label>
                    <textarea
                      value={markNotes}
                      onChange={(e) => setMarkNotes(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder:text-gray-500 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="Add any additional notes..."
                    />
                  </div>
                </div>
                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setShowMarkModal(false)}
                    className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-6 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg hover:from-orange-600 hover:to-red-600 transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Marking...' : 'Mark Attendance'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Mark Out Modal */}
      {showMarkOutModal && markingOutAttendance && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-4">
                Mark Out for {markingOutAttendance.employee.first_name} {markingOutAttendance.employee.last_name}
              </h3>
              <form onSubmit={handleMarkOutSubmit}>
                <div className="space-y-4">
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-sm text-gray-600">
                      <strong>In Time:</strong> {markingOutAttendance.in_time || 'Not set'}
                    </p>
                    <p className="text-sm text-gray-600">
                      <strong>Status:</strong> {markingOutAttendance.status.replace('_', ' ').toUpperCase()}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Out Time *
                    </label>
                    <input
                      type="time"
                      value={markOutTimeInput}
                      onChange={(e) => setMarkOutTimeInput(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Notes (Optional)
                    </label>
                    <textarea
                      value={markOutNotes}
                      onChange={(e) => setMarkOutNotes(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder:text-gray-500 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="Add any additional notes..."
                    />
                  </div>
                </div>
                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setShowMarkOutModal(false)}
                    className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !markOutTimeInput}
                    className="px-6 py-2 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg hover:from-purple-600 hover:to-purple-700 transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Marking Out...' : 'Mark Out'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Attendance Modal */}
      {showEditModal && editingAttendance && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-4">
                Edit Attendance - {editingAttendance.employee.first_name} {editingAttendance.employee.last_name}
              </h3>
              <p className="text-sm text-gray-600 mb-4">Date: {String(editingAttendance.date).split('T')[0]}</p>
              <form onSubmit={handleEditSubmit}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as 'present' | 'absent' | 'late' | 'half_day')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                      required
                    >
                      <option value="present">Present</option>
                      <option value="absent">Absent</option>
                      <option value="late">Late</option>
                      <option value="half_day">Half Day</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">In Time</label>
                    <input
                      type="time"
                      value={editInTime}
                      onChange={(e) => setEditInTime(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Out Time</label>
                    <input
                      type="time"
                      value={editOutTime}
                      onChange={(e) => setEditOutTime(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                    <textarea
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder:text-gray-500 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="Update notes..."
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditModal(false);
                      setEditingAttendance(null);
                    }}
                    className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-6 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg hover:from-indigo-600 hover:to-purple-700 transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Updating...' : 'Update Attendance'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
