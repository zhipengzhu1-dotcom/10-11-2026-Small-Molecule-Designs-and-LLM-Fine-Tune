# Figure 9. Training dynamics of s1-32B on s1K

Label: `fig:training_metrics` (main.tex L933-L940, appendix D; image `figures/training_metrics.pdf`)

Three line plots over the same x axis, training steps from 0 to about 315. The paper's text says nothing
else about this figure (C-154). Values are read off the image.

## Training loss

- y axis: loss, ticks 0.0, 0.2 and 0.4.
- Starts noisy between about 0.3 and 0.48 in the first 25 steps.
- Falls in steps. Sharp drops come near steps 125, 190 and 250, close to the epoch boundaries (63 steps per
  epoch, so 126, 189 and 252).
- Ends near 0.02 to 0.03 at step 315.

## Learning rate schedule

- y axis: learning rate, scale 1e-5, ticks 0.0, 0.5 and 1.0.
- Rises linearly from near 0 to 1.0e-5 by about step 16, then decays along a cosine curve to 0 at about step
  315.
- This matches the stated schedule: linear warmup over 5% of training (16 steps), then cosine decay to 0 over
  the remaining 299 steps (L931, C-150).

## Gradient norm

- y axis: gradient norm, ticks 1, 2 and 3.
- Starts near 2.0, falls below 1 within about 10 steps, and stays between about 0.3 and 0.6 after that.
- One spike reaches about 3.7 near step 163. Smaller spikes reach about 0.7 near step 230 and about 0.65
  near step 300.

Reading notes:

- 315 steps is 5 epochs of 1,000 samples at batch size 16, with 63 steps per epoch (C-149).
- Drops at epoch boundaries are what repeated passes over the same 1,000 samples would produce. This is my
  reading. The paper does not discuss it.
- Claims: C-149, C-150, C-154.
