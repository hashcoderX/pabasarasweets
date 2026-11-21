<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\Storage;

class Candidate extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'candidate_code',
        'first_name',
        'last_name',
        'email',
        'phone',
        'address',
        'city',
        'date_of_birth',
        'position_applied',
        'source',
        'linkedin_url',
        'portfolio_url',
        'years_of_experience',
        'current_company',
        'current_designation',
        'current_salary',
        'notice_period_days',
        'skills',
        'cv_path',
        'photo_path',
        'status',
        'interview_date',
        'interview_time',
        'interview_notes',
        'appointment_letter_path',
        'joining_date',
        'expected_salary',
        'offered_salary',
        'notes',
    ];

    protected $casts = [
        'date_of_birth' => 'date',
        'interview_date' => 'date',
        'joining_date' => 'date',
        'interview_time' => 'datetime:H:i',
        'years_of_experience' => 'decimal:1',
        'current_salary' => 'decimal:2',
        'notice_period_days' => 'integer',
        'expected_salary' => 'decimal:2',
        'offered_salary' => 'decimal:2',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Company::class, 'tenant_id');
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Company::class, 'branch_id');
    }

    public function documents()
    {
        return $this->hasMany(CandidateDocument::class);
    }

    public function educations()
    {
        return $this->hasMany(CandidateEducation::class);
    }

    public function experiences()
    {
        return $this->hasMany(CandidateExperience::class);
    }

    public function interviewers()
    {
        return $this->belongsToMany(Employee::class, 'candidate_interviewers');
    }

    public function interviews()
    {
        return $this->hasMany(CandidateInterview::class);
    }

    public function getFullNameAttribute(): string
    {
        return $this->first_name . ' ' . $this->last_name;
    }

    protected $appends = [
        'photo_url',
    ];

    public function getPhotoUrlAttribute(): ?string
    {
        if (!$this->photo_path) {
            return null;
        }
        // Use a public route to serve the photo to avoid symlink issues
        return route('candidate.photo', ['candidate' => $this->id]);
    }
}
