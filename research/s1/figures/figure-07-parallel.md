# Figure 7. Scaling further with parallel scaling methods

Label: `fig:parallel` (main.tex L643-L647, §6.2; image `figures/parallel_stretched.pdf`)

A line plot of AIME24 accuracy, averaged over the 30 questions, for three ways to spend more compute. The
model is a step-conditional model trained on an earlier version of the data (L2612, C-173).

- x axis: average thinking time in tokens, log scale, ticks 2048, 8192, 32768 and 131072. REBASE token
  counts leave out the reward model's compute.
- y axis: accuracy (%), ticks 30 to 60.
- Sequential scaling (solid, then dashed): the model is prompted to use up to 32, 64, 256 and 512 steps.
  Accuracy rises to 50% at 256 steps, then drops at 512.
- REBASE and majority voting (dashed): both start from the 50% sequential point and generate 16 parallel
  trajectories. REBASE ends higher than majority voting.

Values read off the image, accuracies within about 1 point and token counts within about 10%.

| Series | Point | Thinking tokens (≈) | Accuracy % (≈) |
|---|---|---:|---:|
| Sequential | 32 steps | 2850 | 30.0 |
| Sequential | 64 steps | 5000 | 36.7 |
| Sequential | 256 steps | 14400 | 50.0 |
| Sequential | 512 steps | 23400 | 33.3 |
| REBASE | 16 trajectories | 229000 | 56.7 |
| Majority voting | 16 trajectories | 229000 | 53.3 |

Reading notes:

- At 512 steps, 12 of the 30 responses exceed the context window, which causes the drop (L649).
- REBASE uses a process reward model initialized from LLaMA-34B, and aggregates its solutions by majority
  vote. It needs an extra reward-model forward pass at each step (L649, C-112).
- Each parallel series has only two points: the shared start and the 16-trajectory end.
- Claims: C-112, C-113, C-173.
