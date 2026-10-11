# geminithinking: Gemini 2.0 Flash Thinking Mode (Vertex AI doc page)

Source read: `research/refs/geminithinking/raw/thinking-mode-wayback-20250119.html`, an archived copy of cloud.google.com/vertex-ai/generative-ai/docs/thinking-mode (Wayback snapshot 2025-01-19). The footer says "Last updated 2025-01-17 UTC". The page is short, with no numbered pages, so pointers are to its headings.

## What it is

This is Google's Vertex AI doc page for the experimental model `gemini-2.0-flash-thinking-exp-1219`. s1 cites it (reference.bib L588-594) as the model that wrote the s1K reasoning traces and answers (C-10, C-28), and as a comparison row in Table 1 (C-61, C-62, C-68). The page is product documentation, not a paper. It has no benchmark scores, no architecture details and no evaluation protocol.

## Facts Tier 1 needs

- Model ID: `gemini-2.0-flash-thinking-exp-1219`, an experimental model chosen from the Model drop-down in Vertex AI (§ "Use Thinking Mode").
- The model is trained to output its "thinking process" as part of the response, and the page says this gives stronger reasoning than base Gemini 2.0 Flash (intro paragraph).
- Output format: the thinking process is the first element of `response.candidates[0].content.parts`. The page's example prints only `parts[0].text` from `client.models.generate_content(...)` (§ "Thoughts"). The page does not say what the later parts contain.
- Limits: 32k-token input limit and 8k-token output limit. Input can be text and images, and output is text only. Search and code execution tools are not built in (§ "Limitations").
- Not on the page: architecture, parameter count, tokenizer, context length beyond the limits above, sampling defaults, evaluation results, and any terms covering use of model outputs.
- License of the page: content is CC BY 4.0, code samples are Apache 2.0 (footer). Google's API terms, which govern the model and its outputs, are not on this page. The s1K dataset card lists apache-2.0 (datasets/s1K.md:2).

## Conflicts with s1

1. Model ID and API. s1's bib entry names `gemini-2.0-flash-thinking-exp-1219` and cites this Vertex AI page. s1's generation code calls `model="gemini-2.0-flash-thinking-exp"` through `genai.Client(api_key=...)` (data/gemini.py:23-25; verification C-10). That is an alias called with an API key, not the dated `-1219` model in Vertex. The page does not define the alias, so this source cannot confirm which snapshot wrote the 59K traces. Google released `gemini-2.0-flash-thinking-exp-01-21` around 21 Jan 2025 (the live page and the 2025-01-27 snapshot describe it; see factory/decisions.tsv `project/intake/references/fetch-fallback/geminithinking`), so the alias may have resolved to different snapshots over the generation period.

These match the page: s1 takes the trace from `parts[0]` (data/gemini.py:28), as the page documents. The page has no official scores, which fits s1's statement that it benchmarked Gemini itself (L271). The page does not mention the "recitation error" (C-62), so it neither supports nor contradicts that claim.

## Caveats for a local, under-8B, 8 GB replication

- The traces cannot be regenerated locally. The model is a closed, experimental API, and the cited URL now serves a different page. The released s1K traces are the only copy, so use them as they are.
- The 8k-token output cap covers thinking and answer together, so every s1K Gemini trace is short. s1 reports a mean thinking length of 3.6K over the 59K pool and 4.7K for the longest source (C-139, C-140), counted with the Qwen tokenizer. Gemini token counts and Qwen token counts differ, so treat 8K as approximate. This makes s1K, not s1K-1.1 with its long R1 traces, the dataset that best fits an 8 GB budget with a 4K to 8K block size.
- s1's Gemini score (60.0 on AIME24, C-68) came from typing questions into the web interface. A local run cannot reproduce it and should cite it only as reported.
- This page gives no basis for any grading, sampling or prompt setting. Take those from s1's code and the benchmark references instead.
