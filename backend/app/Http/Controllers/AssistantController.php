<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;

class AssistantController extends Controller
{
    public function query(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'prompt' => 'required|string|max:5000',
            'mode' => 'nullable|in:help,document,graph,details',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $apiKey = (string) env('OPENAI_API_KEY', '');
        if ($apiKey === '') {
            return response()->json([
                'success' => false,
                'message' => 'OpenAI API key is missing. Set OPENAI_API_KEY in backend .env.',
            ], 500);
        }

        $payload = $validator->validated();
        $prompt = trim((string) ($payload['prompt'] ?? ''));
        $mode = (string) ($payload['mode'] ?? 'help');

        try {
            $response = Http::withToken($apiKey)
                ->acceptJson()
                ->timeout(60)
                ->post('https://api.openai.com/v1/responses', [
                    'model' => (string) env('OPENAI_MODEL', 'gpt-4.1-mini'),
                    'temperature' => 0.25,
                    'input' => [
                        [
                            'role' => 'system',
                            'content' => [
                                [
                                    'type' => 'input_text',
                                    'text' => $this->buildSystemPrompt($mode),
                                ],
                            ],
                        ],
                        [
                            'role' => 'user',
                            'content' => [
                                [
                                    'type' => 'input_text',
                                    'text' => $prompt,
                                ],
                            ],
                        ],
                    ],
                ]);

            if (!$response->successful()) {
                return response()->json([
                    'success' => false,
                    'message' => 'Assistant request failed',
                    'error' => $response->json('error.message') ?? 'Unknown error',
                ], $response->status() ?: 500);
            }

            $outputText = (string) ($response->json('output_text') ?? '');
            if ($outputText === '') {
                $outputText = $this->extractOutputText($response->json('output', []));
            }

            $structured = $this->parseStructuredOutput($outputText, $mode);

            return response()->json([
                'success' => true,
                'data' => $structured,
            ]);
        } catch (\Throwable $e) {
            Log::error('Assistant query failed', [
                'error' => $e->getMessage(),
                'mode' => $mode,
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Assistant service unavailable',
            ], 500);
        }
    }

    private function buildSystemPrompt(string $mode): string
    {
        $modeGuidance = match ($mode) {
            'document' => 'Focus on document drafting with clean sections and actionable language.',
            'graph' => 'Focus on process mapping. Include a valid Mermaid flowchart in graph_mermaid.',
            'details' => 'Focus on extracting important details, checks, risks, and follow-up actions.',
            default => 'Provide practical system-usage help with short, clear operational steps.',
        };

        return implode("\n", [
            'You are a skilled business operations assistant for a BMS application.',
            $modeGuidance,
            'Always return strict JSON only, no markdown wrapper, with this schema:',
            '{"answer":"string","document":"string or empty","graph_mermaid":"string or empty","details":["string"],"mode":"help|document|graph|details"}',
            'Rules:',
            '- Keep answer concise and practical.',
            '- For mode=document, include a full draft in document.',
            '- For mode=graph, include Mermaid flowchart syntax in graph_mermaid.',
            '- For mode=details, include 4-8 bullets in details.',
            '- If graph not needed, graph_mermaid must be empty string.',
            '- If document not needed, document must be empty string.',
        ]);
    }

    private function extractOutputText(array $output): string
    {
        $chunks = [];

        foreach ($output as $item) {
            $content = $item['content'] ?? [];
            if (!is_array($content)) {
                continue;
            }

            foreach ($content as $block) {
                if (isset($block['text']) && is_string($block['text'])) {
                    $chunks[] = $block['text'];
                }
            }
        }

        return trim(implode("\n", $chunks));
    }

    private function parseStructuredOutput(string $text, string $mode): array
    {
        $decoded = json_decode($text, true);

        if (!is_array($decoded)) {
            $start = strpos($text, '{');
            $end = strrpos($text, '}');
            if ($start !== false && $end !== false && $end > $start) {
                $slice = substr($text, $start, $end - $start + 1);
                $decoded = json_decode($slice, true);
            }
        }

        if (!is_array($decoded)) {
            return [
                'answer' => $text,
                'document' => $mode === 'document' ? $text : '',
                'graph_mermaid' => '',
                'details' => [],
                'mode' => $mode,
            ];
        }

        $details = $decoded['details'] ?? [];
        if (!is_array($details)) {
            $details = [];
        }

        return [
            'answer' => (string) ($decoded['answer'] ?? ''),
            'document' => (string) ($decoded['document'] ?? ''),
            'graph_mermaid' => (string) ($decoded['graph_mermaid'] ?? ''),
            'details' => array_values(array_filter(array_map(static fn ($line) => trim((string) $line), $details))),
            'mode' => (string) ($decoded['mode'] ?? $mode),
        ];
    }
}
