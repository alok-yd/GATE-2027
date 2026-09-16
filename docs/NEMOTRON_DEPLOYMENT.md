# Nemotron Deployment

## Development API

Run the local Achiever AI Gateway on the development laptop and point it at a remote OpenAI-compatible Nemotron endpoint.

Required server-side environment variables:

```dotenv
NEMOTRON_API_BASE_URL=https://your-nemotron-provider.example/v1
NEMOTRON_API_KEY=replace-with-your-real-key
NEMOTRON_MODEL=nvidia/nemotron-3-ultra-550b-a55b
```

The browser calls `/api/ai/chat`. It does not receive `NEMOTRON_API_KEY`.

## Cloud Inference

Use a managed NVIDIA-compatible provider that exposes `/v1/chat/completions`. Keep provider credentials in the server environment.

## Self-Hosted Inference

The architecture is prepared for a self-hosted OpenAI-compatible endpoint. Future deployment can use NVIDIA NIM, vLLM, NVIDIA Dynamo, or TensorRT-LLM behind the same gateway contract.

Do not install these data-center runtimes on the low-resource development laptop.

## Production Inference

Before production:

- Add authentication between the frontend and gateway.
- Add per-user rate limits and token budgets.
- Persist observability metrics outside process memory.
- Store documents in object storage.
- Add retrieval isolation by user.
- Add validation for every AI action before state changes.
