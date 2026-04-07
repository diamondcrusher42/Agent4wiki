# Hardware Stack

## Current Setup
- **GPU**: NVIDIA RTX 3090 (24GB VRAM) — runs Nemotron, specialized clone tasks
- **OS**: Windows 10 + WSL2 + Docker
- **Local AI**: Ollama (Nemotron), [[tool-bitnet]] (2B model on CPU)

## Model Distribution
- RTX 3090: Nemotron/larger models for [[segment-brain]]-class local tasks and sensitive data
- CPU: [[tool-bitnet]] 2B for routine [[segment-clones]], [[segment-user-agent]] daemon, [[segment-janitor]] passes, [[segment-forge]] monitoring
- Cloud: Claude/Opus via API for Brain planning and critical clone work

## Key Constraint
One GPU means careful scheduling. BitNet on CPU frees the GPU for heavy work. Multiple BitNet clones can run simultaneously on CPU without contention.
