'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

interface Candidate {
  id: number;
  candidate_code: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  position_applied: string;
  status: 'applied' | 'shortlisted' | 'interviewed' | 'selected' | 'rejected' | 'hired';
  interview_date?: string;
  interview_time?: string;
  interview_notes?: string;
  interviewers?: { id: number; first_name: string; last_name: string; employee_code?: string }[];
  joining_date?: string;
  expected_salary?: number;
  offered_salary?: number;
  cv_path?: string;
  photo_path?: string;
  photo_url?: string;
  appointment_letter_path?: string;
  notes?: string;
}

interface Department {
  id: number;
  name: string;
}

interface Designation {
  id: number;
  name: string;
}

interface Branch {
  id: number;
  name: string;
}

interface CandidateDocument {
  id: number;
  type: string;
  file_path: string;
  original_name?: string;
  notes?: string;
  created_at?: string;
}

interface CandidateEducation {
  id: number;
  institution: string;
  degree?: string;
  field_of_study?: string;
  start_date?: string;
  end_date?: string;
  grade?: string;
  description?: string;
}

interface CandidateExperience {
  id: number;
  company: string;
  role: string;
  start_date?: string;
  end_date?: string;
  is_current?: boolean;
  responsibilities?: string;
  achievements?: string;
}

interface Interview {
  id: number;
  interview_date: string;
  interview_time: string;
  interview_notes?: string;
  score?: number | null;
  result?: 'pending' | 'pass' | 'fail';
  interviewers?: { id: number; first_name: string; last_name: string; employee_code?: string }[];
}

type CandidateFull = Candidate & {
  documents?: CandidateDocument[];
  educations?: CandidateEducation[];
  experiences?: CandidateExperience[];
  interviews?: Interview[];
};

export default function Candidates() {
  const [token, setToken] = useState('');
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8020';
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [employeesOptions, setEmployeesOptions] = useState<Array<{id:number; first_name:string; last_name:string; employee_code?:string}>>([]);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showConvertForm, setShowConvertForm] = useState(false);
  const [showDocsModal, setShowDocsModal] = useState(false);
  const [showEduModal, setShowEduModal] = useState(false);
  const [showExpModal, setShowExpModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showInterviewModal, setShowInterviewModal] = useState(false);
  const [upcomingInterviews, setUpcomingInterviews] = useState<Interview[]>([]);
  const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(null);
  const [convertingCandidate, setConvertingCandidate] = useState<Candidate | null>(null);
  const [activeCandidate, setActiveCandidate] = useState<Candidate | null>(null);
  const [profileCandidate, setProfileCandidate] = useState<CandidateFull | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const router = useRouter();

  // Form fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [positionApplied, setPositionApplied] = useState('');
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [expectedSalary, setExpectedSalary] = useState('');
  const [notes, setNotes] = useState('');

  // Edit fields
  const [status, setStatus] = useState<'applied' | 'shortlisted' | 'interviewed' | 'selected' | 'rejected' | 'hired'>('applied');
  const [interviewDate, setInterviewDate] = useState('');
  const [interviewTime, setInterviewTime] = useState('');
  const [interviewNotes, setInterviewNotes] = useState('');
  const [selectedInterviewers, setSelectedInterviewers] = useState<number[]>([]);
  const [joiningDate, setJoiningDate] = useState('');
  const [offeredSalary, setOfferedSalary] = useState('');

  // Convert to employee fields
  const [convertDepartmentId, setConvertDepartmentId] = useState('');
  const [convertDesignationId, setConvertDesignationId] = useState('');
  const [convertBranchId, setConvertBranchId] = useState('');
  const [convertBasicSalary, setConvertBasicSalary] = useState('');
  const [convertCommission, setConvertCommission] = useState('');
  const [convertCommissionBase, setConvertCommissionBase] = useState<'company_profit' | 'own_business' | ''>('');
  const [convertJoinDate, setConvertJoinDate] = useState('');

  // Documents state
  const [documents, setDocuments] = useState<CandidateDocument[]>([]);
  const [docType, setDocType] = useState('cv');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docNotes, setDocNotes] = useState('');

  // Education state
  const [educations, setEducations] = useState<CandidateEducation[]>([]);
  const [eduInstitution, setEduInstitution] = useState('');
  const [eduDegree, setEduDegree] = useState('');
  const [eduField, setEduField] = useState('');
  const [eduStart, setEduStart] = useState('');
  const [eduEnd, setEduEnd] = useState('');
  const [eduGrade, setEduGrade] = useState('');
  const [eduDescription, setEduDescription] = useState('');

  // Experience state
  const [experiences, setExperiences] = useState<CandidateExperience[]>([]);
  const [expCompany, setExpCompany] = useState('');
  const [expRole, setExpRole] = useState('');
  const [expStart, setExpStart] = useState('');
  const [expEnd, setExpEnd] = useState('');
  const [expCurrent, setExpCurrent] = useState(false);
  const [expResp, setExpResp] = useState('');
  const [expAch, setExpAch] = useState('');

  // Actions menu state
  const [openMenuFor, setOpenMenuFor] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Notification modal state
  const [showNotice, setShowNotice] = useState(false);
  const [noticeType, setNoticeType] = useState<'success' | 'error' | 'info'>('info');
  const [noticeTitle, setNoticeTitle] = useState<string>('');
  const [noticeMessage, setNoticeMessage] = useState<string>('');

  const showSuccess = (message: string, title = 'Success') => {
    setNoticeType('success');
    setNoticeTitle(title);
    setNoticeMessage(message);
    setShowNotice(true);
  };
  const showError = (message: string, title = 'Error') => {
    setNoticeType('error');
    setNoticeTitle(title);
    setNoticeMessage(message);
    setShowNotice(true);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (openMenuFor && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuFor(null);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenuFor(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [openMenuFor]);

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
    } else {
      setToken(storedToken);
      setApiError(null);
      fetchCandidates(storedToken);
      fetchDepartments(storedToken);
      fetchDesignations(storedToken);
      fetchBranches(storedToken);
      fetchEmployees(storedToken);
      fetchUpcomingInterviews(storedToken);
    }
  }, [router]);

  const fetchCandidates = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;

    try {
      const response = await axios.get(`${API_URL}/api/hr/candidates`, {
        headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
      });
      setCandidates(response.data.data || []);
    } catch (error) {
      const err: any = error;
      console.error('Error fetching candidates:', err?.response?.status, err?.response?.data || err?.message);
      setApiError(
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        `Failed to fetch candidates (${err?.response?.status || 'network error'})`
      );
    }
  };

  const openProfile = async (candidate: Candidate) => {
    try {
      setProfileLoading(true);
      setShowProfileModal(true);
      const res = await axios.get(`${API_URL}/api/hr/candidates/${candidate.id}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      setProfileCandidate(res.data as CandidateFull);
      setActiveCandidate(candidate);
    } catch (err: any) {
      console.error('Error loading candidate profile', err?.response?.data || err?.message);
      showError('Failed to load candidate profile');
      setShowProfileModal(false);
    } finally {
      setProfileLoading(false);
    }
  };

  const fetchUpcomingInterviews = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;
    try {
      const res = await axios.get(`${API_URL}/api/hr/interviews/upcoming`, {
        headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
      });
      setUpcomingInterviews(res.data || []);
    } catch (err: any) {
      console.error('Failed to load upcoming interviews', err?.response?.data || err?.message);
    }
  };

  const fetchDepartments = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;

    try {
      const response = await axios.get(`${API_URL}/api/hr/departments`, {
        headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
      });
      setDepartments(response.data.data || []);
    } catch (error) {
      const err: any = error;
      console.error('Error fetching departments:', err?.response?.status, err?.response?.data || err?.message);
    }
  };

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
    }
  };

  const fetchBranches = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;

    try {
      const response = await axios.get(`${API_URL}/api/companies`, {
        headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
      });
      setBranches(response.data || []);
    } catch (error) {
      const err: any = error;
      console.error('Error fetching branches:', err?.response?.status, err?.response?.data || err?.message);
    }
  };

  const fetchEmployees = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;

    try {
      const response = await axios.get(`${API_URL}/api/hr/employees`, {
        headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
      });
      const items = (response.data.data || response.data || []).map((e: any) => ({
        id: e.id,
        first_name: e.first_name,
        last_name: e.last_name,
        employee_code: e.employee_code,
      }));
      setEmployeesOptions(items);
    } catch (error) {
      const err: any = error;
      console.error('Error fetching employees:', err?.response?.status, err?.response?.data || err?.message);
    }
  };

  const openScheduleInterview = async (candidate: Candidate) => {
    setActiveCandidate(candidate);
    setInterviewDate('');
    setInterviewTime('');
    setInterviewNotes('');
    // Optionally preselect existing candidate-level interviewers
    setSelectedInterviewers((candidate.interviewers || []).map(i => i.id));
    setShowInterviewModal(true);
  };

  const handleScheduleInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCandidate) return;
    try {
      const payload = {
        interview_date: interviewDate,
        interview_time: interviewTime,
        interview_notes: interviewNotes || undefined,
        notes: interviewNotes || undefined,
        interviewer_ids: selectedInterviewers,
        interviewers: selectedInterviewers,
      };
      await axios.post(
        `${API_URL}/api/hr/candidates/${activeCandidate.id}/interviews`,
        payload,
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' } }
      );
      setShowInterviewModal(false);
      fetchCandidates();
      if (profileCandidate && profileCandidate.id === activeCandidate.id) {
        // Refresh profile to show new interview
        openProfile(activeCandidate);
      }
      fetchUpcomingInterviews();
    } catch (err: any) {
      console.error('Schedule interview failed', err);
      console.error('Schedule interview error details:', err?.response?.status, err?.response?.data, err?.message);
      showError('Failed to schedule interview');
    }
  };

  const openDocs = async (candidate: Candidate) => {
    setActiveCandidate(candidate);
    setShowDocsModal(true);
    try {
      const res = await axios.get(`${API_URL}/api/hr/candidates/${candidate.id}/documents`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      setDocuments(res.data || []);
    } catch (err: any) {
      console.error('Error loading documents', err?.response?.data || err?.message);
    }
  };

  const uploadDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCandidate || !docFile) return;
    try {
      const fd = new FormData();
      fd.append('type', docType);
      fd.append('file', docFile);
      if (docNotes) fd.append('notes', docNotes);
      await axios.post(`${API_URL}/api/hr/candidates/${activeCandidate.id}/documents`, fd, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
      });
      // refresh
      openDocs(activeCandidate);
      setDocFile(null);
      setDocNotes('');
    } catch (err: any) {
      console.error('Upload failed', err?.response?.data || err?.message);
      showError('Failed to upload document');
    }
  };

  const deleteDocument = async (doc: CandidateDocument) => {
    if (!activeCandidate) return;
    if (!confirm('Delete this document?')) return;
    try {
      await axios.delete(`${API_URL}/api/hr/candidates/${activeCandidate.id}/documents/${doc.id}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (err: any) {
      console.error('Delete failed', err?.response?.data || err?.message);
    }
  };

  const downloadDocument = async (doc: CandidateDocument) => {
    if (!activeCandidate) return;
    try {
      const response = await axios.get(
        `${API_URL}/api/hr/candidates/${activeCandidate.id}/documents/${doc.id}/download`,
        { headers: { Authorization: `Bearer ${token}` }, responseType: 'blob' }
      );
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', doc.original_name || 'document');
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (err: any) {
      console.error('Download failed', err?.response?.data || err?.message);
    }
  };

  const openEducations = async (candidate: Candidate) => {
    setActiveCandidate(candidate);
    setShowEduModal(true);
    try {
      const res = await axios.get(`${API_URL}/api/hr/candidates/${candidate.id}/educations`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      setEducations(res.data || []);
    } catch (err: any) {
      console.error('Error loading educations', err?.response?.data || err?.message);
    }
  };

  const addEducation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCandidate) return;
    try {
      const payload = {
        institution: eduInstitution,
        degree: eduDegree || undefined,
        field_of_study: eduField || undefined,
        start_date: eduStart || undefined,
        end_date: eduEnd || undefined,
        grade: eduGrade || undefined,
        description: eduDescription || undefined,
      };
      const res = await axios.post(`${API_URL}/api/hr/candidates/${activeCandidate.id}/educations`, payload, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      setEducations((prev) => [res.data, ...prev]);
      setEduInstitution('');
      setEduDegree('');
      setEduField('');
      setEduStart('');
      setEduEnd('');
      setEduGrade('');
      setEduDescription('');
    } catch (err: any) {
      console.error('Add education failed', err?.response?.data || err?.message);
      showError('Failed to add education');
    }
  };

  const removeEducation = async (edu: CandidateEducation) => {
    if (!activeCandidate) return;
    if (!confirm('Remove this education?')) return;
    try {
      await axios.delete(`${API_URL}/api/hr/candidates/${activeCandidate.id}/educations/${edu.id}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      setEducations((prev) => prev.filter((e) => e.id !== edu.id));
    } catch (err: any) {
      console.error('Remove education failed', err?.response?.data || err?.message);
    }
  };

  const openExperiences = async (candidate: Candidate) => {
    setActiveCandidate(candidate);
    setShowExpModal(true);
    try {
      const res = await axios.get(`${API_URL}/api/hr/candidates/${candidate.id}/experiences`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      setExperiences(res.data || []);
    } catch (err: any) {
      console.error('Error loading experiences', err?.response?.data || err?.message);
    }
  };

  const addExperience = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCandidate) return;
    try {
      const payload = {
        company: expCompany,
        role: expRole,
        start_date: expStart || undefined,
        end_date: expEnd || undefined,
        is_current: expCurrent,
        responsibilities: expResp || undefined,
        achievements: expAch || undefined,
      };
      const res = await axios.post(`${API_URL}/api/hr/candidates/${activeCandidate.id}/experiences`, payload, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      setExperiences((prev) => [res.data, ...prev]);
      setExpCompany('');
      setExpRole('');
      setExpStart('');
      setExpEnd('');
      setExpCurrent(false);
      setExpResp('');
      setExpAch('');
    } catch (err: any) {
      console.error('Add experience failed', err?.response?.data || err?.message);
      showError('Failed to add experience');
    }
  };

  const removeExperience = async (exp: CandidateExperience) => {
    if (!activeCandidate) return;
    if (!confirm('Remove this experience?')) return;
    try {
      await axios.delete(`${API_URL}/api/hr/candidates/${activeCandidate.id}/experiences/${exp.id}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      setExperiences((prev) => prev.filter((e) => e.id !== exp.id));
    } catch (err: any) {
      console.error('Remove experience failed', err?.response?.data || err?.message);
    }
  };

  const resetForm = () => {
    setFirstName('');
    setLastName('');
    setEmail('');
    setPhone('');
    setAddress('');
    setPositionApplied('');
    setCvFile(null);
    setPhotoFile(null);
    setExpectedSalary('');
    setNotes('');
    setEditingCandidate(null);
  };

  const resetEditForm = () => {
    setStatus('applied');
    setInterviewDate('');
    setInterviewTime('');
    setInterviewNotes('');
    setJoiningDate('');
    setOfferedSalary('');
  };

  const resetConvertForm = () => {
    setConvertDepartmentId('');
    setConvertDesignationId('');
    setConvertBranchId('');
    setConvertBasicSalary('');
    setConvertCommission('');
    setConvertCommissionBase('');
    setConvertJoinDate('');
    setConvertingCandidate(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData();
    formData.append('first_name', firstName);
    formData.append('last_name', lastName);
    formData.append('email', email);
    formData.append('phone', phone);
    formData.append('address', address);
    formData.append('position_applied', positionApplied);
    if (cvFile) {
      formData.append('cv_file', cvFile);
    }
    if (photoFile) {
      formData.append('photo', photoFile);
    }
    if (expectedSalary) {
      formData.append('expected_salary', expectedSalary);
    }
    if (notes) {
      formData.append('notes', notes);
    }

    try {
      if (editingCandidate) {
        formData.append('_method', 'PUT');
        await axios.post(`${API_URL}/api/hr/candidates/${editingCandidate.id}`, formData, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
        });
      } else {
        await axios.post(`${API_URL}/api/hr/candidates`, formData, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
        });
      }
      fetchCandidates();
      setShowForm(false);
      resetForm();
    } catch (error) {
      console.error('Error saving candidate:', error);
      showError('Failed to save candidate. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (candidate: Candidate) => {
    setEditingCandidate(candidate);
    setFirstName(candidate.first_name);
    setLastName(candidate.last_name);
    setEmail(candidate.email);
    setPhone(candidate.phone);
    setAddress(candidate.address);
    setPositionApplied(candidate.position_applied);
    setExpectedSalary(candidate.expected_salary ? candidate.expected_salary.toString() : '');
    setNotes(candidate.notes || '');
    setStatus(candidate.status);
    setInterviewDate(candidate.interview_date || '');
    setInterviewTime(candidate.interview_time || '');
    setInterviewNotes(candidate.interview_notes || '');
    setJoiningDate(candidate.joining_date || '');
    setOfferedSalary(candidate.offered_salary ? candidate.offered_salary.toString() : '');
    setShowForm(true);
  };

  const handleUpdateStatus = async (candidateId: number, newStatus: string) => {
    try {
      await axios.put(`${API_URL}/api/hr/candidates/${candidateId}`, {
        status: newStatus,
      }, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      fetchCandidates();
    } catch (error) {
      const err: any = error;
      console.error('Error updating status:', err?.response?.status, err?.response?.data || err?.message);
      showError('Failed to update status. Please try again.');
    }
  };

  const handleGenerateAppointmentLetter = async (candidate: Candidate) => {
    try {
      await axios.post(`${API_URL}/api/hr/candidates/${candidate.id}/generate-appointment-letter`, {}, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      fetchCandidates();
      showSuccess('Appointment letter generated successfully!');
    } catch (error) {
      const err: any = error;
      console.error('Error generating appointment letter:', err?.response?.status, err?.response?.data || err?.message);
      showError('Failed to generate appointment letter. Please try again.');
    }
  };

  const handleConvertToEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!convertingCandidate) return;

    setLoading(true);

    const convertData = {
      department_id: parseInt(convertDepartmentId),
      designation_id: parseInt(convertDesignationId),
      branch_id: parseInt(convertBranchId),
      basic_salary: parseFloat(convertBasicSalary),
      commission: convertCommission ? parseFloat(convertCommission) : undefined,
      commission_base: convertCommissionBase || undefined,
      join_date: convertJoinDate,
    };

    try {
      await axios.post(`${API_URL}/api/hr/candidates/${convertingCandidate.id}/convert-to-employee`, convertData, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      fetchCandidates();
      setShowConvertForm(false);
      resetConvertForm();
      showSuccess('Candidate successfully converted to employee!');
    } catch (error) {
      const err: any = error;
      console.error('Error converting candidate:', err?.response?.status, err?.response?.data || err?.message);
      showError('Failed to convert candidate. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this candidate?')) return;

    try {
      await axios.delete(`${API_URL}/api/hr/candidates/${id}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      fetchCandidates();
    } catch (error) {
      const err: any = error;
      console.error('Error deleting candidate:', err?.response?.status, err?.response?.data || err?.message);
      showError('Failed to delete candidate. Please try again.');
    }
  };

  const downloadCv = async (candidate: Candidate) => {
    try {
      const response = await axios.get(`${API_URL}/api/hr/candidates/${candidate.id}/download-cv`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `CV_${candidate.candidate_code}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Error downloading CV:', error);
      showError('Failed to download CV. Please try again.');
    }
  };

  const downloadAppointmentLetter = async (candidate: Candidate) => {
    try {
      const response = await axios.get(`${API_URL}/api/hr/candidates/${candidate.id}/download-appointment-letter`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Appointment_Letter_${candidate.candidate_code}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Error downloading appointment letter:', error);
      showError('Failed to download appointment letter. Please try again.');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'applied': return 'bg-gray-100 text-gray-800';
      case 'shortlisted': return 'bg-blue-100 text-blue-800';
      case 'interviewed': return 'bg-yellow-100 text-yellow-800';
      case 'selected': return 'bg-green-100 text-green-800';
      case 'hired': return 'bg-purple-100 text-purple-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center h-auto sm:h-16 py-3 gap-3">
            <div className="flex items-center justify-between sm:justify-start gap-3">
              <button
                onClick={() => router.push('/dashboard/hrm')}
                className="flex items-center space-x-2 text-gray-700 hover:text-blue-600 transition-colors duration-300"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="font-medium text-sm sm:text-base">Back to HRM</span>
              </button>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
              <div className="hidden md:flex items-center space-x-2 text-sm text-gray-600">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span>Candidate System Active</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                  🎯
                </div>
                <span className="font-medium text-gray-900">Candidate Management</span>
              </div>
              <button
                onClick={() => {
                  localStorage.removeItem('token');
                  router.push('/');
                }}
                className="bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white px-6 py-2 rounded-full text-sm font-medium transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
              >
                Logout
              </button>
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
        {/* Hero Section */}
        <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900">Candidates</h1>
            <p className="text-sm sm:text-base md:text-lg text-gray-600">Manage applicants, interviews and conversions</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { resetForm(); resetEditForm(); setShowForm(true); }}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            >
              Add Candidate
            </button>
            <button onClick={() => fetchCandidates()} className="px-4 py-2 rounded-lg border">Refresh</button>
          </div>
        </div>

        {/* Candidates Table */}
        <div className="bg-white/80 backdrop-blur rounded-xl shadow-sm border">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600">Code</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600">Name</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600">Email</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600">Phone</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600">Position</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600">Status</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((candidate) => (
                <tr key={candidate.id} className="border-t">
                  <td className="px-6 py-4 text-sm text-gray-700">{candidate.candidate_code}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{candidate.first_name} {candidate.last_name}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">{candidate.email}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">{candidate.phone}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">{candidate.position_applied}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(candidate.status)}`}>{candidate.status}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="relative inline-block" ref={openMenuFor === candidate.id ? menuRef : undefined}>
                      <button
                        aria-haspopup="menu"
                        aria-expanded={openMenuFor === candidate.id}
                        aria-controls={`row-menu-${candidate.id}`}
                        onClick={() => setOpenMenuFor(openMenuFor === candidate.id ? null : candidate.id)}
                        className="p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        title="More actions"
                      >
                        <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                      </button>
                      {openMenuFor === candidate.id && (
                        <div
                          id={`row-menu-${candidate.id}`}
                          role="menu"
                          tabIndex={-1}
                          className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-20"
                        >
                          <button role="menuitem" onClick={() => { openProfile(candidate); setOpenMenuFor(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-left text-gray-700 hover:bg-gray-50">
                            <span className="w-4 h-4">👁️</span><span>View</span>
                          </button>
                          <button role="menuitem" onClick={() => { handleEdit(candidate); setOpenMenuFor(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-left text-gray-700 hover:bg-gray-50">
                            <span className="w-4 h-4">✏️</span><span>Edit</span>
                          </button>
                          <button role="menuitem" onClick={() => { openScheduleInterview(candidate); setOpenMenuFor(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-left text-gray-700 hover:bg-gray-50">
                            <span className="w-4 h-4">🗓️</span><span>Interview</span>
                          </button>
                          <button role="menuitem" onClick={() => { openDocs(candidate); setOpenMenuFor(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-left text-gray-700 hover:bg-gray-50">
                            <span className="w-4 h-4">📄</span><span>Documents</span>
                          </button>
                          <button role="menuitem" onClick={() => { openEducations(candidate); setOpenMenuFor(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-left text-gray-700 hover:bg-gray-50">
                            <span className="w-4 h-4">🎓</span><span>Education</span>
                          </button>
                          <button role="menuitem" onClick={() => { openExperiences(candidate); setOpenMenuFor(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-left text-gray-700 hover:bg-gray-50">
                            <span className="w-4 h-4">💼</span><span>Career</span>
                          </button>
                          {candidate.cv_path && (
                            <button role="menuitem" onClick={() => { downloadCv(candidate); setOpenMenuFor(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-left text-gray-700 hover:bg-gray-50">
                              <span className="w-4 h-4">⬇️</span><span>Download CV</span>
                            </button>
                          )}
                          {candidate.status === 'selected' && (
                            <button role="menuitem" onClick={() => { handleGenerateAppointmentLetter(candidate); setOpenMenuFor(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-left text-gray-700 hover:bg-gray-50">
                              <span className="w-4 h-4">📝</span><span>Generate Letter</span>
                            </button>
                          )}
                          {candidate.appointment_letter_path && (
                            <button role="menuitem" onClick={() => { downloadAppointmentLetter(candidate); setOpenMenuFor(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-left text-gray-700 hover:bg-gray-50">
                              <span className="w-4 h-4">⬇️</span><span>Download Letter</span>
                            </button>
                          )}
                          {(candidate.status === 'selected' || candidate.status === 'hired') && (
                            <button role="menuitem" onClick={() => { setConvertingCandidate(candidate); setShowConvertForm(true); setOpenMenuFor(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-left text-gray-700 hover:bg-gray-50">
                              <span className="w-4 h-4">👔</span><span>Convert to Employee</span>
                            </button>
                          )}
                          <div className="my-1 h-px bg-gray-200" />
                          <div className="px-3 py-2">
                            <label className="block text-xs text-gray-500 mb-1">Status</label>
                            <select
                              value={candidate.status}
                              onChange={(e) => { handleUpdateStatus(candidate.id, e.target.value); setOpenMenuFor(null); }}
                              className="w-full px-2 py-1.5 rounded-md border border-gray-300 text-gray-700 bg-white text-xs hover:bg-gray-50"
                            >
                              <option value="applied">Applied</option>
                              <option value="shortlisted">Shortlisted</option>
                              <option value="interviewed">Interviewed</option>
                              <option value="selected">Selected</option>
                              <option value="rejected">Rejected</option>
                              <option value="hired">Hired</option>
                            </select>
                          </div>
                          <div className="my-1 h-px bg-gray-200" />
                          <button role="menuitem" onClick={() => { handleDelete(candidate.id); setOpenMenuFor(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50">
                            <span className="w-4 h-4">🗑️</span><span>Delete</span>
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
      </main>

      {/* Notification Modal */}
      {showNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowNotice(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-start gap-3">
              <div className={
                noticeType === 'success' ? 'w-10 h-10 rounded-xl bg-green-100 text-green-700 flex items-center justify-center' :
                noticeType === 'error' ? 'w-10 h-10 rounded-xl bg-red-100 text-red-700 flex items-center justify-center' :
                'w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center'
              }>
                {noticeType === 'success' ? '✓' : noticeType === 'error' ? '!' : 'i'}
              </div>
              <div className="flex-1">
                <h4 className="text-lg font-semibold text-gray-900">{noticeTitle}</h4>
                <p className="mt-1 text-sm text-gray-700">{noticeMessage}</p>
              </div>
              <button onClick={() => setShowNotice(false)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={() => setShowNotice(false)} className="px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-black">OK</button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Candidate Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-blue-500 to-cyan-500 p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-2xl">
                    🎯
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">
                      {editingCandidate ? 'Edit Candidate' : 'Add New Candidate'}
                    </h3>
                    <p className="text-white/80">
                      {editingCandidate ? 'Update candidate information' : 'Create a new candidate record'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowForm(false);
                    resetForm();
                    resetEditForm();
                  }}
                  className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-white hover:bg-white/30 transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      First Name *
                    </label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-black placeholder-gray-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Last Name *
                    </label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-black placeholder-gray-500"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email *
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-black placeholder-gray-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone *
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-black placeholder-gray-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Address
                  </label>
                  <textarea
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-black placeholder-gray-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Position Applied *
                  </label>
                  <input
                    type="text"
                    value={positionApplied}
                    onChange={(e) => setPositionApplied(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-black placeholder-gray-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    CV File
                  </label>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={(e) => setCvFile(e.target.files?.[0] || null)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-black file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Profile Photo
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-black file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Expected Salary
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={expectedSalary}
                    onChange={(e) => setExpectedSalary(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-black placeholder-gray-500"
                    placeholder="e.g., 50000.00"
                  />
                </div>

                {editingCandidate && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Status
                      </label>
                      <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value as any)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-black bg-white"
                      >
                        <option value="applied">Applied</option>
                        <option value="shortlisted">Shortlisted</option>
                        <option value="interviewed">Interviewed</option>
                        <option value="selected">Selected</option>
                        <option value="rejected">Rejected</option>
                        <option value="hired">Hired</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Interview Date
                        </label>
                        <input
                          type="date"
                          value={interviewDate}
                          onChange={(e) => setInterviewDate(e.target.value)}
                          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-black"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Interview Time
                        </label>
                        <input
                          type="time"
                          value={interviewTime}
                          onChange={(e) => setInterviewTime(e.target.value)}
                          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-black"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Interview Notes
                      </label>
                      <textarea
                        value={interviewNotes}
                        onChange={(e) => setInterviewNotes(e.target.value)}
                        rows={3}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-black placeholder-gray-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Joining Date
                        </label>
                        <input
                          type="date"
                          value={joiningDate}
                          onChange={(e) => setJoiningDate(e.target.value)}
                          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-black"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Offered Salary
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={offeredSalary}
                          onChange={(e) => setOfferedSalary(e.target.value)}
                          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-black placeholder-gray-500"
                        />
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Notes
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-black placeholder-gray-500"
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-6 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      resetForm();
                      resetEditForm();
                    }}
                    className="px-6 py-3 text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50 transition-all duration-200 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white px-6 py-3 rounded-xl font-medium transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  >
                    {loading ? (
                      <div className="flex items-center space-x-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Saving...</span>
                      </div>
                    ) : (
                      <span>{editingCandidate ? 'Update Candidate' : 'Create Candidate'}</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Convert to Employee Modal */}
      {showConvertForm && convertingCandidate && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-green-500 to-emerald-500 p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-2xl">
                    👔
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">
                      Convert to Employee
                    </h3>
                    <p className="text-white/80">
                      Transform candidate into employee
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowConvertForm(false);
                    resetConvertForm();
                  }}
                  className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-white hover:bg-white/30 transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="p-6">
              <form onSubmit={handleConvertToEmployee} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Department *
                  </label>
                  <select
                    value={convertDepartmentId}
                    onChange={(e) => setConvertDepartmentId(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-gray-900 bg-white"
                    required
                  >
                    <option value="">Select Department</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Designation *
                  </label>
                  <select
                    value={convertDesignationId}
                    onChange={(e) => setConvertDesignationId(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-gray-900 bg-white"
                    required
                  >
                    <option value="">Select Designation</option>
                    {designations.map((desig) => (
                      <option key={desig.id} value={desig.id}>
                        {desig.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Branch *
                  </label>
                  <select
                    value={convertBranchId}
                    onChange={(e) => setConvertBranchId(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-gray-900 bg-white"
                    required
                  >
                    <option value="">Select Branch</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Basic Salary *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={convertBasicSalary}
                    onChange={(e) => setConvertBasicSalary(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-gray-900 placeholder-gray-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Commission (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={convertCommission}
                    onChange={(e) => setConvertCommission(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-gray-900 placeholder-gray-500"
                    placeholder="e.g., 5.50 for 5.5%"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Commission Base
                  </label>
                  <select
                    value={convertCommissionBase}
                    onChange={(e) => setConvertCommissionBase(e.target.value as 'company_profit' | 'own_business' | '')}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-gray-900 bg-white"
                  >
                    <option value="">Select Commission Base</option>
                    <option value="company_profit">Company Profit</option>
                    <option value="own_business">Own Business</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Join Date *
                  </label>
                  <input
                    type="date"
                    value={convertJoinDate}
                    onChange={(e) => setConvertJoinDate(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-gray-900"
                    required
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-6 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => {
                      setShowConvertForm(false);
                      resetConvertForm();
                    }}
                    className="px-6 py-3 text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50 transition-all duration-200 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white px-6 py-3 rounded-xl font-medium transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  >
                    {loading ? (
                      <div className="flex items-center space-x-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Converting...</span>
                      </div>
                    ) : (
                      <span>Convert to Employee</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Full Profile Modal */}
      {showProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowProfileModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-xl font-semibold text-gray-900 flex items-center gap-3">
                  {(profileCandidate?.photo_url || profileCandidate?.photo_path) ? (
                    <img
                      src={profileCandidate?.photo_url || `${API_URL}/storage/${profileCandidate?.photo_path}`}
                      alt="avatar"
                      className="w-10 h-10 rounded-full object-cover border border-gray-200"
                    />
                  ) : (
                    <span className="inline-flex w-10 h-10 items-center justify-center rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-bold">
                      {profileCandidate?.first_name?.charAt(0)}{profileCandidate?.last_name?.charAt(0)}
                    </span>
                  )}
                  {profileCandidate ? `${profileCandidate.first_name} ${profileCandidate.last_name}` : 'Loading...'}
                </h3>
                {profileCandidate && (
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                    <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 font-mono">{profileCandidate.candidate_code}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusColor(profileCandidate.status)}`}>{profileCandidate.status}</span>
                    <span className="text-gray-500">{profileCandidate.position_applied}</span>
                  </div>
                )}
              </div>
              <button onClick={() => setShowProfileModal(false)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>

            {profileLoading && (
              <div className="py-16 text-center text-gray-500">Loading profile…</div>
            )}

            {!profileLoading && profileCandidate && (
              <div className="space-y-6 max-h-[70vh] overflow-y-auto">
                {/* Overview */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="border rounded-xl p-4">
                    <div className="text-xs uppercase text-gray-500">Contact</div>
                    <div className="mt-2 text-sm text-gray-900">{profileCandidate.email}</div>
                    <div className="text-sm text-gray-700">{profileCandidate.phone}</div>
                    {profileCandidate.address && <div className="text-sm text-gray-700 mt-1">{profileCandidate.address}</div>}
                  </div>
                  <div className="border rounded-xl p-4">
                    <div className="text-xs uppercase text-gray-500">Interviews</div>
                    <div className="mt-2 text-sm text-gray-900">
                      {(profileCandidate.interviews?.length || 0) === 0 ? (
                        'No interviews yet'
                      ) : (
                        <>
                          <span>Total: {profileCandidate.interviews?.length}</span>
                          {(() => {
                            const latest = [...(profileCandidate.interviews || [])].sort((a,b)=>`${a.interview_date} ${a.interview_time}`.localeCompare(`${b.interview_date} ${b.interview_time}`)).slice(-1)[0];
                            return latest ? (
                              <div className="text-xs text-gray-600">Last: {latest.interview_date} {latest.interview_time} · Result: {latest.result || 'pending'}</div>
                            ) : null;
                          })()}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="border rounded-xl p-4">
                    <div className="text-xs uppercase text-gray-500">Offer</div>
                    <div className="mt-2 text-sm text-gray-900">Expected: {profileCandidate.expected_salary ?? '—'}</div>
                    <div className="text-sm text-gray-900">Offered: {profileCandidate.offered_salary ?? '—'}</div>
                    <div className="text-sm text-gray-700">Joining: {profileCandidate.joining_date || '—'}</div>
                  </div>
                </div>

                {/* Documents */}
                <div className="border rounded-2xl">
                  <div className="px-4 py-3 border-b bg-gradient-to-r from-gray-50 to-gray-100 flex items-center justify-between">
                    <div className="text-sm font-semibold text-gray-900">Documents ({profileCandidate.documents?.length || 0})</div>
                  </div>
                  <div className="p-4 overflow-auto max-h-64">
                    {(profileCandidate.documents?.length || 0) === 0 ? (
                      <div className="text-sm text-gray-500">No documents uploaded.</div>
                    ) : (
                      <table className="min-w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2">Type</th>
                            <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2">Name</th>
                            <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {profileCandidate.documents?.map((d) => (
                            <tr className="border-t" key={d.id}>
                              <td className="px-3 py-2 text-sm text-gray-700">{d.type}</td>
                              <td className="px-3 py-2 text-sm text-gray-700">{d.original_name || d.file_path}</td>
                              <td className="px-3 py-2 text-sm">
                                <button onClick={() => downloadDocument(d)} className="text-indigo-600 hover:underline">Download</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                {/* Education */}
                <div className="border rounded-2xl">
                  <div className="px-4 py-3 border-b bg-gradient-to-r from-gray-50 to-gray-100 flex items-center justify-between">
                    <div className="text-sm font-semibold text-gray-900">Education ({profileCandidate.educations?.length || 0})</div>
                  </div>
                  <div className="p-4 overflow-auto max-h-64">
                    {(profileCandidate.educations?.length || 0) === 0 ? (
                      <div className="text-sm text-gray-500">No education records.</div>
                    ) : (
                      <table className="min-w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2">Institution</th>
                            <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2">Degree</th>
                            <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2">Period</th>
                          </tr>
                        </thead>
                        <tbody>
                          {profileCandidate.educations?.map((e) => (
                            <tr className="border-t" key={e.id}>
                              <td className="px-3 py-2 text-sm text-gray-700">{e.institution}</td>
                              <td className="px-3 py-2 text-sm text-gray-700">{e.degree || '-'} {e.field_of_study ? `(${e.field_of_study})` : ''}</td>
                              <td className="px-3 py-2 text-sm text-gray-700">{e.start_date || '-'} → {e.end_date || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                {/* Career */}
                <div className="border rounded-2xl">
                  <div className="px-4 py-3 border-b bg-gradient-to-r from-gray-50 to-gray-100 flex items-center justify-between">
                    <div className="text-sm font-semibold text-gray-900">Career History ({profileCandidate.experiences?.length || 0})</div>
                  </div>
                  <div className="p-4 overflow-auto max-h-64">
                    {(profileCandidate.experiences?.length || 0) === 0 ? (
                      <div className="text-sm text-gray-500">No experience records.</div>
                    ) : (
                      <table className="min-w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2">Company</th>
                            <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2">Role</th>
                            <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2">Period</th>
                          </tr>
                        </thead>
                        <tbody>
                          {profileCandidate.experiences?.map((x) => (
                            <tr className="border-t" key={x.id}>
                              <td className="px-3 py-2 text-sm text-gray-700">{x.company}</td>
                              <td className="px-3 py-2 text-sm text-gray-700">{x.role}</td>
                              <td className="px-3 py-2 text-sm text-gray-700">{x.start_date || '-'} → {x.is_current ? 'Present' : (x.end_date || '-')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                {/* Interviews list */}
                <div className="border rounded-2xl">
                  <div className="px-4 py-3 border-b bg-gradient-to-r from-gray-50 to-gray-100 flex items-center justify-between">
                    <div className="text-sm font-semibold text-gray-900">Interviews ({profileCandidate.interviews?.length || 0})</div>
                  </div>

                  {/* Scheduled Interviews (global) */}
                  <div className="border rounded-2xl mt-6">
                    <div className="px-4 py-3 border-b bg-gradient-to-r from-gray-50 to-gray-100 flex items-center justify-between">
                      <div className="text-sm font-semibold text-gray-900">Scheduled Interviews ({upcomingInterviews.length})</div>
                      <button className="text-indigo-600 text-sm" onClick={() => fetchUpcomingInterviews()}>Refresh</button>
                    </div>
                    <div className="p-4 overflow-auto max-h-72">
                      {upcomingInterviews.length === 0 ? (
                        <div className="text-sm text-gray-500">No upcoming interviews.</div>
                      ) : (
                        <table className="min-w-full">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2">Date</th>
                              <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2">Time</th>
                              <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2">Candidate</th>
                              <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2">Interviewers</th>
                              <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2">Result</th>
                            </tr>
                          </thead>
                          <tbody>
                            {upcomingInterviews.map(iv => (
                              <tr key={iv.id} className="border-t">
                                <td className="px-3 py-2 text-sm text-gray-700">{iv.interview_date}</td>
                                <td className="px-3 py-2 text-sm text-gray-700">{iv.interview_time}</td>
                                <td className="px-3 py-2 text-sm text-gray-700">
                                  {/* Candidate name comes via interview->candidate in backend response */}
                                  {/* We typecast loosely here since Interview type doesn't include candidate; we rely on runtime */}
                                  {(iv as any).candidate ? `${(iv as any).candidate.first_name} ${(iv as any).candidate.last_name}` : '-'}
                                </td>
                                <td className="px-3 py-2 text-sm text-gray-700">
                                  <div className="flex flex-wrap gap-1">
                                    {(iv.interviewers || []).map(p => (
                                      <span key={p.id} className="inline-flex px-2 py-0.5 text-xs rounded-md bg-yellow-100 text-yellow-800">{p.first_name} {p.last_name}</span>
                                    ))}
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-sm text-gray-700">{iv.result || 'pending'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                  <div className="p-4 overflow-auto max-h-72">
                    {(profileCandidate.interviews?.length || 0) === 0 ? (
                      <div className="text-sm text-gray-500">No interviews scheduled.</div>
                    ) : (
                      <table className="min-w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2">Date</th>
                            <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2">Time</th>
                            <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2">Interviewers</th>
                            <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2">Score</th>
                            <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2">Result</th>
                            <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2">Notes</th>
                            <th className="text-left text-xs font-semibold text-gray-600 px-3 py-2">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {profileCandidate.interviews?.map((iv) => (
                            <tr key={iv.id} className="border-t">
                              <td className="px-3 py-2 text-sm text-gray-700">{iv.interview_date}</td>
                              <td className="px-3 py-2 text-sm text-gray-700">{iv.interview_time}</td>
                              <td className="px-3 py-2 text-sm text-gray-700">
                                <div className="flex flex-wrap gap-1">
                                  {(iv.interviewers || []).map(p => (
                                    <span key={p.id} className="inline-flex px-2 py-0.5 text-xs rounded-md bg-yellow-100 text-yellow-800">{p.first_name} {p.last_name}</span>
                                  ))}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-sm text-gray-700">
                                <input
                                  type="number"
                                  step="0.01"
                                  defaultValue={iv.score ?? ''}
                                  onBlur={async (e) => {
                                    try {
                                      await axios.put(`${API_URL}/api/hr/candidates/${profileCandidate.id}/interviews/${iv.id}`, { score: e.target.value === '' ? null : parseFloat(e.target.value) }, {
                                        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
                                      });
                                    } catch (err: any) {
                                      console.error('Failed to update score', err?.response?.data || err?.message);
                                      showError('Failed to update score');
                                    }
                                  }}
                                  className="w-24 px-2 py-1 border rounded"
                                />
                              </td>
                              <td className="px-3 py-2 text-sm text-gray-700">
                                <select
                                  defaultValue={iv.result || 'pending'}
                                  onChange={async (e) => {
                                    try {
                                      await axios.put(`${API_URL}/api/hr/candidates/${profileCandidate.id}/interviews/${iv.id}`, { result: e.target.value }, {
                                        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
                                      });
                                    } catch (err: any) {
                                      console.error('Failed to update result', err?.response?.data || err?.message);
                                      showError('Failed to update result');
                                    }
                                  }}
                                  className="px-2 py-1 border rounded"
                                >
                                  <option value="pending">Pending</option>
                                  <option value="pass">Pass</option>
                                  <option value="fail">Fail</option>
                                </select>
                              </td>
                              <td className="px-3 py-2 text-sm text-gray-700">{iv.interview_notes || '-'}</td>
                              <td className="px-3 py-2 text-sm text-gray-700">
                                <button
                                  className="text-indigo-600 hover:underline"
                                  onClick={async () => {
                                    try {
                                      const res = await axios.get(`${API_URL}/api/hr/candidates/${profileCandidate.id}`, {
                                        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
                                      });
                                      setProfileCandidate(res.data as CandidateFull);
                                    } catch (err: any) {
                                      console.error('Failed to refresh interviews', err?.response?.data || err?.message);
                                    }
                                  }}
                                >Refresh</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Schedule Interview Modal */}
      {showInterviewModal && activeCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowInterviewModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Schedule Interview - {activeCandidate.first_name} {activeCandidate.last_name}</h3>
              <button onClick={() => setShowInterviewModal(false)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            <form onSubmit={handleScheduleInterview} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Date *</label>
                  <input type="date" value={interviewDate} onChange={(e)=>setInterviewDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-black" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Time *</label>
                  <input type="time" value={interviewTime} onChange={(e)=>setInterviewTime(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-black" required />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                <textarea value={interviewNotes} onChange={(e)=>setInterviewNotes(e.target.value)} rows={3} className="w-full px-3 py-2 border rounded-lg text-black" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Assign Interviewers</label>
                <div className="max-h-40 overflow-auto border rounded-lg p-2">
                  {employeesOptions.length === 0 ? (
                    <div className="text-sm text-gray-500">No employees found</div>
                  ) : (
                    employeesOptions.map(emp => (
                      <label key={emp.id} className="flex items-center gap-2 py-1">
                        <input
                          type="checkbox"
                          checked={selectedInterviewers.includes(emp.id)}
                          onChange={(e)=>{
                            setSelectedInterviewers(prev => e.target.checked ? [...prev, emp.id] : prev.filter(id=>id!==emp.id));
                          }}
                        />
                        <span className="text-sm text-black">{emp.first_name} {emp.last_name} {emp.employee_code ? `(${emp.employee_code})` : ''}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={()=>setShowInterviewModal(false)} className="px-4 py-2 border rounded-lg">Cancel</button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-yellow-600 text-white hover:bg-yellow-700">Schedule</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Documents Modal */}
      {showDocsModal && activeCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowDocsModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Documents - {activeCandidate.first_name} {activeCandidate.last_name}</h3>
              <button onClick={() => setShowDocsModal(false)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            <form onSubmit={uploadDocument} className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
              <select value={docType} onChange={(e) => setDocType(e.target.value)} className="border rounded-lg p-2 md:col-span-1">
                <option value="cv">CV</option>
                <option value="birth_certificate">Birth Certificate</option>
                <option value="police_report">Police Report</option>
                <option value="certificate">Certificate</option>
                <option value="other">Other</option>
              </select>
              <input type="file" onChange={(e) => setDocFile(e.target.files?.[0] || null)} className="border rounded-lg p-2 md:col-span-2" />
              <button type="submit" className="bg-teal-600 text-white rounded-lg px-4 py-2 hover:bg-teal-700">Upload</button>
              <input placeholder="Notes (optional)" value={docNotes} onChange={(e)=>setDocNotes(e.target.value)} className="border rounded-lg p-2 md:col-span-4" />
            </form>
            <div className="max-h-72 overflow-auto border rounded-xl">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left text-xs font-semibold text-gray-600 px-4 py-2">Type</th>
                    <th className="text-left text-xs font-semibold text-gray-600 px-4 py-2">Name</th>
                    <th className="text-left text-xs font-semibold text-gray-600 px-4 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((d) => (
                    <tr key={d.id} className="border-t">
                      <td className="px-4 py-2 text-sm text-gray-700">{d.type}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">{d.original_name || d.file_path}</td>
                      <td className="px-4 py-2 text-sm">
                        <button onClick={() => downloadDocument(d)} className="text-indigo-600 hover:underline mr-3">Download</button>
                        <button onClick={() => deleteDocument(d)} className="text-red-600 hover:underline">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Education Modal */}
      {showEduModal && activeCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowEduModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-3xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Education - {activeCandidate.first_name} {activeCandidate.last_name}</h3>
              <button onClick={() => setShowEduModal(false)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            <form onSubmit={addEducation} className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-4">
              <input value={eduInstitution} onChange={(e)=>setEduInstitution(e.target.value)} placeholder="Institution *" className="border rounded-lg p-2 md:col-span-2 text-gray-900" required />
              <input value={eduDegree} onChange={(e)=>setEduDegree(e.target.value)} placeholder="Degree" className="border rounded-lg p-2 md:col-span-2 text-gray-900" />
              <input value={eduField} onChange={(e)=>setEduField(e.target.value)} placeholder="Field of Study" className="border rounded-lg p-2 md:col-span-2 text-gray-900" />
              <input type="date" value={eduStart} onChange={(e)=>setEduStart(e.target.value)} className="border rounded-lg p-2 md:col-span-2 text-gray-900" />
              <input type="date" value={eduEnd} onChange={(e)=>setEduEnd(e.target.value)} className="border rounded-lg p-2 md:col-span-2 text-gray-900" />
              <input value={eduGrade} onChange={(e)=>setEduGrade(e.target.value)} placeholder="Grade" className="border rounded-lg p-2 md:col-span-2 text-gray-900" />
              <input value={eduDescription} onChange={(e)=>setEduDescription(e.target.value)} placeholder="Description" className="border rounded-lg p-2 md:col-span-6 text-gray-900" />
              <button type="submit" className="bg-sky-600 text-white rounded-lg px-4 py-2 hover:bg-sky-700 md:col-span-1">Add</button>
            </form>
            <div className="max-h-72 overflow-auto border rounded-xl">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left text-xs font-semibold text-gray-600 px-4 py-2">Institution</th>
                    <th className="text-left text-xs font-semibold text-gray-600 px-4 py-2">Degree</th>
                    <th className="text-left text-xs font-semibold text-gray-600 px-4 py-2">Period</th>
                    <th className="text-left text-xs font-semibold text-gray-600 px-4 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {educations.map((e) => (
                    <tr key={e.id} className="border-t">
                      <td className="px-4 py-2 text-sm text-gray-700">{e.institution}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">{e.degree || '-'} {e.field_of_study ? `(${e.field_of_study})` : ''}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">{e.start_date || '-'} → {e.end_date || '-'}</td>
                      <td className="px-4 py-2 text-sm">
                        <button onClick={() => removeEducation(e)} className="text-red-600 hover:underline">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Experience Modal */}
      {showExpModal && activeCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowExpModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-3xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Career History - {activeCandidate.first_name} {activeCandidate.last_name}</h3>
              <button onClick={() => setShowExpModal(false)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            <form onSubmit={addExperience} className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-4">
              <input value={expCompany} onChange={(e)=>setExpCompany(e.target.value)} placeholder="Company *" className="border rounded-lg p-2 md:col-span-2 text-gray-900" required />
              <input value={expRole} onChange={(e)=>setExpRole(e.target.value)} placeholder="Role *" className="border rounded-lg p-2 md:col-span-2 text-gray-900" required />
              <input type="date" value={expStart} onChange={(e)=>setExpStart(e.target.value)} className="border rounded-lg p-2 md:col-span-1 text-gray-900" />
              <input type="date" value={expEnd} onChange={(e)=>setExpEnd(e.target.value)} className="border rounded-lg p-2 md:col-span-1 text-gray-900" />
              <label className="flex items-center gap-2 md:col-span-2 text-sm text-gray-700">
                <input type="checkbox" checked={expCurrent} onChange={(e)=>setExpCurrent(e.target.checked)} /> Current Role
              </label>
              <input value={expResp} onChange={(e)=>setExpResp(e.target.value)} placeholder="Responsibilities" className="border rounded-lg p-2 md:col-span-3 text-gray-900" />
              <input value={expAch} onChange={(e)=>setExpAch(e.target.value)} placeholder="Achievements" className="border rounded-lg p-2 md:col-span-3 text-gray-900" />
              <button type="submit" className="bg-fuchsia-600 text-white rounded-lg px-4 py-2 hover:bg-fuchsia-700 md:col-span-1">Add</button>
            </form>
            <div className="max-h-72 overflow-auto border rounded-xl">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left text-xs font-semibold text-gray-600 px-4 py-2">Company</th>
                    <th className="text-left text-xs font-semibold text-gray-600 px-4 py-2">Role</th>
                    <th className="text-left text-xs font-semibold text-gray-600 px-4 py-2">Period</th>
                    <th className="text-left text-xs font-semibold text-gray-600 px-4 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {experiences.map((x) => (
                    <tr key={x.id} className="border-t">
                      <td className="px-4 py-2 text-sm text-gray-700">{x.company}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">{x.role}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">{x.start_date || '-'} → {x.is_current ? 'Present' : (x.end_date || '-')}</td>
                      <td className="px-4 py-2 text-sm">
                        <button onClick={() => removeExperience(x)} className="text-red-600 hover:underline">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}