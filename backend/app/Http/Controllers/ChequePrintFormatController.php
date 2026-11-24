<?php

namespace App\Http\Controllers;

use App\Models\ChequePrintFormat;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;

/**
 * Cheque print formats: an uploaded sample cheque image plus the mm positions
 * where date, payee, amount in words and amount in figures are printed.
 */
class ChequePrintFormatController extends Controller
{
    private const DISK = 'local';
    private const DIRECTORY = 'cheque-formats';

    public function index(): JsonResponse
    {
        $formats = ChequePrintFormat::orderByDesc('is_default')->orderBy('name')->get();

        return response()->json([
            'success' => true,
            'data' => $formats->map(fn (ChequePrintFormat $format) => $this->present($format))->values(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), $this->rules());
        if ($validator->fails()) {
            return $this->validationError($validator->errors());
        }

        $payload = $this->payloadFrom($request);
        $payload['created_by'] = $request->user()?->id;

        if ($request->hasFile('sample_image')) {
            $payload['sample_image_path'] = $request->file('sample_image')->store(self::DIRECTORY, self::DISK);
        }

        $format = DB::transaction(function () use ($payload) {
            $isFirst = ChequePrintFormat::count() === 0;
            if (!empty($payload['is_default']) || $isFirst) {
                ChequePrintFormat::query()->update(['is_default' => false]);
                $payload['is_default'] = true;
            }

            return ChequePrintFormat::create($payload);
        });

        return response()->json([
            'success' => true,
            'message' => 'Cheque format saved.',
            'data' => $this->present($format),
        ], 201);
    }

    /** POST (multipart) so the sample image can be replaced in the same request. */
    public function update(Request $request, int $id): JsonResponse
    {
        $format = ChequePrintFormat::findOrFail($id);

        $validator = Validator::make($request->all(), $this->rules(true));
        if ($validator->fails()) {
            return $this->validationError($validator->errors());
        }

        $payload = $this->payloadFrom($request, true);

        if ($request->hasFile('sample_image')) {
            $this->deleteImage($format);
            $payload['sample_image_path'] = $request->file('sample_image')->store(self::DIRECTORY, self::DISK);
        } elseif ($request->boolean('remove_sample_image')) {
            $this->deleteImage($format);
            $payload['sample_image_path'] = null;
        }

        DB::transaction(function () use ($format, $payload) {
            if (!empty($payload['is_default'])) {
                ChequePrintFormat::whereKeyNot($format->id)->update(['is_default' => false]);
            }
            $format->update($payload);
        });

        return response()->json([
            'success' => true,
            'message' => 'Cheque format updated.',
            'data' => $this->present($format->fresh()),
        ]);
    }

    public function destroy(int $id): JsonResponse
    {
        $format = ChequePrintFormat::findOrFail($id);
        $wasDefault = $format->is_default;

        $this->deleteImage($format);
        $format->delete();

        if ($wasDefault) {
            ChequePrintFormat::orderBy('name')->first()?->update(['is_default' => true]);
        }

        return response()->json(['success' => true, 'message' => 'Cheque format deleted.']);
    }

    private function rules(bool $partial = false): array
    {
        $required = $partial ? 'sometimes|required' : 'required';

        return [
            'name' => "{$required}|string|max:255",
            'bank_name' => 'nullable|string|max:255',
            'width_mm' => "{$required}|numeric|min:50|max:300",
            'height_mm' => "{$required}|numeric|min:30|max:200",
            'layout' => 'nullable|string',
            'is_default' => 'nullable|boolean',
            'sample_image' => 'nullable|file|mimes:jpg,jpeg,png,webp|max:4096',
            'remove_sample_image' => 'nullable|boolean',
        ];
    }

    private function payloadFrom(Request $request, bool $partial = false): array
    {
        $payload = [];
        foreach (['name', 'bank_name', 'width_mm', 'height_mm'] as $field) {
            if (!$partial || $request->has($field)) {
                $payload[$field] = $request->input($field);
            }
        }

        if ($request->has('layout')) {
            $decoded = json_decode((string) $request->input('layout'), true);
            $payload['layout'] = is_array($decoded) ? $decoded : null;
        }

        if ($request->has('is_default')) {
            $payload['is_default'] = $request->boolean('is_default');
        }

        return $payload;
    }

    /** The sample image is returned inline so it renders without a public storage link. */
    private function present(ChequePrintFormat $format): array
    {
        $image = null;
        $path = $format->sample_image_path;
        if ($path && Storage::disk(self::DISK)->exists($path)) {
            $mime = Storage::disk(self::DISK)->mimeType($path) ?: 'image/png';
            $image = 'data:' . $mime . ';base64,' . base64_encode((string) Storage::disk(self::DISK)->get($path));
        }

        return array_merge($format->toArray(), ['sample_image' => $image]);
    }

    private function deleteImage(ChequePrintFormat $format): void
    {
        $path = $format->sample_image_path;
        if ($path && Storage::disk(self::DISK)->exists($path)) {
            Storage::disk(self::DISK)->delete($path);
        }
    }

    private function validationError($errors): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => 'Validation failed',
            'errors' => $errors,
        ], 422);
    }
}
