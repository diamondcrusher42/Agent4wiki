# BitNet (Microsoft)

1-bit LLM inference. 1.58 bits per parameter (ternary weights: -1, 0, 1). x86: 2.37x-6.17x speedup, 71.9-82.2% energy reduction. ARM: 1.37x-5.07x. 100B model on single CPU at 5-7 tok/s (human reading speed). Official 2B model on HuggingFace. CPU and GPU kernels. 36.4k stars.

Enables the bottom tiers of [[concept-token-economics]]: unlimited parallel [[segment-clones]] on CPU (no API cost), always-on [[segment-user-agent]] daemon (near-zero energy), cheap [[segment-janitor]] and [[segment-forge]] monitoring passes. Frees RTX 3090 GPU for heavy work.

github.com/microsoft/BitNet. MIT license.

## Used By
All segments (infrastructure layer)
