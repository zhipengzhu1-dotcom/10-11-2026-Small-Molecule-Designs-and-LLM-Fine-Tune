# Table 11. s1K sample from the OlympicArena astronomy subset

Label: `tab:arena` (main.tex L1904-L2472, appendix D.2, a `longtable`)

One full s1K training sample from the astronomy part of OlympicArena (Table 7). It is text, not data. The
layout has one column:

1. The question. If the Sun kept its size but produced as much power per unit volume as a human, what would
   its surface temperature be? It is multiple choice with five options, from A (3500 K) to E (50000 K).
2. The reference solution. It computes the human power density (about 1506 W/m^3) and applies the
   Stefan-Boltzmann law to the Sun's radius.
3. Gemini's reasoning trace and response, generated from the question alone. The response ends with the
   boxed answer E.

Reading notes:

- The caption says the solution text is "blue", but the source colors it with the yellow macro, as in
  Tables 9 and 10.
- Claims: C-160.
