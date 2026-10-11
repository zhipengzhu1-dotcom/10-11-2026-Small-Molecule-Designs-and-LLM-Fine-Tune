# s1 claims

Source: arXiv 2501.19393v3, LaTeX at `research/s1/raw/arxiv/latex/main.tex`. Each row is one factual
claim the paper makes, in paper order. The section column gives the section number as the HTML and PDF
render it, then the `main.tex` line where the claim appears. Table and figure numbers follow the rendered
paper. s1-32B is the paper's model and s1K its dataset. A claim restates the paper. It does not mean the
claim is true; issue #9 checks claims against the code and data.

IDs are stable. A wrong claim gets a new row that names the ID it replaces, and the old row stays.
Claims contain no `|` characters, so a row splits cleanly on pipes. The reference list is out of scope
here; issue #5 catalogs it.

| ID | Section | Claim |
|---|---|---|
| C-01 | Title block (L123) | The authors are from Stanford University, the University of Washington, the Allen Institute for AI and Contextual AI. Four authors share first-author credit. |
| C-02 | Abstract (L156) | s1K has 1,000 questions paired with reasoning traces, selected on three criteria: difficulty, diversity and quality. |
| C-03 | Abstract (L156) | Budget forcing controls test-time compute by ending the model's thinking early, or by appending "Wait" one or more times when the model tries to stop. |
| C-04 | Abstract (L156) | The base model is Qwen2.5-32B-Instruct, supervised fine-tuned on s1K. |
| C-05 | Abstract (L156) | s1-32B with budget forcing beats o1-preview on competition math (MATH and AIME24) by up to 27%. |
| C-06 | Abstract (L156) | Budget forcing raises s1-32B on AIME24 from 50% without intervention to 57%. |
| C-07 | Abstract (L156) | The model, data and code are released at github.com/simplescaling/s1. |
| C-08 | §1 (L170) | OpenAI describes o1 as trained with large-scale reinforcement learning. |
| C-09 | §1 (L170) | The authors state that no earlier o1 replication had openly shown clear test-time scaling. |
| C-10 | §1 (L172) | The reasoning traces and answers in s1K are distilled from Gemini Thinking Experimental. |
| C-11 | §1 (L172) | Supervised fine-tuning on s1K takes 26 minutes on 16 H100 GPUs. |
| C-12 | §1 (L172) | To cap thinking, budget forcing appends the end-of-thinking delimiter once the model passes the token limit, and the model then writes its answer. |
| C-13 | §1 (L172) | To extend thinking, budget forcing suppresses the end-of-thinking delimiter and appends "Wait" to the reasoning trace. |
| C-14 | §1 (L174) | Selecting 1,000 samples at random, by longest trace, or by diversity alone each scores about 30% lower on AIME24 on average than s1K. |
| C-15 | §1 (L174) | Training on the full 59K pool, a superset of s1K, gives no substantial gain over the 1K selection. |
| C-16 | §1 (L172, L184) | s1-32B is the most sample-efficient reasoning model and outperforms o1-preview (Figure 2). |
| C-17 | §1 (L166) | Figure 1 shows s1-32B accuracy on reasoning benchmarks rising as test-time compute grows. |
| C-18 | §2 (L191) | Data curation has two stages: collect a 59K pool, then filter it to s1K. |
| C-19 | §2.1 (L196) | The pool starts with 59,029 questions from 16 sources. |
| C-20 | §2.1 (L196) | The collection follows three principles: quality, difficulty and diversity. |
| C-21 | §2.1 (L198) | NuminaMATH is the largest source, with 30,660 math problems from online websites. |
| C-22 | §2.1 (L198) | The pool includes historical AIME problems from 1983 to 2021. |
| C-23 | §2.1 (L198) | OlympicArena adds 4,250 olympiad questions in astronomy, biology, chemistry, computer science, geography, math and physics. |
| C-24 | §2.1 (L198) | OmniMath adds 4,238 competition math problems. |
| C-25 | §2.1 (L198) | AGIEval adds 2,385 problems from standardized tests such as the SAT and LSAT, covering English, law and logic. |
| C-26 | §2.1 (L200) | s1-prob, created by the authors, has 182 questions from the probability section of Stanford Statistics PhD qualifying exams, with handwritten solutions. |
| C-27 | §2.1 (L200) | s1-teasers, created by the authors, has 23 quant-trading interview brain-teasers from PuzzledQuant, taking only the "Hard" level. |
| C-28 | §2.1 (L202) | The Google Gemini Flash Thinking API generated a reasoning trace and a solution for each question, giving 59K triplets of question, trace and solution. |
| C-29 | §2.1 (L202) | The authors decontaminated all samples against MATH500, GPQA Diamond and AIME24 using 8-grams, and deduplicated the data. |
| C-30 | §2.2 (L209) | Removing questions that hit API errors leaves 54,116 samples. |
| C-31 | §2.2 (L209) | Removing samples with formatting problems (ASCII art diagrams, references to missing images, inconsistent question numbering) leaves 51,581. |
| C-32 | §2.2 (L209) | 384 of the final 1,000 samples come straight from datasets the authors judged high-quality, with no further filtering. |
| C-33 | §2.2 (L211) | Qwen2.5-7B-Instruct and Qwen2.5-32B-Instruct each attempt every question, and Claude 3.5 Sonnet grades each attempt against the reference solution. |
| C-34 | §2.2 (L211) | Trace length, counted with the Qwen2.5 tokenizer, is the second difficulty signal, on the assumption that harder problems need more thinking tokens. |
| C-35 | §2.2 (L211) | Dropping every question that either Qwen model solves leaves 24,496 questions. |
| C-36 | §2.2 (L211) | The authors note that filtering with Qwen2.5-32B-Instruct may suit their setup because the same model is the one they fine-tune. |
| C-37 | §2.2 (L213) | Claude 3.5 Sonnet assigns each question a domain from the AMS Mathematics Subject Classification, which also covers sciences such as biology, physics and economics. |
| C-38 | §2.2 (L213) | Selection picks a domain uniformly at random, samples one problem from it with weights favoring longer traces, and repeats until 1,000 samples span 50 domains. |
| C-39 | §2.2 (L215) | s1K keeps some incorrect distilled solutions on purpose, because the goal is to capture the reasoning process. |
| C-40 | §2.2 (L215) | The grader rates 53.6% of s1K and 63.0% of s1K-1.1 as correct. |
| C-41 | §3.1 (L230) | The paper splits test-time scaling into sequential methods, where later computation depends on earlier, and parallel methods such as majority voting. It focuses on sequential. |
| C-42 | §3.1 (L232) | To enforce a maximum, budget forcing appends the end-of-thinking delimiter and, optionally, "Final Answer:". |
| C-43 | §3.1 (L232) | To enforce a minimum, budget forcing suppresses the end-of-thinking delimiter and, optionally, appends "Wait". |
| C-44 | §3.1 (L224) | Figure 3 shows the model trying to stop at an answer of 2; appending "Wait" leads it to correct the answer. |
| C-45 | §3.1 (L234) | Baselines are token-conditional control (a token cap in the prompt), step-conditional control (a step cap, each step about 100 tokens), class-conditional control (a short or long thinking prompt) and rejection sampling. |
| C-46 | §3.1 (L234) | Rejection sampling resamples until a generation fits the compute budget, which the authors call an oracle for the response distribution conditioned on length. |
| C-47 | §3.2 (L241) | Control is the fraction of evaluation runs whose thinking tokens fall between a preset minimum and maximum. The paper usually sets only the maximum. |
| C-48 | §3.2 (L245) | Scaling is the average slope of the piecewise-linear accuracy-versus-thinking-tokens curve over every pair of runs. Useful methods have a positive value. |
| C-49 | §3.2 (L249) | Performance is the highest accuracy a method reaches across its runs. |
| C-50 | §3.2 (L239) | The rightmost AIME24 point in Figure 1 is 57% accuracy at 7,320 thinking tokens. |
| C-51 | §3.2 (L257) | In Figure 4a the three rightmost points stop the model from ending its thinking 2, 4 and 6 times, appending "Wait" each time. |
| C-52 | §3.2 (L257) | Figure 4b samples Qwen2.5-32B-Instruct 64 times per question at temperature 1 and majority-votes over 2, 4, 8, 16, 32 and 64 samples. |
| C-53 | §4.1 (L267) | Fine-tuning used PyTorch FSDP on 16 NVIDIA H100 GPUs and took 26 minutes. |
| C-54 | §4.1 (L269) | AIME24 has the 30 problems of the 2024 AIME (January 31 to February 1, 2024), each answer an integer from 000 to 999. |
| C-55 | §4.1 (L269) | AIME problems that rely on figures reach the model as Asymptote vector-graphics code, because the model takes no images. |
| C-56 | §4.1 (L269) | MATH500 is the 500-problem subset of MATH that OpenAI selected in "Let's verify step by step". |
| C-57 | §4.1 (L269) | GPQA Diamond has 198 PhD-level questions in biology, chemistry and physics, and "GPQA" in the paper always means this subset. |
| C-58 | §4.1 (L269) | PhD experts score 69.7% on GPQA Diamond, a figure cited from OpenAI's o1 report. |
| C-59 | §4.1 (L269) | The evaluation builds on lm-evaluation-harness. |
| C-60 | §4.1 (L269) | Unless stated otherwise, evaluation uses temperature 0 (greedy decoding) and reports accuracy, which equals pass@1. |
| C-61 | §4.1 (L271) | The comparison models are the o1 series, the DeepSeek r1 series, QwQ-32B-preview, Sky-T1-32B-Preview, Bespoke-32B and Gemini 2.0 Flash Thinking Experimental. |
| C-62 | §4.1 (L271) | The authors scored Gemini 2.0 Flash Thinking on AIME24 only, typing the 30 questions into its web interface to avoid the API's recitation error. MATH500 and GPQA are N.A. for it. |
| C-63 | §4.1 (L275) | Table 1 numbers for models other than s1, Qwen and Gemini come from those models' own reports. |
| C-64 | §4.1 (L303) | Table 1: s1-32B (1K examples) scores 56.7 on AIME24, 93.0 on MATH500 and 59.6 on GPQA Diamond. |
| C-65 | §4.1 (L302) | Table 1: s1 without budget forcing scores 50.0 on AIME24, 92.6 on MATH500 and 56.6 on GPQA. |
| C-66 | §4.1 (L291) | Table 1: Qwen2.5-32B-Instruct scores 26.7 on AIME24, 84.0 on MATH500 and 49.0 on GPQA. |
| C-67 | §4.1 (L282) | Table 1: o1-preview scores 44.6, 85.5 and 73.3 on AIME24, MATH500 and GPQA. o1-mini scores 70.0, 90.0 and 60.0. o1 scores 74.4, 94.8 and 77.3. |
| C-68 | §4.1 (L286) | Table 1: Gemini 2.0 Flash Thinking scores 60.0 on AIME24. |
| C-69 | §4.1 (L293) | Table 1: QwQ-32B scores 50.0, 90.6 and 54.5 on AIME24, MATH500 and GPQA. |
| C-70 | §4.1 (L294) | Table 1: r1, trained on far more than 800K examples, scores 79.8, 97.3 and 71.5. r1-distill, trained on 800K, scores 72.6, 94.3 and 62.1. |
| C-71 | §4.1 (L299) | Table 1: Sky-T1 (17K examples) scores 43.3, 82.4 and 56.8. Bespoke-32B (17K) scores 63.3, 93.0 and 58.1. |
| C-72 | §4.2 (L352) | Budget forcing improves AIME24 with more compute but flattens out at six suppressions (Figure 4a). |
| C-73 | §4.2 (L352) | Suppressing the end-of-thinking delimiter too often can push the model into repetitive loops. |
| C-74 | §4.2 (L352) | Majority voting on the base model does not reach s1-32B's accuracy, which the authors read as sequential scaling beating parallel scaling (Figure 4b). |
| C-75 | §4.2 (L354) | The authors call s1-32B the most sample-efficient open-data reasoning model. |
| C-76 | §4.2 (L354) | r1-32B is stronger than s1-32B and also uses only SFT, but trains on 800 times more reasoning samples. |
| C-77 | §4.2 (L354) | s1-32B nearly matches Gemini 2.0 Thinking on AIME24, which the authors take as evidence that distillation from Gemini worked. |
| C-78 | §4.2 (L535) | Figure 5 shows correct s1-32B outputs on one question each from AIME24, MATH500 and GPQA, with the traces trimmed. |
| C-79 | §5.1 (L546) | All Table 2 scores use budget forcing with a cap of about 30,000 thinking tokens, which scores slightly above no forcing because a looping model can still give a best guess. |
| C-80 | §5.1 (L546) | Table 2 reports 95% paired bootstrap confidence intervals of the difference from s1K, using 10,000 bootstrap samples. |
| C-81 | §5.1 (L560) | Table 2: s1K scores 50.0 on AIME24, 93.0 on MATH500 and 57.6 on GPQA. |
| C-82 | §5.1 (L551) | Table 2: 1K-random (quality only) scores 36.7, 90.6 and 52.0, with an AIME24 interval of [-26.7%, -3.3%]. |
| C-83 | §5.1 (L553) | Table 2: 1K-diverse (diversity only) scores 26.7, 91.2 and 54.6, with an AIME24 interval of [-40.0%, -10.0%]. |
| C-84 | §5.1 (L555) | Table 2: 1K-longest (difficulty only) scores 33.3, 90.4 and 59.6, with an AIME24 interval of [-36.7%, 0.0%]. Its GPQA score is higher than s1K's. |
| C-85 | §5.1 (L557) | Table 2: 59K-full scores 53.3, 92.8 and 58.1, with an AIME24 interval of [-13.3%, 20.0%]. |
| C-86 | §5.1 (L566) | Fine-tuning on the 59K pool cost 394 H100 GPU hours, against 7 for s1-32B. |
| C-87 | §5.1 (L566) | The authors conclude that combining quality, difficulty and diversity is what makes training sample-efficient. |
| C-88 | §5.2 (L578) | Table 3 (AIME24): budget forcing has 100% Control, Scaling 15 and Performance 56.7 over 5 runs. |
| C-89 | §5.2 (L580) | Table 3: token-conditional control has 40% Control, Scaling -24 and Performance 40.0. Adding budget forcing gives 100%, 13 and 40.0. |
| C-90 | §5.2 (L582) | Table 3: step-conditional control has 60% Control, Scaling 3 and Performance 36.7. Adding budget forcing gives 100%, 6 and 36.7. |
| C-91 | §5.2 (L584) | Table 3: class-conditional control has 50% Control, Scaling 25 and Performance 36.7, over only 2 runs. |
| C-92 | §5.2 (L586) | Table 3: rejection sampling has 100% Control, Scaling -35 and Performance 40.0. |
| C-93 | §5.2 (L594) | The authors chose budget forcing for s1-32B because it gives perfect control, good scaling and the best AIME24 score. |
| C-94 | §5.2 (L605) | Table 4, ignoring the end-of-thinking delimiter twice: appending "Wait" scores 53.3, 93.0 and 59.6 on AIME24, MATH500 and GPQA, the best of the strings tested. |
| C-95 | §5.2 (L605) | Table 4: no extrapolation scores 50.0, 93.0 and 57.6. Two ignores with no string score 50.0, 90.2 and 55.1. "Alternatively" scores 50.0, 92.2 and 59.6. "Hmm" scores 50.0, 93.0 and 59.6. |
| C-96 | §5.2 (L596) | Token-conditional control fails without budget forcing because the model cannot count tokens, even after training to do so. |
| C-97 | §5.2 (L596) | Under step-conditional control the model keeps total tokens roughly fixed by trading step count against tokens per step. |
| C-98 | §5.2 (L596) | Prompting the model to think longer can raise both its compute and its performance. |
| C-99 | §5.2 (L620, L624) | Rejection sampling at temperature 1 on AIME24 shows inverse scaling: accuracy falls as the allowed length grows (Figure 6). |
| C-100 | §5.2 (L620) | Figure 6's caption lists length caps of 3,500, 4,000, 5,000, 8,000 and 16,000 thinking tokens and average tries per sample of 655, 97, 8, 3, 2 and 1. |
| C-101 | §5.2 (L624) | The authors hypothesize that short generations are the ones on the right track from the start, while long ones backtrack after mistakes, so long samples are more often wrong. |
| C-102 | §6.1 (L631) | DeepSeek-r1 and k1.5 use reinforcement learning. Sky-T1, RedStar and Bespoke use SFT on tens of thousands of distilled examples. |
| C-103 | §6.1 (L631) | The authors claim budget forcing with s1-32B is the first reproduction of OpenAI's test-time scaling curves. |
| C-104 | §6.1 (L631) | The authors hypothesize that pretraining already gives the model reasoning ability, and 1,000-sample SFT only activates it, as in LIMA's Superficial Alignment Hypothesis. |
| C-105 | §6.1 (L633) | Related work on reasoning covers harder benchmarks, continued pretraining on math and science corpora, reasoning-specific training methods, and prompting methods such as chain-of-thought. |
| C-106 | §6.2 (L637) | Parallel methods pick among independent attempts by majority vote or by an external reward (Best-of-N). Sequential methods refine each attempt using earlier ones. Tree search, such as MCTS and guided beam search, mixes the two. |
| C-107 | §6.2 (L637) | REBASE uses a process reward model to balance exploitation and pruning in tree search, and Wu et al. report that it beats sampling and MCTS. |
| C-108 | §6.2 (L637) | Outcome reward models score whole solutions and suit Best-of-N. Process reward models score single steps and suit tree search. |
| C-109 | §6.2 (L639) | Budget forcing has two limits: its gains flatten out, and the model's context window caps it. |
| C-110 | §6.2 (L641) | Suggested next steps are rotating through strings other than "Wait", adding frequency penalties or higher temperature to avoid loops, and testing budget forcing on RL-trained models. |
| C-111 | §6.2 (L649) | The REBASE process reward model starts from LLaMA-34B and is fine-tuned on synthetic process-reward data. REBASE outputs are combined by majority vote. |
| C-112 | §6.2 (L649) | In Figure 7, REBASE scales better than majority voting and better than sequential scaling, at the cost of an extra reward-model forward pass per step. |
| C-113 | §6.2 (L645) | Figure 7 averages over the 30 AIME24 questions. Sequential points prompt for up to 32, 64, 256 and 512 steps. REBASE and majority voting use 16 parallel trajectories. Its token counts leave out reward-model compute. |
| C-114 | §6.2 (L649) | When prompted for up to 512 steps, 12 of the 30 AIME24 responses overflow the context window, and accuracy drops sharply. |
| C-115 | Impact statement (L655) | The authors cite the lack of transparency in o1 and r1 as the reason to do the work fully in the open. |
| C-116 | Acknowledgements (L659) | Ryan Marten generated the DeepSeek r1 traces for s1.1 with Bespoke Curator. Part of the work ran on Stanford's Marlowe GPU cluster. |
| C-117 | App. A (L686) | s1.1 came out seven days after s1. Its dataset, s1K-1.1, has the same 1,000 questions with traces regenerated by DeepSeek r1, and the training procedure is unchanged. |
| C-118 | App. A (L686) | s1.1 performs significantly better than s1. |
| C-119 | App. A (L686) | Distilling from Claude 3.7 did worse than distilling from r1. The paper gives no numbers for it. |
| C-120 | App. A (L690) | Table 5 takes other models' scores from their reports, except AIME 2025, which comes from Ye et al.'s AIME preview. |
| C-121 | App. A (L718) | Table 5: s1.1 without budget forcing scores 94.4 on MATH500, 60.6 on GPQA, 56.7 on AIME 2024 and 50.0 on AIME 2025. |
| C-122 | App. A (L719) | Table 5: s1.1 with "Wait" once scores 95.4, 62.6, 56.7 and 50.0. With "Wait" twice it scores 95.4, 63.6, 56.7 and 50.0. |
| C-123 | App. A (L714) | Table 5: s1 without budget forcing scores 92.6, 56.6, 50.0 and 26.7 on MATH500, GPQA, AIME 2024 and AIME 2025. |
| C-124 | App. A (L715) | Table 5: s1 with "Wait" 1x scores 92.8, 59.6, 53.3 and 30.0. With 2x it scores 93.0, 59.6, 53.3 and 33.3. With 4x it scores 92.2, 58.6, 56.7 and 36.7. |
| C-125 | App. A (L713) | Table 5: LIMO, trained on 817 examples, scores 94.8, 66.7, 56.3 and 44.6. |
| C-126 | App. A (L699) | Table 5: o3-mini-high scores 97.9, 79.7, 83.8 and 80.9 on MATH500, GPQA, AIME 2024 and AIME 2025, the best GPQA and AIME 2024 scores in the table. |
| C-127 | App. A (L705) | Table 5: QwQ-32B scores 46.7 on AIME 2024 and r1-distill-Qwen-32B scores 58.3. |
| C-128 | App. B (L729) | The authors run evaluations with vLLM because it was the fastest option they tried. |
| C-129 | App. B (L729) | Scores change across vLLM runs even with fixed seeds and greedy decoding, because of batch size, continued generations and tensor-parallel settings. |
| C-130 | App. B (L736) | Long traces amplify these differences: generations can match for thousands of tokens, diverge at one token and reach a different answer. |
| C-131 | App. B (L736) | Final evaluations run in full precision unless the paper says otherwise, to reduce this variance. |
| C-132 | App. C.1 (L747) | Table 6 counts tokens with the Qwen-2.5 tokenizer, and Claude wrote each domain's keywords from sample questions. |
| C-133 | App. C.1 (L752) | Table 6: the largest domains are geometry (109 questions, 560.2K tokens), number theory (98, 522.5K) and combinatorics (75, 384.7K). |
| C-134 | App. C.1 (L785) | Table 6 lists 23 named domains plus "remaining 27 domains" with 242 questions and 982.2K tokens, each of those with at most 16 questions. |
| C-135 | App. C.1 (L787) | Table 6 totals 1,000 questions and 4.7M tokens, labeled "All domains (51)". |
| C-136 | App. C.2 (L798) | Table 7 measures thinking length with the Qwen2.5-32B-Instruct tokenizer. |
| C-137 | App. C.2 (L798) | AIME 2022 and 2023 (90 questions) are left out of the pool because the authors used them during development. |
| C-138 | App. C.2 (L804) | Table 7 sources beyond §2.1 are MATH (11,999), xword crosswords (999), OlympiadBench (896), TheoremQA (747), USACO (519), JEEBench (515), GPQA (348), SciEval (227) and LiveCodeBench (151). |
| C-139 | App. C.2 (L810) | Table 7: AIME 1983-2021 contributes 890 questions with the longest average thinking length, 4.7K tokens. |
| C-140 | App. C.2 (L820) | Table 7: the pool totals 59,029 questions with an average thinking length of 3.6K tokens. |
| C-141 | App. C.3 (L831) | Claude 3.5 does the grading for selection, but Claude 3.7 graded correctness of the final 1,000 samples. |
| C-142 | App. C.3 (L836) | The grading prompt (Figure 8) gives the grader the problem, the attempt and the correct answer, and asks it to explain and end with "Yes" or "No". |
| C-143 | App. C.4 (L886) | Algorithm 1 first keeps every question Gemini answered correctly from AIME or GPQA, and every Gemini-correct MATH question with thinking length above 5,600. |
| C-144 | App. C.4 (L898) | Algorithm 1 then loops until it has 1,000 questions: pick a random domain, rank its questions by thinking length, weight each by 2 to the power of minus its rank, sample one, and drop the domain once empty. |
| C-145 | App. C.4 (L921) | None of the selected samples overlap with the final evaluation sets. |
| C-146 | App. C.5 (L925) | Decontamination drops questions that share more than an 8-gram with MATH500, GPQA Diamond or AIME24. |
| C-147 | App. D (L931) | Qwen2.5-32B-Instruct generally matches or beats Qwen2.5-72B-Instruct on math, which is why the authors chose it. |
| C-148 | App. D (L931) | The thinking stage opens with Qwen's im_start chat token followed by "think", and the answer opens with im_start followed by "answer", each delimiter with a newline before and after. The exact strings are under Appendix D in sections.md. |
| C-149 | App. D (L931) | Training runs 5 epochs at batch size 16, for 315 gradient steps. |
| C-150 | App. D (L931) | Training uses bfloat16 and a learning rate of 1e-5, warmed up linearly over 5% of training (16 steps), then cosine-decayed to 0 over 299 steps. |
| C-151 | App. D (L931) | The optimizer is AdamW with beta1 0.9, beta2 0.95 and weight decay 1e-4. |
| C-152 | App. D (L931) | Loss is computed on reasoning traces and solutions only, not on questions. |
| C-153 | App. D (L931) | The sequence length is set high enough that no sample is cut off. |
| C-154 | App. D (L937) | Figure 9 shows s1-32B's training dynamics on s1K. The text says nothing more about it. |
| C-155 | App. D.1 (L952) | Table 8: a training sequence length of 4,096 cuts off 74% of samples; 32,768 cuts off none. |
| C-156 | App. D.1 (L955) | Table 8: with length 4,096 the model scores 30.0% on AIME24 at 20,721 average thinking tokens, 90.0% on MATH500 at 5,324 and 52.5% on GPQA at 6,841. |
| C-157 | App. D.1 (L955) | Table 8: with length 32,768 the model scores 50.0% on AIME24 at 6,984 average thinking tokens, 91.0% on MATH500 at 3,268 and 53.0% on GPQA at 3,568. |
| C-158 | App. D.1 (L963) | A shorter training sequence length produces longer reasoning at test time, because truncation removes the answer from more samples and the model sees fewer examples of ending its thinking. |
| C-159 | App. D.1 (L963) | The authors use the longest training sequence length because it scores better and gives shorter traces. |
| C-160 | App. D.2 (L975) | Tables 9 to 11 show s1K training samples from s1-prob, s1-teasers and the OlympicArena astronomy subset. Gemini wrote each trace and response from the question alone. |
| C-161 | App. E.1 (L2538) | Figure 10: the token format appends "Think for up to N tokens" to the user turn; the step format marks steps with "N steps left" delimiters counting down. Training loss covers only the trace and the answer. |
| C-162 | App. E.1 (L2610) | For token-conditional training, trace lengths are rounded up to the next power of two and the matching instruction goes into the prompt. |
| C-163 | App. E.1 (L2552) | Table 12, no intervention: for token caps of 1,024, 2,048, 4,096, 8,192 and 16,384, the model uses 7,939, 7,158, 8,263, 7,108 and 7,500 thinking tokens and scores 26.7, 30.0, 33.3, 33.3 and 40.0 on AIME24. |
| C-164 | App. E.1 (L2558) | Table 12, forcing the end at the cap: thinking tokens are 1,024, 2,048, 4,031, 5,664 and 6,330, and AIME24 scores are 3.3, 30.0, 33.3, 33.3 and 40.0. |
| C-165 | App. E.1 (L2610) | Token-conditional Control in Table 3 is the share of runs under the cap: 2 of 5 without forcing and 5 of 5 with it. |
| C-166 | App. E.1 (L2610) | The authors cite Zhang et al. as suggesting that o1-mini also cannot follow token instructions. |
| C-167 | App. E.1 (L2612) | Step-conditional training splits traces into steps at double newlines and rounds step counts up to powers of two. Counting down worked better than counting up in early tests. |
| C-168 | App. E.1 (L2612) | Without intervention the model sometimes counts past zero into negative steps. Forcing appends the answer delimiter at 0 steps left. |
| C-169 | App. E.1 (L2575) | Table 13, no intervention: for step caps of 16, 32, 64, 128 and 256 the model uses 123, 90, 80, 82 and 136 steps and scores 33.3, 23.3, 33.3, 36.7 and 33.3 on AIME24. |
| C-170 | App. E.1 (L2583) | Table 13, forced: the model uses 16, 32, 59, 78 and 136 steps at 96, 94, 80, 70 and 56 tokens per step, with 1,517, 2,963, 4,636, 5,409 and 7,551 thinking tokens and AIME24 scores of 23.3, 23.3, 33.3, 36.7 and 33.3. |
| C-171 | App. E.1 (L2612) | Each step delimiter costs about 6 tokens, about 380 tokens at 64 steps. |
| C-172 | App. E.1 (L2612) | Step-conditional Control uses a proxy cap of 100 tokens per instructed step: 3 of 5 runs fit without forcing and 5 of 5 with it. |
| C-173 | App. E.1 (L2612) | The Figure 7 model is a step-conditional model trained on an earlier version of the data and evaluated with an earlier version of the evaluation code. |
| C-174 | App. E.1 (L2614) | OpenAI's API exposes a reasoning_effort setting of low, medium or high. The authors guess OpenAI changes the prompt per setting. |
| C-175 | App. E.1 (L2600) | Table 14: the short-thinking prompt gives 30.0% at 8,033 tokens on AIME24, 90.4% at 2,537 on MATH500 and 56.6% at 4,177 on GPQA. |
| C-176 | App. E.1 (L2602) | Table 14: the long-thinking prompt gives 36.7% at 9,651 tokens on AIME24, 91.4% at 3,875 on MATH500 and 51.0% at 4,827 on GPQA. |
| C-177 | App. E.1 (L2604) | Table 14: with no added prompt the model gives 50.0% at 6,109 tokens on AIME24, 93.0% at 3,298 on MATH500 and 57.6% at 3,510 on GPQA. |
| C-178 | App. E.1 (L2614) | Class-conditional Control is 50% because on AIME24 the long prompt used more tokens than the default, as expected, but the short prompt also used more. |
| C-179 | App. E.2 (L2622) | Table 15 uses an earlier version of s1-32B sampled at temperature 1 on one AIME24 question. Under a 4,000-token cap it answers correctly; under an 8,000-token cap it answers wrongly. |
| C-180 | App. E.2 (L2622) | Reaching 4,000 thinking tokens or fewer took 199 tries on average; 8,000 or fewer took 1. |
| C-181 | App. E.2 (L2634, L3053) | The correct generation used 3,981 thinking and 1,055 answer tokens. The incorrect one used 5,923 thinking and 754 answer tokens. |
| C-182 | App. F (L3586) | Version 2 (2025-02) added citations and small edits. Version 3 (2025-03) added Appendix A on s1.1 and the share of correct samples in §2. |
