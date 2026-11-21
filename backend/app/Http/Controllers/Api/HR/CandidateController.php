<?php

namespace App\Http\Controllers\Api\HR;

use App\Http\Controllers\Controller;
use App\Models\Candidate;
use App\Models\Employee;
use App\Models\CandidateInterview;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Storage;
use Barryvdh\DomPDF\Facade\Pdf;
use App\Notifications\InterviewScheduled;
use Illuminate\Support\Facades\Log;

class CandidateController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): JsonResponse
    {
        $tenantId = $request->input('tenant_id');
        $branchId = $request->input('branch_id');
        $status = $request->input('status');

        $query = Candidate::query();

        if ($tenantId) {
            $query->where('tenant_id', $tenantId);
        }

        if ($branchId) {
            $query->where('branch_id', $branchId);
        }

        if ($status) {
            $query->where('status', $status);
        }

        $candidates = $query->withCount(['documents', 'educations', 'experiences'])->paginate(15);

        return response()->json($candidates);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'first_name' => 'required|string|max:255',
            'last_name' => 'required|string|max:255',
            'email' => 'required|email|unique:candidates',
            'phone' => 'required|string|max:20',
            'address' => 'nullable|string',
            'city' => 'nullable|string|max:120',
            'date_of_birth' => 'nullable|date|before:today',
            'position_applied' => 'required|string|max:255',
            'source' => 'nullable|string|max:100',
            'linkedin_url' => 'nullable|url|max:255',
            'portfolio_url' => 'nullable|url|max:255',
            'years_of_experience' => 'nullable|numeric|min:0|max:60',
            'current_company' => 'nullable|string|max:255',
            'current_designation' => 'nullable|string|max:255',
            'current_salary' => 'nullable|numeric|min:0',
            'notice_period_days' => 'nullable|integer|min:0|max:365',
            'skills' => 'nullable|string|max:1000',
            'cv_file' => 'nullable|file|mimes:pdf,doc,docx|max:5120', // 5MB max
            'photo' => 'nullable|image|mimes:jpg,jpeg,png,webp|max:5120',
            'expected_salary' => 'nullable|numeric|min:0',
            'notes' => 'nullable|string',
        ]);

        // Handle CV file upload
        $cvPath = null;
        if ($request->hasFile('cv_file')) {
            $cvPath = $request->file('cv_file')->store('cvs', 'public');
        }

        // Handle photo upload
        $photoPath = null;
        if ($request->hasFile('photo')) {
            $photoPath = $request->file('photo')->store('candidate_photos', 'public');
        }

        // Generate candidate code
        $lastCandidate = Candidate::withTrashed()->orderBy('id', 'desc')->first();
        $nextNumber = $lastCandidate ? intval(substr($lastCandidate->candidate_code, -4)) + 1 : 1;
        $candidateCode = 'CAND' . str_pad($nextNumber, 4, '0', STR_PAD_LEFT);

        $candidateData = [
            'tenant_id' => 1, // Default tenant
            'branch_id' => 1, // Default branch
            'candidate_code' => $candidateCode,
            'first_name' => $validated['first_name'],
            'last_name' => $validated['last_name'],
            'email' => $validated['email'],
            'phone' => $validated['phone'],
            'address' => $validated['address'] ?? null,
            'city' => $validated['city'] ?? null,
            'date_of_birth' => $validated['date_of_birth'] ?? null,
            'position_applied' => $validated['position_applied'],
            'source' => $validated['source'] ?? null,
            'linkedin_url' => $validated['linkedin_url'] ?? null,
            'portfolio_url' => $validated['portfolio_url'] ?? null,
            'years_of_experience' => $validated['years_of_experience'] ?? null,
            'current_company' => $validated['current_company'] ?? null,
            'current_designation' => $validated['current_designation'] ?? null,
            'current_salary' => $validated['current_salary'] ?? null,
            'notice_period_days' => $validated['notice_period_days'] ?? null,
            'skills' => $validated['skills'] ?? null,
            'cv_path' => $cvPath,
            'photo_path' => $photoPath,
            'expected_salary' => $validated['expected_salary'] ?? null,
            'notes' => $validated['notes'] ?? null,
        ];

        $candidate = Candidate::create($candidateData);

        return response()->json($candidate, 201);
    }

    /**
     * Display the specified resource.
     */
    public function show(Candidate $candidate): JsonResponse
    {
        return response()->json($candidate->load(['documents', 'educations', 'experiences', 'interviewers', 'interviews.interviewers']));
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Candidate $candidate): JsonResponse
    {
        $validated = $request->validate([
            'first_name' => 'sometimes|required|string|max:255',
            'last_name' => 'sometimes|required|string|max:255',
            'email' => 'sometimes|required|email|unique:candidates,email,' . $candidate->id,
            'phone' => 'sometimes|required|string|max:20',
            'address' => 'nullable|string',
            'city' => 'nullable|string|max:120',
            'date_of_birth' => 'nullable|date|before:today',
            'position_applied' => 'sometimes|required|string|max:255',
            'source' => 'nullable|string|max:100',
            'linkedin_url' => 'nullable|url|max:255',
            'portfolio_url' => 'nullable|url|max:255',
            'years_of_experience' => 'nullable|numeric|min:0|max:60',
            'current_company' => 'nullable|string|max:255',
            'current_designation' => 'nullable|string|max:255',
            'current_salary' => 'nullable|numeric|min:0',
            'notice_period_days' => 'nullable|integer|min:0|max:365',
            'skills' => 'nullable|string|max:1000',
            'cv_file' => 'nullable|file|mimes:pdf,doc,docx|max:5120',
            'photo' => 'nullable|image|mimes:jpg,jpeg,png,webp|max:5120',
            'status' => 'in:applied,shortlisted,interviewed,selected,rejected,hired',
            'interview_date' => 'nullable|date',
            'interview_time' => 'nullable|date_format:H:i',
            'interview_notes' => 'nullable|string',
            'interviewer_ids' => 'nullable|array',
            'interviewer_ids.*' => 'exists:employees,id',
            'joining_date' => 'nullable|date',
            'expected_salary' => 'nullable|numeric|min:0',
            'offered_salary' => 'nullable|numeric|min:0',
            'notes' => 'nullable|string',
        ]);

        // Handle CV file upload
        if ($request->hasFile('cv_file')) {
            // Delete old CV if exists
            if ($candidate->cv_path) {
                Storage::disk('public')->delete($candidate->cv_path);
            }
            $validated['cv_path'] = $request->file('cv_file')->store('cvs', 'public');
        }

        // Handle photo upload
        if ($request->hasFile('photo')) {
            if ($candidate->photo_path) {
                Storage::disk('public')->delete($candidate->photo_path);
            }
            $validated['photo_path'] = $request->file('photo')->store('candidate_photos', 'public');
        }

        $candidate->update($validated);

        // Sync interviewers if provided
        if ($request->filled('interviewer_ids')) {
            $candidate->interviewers()->sync($request->input('interviewer_ids'));
        }

        return response()->json($candidate);
    }

    /**
     * Schedule interview: set date/time/location/notes and assign interviewers
     */
    public function scheduleInterview(Request $request, Candidate $candidate): JsonResponse
    {
        $data = $request->validate([
            'interview_date' => 'required|date|after_or_equal:today',
            'interview_time' => 'required|date_format:H:i',
            'interview_notes' => 'nullable|string',
            'interviewer_ids' => 'nullable|array',
            'interviewer_ids.*' => 'exists:employees,id',
        ]);

        $interview = new CandidateInterview([
            'interview_date' => $data['interview_date'],
            'interview_time' => $data['interview_time'],
            'interview_notes' => $data['interview_notes'] ?? null,
        ]);
        $interview->candidate()->associate($candidate);
        $interview->save();

        if (!empty($data['interviewer_ids'])) {
            $interview->interviewers()->sync($data['interviewer_ids']);
            // Maintain candidate-level interviewer rollup for inline chips
            $candidate->interviewers()->syncWithoutDetaching($data['interviewer_ids']);
        }

        if ($candidate->status === 'applied') {
            $candidate->update(['status' => 'shortlisted']);
        }

        // Notify interviewers via email (non-blocking; guard against mail issues)
        $interviewers = $interview->interviewers()->get();
        foreach ($interviewers as $interviewer) {
            if (!empty($interviewer->email)) {
                try {
                    $interviewer->notify(new InterviewScheduled($interview));
                } catch (\Throwable $e) {
                    Log::warning('Failed to dispatch InterviewScheduled notification', [
                        'employee_id' => $interviewer->id,
                        'candidate_id' => $candidate->id,
                        'interview_id' => $interview->id,
                        'error' => $e->getMessage(),
                    ]);
                }
            }
        }

        return response()->json($candidate->load(['interviews.interviewers', 'interviewers']));
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Candidate $candidate): JsonResponse
    {
        // Delete CV file if exists
        if ($candidate->cv_path) {
            Storage::disk('public')->delete($candidate->cv_path);
        }

        // Delete appointment letter if exists
        if ($candidate->appointment_letter_path) {
            Storage::disk('public')->delete($candidate->appointment_letter_path);
        }

        // Delete photo if exists
        if ($candidate->photo_path) {
            Storage::disk('public')->delete($candidate->photo_path);
        }

        $candidate->delete();

        return response()->json(['message' => 'Candidate deleted successfully']);
    }

    /**
     * Generate appointment letter for candidate
     */
    public function generateAppointmentLetter(Candidate $candidate): JsonResponse
    {
        if ($candidate->status !== 'selected') {
            return response()->json(['message' => 'Candidate must be selected to generate appointment letter'], 400);
        }

        // Generate PDF appointment letter
        $pdf = Pdf::loadView('appointment-letter', [
            'candidate' => $candidate,
            'company' => $candidate->tenant,
        ]);

        $filename = 'appointment_letter_' . $candidate->candidate_code . '.pdf';
        $path = 'appointment_letters/' . $filename;

        Storage::disk('public')->put($path, $pdf->output());

        $candidate->update([
            'appointment_letter_path' => $path,
            'status' => 'hired'
        ]);

        return response()->json([
            'message' => 'Appointment letter generated successfully',
            'path' => $path
        ]);
    }

    /**
     * Convert candidate to employee
     */
    public function convertToEmployee(Request $request, Candidate $candidate): JsonResponse
    {
        $validated = $request->validate([
            'department_id' => 'required|exists:departments,id',
            'designation_id' => 'required|exists:designations,id',
            'branch_id' => 'required|exists:companies,id',
            'basic_salary' => 'required|numeric|min:0',
            'commission' => 'nullable|numeric|min:0|max:100',
            'commission_base' => 'nullable|in:company_profit,own_business',
            'join_date' => 'required|date',
        ]);

        // Create employee from candidate data
        $employeeData = [
            'tenant_id' => $candidate->tenant_id,
            'branch_id' => $validated['branch_id'],
            'first_name' => $candidate->first_name,
            'last_name' => $candidate->last_name,
            'email' => $candidate->email,
            'mobile' => $candidate->phone,
            'nic_passport' => 'TEMP' . time(), // Temporary NIC
            'address' => $candidate->address,
            'date_of_birth' => $candidate->date_of_birth,
            'gender' => 'other', // Default
            'department_id' => $validated['department_id'],
            'designation_id' => $validated['designation_id'],
            'join_date' => $validated['join_date'],
            'basic_salary' => $validated['basic_salary'],
            'commission' => $validated['commission'] ?? null,
            'commission_base' => $validated['commission_base'] ?? null,
            'employee_type' => 'full_time',
            'status' => 'active',
        ];

        // Generate employee code
        $lastEmployee = Employee::orderBy('id', 'desc')->first();
        $nextNumber = $lastEmployee ? intval(substr($lastEmployee->employee_code, -4)) + 1 : 1;
        $employeeData['employee_code'] = 'EMP' . str_pad($nextNumber, 4, '0', STR_PAD_LEFT);

        $employee = Employee::create($employeeData);

        // Update candidate status
        $candidate->update(['status' => 'hired']);

        return response()->json([
            'message' => 'Candidate successfully converted to employee',
            'employee' => $employee->load(['department', 'designation'])
        ], 201);
    }

    /**
     * Download CV file
     */
    public function downloadCv(Candidate $candidate)
    {
        if (!$candidate->cv_path) {
            return response()->json(['message' => 'CV file not found'], 404);
        }

        $disk = Storage::disk('public');
        if (!$disk->exists($candidate->cv_path)) {
            return response()->json(['message' => 'CV file not found'], 404);
        }

        return response()->download($disk->path($candidate->cv_path));
    }

    /**
     * Download appointment letter
     */
    public function downloadAppointmentLetter(Candidate $candidate)
    {
        if (!$candidate->appointment_letter_path) {
            return response()->json(['message' => 'Appointment letter not found'], 404);
        }

        $disk = Storage::disk('public');
        if (!$disk->exists($candidate->appointment_letter_path)) {
            return response()->json(['message' => 'Appointment letter not found'], 404);
        }

        return response()->download($disk->path($candidate->appointment_letter_path));
    }
}
