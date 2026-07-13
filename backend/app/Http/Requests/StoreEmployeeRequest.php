<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreEmployeeRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true; // For now, allow all authenticated users
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, \Illuminate\Contracts\Validation\ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'first_name' => 'required|string|max:255',
            'last_name' => 'required|string|max:255',
            'email' => 'required|email|unique:employees|unique:users',
            'password' => 'required|string|min:8',
            'role' => 'nullable|string|max:100',
            'phone' => 'nullable|string|max:20',
            'address' => 'nullable|string',
            'photo_path' => 'nullable|string',
            'date_of_birth' => 'nullable|date|before:today',
            'hire_date' => 'required|date',
            'basic_salary' => 'required|numeric|min:0',
            'commission' => 'nullable|numeric|min:0|max:100',
            'commission_base' => 'nullable|in:company_profit,own_business',
            'overtime_payment_per_hour' => 'nullable|numeric|min:0',
            'deduction_late_hour' => 'nullable|numeric|min:0',
            'epf_employee_contribution' => 'nullable|numeric|min:0|max:100',
            'epf_employer_contribution' => 'nullable|numeric|min:0|max:100',
            'etf_employee_contribution' => 'nullable|numeric|min:0|max:100',
            'etf_employer_contribution' => 'nullable|numeric|min:0|max:100',
            'tin' => 'nullable|string|max:100',
            'tax_applicable' => 'nullable|boolean',
            'tax_relief_eligible' => 'nullable|boolean',
            'department_id' => 'required|exists:departments,id',
            'designation_id' => 'nullable|required_without:designation_name|exists:designations,id',
            'designation_name' => 'nullable|required_without:designation_id|string|max:255',
            'reporting_person_id' => 'nullable|exists:employees,id',
            'branch_id' => 'required|exists:companies,id',
            'status' => 'in:active,inactive',
        ];
    }
}
